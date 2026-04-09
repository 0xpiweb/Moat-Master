import { NextResponse } from 'next/server'

export const revalidate = 60

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393'
const MOAT_API_URL  = `https://moat-api.fortifi.network/api/moat-points/all?contractAddress=${MOAT_CONTRACT}`

export async function GET() {
  try {
    const res = await fetch(MOAT_API_URL, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`Fortifi API responded with ${res.status}`)

    const data = await res.json()
    if (!Array.isArray(data)) throw new Error('Invalid response format from Fortifi')

    // "Unified Pool" denominator:
    //   totalPoints         = Σ(points_i)
    //   totalWeightedPoints = Σ(points_i × boostMultiplier_i)
    //
    // User share = (moatPoints + moatPoints × avgMult) / (totalPoints + totalWeightedPoints)
    //            = moatPoints × (1 + avgMult) / (totalPoints + totalWeightedPoints)
    let totalPoints         = 0
    let totalWeightedPoints = 0

    for (const p of data) {
      const pts  = Number(p.points)          || 0
      const mult = Number(p.boostMultiplier) || 0
      totalPoints         += pts
      totalWeightedPoints += pts * mult
    }

    return NextResponse.json({ totalPoints, totalWeightedPoints, participantCount: data.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
