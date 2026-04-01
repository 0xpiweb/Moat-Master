'use client'

import { useState } from 'react'
import {
  createPublicClient,
  http,
  formatEther,
  getAddress,
  isAddress,
  parseAbi,
  parseAbiItem,
  type Address,
  type PublicClient,
} from 'viem'

// ── Avalanche chain (inline — avoids viem/chains bundle overhead) ───────────────
const avalanche = {
  id: 43114,
  name: 'Avalanche C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.avax.network/ext/bc/C/rpc'] } },
} as const satisfies {
  id: number
  name: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: { default: { http: readonly string[] } }
}

// ── Contracts ──────────────────────────────────────────────────────────────────
const MOAT_CONTRACT    = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393' as Address
const REWARD_POOL_AVAX = 25
const POINTS_DIVISOR   = 27_000_000_000

const MOAT_ABI = parseAbi([
  'function userInfo(address) view returns (uint256 stakedAmount, uint256 totalUserBurn, uint256 stakingPoints, uint256 burnPoints, uint256 activeLockCount)',
  'function getUserAllLocks(address) view returns (uint256[] amounts, uint256[] ends, uint256[] points, uint256[] originalDurations, uint256[] lastUpdated, bool[] active)',
  'function getAllPendingRewards(address) view returns (address[] tokens, uint256[] amounts)',
  'function getCurrentPoints(address) view returns (uint256)',
  'function totalPoints() view returns (uint256)',
] as const)

const CLAIM_EVENT = parseAbiItem(
  'event RewardClaimed(address indexed user, address indexed token, uint256 amount)'
)

const MOAT_API = `https://api.moats.app/api/moat-points/v2/all?contractAddress=${MOAT_CONTRACT}&chainId=43114`

// ── Strict API response types ──────────────────────────────────────────────────
interface MoatLeaderboardEntry { address?: string; points?: number }
interface MoatApiResponse { leaderboard?: MoatLeaderboardEntry[] }

// ── Strict on-chain return types ───────────────────────────────────────────────
interface UserInfoReturn {
  stakedAmount:   bigint
  totalUserBurn:  bigint
  stakingPoints:  bigint
  burnPoints:     bigint
  activeLockCount: bigint
}
interface LocksReturn {
  amounts:           readonly bigint[]
  ends:              readonly bigint[]
  points:            readonly bigint[]
  originalDurations: readonly bigint[]
  lastUpdated:       readonly bigint[]
  active:            readonly boolean[]
}
interface PendingReturn {
  tokens:  readonly Address[]
  amounts: readonly bigint[]
}

// ── Lock multiplier (piecewise linear — same breakpoints as MoatOptimizer) ─────
const LOCK_POINTS = [
  { days: 1,   mult: 2.04 }, { days: 7,   mult: 2.11 }, { days: 30,  mult: 2.31 },
  { days: 90,  mult: 2.73 }, { days: 180, mult: 3.23 }, { days: 365, mult: 4.00 },
  { days: 730, mult: 5.00 },
] as const

