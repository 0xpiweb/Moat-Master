'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPublicClient, http, parseAbi, formatEther } from 'viem'

const PINK     = '#ff007a'
const PINK_RGB = '255,0,122'

// ── Chain / contracts ─────────────────────────────────────────────────────────
const RPC_URL       = 'https://api.avax.network/ext/bc/C/rpc'
const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393' as `0x${string}`
const REWARD_ADDR   = '0x5E1AC781157AAF1492f15c351183EEFCa5Fbd746' as `0x${string}`
const TOTAL_SUPPLY  = 1_350_000_000

const avalanche = {
  id: 43114, name: 'Avalanche C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const

const MOAT_ABI = parseAbi([
  'function getTotalAmounts() view returns (uint256 totalStaked, uint256 totalLocked, uint256 totalBurned, uint256 totalInContract)',
  'function totalRewardPower() view returns (uint256)',
  'function epochYield() view returns (uint256)',
])

function fromWei(wei: bigint): number {
  return Number(wei / 10n ** 16n) / 100
}

// ── Official Moat Formula (API-derived, dynamic denominator) ──────────────────
// RawPower  = (S×1) + (L×ML) + (B×10)
// UserWeight = √(RawPower / totalRewardPower())        ← on-chain total pool power
// MoatPoints = UserWeight × MOAT_SCALAR                ← constant ratio = 2888
//
// Verification (pool ≈ 11.25M at snapshot time):
//   vroshi55 (361,465 B)   →  1,637 pts  ✓ exact
//   0x2cb…  (22.65M B)    → 12,954 pts  ✓ exact
//   930k @ 730d (ML=5×)   →  1,856 pts  ✓ exact
const MOAT_SCALAR = 2_888        // constant: UserPoints / UserWeight from leaderboard

// Fallback avg ML for locked tokens — only if on-chain totalRewardPower() reverts
const LOCKED_AVG_ML = 3.759

// ── Multiplier table (spec-defined breakpoints, linear interpolation) ─────────
type Strategy = 'stake' | 'lock' | 'burn'

const BREAKPOINTS = [
  { days: 1,   mult: 2.04 },
  { days: 7,   mult: 2.11 },
  { days: 30,  mult: 2.31 },
  { days: 60,  mult: 2.52 },
  { days: 90,  mult: 2.73 },
  { days: 120, mult: 2.91 },
  { days: 180, mult: 3.23 },
  { days: 240, mult: 3.52 },
  { days: 365, mult: 4.00 },
  { days: 450, mult: 4.31 },
  { days: 730, mult: 5.00 },
]

function getMultiplier(strategy: Strategy, days: number): number {
  if (strategy === 'stake') return 1
  if (strategy === 'burn')  return 10
  if (days <= BREAKPOINTS[0].days) return BREAKPOINTS[0].mult
  if (days >= BREAKPOINTS[BREAKPOINTS.length - 1].days) return BREAKPOINTS[BREAKPOINTS.length - 1].mult
  for (let i = 0; i < BREAKPOINTS.length - 1; i++) {
    const lo = BREAKPOINTS[i], hi = BREAKPOINTS[i + 1]
    if (days >= lo.days && days <= hi.days) {
      const t = (days - lo.days) / (hi.days - lo.days)
      return lo.mult + t * (hi.mult - lo.mult)
    }
  }
  return BREAKPOINTS[0].mult
}

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return Math.round(n).toLocaleString('en-US')
  return n.toFixed(2)
}

const QUICK_SELECT = [7, 30, 60, 90, 120, 180, 240, 365, 450, 730]

interface LiveData {
  totalMoatPower: number
  epochYield:     number
  moatDensity:    string
  loading:        boolean
  error:          boolean
}

