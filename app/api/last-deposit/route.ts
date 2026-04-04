import { NextResponse } from 'next/server'
import { formatEther } from 'viem'

const REWARD_ADDR = '0x5e1ac781157aaf1492f15c351183eefca5fbd746'
const FALLBACK    = 30.00
// Minimum AVAX value to qualify as an epoch deposit (filters out small incidental transfers)
const MIN_DEPOSIT = 1n * 10n ** 18n   // 1 AVAX in wei

type SnowtraceApiTx = { to: string; value: string }

async function findEpochDeposit(action: 'txlist' | 'txlistinternal'): Promise<number | null> {
  const apiKey = process.env.SNOWTRACE_API_KEY ?? 'YourApiKeyToken'
  const addr   = REWARD_ADDR.toLowerCase()
  const url    = `https://api.snowtrace.io/api?module=account&action=${action}&address=${addr}&sort=desc&page=1&offset=50&apikey=${apiKey}`

  const res  = await fetch(url, { next: { revalidate: 300 } })
  const json = await res.json()

  if (json.status !== '1' || !Array.isArray(json.result)) return null

  // Find the most recent deposit that is a genuine epoch injection (>= 1 AVAX)
  // Small transfers (e.g. 0.24 AVAX) are skipped — only real epoch deposits qualify
  const hit = (json.result as SnowtraceApiTx[]).find(tx => {
    if (tx.to?.toLowerCase() !== addr) return false
    const val = BigInt(tx.value || '0')
    return val >= MIN_DEPOSIT
  })

  return hit ? parseFloat(formatEther(BigInt(hit.value))) : null
}

export async function GET() {
  try {
    for (const action of ['txlist', 'txlistinternal'] as const) {
      const avax = await findEpochDeposit(action)
      if (avax !== null && avax > 0) return NextResponse.json({ avax, source: 'chain' })
    }
    return NextResponse.json({ avax: FALLBACK, source: 'fallback' })
  } catch {
    return NextResponse.json({ avax: FALLBACK, source: 'fallback' })
  }
}
