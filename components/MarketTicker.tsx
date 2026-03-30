'use client'

import { useState, useEffect, useCallback } from 'react'

const REFRESH_MS = 30_000

export interface MarketData {
  priceUsd:  number | null
  priceAvax: number | null
  liquidity: number | null
  marketCap: number | null  // from DexScreener pair.marketCap
  fdv:       number | null  // priceUsd × token config supply (our calculation)
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)         return '$' + Math.round(n).toLocaleString('en-US')
  return '$' + n.toFixed(2)
}

function fmtPrice(n: number): string {
  if (n < 0.0001) return '$' + n.toFixed(8)
  if (n < 0.01)   return '$' + n.toFixed(6)
  return '$' + n.toFixed(4)
}

function fmtAvax(n: number): string {
  if (n < 0.000001) return n.toFixed(10)
  if (n < 0.0001)   return n.toFixed(8)
  if (n < 0.01)     return n.toFixed(6)
  return n.toFixed(4)
}

interface Props {
  initial:      MarketData
  dexApiUrl:    string
  color:        string
  supply:       number
  holders:      number | null
  variant?:     'light' | 'frosted'
  accentColor?: string   // override accent color for FDV/Holders cells
}

export default function MarketTicker({ initial, dexApiUrl, color, supply, holders, variant, accentColor }: Props) {
  const [market, setMarket] = useState<MarketData>(initial)

  const refresh = useCallback(async () => {
    try {
      const res   = await fetch(dexApiUrl, { cache: 'no-store' })
      const json  = await res.json()
      const pair  = json?.pairs?.[0] ?? null
      if (!pair) return
      const price = pair.priceUsd ? parseFloat(pair.priceUsd) : null
      setMarket({
        priceUsd:  price,
        priceAvax: pair.priceNative ? parseFloat(pair.priceNative) : null,
        liquidity: pair.liquidity?.usd ?? null,
        marketCap: pair.marketCap   ?? null,
        fdv:       price ? price * supply : null,
      })
    } catch { /* keep stale data on error */ }
  }, [dexApiUrl, supply])

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  const metrics: { label: string; value: string; accent?: boolean }[] = [
    { label: 'Price USD',        value: market.priceUsd  ? fmtPrice(market.priceUsd)       : '—' },
    { label: 'Price WAVAX',      value: market.priceAvax ? fmtAvax(market.priceAvax)       : '—' },
    { label: 'Liquidity',        value: market.liquidity ? fmtUsd(market.liquidity)        : '—' },
    { label: 'Market Cap',       value: market.marketCap ? fmtUsd(market.marketCap)        : '—' },
    { label: 'Fully Diluted MC', value: market.fdv       ? fmtUsd(market.fdv)              : '—',  accent: true },
    { label: 'Holders',          value: holders != null  ? holders.toLocaleString('en-US') : '---', accent: true },
  ]

  const ac = accentColor ?? color

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {metrics.map(({ label, value, accent }) => {
        if (variant === 'light') {
          return (
            <div
              key={label}
              className="bg-white rounded-xl p-4 flex flex-col gap-1"
              style={{ border: `2px solid ${accent ? ac : '#000'}` }}
            >
              <span className="text-gray-600 text-xs font-bold tracking-wider uppercase">{label}</span>
              <span className="text-base font-black text-black">{value}</span>
            </div>
          )
        }

        if (variant === 'frosted') {
          const inner = (
            <div className="bg-[#121212] backdrop-blur-md rounded-[11px] p-4 flex flex-col gap-1 h-full">
              <span className="text-zinc-500 text-xs font-medium tracking-wider uppercase">{label}</span>
              <span className="text-base font-bold tracking-wider text-white">{value}</span>
            </div>
          )
          return (
            <div
              key={label}
              className="rounded-xl p-px shadow-2xl"
              style={{ background: accent ? (accentColor ?? 'rgba(255,255,255,0.55)') : 'rgb(39 39 42)' }}
            >
              {inner}
            </div>
          )
        }

        // Default dark
        return (
          <div
            key={label}
            className="rounded-2xl p-px"
            style={{ background: accent ? ac : 'rgb(39 39 42)' }}
          >
            <div className="bg-zinc-900 rounded-[15px] p-4 flex flex-col gap-1 h-full">
              <span className="text-zinc-500 text-xs font-medium tracking-wider">{label}</span>
              <span className="text-base font-bold tracking-wider text-white">{value}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
