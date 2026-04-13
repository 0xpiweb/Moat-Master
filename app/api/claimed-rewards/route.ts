import { NextResponse } from 'next/server'
import { keccak256, toBytes } from 'viem'

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393'

// keccak256("RewardClaimed(address,address,uint256)")
// The two address params are (token, user) — user lands in topic2.
// We query both topic positions and deduplicate so either ordering is covered.
const TOPIC0 = keccak256(toBytes('RewardClaimed(address,address,uint256)'))

function padAddress(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`
}

interface SnowtraceLog {
  transactionHash: string
  logIndex:        string
  data:            string
}

async function fetchLogs(
  topicParam: 'topic1' | 'topic2',
  topicValue: string,
  apiKey: string,
): Promise<SnowtraceLog[]> {
  const oprParam = topicParam === 'topic1' ? 'topic0_1_opr=and' : 'topic0_2_opr=and'
  const url =
    `https://api.snowtrace.io/api?module=logs&action=getLogs` +
    `&address=${MOAT_CONTRACT}` +
    `&topic0=${TOPIC0}` +
    `&${topicParam}=${topicValue}` +
    `&${oprParam}` +
    `&fromBlock=0&toBlock=latest` +
    `&apikey=${apiKey}`

  const res  = await fetch(url, { next: { revalidate: 60 } })
  const json = await res.json()

  if (json.status !== '1') return []
  return Array.isArray(json.result) ? json.result : []
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const topicAddr = padAddress(address)
  const apiKey    = process.env.SNOWTRACE_API_KEY ?? 'YourApiKeyToken'

  try {
    // Query both topic positions: older contract versions put user in topic1,
    // newer versions put token in topic1 and user in topic2.
    const [byTopic1, byTopic2] = await Promise.all([
      fetchLogs('topic1', topicAddr, apiKey),
      fetchLogs('topic2', topicAddr, apiKey),
    ])

    // Deduplicate by txHash+logIndex so overlapping results aren't double-counted.
    const seen = new Set<string>()
    let totalWei = 0n

    for (const log of [...byTopic1, ...byTopic2]) {
      const key = `${log.transactionHash}:${log.logIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      try { totalWei += BigInt(log.data) } catch { /* skip malformed */ }
    }

    // Convert wei → AVAX (18 decimals; WAVAX is 1:1 with AVAX)
    const alreadyClaimed = Number(totalWei) / 1e18

    return NextResponse.json({ alreadyClaimed })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
