'use client'

import { useState } from 'react'

const PINK     = '#ff007a'
const PINK_RGB = '255,0,122'

type Strategy = 'stake' | 'lock' | 'burn'

// Exact piecewise breakpoints from lockup data
const BREAKPOINTS = [
  { days: 1,   mult: 2.04 },
  { days: 7,   mult: 2.11 },
  { days: 30,  mult: 2.31 },
  { days: 90,  mult: 2.73 },
  { days: 180, mult: 3.23 },
  { days: 365, mult: 4.00 },
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

const QUICK_SELECT = [7, 30, 90, 180, 365, 730]

// ── Official Moat v1.2 Formula ─────────────────────────────────────────────────
// RawSum = (Staked × 1) + (Locked × ML) + (Burned × 10)
// MoatPoints = √RawSum   — normalized to 1B supply anchor
// UserShare   = MoatPoints / √GLOBAL_REWARD_POWER

// ── Reward engine constants ────────────────────────────────────────────────────
const GLOBAL_REWARD_POWER  = 3_942_855_424         // Ecosystem raw sum anchor
const GLOBAL_MOAT_POINTS   = Math.sqrt(GLOBAL_REWARD_POWER)  // ≈ 62,792
const PULSE_AVAX           = 0.577          // Fixed AVAX per pulse
const EPOCH_POOL_AVAX      = 30.41          // Shown in Estimated Rewards input
const PULSES_PER_DAY       = 4              // One pulse every 6 hours

// ── Global ecosystem snapshot ─────────────────────────────────────────────────
const TOTAL_SUPPLY   = 1_350_000_000
const GLOBAL_STAKED  =   155_693_804   // LIL currently staked (1×)
const GLOBAL_LOCKED  =   152_330_218   // LIL currently locked (avg 3.76×)
const GLOBAL_BURNED  =   321_438_924   // LIL burned in Moat (10×)
const MOAT_DENSITY   = ((GLOBAL_STAKED + GLOBAL_LOCKED + GLOBAL_BURNED) / TOTAL_SUPPLY * 100).toFixed(2)

export default function MoatOptimizer() {
  const [amount,    setAmount]    = useState('')
  const [strategy,  setStrategy]  = useState<Strategy>('stake')
  const [days,      setDays]      = useState(365)
  const [epochPool, setEpochPool] = useState(EPOCH_POOL_AVAX.toString())

  const lilAmount    = parseFloat(amount)    || 0
  const epochPoolAmt = parseFloat(epochPool) || EPOCH_POOL_AVAX
  const multiplier   = getMultiplier(strategy, days)

  // Official Moat v1.2 — √((S×1) + (L×ML) + (B×10))
  const staked      = strategy === 'stake' ? lilAmount : 0
  const locked      = strategy === 'lock'  ? lilAmount : 0
  const burned      = strategy === 'burn'  ? lilAmount : 0
  const rawSum      = (staked * 1) + (locked * multiplier) + (burned * 10)
  const moatPoints  = rawSum > 0 ? Math.sqrt(rawSum) : 0
  const userShare   = moatPoints > 0 ? moatPoints / GLOBAL_MOAT_POINTS : 0
  const rewardPerPulse = userShare * PULSE_AVAX
  const dailyYield  = rewardPerPulse * PULSES_PER_DAY
  const epochYield  = userShare * epochPoolAmt

  const hasResult = lilAmount > 0

  // Slider fill (min=1, max=730)
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

      <p className="text-[10px] font-bold uppercase tracking-widest mb-5" style={{ color: PINK }}>
        Moat Calculator
      </p>

      {/* ── Row 1: Inputs + Multiplier Table ───────────────────────────── */}
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

          <div>
            <label className={labelCls}>Estimated Rewards (AVAX Pool)</label>
            <input
              type="number" min="0" step="0.01" placeholder={EPOCH_POOL_AVAX.toString()}
              value={epochPool} onChange={e => setEpochPool(e.target.value)}
              className={inputCls}
            />
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
                    {d >= 365 ? `${d / 365}yr` : `${d}d`}
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

      {/* ── 3-col results grid (mirrors RewardChecker layout) ────────────── */}
      {(() => {
        const card = 'bg-black/40 border border-zinc-800 rounded-xl px-4 py-3'
        const lbl  = 'text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block mb-1'
        return (
          <div className="grid grid-cols-3 gap-3 items-stretch mb-4">

            {/* Card 1 — The Projections */}
            <div className={card + ' flex flex-col'}>
              <span className={lbl}>The Projections</span>
              {/* Top: Daily Yield */}
              <div className="flex flex-col justify-center flex-1 pt-2">
                <p className="text-[10px] text-zinc-500 mb-1">Daily Yield</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight" style={{ color: '#4ade80' }}>
                  {hasResult ? `~${dailyYield.toFixed(4)}` : '—'}
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">$AVAX · {PULSES_PER_DAY} pulses/day</span>
              </div>
              <div className="border-t border-zinc-800 my-2" />
              {/* Bottom: Epoch Yield */}
              <div className="flex flex-col justify-center flex-1 pb-1">
                <p className="text-[10px] text-zinc-500 mb-1">Epoch Yield</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight" style={{ color: '#4ade80' }}>
                  {hasResult ? `~${epochYield.toFixed(4)}` : '—'}
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">$AVAX · {epochPoolAmt} AVAX pool</span>
              </div>
            </div>

            {/* Card 2 — The Hero: Total Moat Points */}
            <div
              className="rounded-xl px-5 py-5 border flex flex-col items-center justify-center text-center"
              style={{ backgroundColor: 'rgba(34,211,238,0.05)', borderColor: 'rgba(34,211,238,0.4)', boxShadow: hasResult ? '0 0 20px rgba(34,211,238,0.08)' : undefined }}
            >
              <span className={lbl + ' justify-center'}>Total Moat Points</span>
              <span className="text-4xl font-black [text-shadow:none] leading-none mt-2" style={{ color: '#22d3ee' }}>
                {hasResult ? moatPoints.toFixed(2) : '—'}
              </span>
              {hasResult && <span className="text-zinc-400 text-sm font-medium mt-1">pts</span>}
              <p className="text-[10px] text-zinc-600 font-mono mt-3">
                √((S·1)+(L·{multiplier.toFixed(2)})+(B·10))
              </p>
              <p className="text-[10px] text-zinc-700 mt-0.5">normalized to 1B supply</p>
            </div>

            {/* Card 3 — The Stats */}
            <div className={card + ' flex flex-col'}>
              <span className={lbl}>The Stats</span>
              {/* Top: Global Share */}
              <div className="flex flex-col justify-center flex-1 pt-2">
                <p className="text-[10px] text-zinc-500 mb-1">Your Global Share</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight text-white">
                  {hasResult ? `${(userShare * 100).toFixed(4)}%` : '—'}
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">of total moat points</span>
              </div>
              <div className="border-t border-zinc-800 my-2" />
              {/* Bottom: Reward Per Pulse */}
              <div className="flex flex-col justify-center flex-1 pb-1">
                <p className="text-[10px] text-zinc-500 mb-1">Reward Per Pulse</p>
                <span className="text-xl font-black [text-shadow:none] leading-tight text-slate-500">
                  {hasResult ? `~${rewardPerPulse.toFixed(4)}` : '—'}
                </span>
                <span className="text-[10px] text-zinc-700 mt-0.5">$AVAX · every 6h</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Global Moat Density ───────────────────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3 border mb-3"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest mb-2">Global Moat Density</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          <span className="text-[10px] text-zinc-400">
            <span className="text-white font-bold">{MOAT_DENSITY}%</span> of supply secured
          </span>
          <span className="text-[10px] text-zinc-400">
            <span className="text-white font-bold">{fmt(Math.round(GLOBAL_MOAT_POINTS))}</span> global moat points
          </span>
          <span className="text-[10px] text-zinc-400">
            Staked <span className="font-bold" style={{ color: '#67e8f9' }}>{fmt(GLOBAL_STAKED)}</span>
            {' · '}Locked <span className="font-bold" style={{ color: '#a78bfa' }}>{fmt(GLOBAL_LOCKED)}</span>
            {' · '}Burned <span className="font-bold" style={{ color: '#fb923c' }}>{fmt(GLOBAL_BURNED)}</span>
          </span>
        </div>
      </div>

      {/* ── Formula Note ──────────────────────────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3 border"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
          Formula: √((S·1) + (L·M<sub>L</sub>) + (B·10)) · normalized to 1B supply · M<sub>L</sub> scales 2× → 5×
        </p>
      </div>
    </div>
  )
}
