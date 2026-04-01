'use client'

import { useState } from 'react'
import {
  createPublicClient, http,
  formatEther, getAddress, isAddress,
  parseAbi, parseAbiItem,
  type Address,
} from 'viem'

// ── Chain ──────────────────────────────────────────────────────────────────────
const avalanche = {
  id: 43114,
  name: 'Avalanche',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.avax.network/ext/bc/C/rpc'] } },
} as const

// ── Contracts ──────────────────────────────────────────────────────────────────
const MOAT_CONTRACT = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393' as Address
const EB_PROTO_ADDR = '0x950a98dd06c898950460b0D1FCaD75D4A23Ff373' as Address
const EB_STAKE_ADDR = '0x2Bf32c61786b8A7b8035a029a82a23bE556DE537' as Address
const MOAT_API      = `https://api.moats.app/api/moat-points/v2/all?contractAddress=${MOAT_CONTRACT}&chainId=43114`
const POINTS_DIVISOR = 27_000_000_000
const REWARD_POOL_AVAX = 25

const MOAT_ABI = parseAbi([
  'function userInfo(address) view returns (uint256 stakedAmount, uint256 totalUserBurn, uint256 stakingPoints, uint256 burnPoints, uint256 activeLockCount)',
  'function getUserAllLocks(address) view returns (uint256[] amounts, uint256[] ends, uint256[] points, uint256[] originalDurations, uint256[] lastUpdated, bool[] active)',
  'function getAllPendingRewards(address) view returns (address[] tokens, uint256[] amounts)',
  'function getCurrentPoints(address) view returns (uint256)',
  'function totalPoints() view returns (uint256)',
])

const EB_ABI = parseAbi([
  'function userInfo(address) view returns (uint256 stakedAmount, uint256 rewardDebt)',
])

const CLAIM_EVENT = parseAbiItem(
  'event RewardClaimed(address indexed user, address indexed token, uint256 amount)'
)

