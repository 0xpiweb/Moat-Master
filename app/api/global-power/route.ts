import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { avalanche } from 'viem/chains'

// Force fresh data to clear the "0.14" ghost
export const revalidate = 0

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393' as `0x${string}`
const NORM_1B = 1_000_000_000
const MOAT_SCALAR = 27_220
const BATCH = 100 

function fromWei(wei: bigint): number {
  return Number(wei / 10n ** 16n) / 100
}

const ABI = parseAbi([
  'function getActiveUserCount() view returns (uint256)',
  'function getActiveUsers(uint256 _startIndex, uint256 _endIndex) view returns (address[])',
  'function userInfo(address user) view returns (uint256 stakedAmount, uint256 totalUserBurn, uint256 stakingPoints, uint256 burnPoints, uint256 activeLockCount)',
  'function getUserAllLocks(address user) view returns (uint256[] amounts, uint256[] ends, uint256[] points, uint256[] originalDurations, uint256[] lastUpdated, bool[] active)',
])

export async function GET() {
  try {
    const client = createPublicClient({
      chain: avalanche,
      transport: http((process.env.AVAX_RPC_URL ?? 'https://api.avax.network/ext/bc/C/rpc').trim()),
    })

    const count = await client.readContract({ address: MOAT_CONTRACT, abi: ABI, functionName: 'getActiveUserCount' })
    const userCount = Number(count)
    if (userCount === 0) return NextResponse.json({ globalMoatPoints: 0, userCount: 0 })

    const addresses: `0x${string}`[] = []
    for (let i = 0; i < userCount; i += 200) {
      const end = Math.min(i + 200, userCount)
      const slice = await client.readContract({
        address: MOAT_CONTRACT, abi: ABI, functionName: 'getActiveUsers',
        args: [BigInt(i), BigInt(end)],
      })
      addresses.push(...(slice as `0x${string}`[]))
    }

    let globalMoatPoints = 0

    for (let i = 0; i < addresses.length; i += BATCH) {
      const batch = addresses.slice(i, i + BATCH)
      const infoCalls = batch.map(addr => ({ address: MOAT_CONTRACT, abi: ABI, functionName: 'userInfo', args: [addr] }))
      const lockCalls = batch.map(addr => ({ address: MOAT_CONTRACT, abi: ABI, functionName: 'getUserAllLocks', args: [addr] }))

      const [infoRes, lockRes] = await Promise.all([
        client.multicall({ contracts: infoCalls as any, allowFailure: true }),
        client.multicall({ contracts: lockCalls as any, allowFailure: true }),
      ])

      for (let j = 0; j < batch.length; j++) {
        if (infoRes[j].status !== 'success' || lockRes[j].status !== 'success') continue
        
        const [stakedWei, burnedWei] = infoRes[j].result as [bigint, bigint, bigint, bigint, bigint]
        const [lockAmounts, , , , , lockActive] = lockRes[j].result as [bigint[], any, any, any, any, boolean[]]

        const staked = fromWei(stakedWei)
        const burned = fromWei(burnedWei)
        let locked = 0
        for (let k = 0; k < lockAmounts.length; k++) {
          if (lockActive[k]) locked += fromWei(lockAmounts[k])
        }

        // FORMULA ALIGNMENT: Match frontend exactly (Stake*1 + Lock*5 + Burn*10)
        const rawPower = staked + (locked * 5) + (burned * 10)
        if (rawPower > 0.01) {
          globalMoatPoints += Math.sqrt(rawPower / NORM_1B) * MOAT_SCALAR
        }
      }
    }

    return NextResponse.json({ globalMoatPoints: Math.round(globalMoatPoints), userCount })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
