'use client'

import { useEffect, useState } from 'react'

type Snap = Record<string, { ts: number; v: number }>

const DAY_MS = 24 * 60 * 60 * 1000

function snapKey(tokenId: string) {
  return `${tokenId.toLowerCase()}-hub-snap`
}
function load(tokenId: string): Snap {
  try { return JSON.parse(localStorage.getItem(snapKey(tokenId)) ?? '{}') }
  catch { return {} }
}
function save(tokenId: string, s: Snap) {
  try { localStorage.setItem(snapKey(tokenId), JSON.stringify(s)) } catch {}
}

function Chip({ delta, positiveColor }: { delta: number; positiveColor: string }) {
  const up = delta >= 0
  const n  = Math.round(Math.abs(delta)).toLocaleString('en-US')
  return (
    <span style={{ color: up ? positiveColor : '#FF005C' }} className="font-medium">
      {up ? '▲' : '▼'} {up ? '+' : '-'}{n}
    </span>
  )
}

export default function DeltaRow({
  tokenId,
  field,
  current,
  serverDelta,
  floorAtZero = false,
  positiveColor = '#00FF41',
}: {
  tokenId: string
  field: string
  current: number
  serverDelta: number | null
  floorAtZero?: boolean
  positiveColor?: string
}) {
  const floor = (n: number) => floorAtZero ? Math.max(0, n) : n

  const [delta, setDelta] = useState<number | null>(
    serverDelta !== null ? floor(serverDelta) : null
  )

  useEffect(() => {
    if (serverDelta !== null) {
      setDelta(floor(serverDelta))
      return
    }

    const snap  = load(tokenId)
    const entry = snap[field]
    const now   = Date.now()

    if (entry && entry.v !== 0 && now - entry.ts < DAY_MS * 2) {
      setDelta(floor(current - entry.v))
    } else {
      setDelta(0)
    }

    if (!entry || now - entry.ts > DAY_MS) {
      save(tokenId, { ...snap, [field]: { ts: now, v: current } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId, field, current, serverDelta, floorAtZero])

  if (delta === null) return null

  return (
    <span className="text-zinc-500 text-xs flex items-center gap-1">
      24h: <Chip delta={delta} positiveColor={positiveColor} />
    </span>
  )
}