// ── Lock multiplier (piecewise linear, same breakpoints as MoatOptimizer) ──────
const LOCK_POINTS = [
  { days: 1, mult: 2.04 }, { days: 7,   mult: 2.11 }, { days: 30,  mult: 2.31 },
  { days: 90, mult: 2.73 }, { days: 180, mult: 3.23 }, { days: 365, mult: 4.00 },
  { days: 730, mult: 5.00 },
]
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

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmtN(n: number, d = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtE(v: bigint): number { return Number(formatEther(v)) }

// ── Types ──────────────────────────────────────────────────────────────────────
interface Lock { amount: number; endTs: number; durDays: number; active: boolean }
interface Result {
  pendingAvax: number; userPts: number; totalPts: number; shareRat: number
  biWeekly: number; claimedTotal: number; claimCount: number
  stakedAmount: number; totalLockedUser: number; activeLockCount: number
  totalBurnUser: number; locks: Lock[]
}

// ── Theme ──────────────────────────────────────────────────────────────────────
const PINK     = '#ff007a'
const PINK_RGB = '255,0,122'

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewardChecker() {
  const [addr,    setAddr]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<Result | null>(null)

  async function lookup() {
    const raw = addr.trim()
    if (!isAddress(raw)) {
      setError('Please enter a valid Avalanche address (0x…)')
      return
    }
    setLoading(true); setError(null); setResult(null)

    try {
      const address = getAddress(raw)
      const client  = createPublicClient({ chain: avalanche, transport: http() })

      const [userInf, locks, pending, onchainPts, onchainTotal, moatApi] = await Promise.all([
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'userInfo',           args: [address] }),
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getUserAllLocks',    args: [address] }),
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getAllPendingRewards',args: [address] }),
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getCurrentPoints',   args: [address] }),
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'totalPoints',        args: [] }),
        fetch(MOAT_API).then(r => r.ok ? r.json() : null).catch(() => null),
      ])

      // Claim history — best-effort (public RPC may limit block range)
      const claimLogs = await client.getLogs({
        address: MOAT_CONTRACT,
        event:   CLAIM_EVENT,
        args:    { user: address },
        fromBlock: 0n,
      }).catch(() => [])

      // ── Staked / Burned / Lock count
      const [stakedRaw, burnRaw,,,activeLockCountRaw] = userInf as [bigint,bigint,bigint,bigint,bigint]
      const stakedAmount    = fmtE(stakedRaw)
      const totalBurnUser   = fmtE(burnRaw)
      const activeLockCount = Number(activeLockCountRaw)

      // ── Locks
      const { amounts, ends, originalDurations, active: actives } = locks as {
        amounts: bigint[]; ends: bigint[]; originalDurations: bigint[]; active: boolean[]
      }
      const userLocks: Lock[] = []
      let totalLockedUser = 0
      for (let i = 0; i < amounts.length; i++) {
        const amt = fmtE(amounts[i])
        if (amt <= 0) continue
        const endTs   = Number(ends[i])
        const durDays = Math.round(Number(originalDurations[i]) / 86400)
        if (actives[i]) totalLockedUser += amt
        userLocks.push({ amount: amt, endTs, durDays, active: actives[i] })
      }

      // ── Pending
      const { amounts: pendAmts } = pending as { tokens: Address[]; amounts: bigint[] }
      const pendingAvax = pendAmts.reduce((s, a) => s + fmtE(a), 0)

      // ── Claimed
      const claimedTotal = claimLogs.reduce((s, log) => {
        const args = log.args as { amount?: bigint }
        return s + fmtE(args.amount ?? 0n)
      }, 0)
      const claimCount = claimLogs.length

      // ── Points — API primary, on-chain fallback
      let userPts = 0, totalPts = 0, shareRat = 0
      const addrLower = address.toLowerCase()
      if (moatApi?.leaderboard?.length > 0) {
        const lb = moatApi.leaderboard as { address?: string; points?: number }[]
        totalPts = lb.reduce((s: number, e) => s + (e.points ?? 0), 0)
        const entry = lb.find((e) => e.address?.toLowerCase() === addrLower)
        userPts  = entry?.points ?? 0
        shareRat = totalPts > 0 ? userPts / totalPts : 0
      } else {
        userPts   = Number(onchainPts as bigint)  / POINTS_DIVISOR
        totalPts  = Number(onchainTotal as bigint) / POINTS_DIVISOR
        shareRat  = Number(onchainTotal as bigint) > 0 ? Number(onchainPts as bigint) / Number(onchainTotal as bigint) : 0
      }

      const biWeekly = shareRat * REWARD_POOL_AVAX

      setResult({ pendingAvax, userPts, totalPts, shareRat, biWeekly, claimedTotal, claimCount,
        stakedAmount, totalLockedUser, activeLockCount, totalBurnUser, locks: userLocks })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data. Check the address and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Shared card styles (glassmorphism, matching MoatOptimizer) ───────────────
  const card  = 'bg-black/40 border border-zinc-800 rounded-xl p-4'
  const lbl   = 'text-[10px] text-zinc-500 font-semibold uppercase tracking-widest block mb-1.5'
  const val   = 'text-lg font-black text-white [text-shadow:none]'
  const sub   = 'text-[10px] text-zinc-600 mt-0.5'

  return (
    <div
      className="border rounded-2xl p-6 backdrop-blur-xl bg-zinc-900/50"
      style={{ borderColor: `rgba(${PINK_RGB},0.45)`, boxShadow: `0 0 28px rgba(${PINK_RGB},0.07)` }}
    >
      {/* ── Header: title + search ───────────────────────────────────────── */}
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
            onKeyDown={e => e.key === 'Enter' && !loading && lookup()}
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

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && <p className="text-red-400 text-xs mb-5">❌ {error}</p>}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-14">
          <span className="text-zinc-500 text-sm">Fetching on-chain data…</span>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {result && !loading && (
        <div className="flex flex-col gap-4">

          {/* 6 stat cards — 3 × 2 grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

            <div className={card}>
              <span className={lbl}>Pending Rewards</span>
              <span className={val}>{result.pendingAvax.toFixed(6)}</span>
              <p className={sub}>
                {result.pendingAvax > 0 ? 'Claimable on moats.app' : 'Nothing claimable yet'}
              </p>
            </div>

            <div className={card}>
              <span className={lbl}>Your Moat Points</span>
              <span className={val}>{fmtN(result.userPts)}</span>
              <p className={sub}>Total pool: {fmtN(result.totalPts)} pts</p>
            </div>

            <div className={card}>
              <span className={lbl}>Pool Share</span>
              <span className={val}>{(result.shareRat * 100).toFixed(4)}%</span>
              <p className={sub}>{fmtN(result.userPts)} / {fmtN(result.totalPts)} pts</p>
            </div>

            {/* Bi-weekly — highlighted with pink accent */}
            <div className={card} style={{ borderColor: `rgba(${PINK_RGB},0.3)` }}>
              <span className={lbl}>Est. Bi-Weekly Rewards</span>
              <span className="text-lg font-black [text-shadow:none]" style={{ color: PINK }}>
                {result.biWeekly.toFixed(4)}
              </span>
              <p className={sub}>
                Monthly: ~{(result.biWeekly * 2).toFixed(4)} · Yearly: ~{(result.biWeekly * 26).toFixed(2)} AVAX
              </p>
            </div>

            <div className={card}>
              <span className={lbl}>Already Claimed</span>
              <span className={val}>{result.claimedTotal.toFixed(6)}</span>
              <p className={sub}>{result.claimCount} claim transaction(s)</p>
            </div>

            <div className={card}>
              <span className={lbl}>Total Earned (Lifetime)</span>
              <span className={val}>{(result.claimedTotal + result.pendingAvax).toFixed(6)}</span>
              <p className={sub}>{result.claimedTotal.toFixed(6)} claimed + {result.pendingAvax.toFixed(6)} pending</p>
            </div>
          </div>

          {/* 3 Moat Position cards */}
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

          {/* Active Locks list */}
          {result.locks.length > 0 && (
            <div className={card}>
              <p className={lbl + ' mb-3'}>Active Locks</p>
              <div className="flex flex-col divide-y divide-zinc-800">
                {result.locks.map((lk, i) => {
                  const endDate   = new Date(lk.endTs * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  const isExpired = lk.endTs < Date.now() / 1000
                  const isActive  = lk.active && !isExpired
                  const durLabel  = lk.durDays >= 365 ? `${(lk.durDays / 365).toFixed(1)} yr` : `${lk.durDays} days`
                  const mult      = getLockMultiplier(lk.durDays)

                  return (
                    <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold text-white [text-shadow:none]">
                          {fmtN(lk.amount)} LIL
                        </p>
                        <p className="text-xs text-zinc-500">
                          {durLabel} lock · {mult.toFixed(2)}× multiplier · Ends {endDate}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                        style={isActive
                          ? { backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981' }
                          : { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
                        }
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
