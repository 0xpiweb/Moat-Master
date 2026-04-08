import { NextResponse } from 'next/server'

export const revalidate = 60

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393'
const MOAT_API_URL = `https://moat-api.fortifi.network/api/moat-points/all?contractAddress=${MOAT_CONTRACT}`

export async function GET() {
  try {
    const res = await fetch(MOAT_API_URL, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`Fortifi API responded with ${res.status}`)

    const data = await res.json()
    if (!Array.isArray(data)) throw new Error('Invalid response format from Fortifi')

    // System calculation: Precise iteration through participants
    const totalWeight = data.reduce((acc, p) => {
      // Logic: Ensure we capture points and multiplier regardless of key casing
      const points = parseFloat(p.points || p.total_points || p.totalPoints || 0)
      const multiplier = parseFloat(p.avgMultiplier || p.multiplier || 1)
      return acc + (points * multiplier)
    }, 0)

    return NextResponse.json({ 
      totalWeight: Math.round(totalWeight), 
      participantCount: data.length 
    })
  } catch (err) {
    console.error('[System Error]', err)
    return NextResponse.json({ error: 'Failed to synchronize weighted power' }, { status: 500 })
  }
}
