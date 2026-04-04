'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPublicClient, http, parseAbi } from 'viem'

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
  // Returns total staked / locked / burned / in-contract (all in wei)
  'function getTotalAmounts() view returns (uint256 totalStaked, uint256 totalLocked, uint256 totalBurned, uint256 totalInContract)',
  // Returns Σ(sqrt(userRawPower_wei)) across all users — used for reward-share denominator
  'function totalPoints() view returns (uint256)',
])

function fromWei(wei: bigint): number {
  return Number(wei / 10n ** 16n) / 100
}

// ── Official Moat Formula (per fortifi.gitbook.io/moats + founder clarification) ─
// RawPower (display)  = (Staked × 1) + (Locked × 5) + (Burned × 10)
// MoatPoints = √(RawPower / 1,000,000,000) × MOAT_SCALAR
//
// CRITICAL: locked tokens always use the FIXED max multiplier (5×) for MoatPoints,
// regardless of lock duration. The duration-based ML (e.g. 2.62× for 74d) applies
// ONLY to reward distribution share — not to the leaderboard points formula.
// This is intentional: "makes the spread feel smaller" (founder).
//
// MOAT_SCALAR calibrated from confirmed benchmarks:
//   vroshi55  (361,465 B)         →  1,637 pts ✓ exact
//   930k locked (any duration)    →  1,856 pts ✓ (locked × 5, not × ML)
//   piweb.bensi (91.6k S + 500k L + 54.3M B) → 20,104 pts ✓ exact
const NORM_1B     = 1_000_000_000
const MOAT_SCALAR = 27_220
const LOCK_MULT   = 5   // fixed lock multiplier for MoatPoints (duration affects rewards only)

// ── Multiplier table — all 16 official breakpoints (linear interpolation) ─────
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
  { days: 540, mult: 4.57 },
  { days: 600, mult: 4.73 },
  { days: 660, mult: 4.87 },
  { days: 700, mult: 4.95 },
  { days: 729, mult: 4.99 },
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

// Key quick-select durations (subset of official breakpoints)
const QUICK_SELECT = [7, 30, 90, 180, 365, 450, 540, 660, 730]

interface LiveData {
  sqrtSumScaled:    number   // totalPoints() / 1e9 = Σ(√rawPower_tokens × mult_i) — live reward-share denominator
  globalMoatPoints: number   // Σ(MoatPoints_i) = sqrtSumScaled × MOAT_SCALAR / √NORM_1B
  globalAvgMult:    number   // weighted avg multiplier = sqrtSumScaled / unweightedSqrtSum (approx from pool composition)
  moatDensity:      string
  loading:          boolean
  error:            boolean
}

