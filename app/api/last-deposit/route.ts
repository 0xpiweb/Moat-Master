import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'

const REWARD_ADDR = '0x5E1AC781157AAF1492f15c351183EEFCa5Fbd746' as `0x${string}`
const FALLBACK    = 30.00

const avalanche = {
  id: 43114, name: 'Avalanche C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.avax.network/ext/bc/C/rpc'] } },
} as const

export async function GET() {
  try {
    const client = createPublicClient({ chain: avalanche, transport: http() })
    const balance = await client.getBalance({ address: REWARD_ADDR })
    const avax = parseFloat(formatEther(balance))
    if (avax > 0) return NextResponse.json({ avax })
    return NextResponse.json({ avax: FALLBACK })
  } catch {
    return NextResponse.json({ avax: FALLBACK })
  }
}
