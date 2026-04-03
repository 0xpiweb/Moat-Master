import { NextResponse } from 'next/server'
import { formatEther } from 'viem'

const REWARD_ADDR = '0x5e1ac781157aaf1492f15c351183eefca5fbd746'
const FALLBACK    = 30.41

type SnowtraceApiTx = { to: string; value: string }

async function findLastDeposit(action: 'txlist' | 'txlistinternal'): Promise<number | null> {
  const apiKey = process.env.SNOWTRACE_API_KEY ?? 'YourApiKeyToken'
  const addr   = REWARD_ADDR.toLowerCase()
  const url    = `https://api.snowtrace.io/api?module=account&action=${action}&address=${addr}&sort=desc&page=1&offset=50&apikey=${apiKey}`

  const res  = await fetch(url, { next: { revalidate: 300 } })
  const json = await res.json()

  if (json.status !== '1' || !Array.isArray(json.result)) return null

  const hit = (json.result as SnowtraceApiTx[]).find(tx =>
    tx.to?.toLowerCase() === addr && BigInt(tx.value || '0') > 0n
  )

  return hit ? parseFloat(formatEther(BigInt(hit.value))) : null
}

export async function GET() {
  try {
    // Try normal outright transfers first, then internal (contract-initiated) transfers
    for (const action of ['txlist', 'txlistinternal'] as const) {
      const avax = await findLastDeposit(action)
      if (avax !== null && avax > 0) return NextResponse.json({ avax })
    }
    return NextResponse.json({ avax: FALLBACK })
  } catch {
    return NextResponse.json({ avax: FALLBACK })
  }
}
