'use client'

import { useState, useEffect } from 'react'

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
  // Piecewise linear interpolation between breakpoints
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
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return Math.round(n).toLocaleString('en-US')
  return n.toFixed(2)
}

const QUICK_SELECT = [7, 30, 90, 180, 365, 730]

// Static fallback — used if API is unavailable
const POOL_TOTAL_FALLBACK = 288_850

const MOAT_API =
  'https://api.moats.app/api/moat-points/v2/all' +
  '?contractAddress=0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393&chainId=43114'

export default function MoatOptimizer() {
  const [amount,       setAmount]       = useState('')
  const [strategy,     setStrategy]     = useState<Strategy>('stake')
  const [days,         setDays]         = useState(365)
  const [epochRewards, setEpochRewards] = useState('')
  const [liveTotalPts, setLiveTotalPts] = useState<number | null>(null)
  const [apiLoading,   setApiLoading]   = useState(true)

  useEffect(() => {
    fetch(MOAT_API)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then((data: { leaderboard?: { points?: number }[] } | null) => {
        if (data?.leaderboard?.length) {
          const total = data.leaderboard.reduce((s, e) => s + (e.points ?? 0), 0)
          if (total > 0) setLiveTotalPts(Math.round(total))
        }
        setApiLoading(false)
      })
  }, [])

  const poolTotal  = liveTotalPts ?? POOL_TOTAL_FALLBACK

  const lilAmount  = parseFloat(amount)       || 0
  const avaxInput  = parseFloat(epochRewards) || 0
  const multiplier = getMultiplier(strategy, days)
  const userPoints = (lilAmount * multiplier) / 27121
  // Dilution: user's simulated points are added to the pool, so denominator grows
  const dilutedPool = poolTotal + userPoints
  const share       = userPoints > 0 ? userPoints / dilutedPool : 0

  const biweekly = share * avaxInput
  const monthly  = biweekly * 2
  const yearly   = biweekly * 26

  const hasResult = avaxInput > 0 && userPoints > 0

  // Slider fill (min=1, max=730)
  const fillPct = ((days - 1) / 729) * 100
  const trackBg = `linear-gradient(90deg, ${PINK} 0%, #8b5cf6 ${fillPct}%, rgba(255,255,255,0.1) ${fillPct}%)`

  const inputCls = [
    'w-full bg-black/60 border border-zinc-700 rounded-xl px-4 py-2.5',
    'text-white text-sm font-semibold outline-none transition-colors',
    'focus:border-[#ff007a] [text-shadow:none]',
  ].join(' ')

  const labelCls = 'text-xs text-zinc-400 font-semibold mb-1.5 block'

  const statBox = (title: string, value: string) => (
    <div className="bg-black/40 border border-zinc-800 rounded-xl p-4">
      <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">
        {title}
      </span>
      <span className="text-lg font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
        {value}
      </span>
    </div>
  )

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

      {/* ── Row 1: Inputs + Multiplier Table ─────────────────────── */}
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
                  className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all hover:scale-105 [text-shadow:none] [box-sizing:border-box]"
                  style={strategy === s
                    ? { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,0,122,0.8)', color: '#fff', boxShadow: '0 0 10px rgba(255,0,122,0.35)' }
                    : { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,0,122,0.3)', color: '#fff' }}
                >
                  {s === 'stake'
                    ? <><span className="text-[10px] mr-1">🏛️</span>Stake</>
                    : s === 'lock'
                    ? <><span className="text-[10px] mr-1">🔐</span>Lock</>
                    : <><span className="text-[10px] mr-1">🔥</span>Burn</>
                  }
                </button>
              ))}
            </div>
          </div>

          {strategy === 'lock' && (
            <div>
              {/* Live readout */}
              <div className="flex justify-between items-baseline mb-3">
                <label className={labelCls + ' mb-0'}>Lock Duration</label>
                <span className="text-sm font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
                  {days}d&nbsp;·&nbsp;<span style={{ color: PINK }}>{multiplier.toFixed(2)}×</span>
                </span>
              </div>

              {/* Slider */}
              <input
                type="range" min={1} max={730} value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="moat-slider"
                style={{ background: trackBg }}
              />

              {/* Quick Select */}
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

          <div>
            <label className={labelCls}>Estimated Bi-Weekly Rewards (AVAX)</label>
            <input
              type="number" min="0" step="0.01" placeholder="e.g. 30.41"
              value={epochRewards} onChange={e => setEpochRewards(e.target.value)}
              className={inputCls}
            />
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
                    <span style={{ opacity: strategy === 'stake' ? 1 : 0.5 }} className="mr-1.5">🏛️</span>Stake
                  </td>
                  <td className="px-3 py-2 text-zinc-500">—</td>
                  <td className="px-3 py-2 text-right font-bold" style={{ color: strategy === 'stake' ? PINK : '#fff' }}>1.00×</td>
                </tr>
                {BREAKPOINTS.map(row => {
                  const active = strategy === 'lock' && days === row.days
                  return (
                    <tr key={row.days} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => { setStrategy('lock'); setDays(row.days) }}>
                      <td className="px-3 py-2 text-zinc-400">
                        <span style={{ opacity: active ? 1 : 0.5 }} className="mr-1.5">🔐</span>Lock
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
                    <span style={{ opacity: strategy === 'burn' ? 1 : 0.5 }} className="mr-1.5">🔥</span>Burn
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

      {/* ── Stats grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Your Moat Points — whole number + effective multiplier */}
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">
            Your Moat Points
          </span>
          <span className="text-lg font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
            {userPoints > 0 ? Math.round(userPoints).toLocaleString('en-US') : '—'}
          </span>
          {userPoints > 0 && (
            <p className="text-[10px] mt-1" style={{ color: PINK }}>
              {multiplier.toFixed(2)}× effective
            </p>
          )}
        </div>
        {/* Pool Share after dilution */}
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">
            Real Weight %
          </span>
          <span className="text-lg font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
            {userPoints > 0 ? (share * 100).toFixed(4) + '%' : '—'}
          </span>
          {userPoints > 0 && (
            <p className="text-[10px] mt-1 text-zinc-600">after dilution</p>
          )}
        </div>
        {/* Live pool total */}
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">
            Total Pool Points
          </span>
          <span className="text-lg font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
            {apiLoading ? '…' : fmt(poolTotal) + ' pts'}
          </span>
          <p className="text-[10px] mt-1" style={{ color: liveTotalPts ? '#22c55e' : '#71717a' }}>
            {apiLoading ? 'fetching…' : liveTotalPts ? '● live' : '● cached'}
          </p>
        </div>
      </div>

      {/* ── Bi-Weekly highlight ───────────────────────────────────── */}
      <div
        className="border rounded-xl p-5 mb-4 text-center"
        style={{ backgroundColor: `rgba(${PINK_RGB},0.07)`, borderColor: `rgba(${PINK_RGB},0.35)` }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest block mb-2" style={{ color: PINK }}>
          Estimated Bi-Weekly Reward
        </span>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-4xl font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.02em' }}>
            {hasResult ? biweekly.toFixed(4) : '—'}
          </span>
          {hasResult && <span className="text-zinc-400 text-lg font-medium">AVAX</span>}
        </div>
        {hasResult && (
          <p className="text-xs text-zinc-500 mt-1.5">
            {liveTotalPts ? 'based on live pool · dilution included' : 'based on cached pool snapshot'}
          </p>
        )}
      </div>

      {/* ── Monthly + Yearly ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 text-center">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">Monthly Reward</span>
          <span className="text-xl font-black text-white [text-shadow:none]">{hasResult ? monthly.toFixed(4) : '—'}</span>
          {hasResult && <p className="text-xs text-zinc-500 mt-0.5">AVAX · ~2 epochs</p>}
        </div>
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 text-center">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">Yearly Reward</span>
          <span className="text-xl font-black text-white [text-shadow:none]">{hasResult ? yearly.toFixed(4) : '—'}</span>
          {hasResult && <p className="text-xs text-zinc-500 mt-0.5">AVAX · 26 epochs</p>}
        </div>
      </div>
    </div>
  )
}
