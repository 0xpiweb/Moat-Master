import type { ReactNode } from 'react'
import Image from 'next/image'
import DeltaRow from './DeltaRow'

interface StatCardProps {
  icon?: string
  iconSrc?: string
  iconNode?: ReactNode
  label: string
  value: number
  pct: string
  delta?: number | null
  floorAtZero?: boolean
  wide?: boolean
  provenance?: string
  provenanceSrc?: string
  provenanceSrcAlt?: string
  tokenId: string
  ticker: string
  color: string
  colorRgb: string
  variant?: 'light' | 'frosted'
  deltaPositiveColor?: string
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export default function StatCard({
  icon, iconSrc, iconNode, label, value, pct, delta, floorAtZero, wide,
  provenance, provenanceSrc, provenanceSrcAlt,
  tokenId, ticker, color, colorRgb,
  variant, deltaPositiveColor = '#00FF41',
}: StatCardProps) {
  const field = label.toLowerCase().replace(/\s+/g, '_')
  const wideClass = wide ? ' col-span-2' : ''

  // Card container
  const cardClass =
    variant === 'light'
      ? `relative bg-white border-2 border-black rounded-xl p-5 flex flex-col gap-2${wideClass}`
      : variant === 'frosted'
      ? `relative bg-[#121212]/[.92] backdrop-blur-xl border border-zinc-800 border-t-white/10 rounded-xl p-5 flex flex-col gap-2 shadow-2xl${wideClass}`
      : `relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-2 transition-colors${wideClass}`

  // Label
  const labelClass =
    variant === 'light'
      ? 'text-black text-sm font-bold flex items-center gap-1.5'
      : variant === 'frosted'
      ? 'text-zinc-300 text-sm font-medium flex items-center gap-1.5'
      : 'text-zinc-400 text-sm font-medium flex items-center gap-1.5'

  // Percentage badge
  const pctBadge =
    variant === 'light' ? (
      <span className="text-xs font-black px-2 py-0.5 rounded-full border-2 border-black" style={{ backgroundColor: '#FFD700', color: '#000' }}>
        {pct}%
      </span>
    ) : variant === 'frosted' ? (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full border" style={{ borderColor: `rgba(${colorRgb},0.35)`, color }}>
        {pct}%
      </span>
    ) : (
      <span className="bg-black text-[#00FF41] text-xs font-semibold px-2 py-0.5 rounded-full border border-[#00FF41]/30">
        {pct}%
      </span>
    )

  // Value
  const valueClass =
    variant === 'light'
      ? 'text-2xl font-black tracking-tight text-black'
      : 'text-2xl font-bold tracking-tight text-white'

  const tickerClass =
    variant === 'light'
      ? 'text-gray-500 text-base font-normal ml-1'
      : 'text-zinc-500 text-base font-normal ml-1'

  // Icon border in iconSrc
  const iconBorderClass =
    variant === 'light'
      ? 'h-6 w-6 min-w-[24px] rounded-full overflow-hidden border-2 border-black flex-shrink-0'
      : 'h-6 w-6 min-w-[24px] rounded-full overflow-hidden border border-zinc-700 flex-shrink-0'

  // Provenance opacity
  const provOpacity = variant === 'frosted' ? 'opacity-30' : 'opacity-100'

  return (
    <div className={cardClass} style={{ ['--hover-color' as string]: color }}>
      <div className="flex items-center justify-between">
        <span className={labelClass}>
          {iconNode
            ? <span className="h-6 w-6 min-w-[24px] flex-shrink-0 flex items-center justify-center">{iconNode}</span>
            : iconSrc
              ? <div className={iconBorderClass}><Image src={iconSrc} width={128} height={128} className="h-full w-full object-cover" alt="token" /></div>
              : <span>{icon}</span>
          }
          {label}
        </span>
        {pctBadge}
      </div>

      <p className={valueClass}>
        {fmt(value)}
        <span className={tickerClass}>${ticker}</span>
      </p>

      <div className="h-4 flex items-center">
        <DeltaRow
          tokenId={tokenId}
          field={field}
          current={value}
          serverDelta={delta ?? null}
          floorAtZero={floorAtZero}
          positiveColor={deltaPositiveColor}
        />
      </div>

      {provenance && (
        <span className={`absolute bottom-3 right-3 text-[14px] select-none ${provOpacity}`}>
          {provenance}
        </span>
      )}
      {provenanceSrc && (
        <img
          src={provenanceSrc}
          alt={provenanceSrcAlt ?? 'source'}
          className={`absolute bottom-3 right-3 h-4 w-4 select-none ${provOpacity}`}
        />
      )}
    </div>
  )
}
