import type { ReactNode } from 'react'
import DeltaRow from './DeltaRow'

interface StatCardProps {
  icon?: string
  iconSrc?: string
  iconNode?: ReactNode
  label: string
  value: number
  pct: string
  delta?: number | null
  wide?: boolean
  provenance?: string
  provenanceSrc?: string
  provenanceSrcAlt?: string
  ticker: string
  color: string
  colorRgb: string
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export default function StatCard({
  icon, iconSrc, iconNode, label, value, pct, delta, wide,
  provenance, provenanceSrc, provenanceSrcAlt,
  ticker, color, colorRgb,
}: StatCardProps) {
  const field = label.toLowerCase().replace(/\s+/g, '_')

  return (
    <div
      className={`relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-2 transition-colors ${wide ? 'col-span-2' : ''}`}
      style={{ ['--hover-color' as string]: color }}
    >
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-sm font-medium flex items-center gap-1.5">
          {iconNode
            ? <span className="h-6 w-6 min-w-[24px] flex-shrink-0 flex items-center justify-center">{iconNode}</span>
            : iconSrc
              ? <div className="h-6 w-6 min-w-[24px] rounded-full overflow-hidden flex-shrink-0"><img src={iconSrc} className="h-full w-full object-cover" alt="token" /></div>
              : <span>{icon}</span>
          }
          {label}
        </span>
        <span className="bg-black text-[#00FF41] text-xs font-semibold px-2 py-0.5 rounded-full border border-[#00FF41]/30">
          {pct}%
        </span>
      </div>

      <p className="text-2xl font-bold tracking-tight text-white">
        {fmt(value)}
        <span className="text-zinc-500 text-base font-normal ml-1">${ticker}</span>
      </p>

      <div className="h-4 flex items-center">
        <DeltaRow
          field={field}
          current={value}
          serverDelta={delta ?? null}
        />
      </div>

      {provenance && (
        <span className="absolute bottom-3 right-3 text-[14px] opacity-100 select-none">
          {provenance}
        </span>
      )}
      {provenanceSrc && (
        <img
          src={provenanceSrc}
          alt={provenanceSrcAlt ?? 'source'}
          className="absolute bottom-3 right-3 h-4 w-4 opacity-100 select-none"
        />
      )}
    </div>
  )
}
