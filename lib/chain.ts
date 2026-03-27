import { createPublicClient, http, parseAbi } from 'viem'
import { avalanche } from 'viem/chains'

const RPC_URL = (process.env.AVAX_RPC_URL ?? 'https://api.avax.network/ext/bc/C/rpc').trim()

const client = createPublicClient({
  chain: avalanche,
  transport: http(RPC_URL, { timeout: 10_000 }),
})

const MOAT_ABI = parseAbi([
  'function getTotalAmounts() view returns (uint256 totalStaked, uint256 totalLocked, uint256 totalBurned, uint256 totalInContract)',
])

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
])

function fromWei(wei: bigint): number {
  return Number(wei / 10n ** 16n) / 100
}

export async function fetchMoatData(moatAddress: string): Promise<{ staked: number; locked: number; burned: number }> {
  try {
    const [totalStaked, totalLocked, totalBurned] = await client.readContract({
      address: moatAddress as `0x${string}`,
      abi: MOAT_ABI,
      functionName: 'getTotalAmounts',
    })
    const staked = fromWei(totalStaked)
    const locked = fromWei(totalLocked)
    const burned = fromWei(totalBurned)
    console.log('[Moat] staked:', staked, '| locked:', locked, '| burned:', burned)
    return { staked, locked, burned }
  } catch (err) {
    console.error('[Moat] fetchMoatData error:', err)
    return { staked: 0, locked: 0, burned: 0 }
  }
}

export async function fetchTokenBalance(tokenAddress: string, walletAddress: string): Promise<number> {
  try {
    const balance = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`],
    })
    return fromWei(balance)
  } catch (err) {
    console.error('[Chain] fetchTokenBalance error:', err)
    return 0
  }
}

const DEAD_ADDR = '0x000000000000000000000000000000000000dead'

export async function fetchHolderCount(tokenAddress: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.routescan.io/v2/network/mainnet/evm/43114/erc20/${tokenAddress}/holders/count`,
      { next: { revalidate: 300 } }
    )
    const json = await res.json()
    return typeof json.count === 'number' ? json.count : null
  } catch {
    return null
  }
}

export async function fetchChainData(tokenAddress: string, lpPairAddress: string): Promise<{ dead: number; lp: number }> {
  const [dead, lp] = await Promise.all([
    fetchTokenBalance(tokenAddress, DEAD_ADDR),
    fetchTokenBalance(tokenAddress, lpPairAddress),
  ])
  console.log('[Chain] dead:', dead, '| lp:', lp)
  return { dead, lp }
}
