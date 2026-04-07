import { NextResponse } from 'next/server'

export const revalidate = 60

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393'
const MOAT_API_URL  = `https://moat-api.fortifi.network/api/moat-points/all?contractAddress=${MOAT_CONTRACT}`

interface MoatParticipant {
  walletAddress:   string
  contractAddress: string
  points:          number
  avgMultiplier:   number
  lastUpdated:     number
}

export async function GET() {
  try {
    const res = await fetch(MOAT_API_URL, { next: { revalidate: 60 } })

    if (!res.ok) {
      return NextResponse.json({ error: `Moat API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json() as MoatParticipant[]

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Unexpected response shape from Moat API' }, { status: 500 })
    }

    // Σ(points_i × avgMultiplier_i) — mirrors the contract's weighted distribution logic
    const totalWeight = data.reduce((acc, p) => {
      const pts  = Number(p.points)        || 0
      const mult = Number(p.avgMultiplier) || 0
      return acc + pts * mult
    }, 0)

    return NextResponse.json({ totalWeight, participantCount: data.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