export default function MoatOptimizer() {
  const [amount,   setAmount]   = useState('')
  const [strategy, setStrategy] = useState<Strategy>('stake')
  const [days,     setDays]     = useState(365)
  const [live,     setLive]     = useState<LiveData>({
    totalMoatPower: 0, epochYield: 0, moatDensity: '—', loading: true, error: false,
  })

  const fetchLive = useCallback(async () => {
    setLive(d => ({ ...d, loading: true, error: false }))
    try {
      const client = createPublicClient({ chain: avalanche, transport: http(RPC_URL) })

      // Live global token amounts
      const [s, l, b] = await client.readContract({
        address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getTotalAmounts',
      })
      const totalStaked = fromWei(s)
      const totalLocked = fromWei(l)
      const totalBurned  = fromWei(b)
      const moatDensity  = ((totalStaked + totalLocked + totalBurned) / TOTAL_SUPPLY * 100).toFixed(2)

      // Live total reward power — fall back to weighted estimate if function absent
      let totalMoatPower: number
      try {
        const tp = await client.readContract({
          address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'totalRewardPower',
        })
        totalMoatPower = fromWei(tp)
      } catch {
        totalMoatPower = totalStaked + totalBurned * 10 + totalLocked * LOCKED_AVG_ML
      }

      // Live epoch yield — try contract function, fall back to reward address balance
      let epochYield: number
      try {
        const ey = await client.readContract({
          address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'epochYield',
        })
        epochYield = parseFloat(formatEther(ey))
      } catch {
        try {
          const bal = await client.getBalance({ address: REWARD_ADDR })
          epochYield = parseFloat(formatEther(bal))
        } catch {
          epochYield = 0
        }
      }

      setLive({ totalMoatPower, epochYield, moatDensity, loading: false, error: false })
    } catch {
      setLive(d => ({ ...d, loading: false, error: true }))
    }
  }, [])

  useEffect(() => { fetchLive() }, [fetchLive])

  // ── Formula (recalculates on every slider/input change) ──────────────────────
  const lilAmount  = parseFloat(amount) || 0
  const multiplier = getMultiplier(strategy, days)

  const staked          = strategy === 'stake' ? lilAmount : 0
  const locked          = strategy === 'lock'  ? lilAmount : 0
  const burned          = strategy === 'burn'  ? lilAmount : 0
  const rawPower = (staked * 1) + (locked * multiplier) + (burned * 10)

  // MoatPoints = √(rawPower / totalRewardPower) × 2888  — denominator is live pool size
  const moatPoints = live.totalMoatPower > 0 && rawPower > 0
    ? Math.sqrt(rawPower / live.totalMoatPower) * MOAT_SCALAR
    : 0

  // Yield — strictly linear share of raw power
  const userShare        = live.totalMoatPower > 0 && rawPower > 0 ? rawPower / live.totalMoatPower : 0
  const dailyYield       = userShare * (live.epochYield / 14)
  const epochYieldResult = userShare * live.epochYield

  const hasResult   = lilAmount > 0
  const hasLiveData = live.totalMoatPower > 0 && live.epochYield > 0

  // Slider gradient
  const fillPct = ((days - 1) / 729) * 100
  const trackBg = `linear-gradient(90deg, ${PINK} 0%, #8b5cf6 ${fillPct}%, rgba(255,255,255,0.1) ${fillPct}%)`

  const inputCls = [
    'w-full bg-black/60 border border-zinc-700 rounded-xl px-4 py-2.5',
    'text-white text-sm font-semibold outline-none transition-colors',
    'focus:border-[#ff007a] [text-shadow:none]',
  ].join(' ')
  const labelCls = 'text-xs text-zinc-400 font-semibold mb-1.5 block'

  return (
    <div
      id="calculator"
      className="border rounded-2xl p-6 mt-4 backdrop-blur-xl bg-zinc-900/50"
      style={{ borderColor: `rgba(${PINK_RGB},0.45)`, boxShadow: `0 0 28px rgba(${PINK_RGB},0.07)` }}
    >
      <style>{`
        .moat-slider { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 9999px; outline: none; cursor: pointer; width: 100%; }
        .moat-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #ffffff; cursor: pointer; box-shadow: 0 0 15px #ff007a, 0 0 0 2px rgba(255,0,122,0.3); transition: transform 0.15s ease; }
        .moat-slider::-webkit-slider-thumb:hover { transform: scale(1.1); }
        .moat-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #ffffff; border: none; cursor: pointer; box-shadow: 0 0 15px #ff007a; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PINK }}>
          Moat Calculator
        </p>
        <button
          onClick={fetchLive}
          disabled={live.loading}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 disabled:opacity-40"
        >
          {live.loading ? '⟳ Loading…' : live.error ? '⚠ Retry' : '⟳ Refresh'}
        </button>
      </div>

      {/* ── Row 1: Inputs + Multiplier Table ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        {/* Left — Your Position */}
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Your Position</p>

          <div>
            <label className={labelCls}>$LIL Balance</label>
            <input
              type="number" min="0" placeholder="Enter amount…"
              value={amount} onChange={e => setAmount(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Strategy</label>
            <div className="flex gap-2">
              {(['stake', 'lock', 'burn'] as Strategy[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className="flex-1 py-3 rounded-xl text-xs font-bold border transition-all hover:scale-105 inline-flex items-center justify-center gap-2 [text-shadow:none] [box-sizing:border-box]"
                  style={strategy === s
                    ? { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,0,122,0.8)', color: '#fff', boxShadow: '0 0 10px rgba(255,0,122,0.35)' }
                    : { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,0,122,0.3)', color: '#fff' }}
                >
                  <span className="text-[10px] leading-none">
                    {s === 'stake' ? '🏛️' : s === 'lock' ? '🔐' : '🔥'}
                  </span>
                  <span>{s === 'stake' ? 'Stake' : s === 'lock' ? 'Lock' : 'Burn'}</span>
                </button>
              ))}
            </div>
          </div>

          {strategy === 'lock' && (
            <div>
              <div className="flex justify-between items-baseline mb-3">
                <label className={labelCls + ' mb-0'}>Lock Duration</label>
                <span className="text-sm font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
                  {days}d&nbsp;·&nbsp;<span style={{ color: PINK }}>{multiplier.toFixed(2)}×</span>
                </span>
              </div>
              <input
                type="range" min={1} max={730} value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="moat-slider"
                style={{ background: trackBg }}
              />
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {QUICK_SELECT.map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all [text-shadow:none]"
                    style={days === d
                      ? { backgroundColor: PINK, borderColor: PINK, color: '#fff' }
                      : { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#71717a' }}
                  >
                    {d === 730 ? '2yr' : d === 365 ? '1yr' : `${d}d`}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right — Multiplier Table */}
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Multiplier Table</p>
          <div className="bg-black/40 border border-zinc-800 rounded-xl overflow-hidden flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-500 font-semibold uppercase tracking-wider">Method</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-semibold uppercase tracking-wider">Duration</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-semibold uppercase tracking-wider">Multiplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                <tr>
                  <td className="px-3 py-2 text-zinc-300">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[10px]" style={{ opacity: strategy === 'stake' ? 1 : 0.5 }}>🏛️</span>Stake
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">—</td>
                  <td className="px-3 py-2 text-right font-bold" style={{ color: strategy === 'stake' ? PINK : '#fff' }}>1.00×</td>
                </tr>
                {BREAKPOINTS.map(row => {
                  const active = strategy === 'lock' && days === row.days
                  return (
                    <tr key={row.days} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => { setStrategy('lock'); setDays(row.days) }}>
                      <td className="px-3 py-2 text-zinc-400">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-[10px]" style={{ opacity: active ? 1 : 0.5 }}>🔐</span>Lock
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{row.days}d</td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: active ? PINK : '#fff' }}>
                        {row.mult.toFixed(2)}×
                      </td>
                    </tr>
                  )
                })}
                <tr>
                  <td className="px-3 py-2 text-zinc-300">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[10px]" style={{ opacity: strategy === 'burn' ? 1 : 0.5 }}>🔥</span>Burn
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">—</td>
                  <td className="px-3 py-2 text-right font-bold" style={{ color: strategy === 'burn' ? PINK : '#fff' }}>10.00×</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800 mb-5" />

      {/* ── 3-col results grid ────────────────────────────────────────────── */}
      {(() => {
        const card = 'bg-black/40 border border-zinc-800 rounded-xl px-4 py-3'
        const lbl  = 'text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block mb-1'
        return (
          <div className="grid grid-cols-3 gap-3 items-stretch">

            {/* Card 1 — The Projections */}
            <div className={card + ' flex flex-col'}>
              <span className={lbl}>The Projections</span>
              <div className="flex flex-col justify-center flex-1">
                <p className="text-[10px] text-zinc-500 mb-1">Daily Yield</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight" style={{ color: '#4ade80' }}>
                  {hasResult && hasLiveData ? `~${dailyYield.toFixed(4)}` : '—'}
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">$AVAX · pool ÷ 14</span>
              </div>
              <div className="border-t border-zinc-800 my-2" />
              <div className="flex flex-col justify-center flex-1">
                <p className="text-[10px] text-zinc-500 mb-1">Epoch Yield</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight" style={{ color: '#4ade80' }}>
                  {hasResult && hasLiveData ? `~${epochYieldResult.toFixed(4)}` : '—'}
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">
                  {hasLiveData ? `$AVAX · ${live.epochYield.toFixed(2)} pool` : '$AVAX · fetching…'}
                </span>
              </div>
            </div>

            {/* Card 2 — The Hero: Total Moat Points */}
            <div
              className="rounded-xl px-5 py-5 border flex flex-col items-center justify-center text-center"
              style={{ backgroundColor: 'rgba(34,211,238,0.05)', borderColor: 'rgba(34,211,238,0.4)', boxShadow: hasResult ? '0 0 20px rgba(34,211,238,0.08)' : undefined }}
            >
              <span className={lbl + ' justify-center'}>Total Moat Points</span>
              <span className="text-4xl font-black [text-shadow:none] leading-none mt-2" style={{ color: '#22d3ee' }}>
                {hasResult && live.totalMoatPower > 0
                  ? Math.round(moatPoints).toLocaleString('en-US')
                  : hasResult && live.loading ? '…' : '—'}
              </span>
              {hasResult && live.totalMoatPower > 0 && (
                <span className="text-zinc-400 text-sm font-medium mt-1">pts</span>
              )}
            </div>

            {/* Card 3 — Moat Vitality */}
            <div className={card + ' flex flex-col'}>
              <span className={lbl}>Moat Vitality</span>
              <div className="flex flex-col justify-center flex-1">
                <p className="text-[10px] text-zinc-500 mb-1">Global Moat Density</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight text-white">
                  {live.loading ? '…' : `${live.moatDensity}%`}
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">
                  {live.loading ? 'fetching…' : live.error ? 'retry ↑' : 'of supply secured · live'}
                </span>
              </div>
              <div className="border-t border-zinc-800 my-2" />
              <div className="flex flex-col justify-center flex-1">
                <p className="text-[10px] text-zinc-500 mb-1">Avg. Multiplier</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight" style={{ color: PINK }}>
                  {multiplier.toFixed(2)}×
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">
                  {strategy === 'stake' ? 'base stake rate' : strategy === 'burn' ? 'max burn rate' : `${days}d lock`}
                </span>
              </div>
            </div>

          </div>
        )
      })()}
    </div>
  )
}
