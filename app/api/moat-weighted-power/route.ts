import { NextResponse } from 'next/server'

export const revalidate = 60

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393'
const MOAT_API_URL = `https://moat-api.fortifi.network/api/moat-points/all?contractAddress=${MOAT_CONTRACT}`

export async function GET() {
  try {
    const res = await fetch(MOAT_API_URL, { next: { revalidate: 60 } })

    if (!res.ok) {
      return NextResponse.json({ error: `Moat API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Unexpected response shape from Moat API' }, { status: 500 })
    }

    // Robust calculation that handles naming variations
    const totalWeight = data.reduce((acc, p) => {
      // API might use 'points', 'totalPoints', 'points_balance'
      const pts = Number(p.points || p.totalPoints || p.points_balance) || 0
      // API might use 'avgMultiplier', 'multiplier', 'current_multiplier'
      const mult = Number(p.avgMultiplier || p.multiplier || p.current_multiplier) || 1
      
      return acc + (pts * mult)
    }, 0)

    // Log to Vercel console so we can see the raw data if it still fails
    console.log(`[Moat API] Processed ${data.length} participants. Total Weight: ${totalWeight}`);

    return NextResponse.json({ 
      totalWeight: totalWeight || 1, // Fallback to 1 to avoid division by zero in UI
      participantCount: data.length 
    })
  } catch (err) {
    console.error("[Moat API Error]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
