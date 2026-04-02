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

// ── Display Points (UI only — not used for rewards) ───────────────────────────
// >10M:  (tokens / 1,000,000,000) × 370,000   — e.g. 54M → ~19,980
// ≤10M:  tokens × 2 (per thousand)            — e.g. 930k → ~1,860
function calcDisplayPoints(tokens: number): number {
  if (tokens > 10_000_000) return (tokens / 1_000_000_000) * 370_000
  return tokens * 2 / 1_000
}

// ── Reward engine constants ────────────────────────────────────────────────────
const GLOBAL_REWARD_POWER  = 3_942_855_424  // Staked×1 + Locked×avg + Burned×10
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

  // Display Points — UI only, not used for reward calc
  const displayPoints = calcDisplayPoints(lilAmount)

  // Earning Power — drives reward distribution
  const staked           = strategy === 'stake' ? lilAmount : 0
  const locked           = strategy === 'lock'  ? lilAmount : 0
  const burned           = strategy === 'burn'  ? lilAmount : 0
  const userEarningPower = (burned * 10) + (locked * multiplier) + (staked * 1)
  const pulseShare       = userEarningPower > 0 ? userEarningPower / GLOBAL_REWARD_POWER : 0
  const projectedPulse   = pulseShare * PULSE_AVAX
  const dailyProjected   = (userEarningPower / GLOBAL_REWARD_POWER) * PULSE_AVAX * PULSES_PER_DAY
  const biWeekly         = pulseShare * epochPoolAmt
  const monthly          = dailyProjected * 30
  const yearly           = dailyProjected * 365

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

      {/* ── Primary Results: Moat Points + Daily Projected ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Moat Points — display only */}
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest">
              Estimated Moat Points
            </span>
          </div>
          <span className="text-3xl font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.02em' }}>
            {hasResult ? Math.round(displayPoints).toLocaleString('en-US') : '—'}
          </span>
          <p className="text-[10px] text-zinc-600 mt-1.5">
            {hasResult
              ? lilAmount > 10_000_000
                ? 'Tokens ÷ 1B × 370k · display only'
                : 'Tokens × 2 per thousand · display only'
              : 'As shown in Moat App · multipliers not applied'}
          </p>
        </div>

        {/* Daily Projected — hero yield card */}
        <div
          className="border rounded-xl p-4 flex flex-col justify-between"
          style={{ backgroundColor: 'rgba(34,211,238,0.06)', borderColor: 'rgba(34,211,238,0.35)', boxShadow: hasResult ? '0 0 20px rgba(34,211,238,0.08)' : undefined }}
        >
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400">
              Daily Projected
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-3xl font-black [text-shadow:none]"
                style={{ letterSpacing: '-0.02em', color: '#22d3ee' }}
              >
                ~{hasResult ? dailyProjected.toFixed(4) : '—'}
              </span>
              {hasResult && <span className="text-zinc-400 text-base font-medium">$AVAX</span>}
            </div>
            {hasResult && (
              <p className="text-[10px] text-zinc-600 mt-1.5">
                {projectedPulse.toFixed(4)} per pulse · {PULSES_PER_DAY}× daily · {(pulseShare * 100).toFixed(4)}% pool share
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Monthly + Yearly ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 text-center">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">Monthly Reward</span>
          <span className="text-xl font-black text-white [text-shadow:none]">{hasResult ? monthly.toFixed(4) : '—'}</span>
          {hasResult && <p className="text-xs text-zinc-500 mt-0.5">$AVAX · ~30 days</p>}
        </div>
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 text-center">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">Yearly Reward</span>
          <span className="text-xl font-black text-white [text-shadow:none]">{hasResult ? yearly.toFixed(3) : '—'}</span>
          {hasResult && <p className="text-xs text-zinc-500 mt-0.5">$AVAX · 365 days</p>}
        </div>
      </div>

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
            <span className="text-white font-bold">{fmt(GLOBAL_REWARD_POWER)}</span> global reward power
          </span>
          <span className="text-[10px] text-zinc-400">
            Staked <span className="font-bold" style={{ color: '#67e8f9' }}>{fmt(GLOBAL_STAKED)}</span>
            {' · '}Locked <span className="font-bold" style={{ color: '#a78bfa' }}>{fmt(GLOBAL_LOCKED)}</span>
            {' · '}Burned <span className="font-bold" style={{ color: '#fb923c' }}>{fmt(GLOBAL_BURNED)}</span>
          </span>
        </div>
      </div>

      {/* ── Protocol Note ─────────────────────────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3 border"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-400 font-semibold">Note:</span>{' '}
          Multipliers increase your share of rewards but are not reflected in your displayed Moat Point total per the protocol design.
        </p>
      </div>
    </div>
  )
}
