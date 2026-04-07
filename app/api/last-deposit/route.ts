import { NextResponse } from 'next/server'
import { formatEther } from 'viem'

const REWARD_ADDR = '0x5e1ac781157aaf1492f15c351183eefca5fbd746'
const FALLBACK    = 30.00
// Minimum AVAX value to qualify as an epoch deposit (filters out small incidental transfers)
const MIN_DEPOSIT = 1n * 10n ** 18n   // 1 AVAX in wei

// ── Epoch schedule ────────────────────────────────────────────────────────────
// 14-day cycle anchored to March 16, 2026 (epoch 26 start per community schedule).
// Sequence: Mar 16 → Mar 30 → Apr 13 → Apr 27 → …
const EPOCH_ANCHOR_MS = Date.UTC(2026, 2, 16)   // month is 0-indexed: 2 = March
const EPOCH_MS        = 14 * 24 * 60 * 60 * 1000

function getCurrentEpochStartSec(): number {
  const elapsed    = Date.now() - EPOCH_ANCHOR_MS
  const epochIndex = Math.max(0, Math.floor(elapsed / EPOCH_MS))
  const epochStartMs = EPOCH_ANCHOR_MS + epochIndex * EPOCH_MS
  return Math.floor(epochStartMs / 1000)
}

type SnowtraceApiTx = { to: string; value: string; timeStamp: string }

async function findEpochDeposit(
  action: 'txlist' | 'txlistinternal',
  epochStartSec: number,
): Promise<number | null> {
  const apiKey = process.env.SNOWTRACE_API_KEY ?? 'YourApiKeyToken'
  const addr   = REWARD_ADDR.toLowerCase()
  const url    = `https://api.snowtrace.io/api?module=account&action=${action}&address=${addr}&sort=desc&page=1&offset=50&apikey=${apiKey}`

  const res  = await fetch(url, { next: { revalidate: 300 } })
  const json = await res.json()

  if (json.status !== '1' || !Array.isArray(json.result)) return null

  // Find the most recent deposit that is:
  //   (a) sent TO the reward address
  //   (b) at least 1 AVAX (not a dust/incidental transfer)
  //   (c) on or after the current epoch start date
  const hit = (json.result as SnowtraceApiTx[]).find(tx => {
    if (tx.to?.toLowerCase() !== addr) return false
    const val = BigInt(tx.value || '0')
    if (val < MIN_DEPOSIT) return false
    const txTime = parseInt(tx.timeStamp, 10)
    return txTime >= epochStartSec
  })

  return hit ? parseFloat(formatEther(BigInt(hit.value))) : null
}

export async function GET() {
  try {
    const epochStartSec = getCurrentEpochStartSec()

    for (const action of ['txlist', 'txlistinternal'] as const) {
      const avax = await findEpochDeposit(action, epochStartSec)
      if (avax !== null && avax > 0) return NextResponse.json({ avax, source: 'chain' })
    }

    // No qualifying deposit found for this epoch — return the benchmark default
    return NextResponse.json({ avax: FALLBACK, source: 'fallback' })
  } catch {
    return NextResponse.json({ avax: FALLBACK, source: 'fallback' })
  }
}