function getLockMultiplier(days: number): number {
  if (days <= 1)   return LOCK_POINTS[0].mult
  if (days >= 730) return LOCK_POINTS[LOCK_POINTS.length - 1].mult
  for (let i = 0; i < LOCK_POINTS.length - 1; i++) {
    const p1 = LOCK_POINTS[i], p2 = LOCK_POINTS[i + 1]
    if (days >= p1.days && days <= p2.days) {
      const t = (days - p1.days) / (p2.days - p1.days)
      return p1.mult + t * (p2.mult - p1.mult)
    }
  }
  return 2.0
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtE(v: bigint | undefined | null): number {
  if (v == null) return 0
  return Number(formatEther(v))
}
function fmtN(n: number, d = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

// ── Result type ────────────────────────────────────────────────────────────────
interface LockItem   { amount: number; endTs: number; durDays: number; active: boolean }
interface CheckResult {
  pendingAvax:     number
  userPts:         number
  totalPts:        number
  shareRat:        number
  biWeekly:        number
  claimedTotal:    number
  claimCount:      number
  stakedAmount:    number
  totalLockedUser: number
  activeLockCount: number
  totalBurnUser:   number
  locks:           LockItem[]
}

// ── Theme constants ────────────────────────────────────────────────────────────
const PINK     = '#ff007a'
const PINK_RGB = '255,0,122'

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewardChecker() {
  const [addr,    setAddr]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<CheckResult | null>(null)

  async function lookup() {
    const raw = addr.trim()
    if (!isAddress(raw)) {
      setError('Please enter a valid Avalanche address (0x…)')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const address = getAddress(raw)

      const client: PublicClient = createPublicClient({
        chain:     avalanche,
        transport: http('https://api.avax.network/ext/bc/C/rpc'),
      })

      // ── Parallel on-chain + API fetch ──────────────────────────────────────
      const [rawUserInfo, rawLocks, rawPending, rawCurPts, rawTotalPts, moatApiRaw] =
        await Promise.all([
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'userInfo',            args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getUserAllLocks',     args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getAllPendingRewards', args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getCurrentPoints',    args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'totalPoints',         args: [] }).catch(() => null),
          fetch(MOAT_API)
            .then((r): Promise<MoatApiResponse | null> => r.ok ? r.json() as Promise<MoatApiResponse> : Promise.resolve(null))
            .catch((): MoatApiResponse | null => null),
        ])

      // ── Claim history — best-effort (public RPC block range may be limited) ─
      const claimLogs = await client
        .getLogs({
          address:   MOAT_CONTRACT,
          event:     CLAIM_EVENT,
          args:      { user: address },
          fromBlock: 0n,
        })
        .catch((): [] => [])

      // ── Access by index — works for both named-object and array-tuple viem returns
      type Tup5   = readonly [bigint,          bigint,          bigint,          bigint,          bigint]
      type Tup6   = readonly [readonly bigint[], readonly bigint[], readonly bigint[], readonly bigint[], readonly bigint[], readonly boolean[]]
      type Tup2   = readonly [readonly Address[], readonly bigint[]]

      const ui = rawUserInfo as unknown as Tup5   | null
      const lk = rawLocks    as unknown as Tup6   | null
      const pd = rawPending  as unknown as Tup2   | null
      const curPts   = (rawCurPts   as bigint | null) ?? 0n
      const totalPts = (rawTotalPts as bigint | null) ?? 0n
      const moatApi  = moatApiRaw as MoatApiResponse | null

      // ── Staked / Burned / Lock count ───────────────────────────────────────
      const stakedAmount    = fmtE(ui?.[0])
      const totalBurnUser   = fmtE(ui?.[1])
      const activeLockCount = Number(ui?.[4] ?? 0n)

      // ── Parse locks ────────────────────────────────────────────────────────
      const lockAmounts = lk?.[0] ?? []
      const lockEnds    = lk?.[1] ?? []
      const lockDurs    = lk?.[3] ?? []
      const lockActive  = lk?.[5] ?? []

      const lockItems: LockItem[] = []
      let totalLockedUser = 0
      for (let i = 0; i < lockAmounts.length; i++) {
        const amt = fmtE(lockAmounts[i])
        if (amt <= 0) continue
        const endTs   = Number(lockEnds[i] ?? 0n)
        const durDays = Math.round(Number(lockDurs[i] ?? 0n) / 86400)
        const active  = lockActive[i] ?? false
        if (active) totalLockedUser += amt
        lockItems.push({ amount: amt, endTs, durDays, active })
      }

      // ── Pending rewards ────────────────────────────────────────────────────
      const pendingAvax = (pd?.[1] ?? []).reduce((s, a) => s + fmtE(a), 0)

      // ── Claimed history (best-effort) ──────────────────────────────────────
      const claimedTotal = claimLogs.reduce((s, log) => {
        const amount = (log.args as { amount?: bigint }).amount ?? 0n
        return s + fmtE(amount)
      }, 0)
      const claimCount = claimLogs.length

      // ── Points: Moat API primary, on-chain fallback ────────────────────────
      let userPtsDisplay  = 0
      let totalPtsDisplay = 0
      let shareRat        = 0
      const addrLower     = address.toLowerCase()

      if (moatApi?.leaderboard && moatApi.leaderboard.length > 0) {
        totalPtsDisplay = moatApi.leaderboard.reduce(
          (s: number, e: MoatLeaderboardEntry) => s + (e.points ?? 0), 0
        )
        const entry = moatApi.leaderboard.find(
          (e: MoatLeaderboardEntry) => e.address?.toLowerCase() === addrLower
        )
        userPtsDisplay = entry?.points ?? 0
        shareRat = totalPtsDisplay > 0 ? userPtsDisplay / totalPtsDisplay : 0
      } else {
        const curRaw   = Number(curPts)
        const totalRaw = Number(totalPts)
        userPtsDisplay  = curRaw   / POINTS_DIVISOR
        totalPtsDisplay = totalRaw / POINTS_DIVISOR
        shareRat        = totalRaw > 0 ? curRaw / totalRaw : 0
      }

      const biWeekly = shareRat * REWARD_POOL_AVAX

      setResult({
        pendingAvax,
        userPts:         userPtsDisplay,
        totalPts:        totalPtsDisplay,
        shareRat,
        biWeekly,
        claimedTotal,
        claimCount,
        stakedAmount,
        totalLockedUser,
        activeLockCount,
        totalBurnUser,
        locks:           lockItems,
      })
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch on-chain data. Check the address and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Shared style constants ─────────────────────────────────────────────────
  const card = 'bg-black/40 border border-zinc-800 rounded-xl px-4 py-3'
  const lbl  = 'text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block mb-1'
  const val  = 'text-xl font-black text-white [text-shadow:none] leading-tight'
  const sub  = 'text-[10px] text-zinc-600 mt-0.5'

  return (
    <div
      className="border rounded-2xl p-6 backdrop-blur-xl bg-zinc-900/50"
      style={{ borderColor: `rgba(${PINK_RGB},0.45)`, boxShadow: `0 0 28px rgba(${PINK_RGB},0.07)` }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0" style={{ color: PINK }}>
          Reward Checker
        </p>
        <div className="flex gap-2 w-full sm:max-w-lg">
          <input
            type="text"
            placeholder="Search by Avalanche address (0x…)"
            value={addr}
            onChange={e => setAddr(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) lookup() }}
            className="flex-1 bg-black/60 border border-zinc-700 rounded-xl px-4 py-2 text-white text-xs font-semibold outline-none transition-colors focus:border-[#ff007a] [text-shadow:none]"
          />
          <button
            onClick={lookup}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: PINK }}
          >
            {loading ? '…' : 'Check'}
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && <p className="text-red-400 text-xs mb-5">❌ {error}</p>}

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-14">
          <span className="text-zinc-500 text-sm">Fetching on-chain data…</span>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && !loading && (
        <div className="flex flex-col gap-3">

          {/* Row 1 — Full-width Pending Rewards ─────────────────────────────── */}
          <div
            className="rounded-xl px-5 py-4 border"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderColor: `rgba(${PINK_RGB},0.3)` }}
          >
            <span className={lbl}>Pending Rewards (Claimable)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white [text-shadow:none] leading-tight">
                {result.pendingAvax.toFixed(6)}
              </span>
              <span className="text-zinc-400 text-sm font-medium">AVAX</span>
            </div>
            <p className={sub}>
              {result.pendingAvax > 0 ? 'Claimable on moats.app' : 'Nothing claimable yet'}
            </p>
          </div>

          {/* Row 2 — 3 cols: Moat Points · Pool Share · Est. Bi-Weekly ──────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className={card}>
              <span className={lbl}>Your Moat Points</span>
              <span className={val}>{fmtN(result.userPts)}</span>
              <p className={sub}>Pool: {fmtN(result.totalPts)} pts</p>
            </div>
            <div className={card}>
              <span className={lbl}>Pool Share</span>
              <span className={val}>{(result.shareRat * 100).toFixed(4)}%</span>
              <p className={sub}>{fmtN(result.userPts)} / {fmtN(result.totalPts)}</p>
            </div>
            <div className={card} style={{ borderColor: `rgba(${PINK_RGB},0.3)` }}>
              <span className={lbl}>Est. Bi-Weekly Rewards</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: PINK }}>
                {result.biWeekly.toFixed(4)}
              </span>
              <p className={sub}>
                ~{(result.biWeekly * 26).toFixed(2)} AVAX / yr
              </p>
            </div>
          </div>

          {/* Row 3 — 2 cols: Already Claimed · Total Earned ─────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className={card}>
              <span className={lbl}>Already Claimed</span>
              <span className={val}>{result.claimedTotal.toFixed(6)}</span>
              <p className={sub}>{result.claimCount} claim transaction(s)</p>
            </div>
            <div className={card}>
              <span className={lbl}>Total Earned (Lifetime)</span>
              <span className={val}>{(result.claimedTotal + result.pendingAvax).toFixed(6)}</span>
              <p className={sub}>
                {result.claimedTotal.toFixed(6)} claimed + {result.pendingAvax.toFixed(6)} pending
              </p>
            </div>
          </div>

          {/* Row 4 — 3 cols: Moat Position ──────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className={card}>
              <span className={lbl}>Staked</span>
              <span className={val}>{fmtN(result.stakedAmount)}</span>
              <p className={sub}>LIL · 1× multiplier</p>
            </div>
            <div className={card}>
              <span className={lbl}>Locked</span>
              <span className={val}>{fmtN(result.totalLockedUser)}</span>
              <p className={sub}>LIL · {result.activeLockCount} active lock(s)</p>
            </div>
            <div className={card}>
              <span className={lbl}>Burned</span>
              <span className={val}>{fmtN(result.totalBurnUser)}</span>
              <p className={sub}>LIL · 10× multiplier</p>
            </div>
          </div>

          {/* Row 5 — Active Locks list (conditional) ────────────────────────── */}
          {result.locks.length > 0 && (
            <div className={card}>
              <p className={lbl + ' mb-3'}>Active Locks</p>
              <div className="flex flex-col divide-y divide-zinc-800">
                {result.locks.map((lk, i) => {
                  const endDate  = new Date(lk.endTs * 1000).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })
                  const expired  = lk.endTs < Date.now() / 1000
                  const isActive = lk.active && !expired
                  const dur      = lk.durDays >= 365
                    ? `${(lk.durDays / 365).toFixed(1)} yr`
                    : `${lk.durDays} days`
                  const mult = getLockMultiplier(lk.durDays)

                  return (
                    <div key={i} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold text-white [text-shadow:none]">
                          {fmtN(lk.amount)} LIL
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {dur} · {mult.toFixed(2)}× · Ends {endDate}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                        style={isActive
                          ? { backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981' }
                          : { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                      >
                        {isActive ? 'Active' : 'Unlockable'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
