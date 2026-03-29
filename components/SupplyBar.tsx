interface Props {
  staked:      number
  locked:      number
  burned:      number      // dead-wallet total / totalBurned — all burned tokens (bar segment)
  lp:          number
  circulating: number
  moatBurned:  number      // moat-contract burned only — for Secured in Moat header
  supply:      number
  color:       string      // brand color
  colorRgb:    string
  variant?:    'light' | 'frosted'  // undefined = default dark
}

export default function SupplyBar({
  staked, locked, burned, lp, circulating,
  moatBurned, supply, color, colorRgb,
  variant,
}: Props) {
  const moatTotal = staked + locked + moatBurned
  const moatPct   = (moatTotal / supply * 100).toFixed(2)
  const w = (n: number) => `${Math.max(0, (n / supply) * 100).toFixed(4)}%`

  if (variant === 'light') {
    // Pop-art / parchment style (BENSI)
    const segments = [
      { label: 'Staked',      value: staked,      color: '#3B82F6' },
      { label: 'Locked',      value: locked,      color: '#8B5CF6' },
      { label: 'Burned',      value: burned,      color: '#E31E24' },
      { label: 'LP',          value: lp,          color: '#10B981' },
      { label: 'Circulating', value: circulating, color: '#FFD700' },
    ]
    return (
      <div className="bg-white border-2 border-black rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-black text-xs font-black uppercase tracking-widest">
            Supply Distribution
          </span>
          <span className="text-xs font-black px-2 py-0.5 rounded-full border-2 border-black" style={{ backgroundColor: '#E31E24', color: '#fff' }}>
            {moatPct}% Secured in Moat
          </span>
        </div>
        <div className="flex h-4 w-full overflow-hidden rounded-sm border-2 border-black gap-px mb-3 bg-black">
          {segments.map(s => s.value > 0 && (
            <div key={s.label} style={{ width: w(s.value), backgroundColor: s.color, minWidth: '2px' }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {segments.map(s => (
            <span key={s.label} className="flex items-center gap-1 text-xs font-bold text-black">
              <span className="w-2 h-2 rounded-full border border-black" style={{ backgroundColor: s.color }} />
              {s.label} <span className="text-gray-500 font-normal">{(s.value / supply * 100).toFixed(2)}%</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'frosted') {
    // Obsidian / frosted glass style (DISH)
    const segments = [
      { label: 'Staked',      value: staked,      color: '#3B82F6' },
      { label: 'Locked',      value: locked,      color: '#8B5CF6' },
      { label: 'Burned',      value: burned,      color: color },
      { label: 'LP',          value: lp,          color: '#10B981' },
      { label: 'Circulating', value: circulating, color: '#52525B' },
    ]
    return (
      <div className="bg-[#121212]/[.92] backdrop-blur-md border border-zinc-800 border-t-white/10 rounded-xl p-5 mb-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-xs font-medium uppercase tracking-widest">
            Supply Distribution
          </span>
          <span
            className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#121212] text-white border"
            style={{ borderColor: `rgba(${colorRgb},0.6)` }}
          >
            {moatPct}% Secured in Moat
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-sm border border-zinc-800 gap-px mb-3 bg-[#050505]">
          {segments.map(s => s.value > 0 && (
            <div key={s.label} style={{ width: w(s.value), backgroundColor: s.color, minWidth: '2px' }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {segments.map(s => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label} <span className="text-zinc-600">{(s.value / supply * 100).toFixed(2)}%</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  // Default dark theme with gradients
  const segments = [
    { label: 'Staked',      value: staked,      gradient: 'linear-gradient(180deg,#00F0FF 0%,#0075FF 100%)', dot: '#00F0FF' },
    { label: 'Locked',      value: locked,      gradient: 'linear-gradient(180deg,#BC00FF 0%,#7000FF 100%)', dot: '#BC00FF' },
    { label: 'Burned',      value: burned,      gradient: 'linear-gradient(180deg,#FF005C 0%,#990037 100%)', dot: '#FF005C' },
    { label: 'Liquidity',   value: lp,          gradient: 'linear-gradient(180deg,#FFE600 0%,#FFB800 100%)', dot: '#FFE600' },
    { label: 'Circulating', value: circulating, gradient: 'linear-gradient(180deg,#00FF94 0%,#00C853 100%)', dot: '#00FF94' },
  ]

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4 transition-all duration-300 ease-in-out">

      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-400 text-xs font-medium uppercase tracking-widest">
          Supply Distribution
        </span>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-black text-white border"
          style={{ borderColor: `rgba(${colorRgb},0.6)` }}
        >
          {moatPct}% Secured in Moat
        </span>
      </div>

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
