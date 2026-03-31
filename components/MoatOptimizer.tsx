'use client'

import { useState } from 'react'

const PINK     = '#ff007a'
const PINK_RGB = '255,0,122'

type Strategy = 'stake' | 'lock' | 'burn'

function getMultiplier(strategy: Strategy, days: number): number {
  if (strategy === 'stake') return 1
  if (strategy === 'burn')  return 10
  return 1 + ((days - 7) / 723) * 4   // linear 1× @ 7d → 5× @ 730d
}

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return Math.round(n).toLocaleString('en-US')
  return n.toFixed(2)
}

const LOCK_ROWS = [
  { label: '7 days',   days: 7   },
  { label: '30 days',  days: 30  },
  { label: '90 days',  days: 90  },
  { label: '180 days', days: 180 },
  { label: '365 days', days: 365 },
  { label: '730 days', days: 730 },
]

interface Props {
  colorRgb:    string
  totalStaked: number
  totalLocked: number
  totalBurned: number
}

export default function MoatOptimizer({ totalStaked, totalLocked, totalBurned }: Props) {
  const [amount,       setAmount]       = useState('')
  const [strategy,     setStrategy]     = useState<Strategy>('stake')
  const [days,         setDays]         = useState(365)
  const [epochRewards, setEpochRewards] = useState('')

  const lilAmount  = parseFloat(amount)       || 0
  const avaxInput  = parseFloat(epochRewards) || 0
  const multiplier = getMultiplier(strategy, days)
  const userPoints = lilAmount * multiplier

  // Pool estimate: staked×1, locked midpoint×3, burned×10
  const poolPoints  = totalStaked * 1 + totalLocked * 3 + totalBurned * 10
  const totalPoints = poolPoints + userPoints
  const share       = totalPoints > 0 ? userPoints / totalPoints : 0

  const biweekly = share * avaxInput   // 1 epoch = bi-weekly
  const monthly  = biweekly * 2        // ~2 epochs / month
  const yearly   = biweekly * 26       // 26 epochs / year

  const hasResult = avaxInput > 0 && userPoints > 0

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
      <p className="text-[10px] font-bold uppercase tracking-widest mb-5" style={{ color: PINK }}>
        Moat Optimizer
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
                  className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all [text-shadow:none]"
                  style={strategy === s
                    ? { backgroundColor: PINK, borderColor: PINK, color: '#fff' }
                    : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#71717a' }}
                >
                  {s === 'stake' ? '🏛️ Stake' : s === 'lock' ? '🔐 Lock' : '🔥 Burn'}
                </button>
              ))}
            </div>
          </div>

          {strategy === 'lock' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className={labelCls + ' mb-0'}>Lock Duration</label>
                <span className="text-xs font-bold text-white">{days}d · {multiplier.toFixed(2)}×</span>
              </div>
              <input
                type="range" min={7} max={730} value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: PINK }}
              />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                <span>7d · 1×</span><span>730d · 5×</span>
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
                  <th className="text-left px-3 py-2 text-zinc-500 font-semibold uppercase tracking-wider">Strategy</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-semibold uppercase tracking-wider">Multiplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                <tr>
                  <td className="px-3 py-2 text-zinc-300">🏛️ Stake</td>
                  <td className="px-3 py-2 text-right font-bold text-white">1.00×</td>
                </tr>
                {LOCK_ROWS.map(row => {
                  const m   = getMultiplier('lock', row.days)
                  const active = strategy === 'lock' && Math.abs(days - row.days) < 15
                  return (
                    <tr key={row.days}>
                      <td className="px-3 py-2 text-zinc-400">🔐 Lock {row.label}</td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: active ? PINK : '#fff' }}>
                        {m.toFixed(2)}×
                      </td>
                    </tr>
                  )
                })}
                <tr>
                  <td className="px-3 py-2 text-zinc-300">🔥 Burn</td>
                  <td className="px-3 py-2 text-right font-bold text-white">10.00×</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800 mb-5" />

      {/* ── Row 2: Stats grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {statBox('Your Moat Points', userPoints > 0 ? fmt(userPoints) : '—')}
        {statBox('Pool Share', userPoints > 0 ? (share * 100).toFixed(4) + '%' : '—')}
        {statBox('Total Pool Points', poolPoints > 0 ? fmt(totalPoints) : '—')}
      </div>

      {/* ── Row 3: Bi-Weekly highlight ────────────────────────────── */}
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
          <p className="text-xs text-zinc-500 mt-1.5">based on live pool snapshot</p>
        )}
      </div>

      {/* ── Row 4: Monthly + Yearly ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 text-center">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">
            Monthly Reward
          </span>
          <span className="text-xl font-black text-white [text-shadow:none]">
            {hasResult ? monthly.toFixed(4) : '—'}
          </span>
          {hasResult && <p className="text-xs text-zinc-500 mt-0.5">AVAX · ~2 epochs</p>}
        </div>
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-4 text-center">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5">
            Yearly Reward
          </span>
          <span className="text-xl font-black text-white [text-shadow:none]">
            {hasResult ? yearly.toFixed(4) : '—'}
          </span>
          {hasResult && <p className="text-xs text-zinc-500 mt-0.5">AVAX · 26 epochs</p>}
        </div>
      </div>
    </div>
  )
}
