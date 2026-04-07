import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { avalanche } from 'viem/chains'

// Cache for 1 hour — pool composition changes slowly
export const revalidate = 3600

const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393' as `0x${string}`
const NORM_1B   = 1_000_000_000
const MOAT_SCALAR = 27_220
const LOCK_MULT   = 5          // fixed ×5 for moatPoints (same rule as component)
const BATCH       = 100        // users per multicall batch

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
      transport: http(
        (process.env.AVAX_RPC_URL ?? 'https://api.avax.network/ext/bc/C/rpc').trim(),
        { timeout: 25_000 },
      ),
    })

    // ── 1. Total active user count ─────────────────────────────────────────
    const count    = await client.readContract({ address: MOAT_CONTRACT, abi: ABI, functionName: 'getActiveUserCount' })
    const userCount = Number(count)

    if (userCount === 0) {
      return NextResponse.json({ globalMoatPoints: 0, userCount: 0 })
    }

    // ── 2. Fetch all addresses in slices of 200 ────────────────────────────
    const addresses: `0x${string}`[] = []
    for (let i = 0; i < userCount; i += 200) {
      const end   = Math.min(i + 200, userCount)
      const slice = await client.readContract({
        address: MOAT_CONTRACT, abi: ABI, functionName: 'getActiveUsers',
        args: [BigInt(i), BigInt(end)],
      })
      addresses.push(...(slice as `0x${string}`[]))
    }

    // ── 3. Multicall userInfo + getUserAllLocks in batches ─────────────────
    let globalMoatPoints = 0

    for (let i = 0; i < addresses.length; i += BATCH) {
      const batch = addresses.slice(i, i + BATCH)

      const infoCalls = batch.map(addr => ({
        address: MOAT_CONTRACT, abi: ABI,
        functionName: 'userInfo' as const,
        args: [addr] as [`0x${string}`],
      }))
      const lockCalls = batch.map(addr => ({
        address: MOAT_CONTRACT, abi: ABI,
        functionName: 'getUserAllLocks' as const,
        args: [addr] as [`0x${string}`],
      }))

      const [infoRes, lockRes] = await Promise.all([
        client.multicall({ contracts: infoCalls, allowFailure: true }),
        client.multicall({ contracts: lockCalls, allowFailure: true }),
      ])

      for (let j = 0; j < batch.length; j++) {
        const info  = infoRes[j]
        const locks = lockRes[j]
        if (info.status !== 'success' || locks.status !== 'success') continue

        // userInfo → (stakedAmount, totalUserBurn, ...)
        const [stakedWei, burnedWei] = info.result as [bigint, bigint, bigint, bigint, bigint]
        // getUserAllLocks → (amounts[], ends[], points[], durations[], updated[], active[])
        const [lockAmounts, , , , , lockActive] = locks.result as [
          bigint[], bigint[], bigint[], bigint[], bigint[], boolean[],
        ]

        const staked = fromWei(stakedWei)
        const burned = fromWei(burnedWei)
        let   locked = 0
        for (let k = 0; k < lockAmounts.length; k++) {
          if (lockActive[k]) locked += fromWei(lockAmounts[k])
        }

        const rawPower = staked + locked * LOCK_MULT + burned * 10
        if (rawPower > 0) {
          globalMoatPoints += Math.sqrt(rawPower / NORM_1B) * MOAT_SCALAR
        }
      }
    }

    return NextResponse.json({ globalMoatPoints: Math.round(globalMoatPoints), userCount })
  } catch (err) {
    console.error('[global-power]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
