'use client'

import { useEffect, useState } from 'react'

type Snap = Record<string, { ts: number; v: number }>

const DAY_MS = 24 * 60 * 60 * 1000

const SNAP_KEY = `${process.env.NEXT_PUBLIC_TOKEN_ID ?? 'lil'}-hub-snap`

function load(): Snap {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) ?? '{}') }
  catch { return {} }
}
function save(s: Snap) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)) } catch {}
}

function Chip({ delta }: { delta: number }) {
  const up = delta >= 0
  const n  = Math.round(Math.abs(delta)).toLocaleString('en-US')
  return (
    <span style={{ color: up ? '#00FF41' : '#FF005C' }} className="font-medium">
      {up ? '▲' : '▼'} {up ? '+' : '-'}{n}
    </span>
  )
}

export default function DeltaRow({
  field,
  current,
  serverDelta,
  floorAtZero = false,
}: {
  field: string
  current: number
  serverDelta: number | null
  floorAtZero?: boolean
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

    const snap  = load()
    const entry = snap[field]
    const now   = Date.now()

    if (entry && now - entry.ts < DAY_MS * 2) {
      setDelta(floor(current - entry.v))
    } else {
      setDelta(0)
    }

    if (!entry || now - entry.ts > DAY_MS) {
      save({ ...snap, [field]: { ts: now, v: current } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, current, serverDelta, floorAtZero])

  if (delta === null) return null

  return (
    <span className="text-zinc-500 text-xs flex items-center gap-1">
      24h: <Chip delta={delta} />
    </span>
  )
}