export default function MoatOptimizer() {
  const [amount,       setAmount]       = useState('')
  const [strategy,     setStrategy]     = useState<Strategy>('stake')
  const [days,         setDays]         = useState(365)
  const [epochRewards, setEpochRewards] = useState(30.41)
  const [epochInput,   setEpochInput]   = useState('30.41')
  const [live,         setLive]         = useState<LiveData>({
    sqrtSumScaled: 0, globalMoatPoints: 0, globalAvgMult: 0, moatDensity: '—', loading: true, error: false,
  })

  const fetchLive = useCallback(async () => {
    setLive(d => ({ ...d, loading: true, error: false }))
    try {
      const client = createPublicClient({ chain: avalanche, transport: http(RPC_URL) })

      // Global token amounts (for density display)
      const [s, l, b] = await client.readContract({
        address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getTotalAmounts',
      })
      const totalStaked = fromWei(s)
      const totalLocked = fromWei(l)
      const totalBurned = fromWei(b)
      const moatDensity = ((totalStaked + totalLocked + totalBurned) / TOTAL_SUPPLY * 100).toFixed(2)

      // totalPoints() = Σ(√(userRawPower_wei) × mult_i) across all users — live weighted reward-share denominator
      // Dividing by 1e9 converts from wei-sqrt to token-sqrt: Σ(√rawPower_tokens × mult_i)
      const tp = await client.readContract({
        address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'totalPoints',
      })
      const sqrtSumScaled = Number(tp) / 1e9

      // Aggregate raw power using fixed LOCK_MULT=5 for MoatPoints (as per protocol docs)
      const totalRawPower = (totalStaked * 1) + (totalLocked * LOCK_MULT) + (totalBurned * 10)
      // Aggregate sqrt(rawPower) — single-pool approximation for deriving global avg multiplier
      const sqrtTotalRaw = totalRawPower > 0 ? Math.sqrt(totalRawPower) : 1
      // globalAvgMult = Σ(√rawPower_i × mult_i) / √(totalRawPower)
      // This is the effective pool-wide average reward multiplier derived from live on-chain data
      const globalAvgMult = sqrtTotalRaw > 0 ? sqrtSumScaled / sqrtTotalRaw : 1
      // Aggregate MoatPoints (treating whole pool as one position) — reference metric for scale
      const globalMoatPoints = totalRawPower > 0
        ? Math.sqrt(totalRawPower / NORM_1B) * MOAT_SCALAR
        : 0

      setLive({ sqrtSumScaled, globalMoatPoints, globalAvgMult, moatDensity, loading: false, error: false })
    } catch {
      setLive(d => ({ ...d, loading: false, error: true }))
    }
  }, [])

  const fetchDeposit = useCallback(async () => {
    try {
      const res  = await fetch('/api/last-deposit')
      const { avax } = await res.json() as { avax: number }
      if (avax > 0) {
        setEpochRewards(avax)
        setEpochInput(avax.toFixed(4))
      }
    } catch { /* keep default 30.41 */ }
  }, [])

  useEffect(() => { fetchLive(); fetchDeposit() }, [fetchLive, fetchDeposit])

  // ── Formula ──────────────────────────────────────────────────────────────────
  const lilAmount  = parseFloat(amount) || 0
  const multiplier = getMultiplier(strategy, days)

  const staked   = strategy === 'stake' ? lilAmount : 0
  const locked   = strategy === 'lock'  ? lilAmount : 0
  const burned   = strategy === 'burn'  ? lilAmount : 0
  // MoatPoints: locked always × 5 (fixed, duration-independent)
  const rawPower = (staked * 1) + (locked * LOCK_MULT) + (burned * 10)

  // MoatPoints = √(RawPower / 1B) × MOAT_SCALAR  (1B normalization, per docs)
  const moatPoints = rawPower > 0 ? Math.sqrt(rawPower / NORM_1B) * MOAT_SCALAR : 0

  // User Share = (User Moat Points × User Avg Multiplier) / (Total Global Reward Weight)
  //
  // Total Global Reward Weight = Σ(MoatPoints_i × mult_i)
  //   = MOAT_SCALAR/√NORM_1B × Σ(√rawPower_i × mult_i)
  //   = MOAT_SCALAR/√NORM_1B × sqrtSumScaled
  //
  // SCALAR/√1B cancels in the ratio, so the simplified form is:
  //   userShare = (√rawPower × mult) / Σ(√rawPower_i × mult_i) = userSqrt / sqrtSumScaled
  //
  // sqrtSumScaled = totalPoints()/1e9 = Σ(√rawPower_i × mult_i) — fetched live from contract
  const userSqrt  = rawPower > 0 ? Math.sqrt(rawPower) * multiplier : 0
  const userShare = live.sqrtSumScaled > 0 && userSqrt > 0
    ? userSqrt / live.sqrtSumScaled : 0
  const epochYieldResult = userShare * epochRewards
  const dailyYield       = epochYieldResult / 14

  const hasResult   = lilAmount > 0
  const hasLiveData = live.sqrtSumScaled > 0 && epochRewards > 0

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

          {/* Estimated Epoch Rewards — auto-fetched from last deposit, user-editable */}
          <div className="mt-auto pt-2">
            <label className={labelCls}>Estimated Epoch Rewards</label>
            <div className="relative">
              <input
                type="number" min="0" step="0.01"
                value={epochInput}
                onChange={e => {
                  setEpochInput(e.target.value)
                  const v = parseFloat(e.target.value)
                  if (!isNaN(v) && v >= 0) setEpochRewards(v)
                }}
                className={inputCls + ' pr-16'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500 pointer-events-none">
                AVAX
              </span>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5">
              {live.loading ? 'Fetching last deposit…' : 'Last bi-weekly deposit · editable'}
            </p>
          </div>

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

            {/* Card 1 — Estimated Rewards */}
            <div className={card + ' flex flex-col'}>
              <span className={lbl}>Est. Rewards</span>

              {/* Green reward-share bar */}
              <div className="mb-3">
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-[10px] text-zinc-500">Reward Share</span>
                  <span className="text-xs font-bold" style={{ color: '#4ade80' }}>
                    {hasResult && live.sqrtSumScaled > 0 ? `${(userShare * 100).toFixed(4)}%` : '—'}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: hasResult && live.sqrtSumScaled > 0
                        ? `${Math.min(Math.max(userShare * 2000, 0.5), 100)}%`
                        : '0%',
                      background: 'linear-gradient(90deg, #4ade80, #22d3ee)',
                    }}
                  />
                </div>
              </div>

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
                  {`$AVAX · ${epochRewards.toFixed(2)} epoch`}
                </span>
              </div>
            </div>

            {/* Card 2 — Total Moat Points (hero) */}
            <div
              className="rounded-xl px-5 py-5 border flex flex-col items-center justify-center text-center"
              style={{ backgroundColor: 'rgba(34,211,238,0.05)', borderColor: 'rgba(34,211,238,0.4)', boxShadow: hasResult ? '0 0 20px rgba(34,211,238,0.08)' : undefined }}
            >
              <span className={lbl + ' justify-center'}>Total Moat Points</span>
              <span className="text-4xl font-black [text-shadow:none] leading-none mt-2" style={{ color: '#22d3ee' }}>
                {hasResult ? Math.round(moatPoints).toLocaleString('en-US') : '—'}
              </span>
              {hasResult && <span className="text-zinc-400 text-sm font-medium mt-1">pts</span>}
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
                <p className="text-[10px] text-zinc-500 mb-1">Reward Multiplier</p>
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
