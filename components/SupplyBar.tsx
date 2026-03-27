interface Segment {
  label: string
  value: number
  bg: string
  glow: string
}

interface Props {
  staked: number
  locked: number
  burned: number      // dead wallet total — all burned tokens
  lp: number
  circulating: number
  supply: number
  color: string       // brand color for Circulating segment
  colorRgb: string
}

export default function SupplyBar({
  staked, locked, burned, lp, circulating, supply, color, colorRgb,
}: Props) {
  const segments: Segment[] = [
    { label: 'Staked',      value: staked,      bg: '#3B82F6', glow: 'rgba(59,130,246,0.75)'  },
    { label: 'Locked',      value: locked,      bg: '#8B5CF6', glow: 'rgba(139,92,246,0.75)'  },
    { label: 'Burned',      value: burned,      bg: '#EF4444', glow: 'rgba(239,68,68,0.75)'   },
    { label: 'Liquidity',   value: lp,          bg: '#F59E0B', glow: 'rgba(245,158,11,0.75)'  },
    { label: 'Circulating', value: circulating, bg: color,     glow: `rgba(${colorRgb},0.75)` },
  ]

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 col-span-full transition-colors">

      <p className="text-zinc-400 text-sm font-medium tracking-wider mb-3">Supply Distribution</p>

      {/* Stacked bar — drop-shadow on container creates ambient outer glow */}
      <div
        className="flex w-full h-5 rounded-full overflow-hidden gap-[2px]"
        style={{ filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.07))' }}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            className="transition-all duration-500 h-full"
            style={{
              width: `${(s.value / supply * 100).toFixed(4)}%`,
              backgroundColor: s.bg,
            }}
            title={`${s.label}: ${Math.round(s.value).toLocaleString('en-US')}`}
          />
        ))}
      </div>

      {/* Legend — box-shadow on swatches is not clipped, shows per-color glow */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs text-zinc-400">
            <span
              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              style={{
                backgroundColor: s.bg,
                boxShadow: `0 0 6px ${s.glow}, 0 0 12px ${s.glow}`,
              }}
            />
            <span>
              <span className="text-zinc-200 font-medium">{s.label}</span>
              {' — '}
              {(s.value / supply * 100).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
