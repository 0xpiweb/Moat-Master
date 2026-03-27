interface Segment {
  label:    string
  value:    number
  gradient: string
  dot:      string
}

interface Props {
  staked:      number
  locked:      number
  burned:      number      // dead-wallet total — all burned tokens (bar segment)
  lp:          number
  circulating: number
  moatBurned:  number      // moat-contract burned only — for Secured in Moat header
  supply:      number
  color:       string      // brand color for header text
  colorRgb:    string      // brand color RGB for badge border
}

function fmtSupply(n: number): string {
  const b = n / 1_000_000_000
  return b % 1 === 0 ? `${b}B` : `${parseFloat(b.toFixed(2))}B`
}

export default function SupplyBar({
  staked, locked, burned, lp, circulating,
  moatBurned, supply, color, colorRgb,
}: Props) {
  const moatTotal = staked + locked + moatBurned
  const moatPct   = (moatTotal / supply * 100).toFixed(2)

  // Fixed "Toxic" gradient palette — same across all hubs
  const segments: Segment[] = [
    { label: 'Staked',      value: staked,      gradient: 'linear-gradient(180deg,#00F0FF 0%,#0075FF 100%)', dot: '#00F0FF' },
    { label: 'Locked',      value: locked,      gradient: 'linear-gradient(180deg,#BC00FF 0%,#7000FF 100%)', dot: '#BC00FF' },
    { label: 'Burned',      value: burned,      gradient: 'linear-gradient(180deg,#FF005C 0%,#990037 100%)', dot: '#FF005C' },
    { label: 'Liquidity',   value: lp,          gradient: 'linear-gradient(180deg,#FFE600 0%,#FFB800 100%)', dot: '#FFE600' },
    { label: 'Circulating', value: circulating, gradient: 'linear-gradient(180deg,#00FF94 0%,#00C853 100%)', dot: '#00FF94' },
  ]

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4 transition-all duration-300 ease-in-out">

      {/* Secured in Moat header */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-lg font-bold tracking-tight leading-none" style={{ color }}>
          {Math.round(moatTotal).toLocaleString('en-US')}
          <span className="text-sm font-normal ml-1" style={{ color }}>$</span>
        </span>
        <span className="text-zinc-400 text-[11px] font-medium leading-none">Secured in Moat</span>
        <span
          className="border text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap leading-none"
          style={{ borderColor: '#00FF94', color: '#00FF94' }}
        >
          {moatPct}% of {fmtSupply(supply)}
        </span>
      </div>

      <p className="text-zinc-400 text-sm font-medium mb-3">Supply Distribution</p>

      {/* Stacked bar */}
      <div
        className="flex w-full h-3 rounded-full overflow-hidden gap-px mb-3"
        style={{
          filter:    'drop-shadow(0 0 8px rgba(0,255,148,0.2))',
          borderTop: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            className="transition-all duration-500"
            style={{
              width:      `${(s.value / supply * 100).toFixed(4)}%`,
              background: s.gradient,
            }}
            title={`${s.label}: ${Math.round(s.value).toLocaleString('en-US')}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.dot }} />
            {s.label} — {(s.value / supply * 100).toFixed(2)}%
          </div>
        ))}
      </div>
    </div>
  )
}
