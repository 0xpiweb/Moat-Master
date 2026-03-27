interface Segment {
  label: string
  value: number
  color: string
}

interface Props {
  staked: number
  locked: number
  burned: number
  lp: number
  circulating: number
  supply: number
  color: string
  colorRgb: string
}

export default function SupplyBar({ staked, locked, burned, lp, circulating, supply, color, colorRgb }: Props) {
  const secured    = staked + locked + burned
  const securedPct = (secured / supply * 100).toFixed(2)

  const segments: Segment[] = [
    { label: 'Secured in Moat', value: secured,     color: 'bg-blue-500'   },
    { label: 'Total Burned',    value: burned,       color: 'bg-red-600'    },
    { label: 'LP Pair',         value: lp,           color: 'bg-amber-500'  },
    { label: 'Circulating',     value: circulating,  color: '' },
  ]

  return (
    <div
      className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 col-span-full transition-colors"
      style={{ ['--tw-border-opacity' as string]: '1' }}
    >
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

      <div className="flex w-full h-4 rounded-full overflow-hidden gap-px">
        {segments.map((s) => (
          <div
            key={s.label}
            className={s.color || undefined}
            style={{
              width: `${(s.value / supply * 100).toFixed(4)}%`,
              ...(s.label === 'Circulating' ? { backgroundColor: color } : {}),
            }}
            title={`${s.label}: ${s.value.toLocaleString('en-US')}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-sm ${s.color || ''}`}
              style={s.label === 'Circulating' ? { backgroundColor: color } : {}}
            />
            {s.label} — {(s.value / supply * 100).toFixed(2)}%
          </div>
        ))}
      </div>
    </div>
  )
}
