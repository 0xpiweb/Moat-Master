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

    // `weight` in the API equals `points / K` for a fixed constant K.
    // K cancels in the share ratio, so summing points directly gives the cleanest
    // denominator — no magic constant needed in either the route or the frontend.
    const totalPoints = data.reduce((acc: number, p: { points: number }) => acc + (Number(p.points) || 0), 0)

    return NextResponse.json({ totalPoints, participantCount: data.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
