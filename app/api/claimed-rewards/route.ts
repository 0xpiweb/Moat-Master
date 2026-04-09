import { NextResponse } from 'next/server'
import { keccak256, toBytes } from 'viem'

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393'

// keccak256("RewardClaimed(address,address,uint256)")
const TOPIC0 = keccak256(toBytes('RewardClaimed(address,address,uint256)'))

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  // Zero-pad address to 32 bytes (topic1 format)
  const topic1 = `0x${address.slice(2).toLowerCase().padStart(64, '0')}`

  const apiKey = process.env.SNOWTRACE_API_KEY ?? 'YourApiKeyToken'
  const url = `https://api.snowtrace.io/api?module=logs&action=getLogs` +
    `&address=${MOAT_CONTRACT}` +
    `&topic0=${TOPIC0}` +
    `&topic1=${topic1}` +
    `&topic0_1_opr=and` +
    `&fromBlock=0&toBlock=latest` +
    `&apikey=${apiKey}`

  try {
    const res  = await fetch(url, { next: { revalidate: 60 } })
    const json = await res.json()

    if (json.status !== '1') {
      // status '0' with message 'No records found' is a valid empty result
      if (json.message === 'No records found') {
        return NextResponse.json({ alreadyClaimed: 0 })
      }
      return NextResponse.json({ error: json.message ?? 'Snowtrace error' }, { status: 500 })
    }

    // Each log.data is a 32-byte hex-encoded uint256 (the amount in wei)
    let totalWei = 0n
    for (const log of json.result) {
      try {
        totalWei += BigInt(log.data)
      } catch {
        // skip malformed entries
      }
    }

    // Convert wei → AVAX (18 decimals)
    const alreadyClaimed = Number(totalWei) / 1e18

    return NextResponse.json({ alreadyClaimed })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
