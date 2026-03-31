'use client'

import { useState } from 'react'

const PINK    = '#ff007a'
const PINK_RGB = '255,0,122'

type Strategy = 'stake' | 'lock' | 'burn'

function getMultiplier(strategy: Strategy, days: number): number {
  if (strategy === 'stake') return 1
  if (strategy === 'burn')  return 10
  // Lock: linear 1× at 7 days → 5× at 730 days
  return 1 + ((days - 7) / (730 - 7)) * 4
}

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return Math.round(n).toLocaleString('en-US')
  return n.toFixed(2)
}

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

  // Estimate existing pool: staked×1, locked×3 (midpoint mult), burned×10
  const poolPoints  = totalStaked * 1 + totalLocked * 3 + totalBurned * 10
  const totalPoints = poolPoints + userPoints
  const share       = totalPoints > 0 ? userPoints / totalPoints : 0
  const projAvax    = share * avaxInput

  const strategies: { id: Strategy; label: string }[] = [
    { id: 'stake', label: '🏛️ Stake' },
    { id: 'lock',  label: '🔐 Lock'  },
    { id: 'burn',  label: '🔥 Burn'  },
  ]

  const inputClass = "w-full bg-black/60 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm font-semibold outline-none focus:border-[#ff007a] transition-colors [text-shadow:none]"
  const labelClass = "text-xs text-zinc-400 font-semibold mb-1.5 block"

  return (
    <div
      id="calculator"
      className="border rounded-2xl p-6 mt-4 backdrop-blur-xl bg-zinc-900/50"
      style={{ borderColor: `rgba(${PINK_RGB},0.45)`, boxShadow: `0 0 28px rgba(${PINK_RGB},0.07)` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-5" style={{ color: PINK }}>
        Moat Optimizer
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Inputs ─────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Amount */}
          <div>
            <label className={labelClass} style={{ letterSpacing: '0.02em' }}>$LIL Amount</label>
            <input
              type="number" min="0" placeholder="Enter amount…"
              value={amount} onChange={e => setAmount(e.target.value)}
              className={inputClass} style={{ letterSpacing: '0.01em' }}
            />
          </div>

          {/* Strategy */}
          <div>
            <label className={labelClass} style={{ letterSpacing: '0.02em' }}>Strategy</label>
            <div className="flex gap-2">
              {strategies.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all [text-shadow:none]"
                  style={strategy === s.id
                    ? { backgroundColor: PINK, borderColor: PINK, color: '#fff' }
                    : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#71717a' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration slider — Lock only */}
          {strategy === 'lock' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className={labelClass + ' mb-0'} style={{ letterSpacing: '0.02em' }}>Lock Duration</label>
                <span className="text-xs font-bold text-white">{days}d</span>
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

          {/* Epoch Rewards */}
          <div>
            <label className={labelClass} style={{ letterSpacing: '0.02em' }}>Estimated Epoch Rewards (AVAX)</label>
            <input
              type="number" min="0" step="0.01" placeholder="e.g. 30.41"
              value={epochRewards} onChange={e => setEpochRewards(e.target.value)}
              className={inputClass} style={{ letterSpacing: '0.01em' }}
            />
          </div>
        </div>

        {/* ── Outputs ────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Multiplier */}
          <div className="bg-black/40 border border-zinc-800 rounded-xl p-4">
            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1">Multiplier</span>
            <span className="text-3xl font-black [text-shadow:none]" style={{ color: PINK }}>
              {multiplier.toFixed(2)}×
            </span>
            {strategy === 'lock' && (
              <p className="text-xs text-zinc-500 mt-0.5">{days}-day lock</p>
            )}
          </div>

          {/* Moat Points */}
          <div className="bg-black/40 border border-zinc-800 rounded-xl p-4">
            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1">Your Moat Points</span>
            <span className="text-2xl font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
              {userPoints > 0 ? fmt(userPoints) : '—'}
            </span>
            {userPoints > 0 && poolPoints > 0 && (
              <p className="text-xs text-zinc-500 mt-0.5">{(share * 100).toFixed(4)}% of current pool</p>
            )}
          </div>

          {/* Projected AVAX */}
          <div
            className="border rounded-xl p-4 flex-1"
            style={{ backgroundColor: `rgba(${PINK_RGB},0.07)`, borderColor: `rgba(${PINK_RGB},0.3)` }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: PINK }}>
              Projected AVAX Reward
            </span>
            <span className="text-2xl font-black text-white [text-shadow:none]" style={{ letterSpacing: '-0.01em' }}>
              {avaxInput > 0 && userPoints > 0 ? projAvax.toFixed(4) : '—'}
              {avaxInput > 0 && userPoints > 0 && (
                <span className="text-sm font-normal text-zinc-400 ml-1.5">AVAX</span>
              )}
            </span>
            {avaxInput > 0 && userPoints > 0 && (
              <p className="text-xs text-zinc-500 mt-0.5">based on live pool snapshot</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
