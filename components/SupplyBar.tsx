interface Segment {
  label: string
  value: number
  bg: string
}

interface Props {
  staked: number
  locked: number
  burned: number      // dead-wallet total — all burned tokens (bar segment)
  lp: number
  circulating: number
  moatBurned: number  // moat-contract burned only — used for Secured in Moat header
  supply: number
  color: string       // brand color for Circulating segment
  colorRgb: string
}

export default function SupplyBar({
  staked, locked, burned, lp, circulating,
  moatBurned, supply, color, colorRgb,
}: Props) {
  const secured    = staked + locked + moatBurned
  const securedPct = (secured / supply * 100).toFixed(2)

  const segments: Segment[] = [
    { label: 'Staked',      value: staked,      bg: '#3B82F6' },
    { label: 'Locked',      value: locked,      bg: '#8B5CF6' },
    { label: 'Burned',      value: burned,      bg: '#EF4444' },
    { label: 'Liquidity',   value: lp,          bg: '#F59E0B' },
    { label: 'Circulating', value: circulating, bg: color     },
  ]

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 col-span-full transition-colors">

      {/* Secured in Moat summary */}
      <p className="text-xs text-zinc-500 tracking-wider mb-2">
        <span className="font-semibold text-sm" style={{ color }}>
          {Math.round(secured).toLocaleString('en-US')}
        </span>
        {' '}Secured in Moat
        <span
          className="ml-2 bg-black border text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ color, borderColor: `rgba(${colorRgb},0.3)` }}
        >
          {securedPct}% of supply
        </span>
      </p>

      <p className="text-zinc-400 text-sm font-medium tracking-wider mb-3">Supply Distribution</p>

      {/* Stacked bar — no overflow-hidden so box-shadow glows are visible */}
      <div className="flex w-full h-4 gap-[1px]">
        {segments.map((s, i) => {
          const isFirst = i === 0
          const isLast  = i === segments.length - 1
          return (
            <div
              key={s.label}
              className="transition-all duration-500 h-full"
              style={{
                width: `${(s.value / supply * 100).toFixed(4)}%`,
                backgroundColor: s.bg,
                borderRadius: isFirst
                  ? '9999px 0 0 9999px'
                  : isLast
                  ? '0 9999px 9999px 0'
                  : '0',
              }}
              title={`${s.label}: ${Math.round(s.value).toLocaleString('en-US')}`}
            />
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs text-zinc-400">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: s.bg }}
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
