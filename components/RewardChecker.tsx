'use client'

import { useState, useEffect } from 'react'
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
const MOAT_CONTRACT  = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393' as Address
const POINTS_DIVISOR = 27_000_000_000

// ── Distribution constants ─────────────────────────────────────────────────────
// Legacy era (3/16 – 3/30): 7.148% of pool; final payout 2.945 AVAX on 3/30
const PROGRAM_START_TS  = Math.floor(new Date('2026-03-16T00:00:00Z').getTime() / 1000)
const FIXED_ERA_START_TS = Math.floor(new Date('2026-03-31T00:00:00Z').getTime() / 1000)
// Fixed-interval era (3/31+): pool / (14d × 4 pulses) per pulse
const PULSES_PER_DAY       = 4
const PAYOUT_INTERVAL_S    = 6 * 3600
const EPOCH_POOL_AVAX      = 30.41          // WAVAX in pool (reloads 4/13)
const EPOCH_DAYS           = 14             // Epoch length in days
const EPOCH_DURATION_S     = EPOCH_DAYS * 86400
const PULSE_AVAX           = EPOCH_POOL_AVAX / (EPOCH_DAYS * PULSES_PER_DAY)  // ~0.543
const GLOBAL_EARNING_POWER = 850_000_000    // Total earning power across all protocol users
// Ecosystem snapshot
const TOTAL_SUPPLY   = 1_350_000_000
const GLOBAL_STAKED  =   155_693_804
const GLOBAL_LOCKED  =   152_330_218
const GLOBAL_BURNED  =   321_438_924
const MOAT_DENSITY   = ((GLOBAL_STAKED + GLOBAL_LOCKED + GLOBAL_BURNED) / TOTAL_SUPPLY * 100).toFixed(2)

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

// Legacy context (for UI labels)
const LEGACY_ERA_RATE       = 0.07148
const LEGACY_INJECTION_AVAX = 30.6
const LEGACY_PAYOUT_AVAX    = 2.945

// ── Strict API response types ──────────────────────────────────────────────────
interface MoatLeaderboardEntry { address?: string; points?: number }
interface MoatApiResponse { leaderboard?: MoatLeaderboardEntry[] }

// ── Lock multiplier (piecewise linear — same breakpoints as MoatOptimizer) ─────
const LOCK_POINTS = [
  { days: 1,   mult: 2.04 }, { days: 7,   mult: 2.11 }, { days: 30,  mult: 2.31 },
  { days: 90,  mult: 2.73 }, { days: 180, mult: 3.23 }, { days: 365, mult: 4.00 },
  { days: 730, mult: 5.00 },
] as const

// ── Moat Points: linear duration formula (same as MoatOptimizer) ─────────────
// Lock:  (Tokens × 1.1) + (Tokens × (Days / 365) × 4.545)
// Stake: Tokens × 1.1   |   Burn: Tokens × 10
function calcEarningPower(staked: number, locks: { amount: number; durDays: number; active: boolean }[], burned: number): number {
  const stakedPts = staked * 1.1
  const lockPts   = locks
    .filter(l => l.active)
    .reduce((s, l) => s + (l.amount * 1.1) + (l.amount * (l.durDays / 365) * 4.545), 0)
  const burnPts   = burned * 10
  return stakedPts + lockPts + burnPts
}

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
function fmtPwr(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return Math.round(n).toLocaleString('en-US')
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface LockItem   { amount: number; endTs: number; durDays: number; active: boolean }
interface CheckResult {
  pendingAvax:      number
  userPts:          number
  totalPts:         number
  shareRat:         number
  estimatedDaily:   number
  projectedPulse:   number
  claimedLegacy:    number
  claimedFixed:     number
  claimedTotal:     number
  claimCount:       number
  stakedAmount:     number
  totalLockedUser:  number
  activeLockCount:  number
  totalBurnUser:    number
  userEarningPower: number
  locks:            LockItem[]
}
interface Countdown { hours: number; mins: number; epochPct: number; daysLeft: number }

// ── Theme ──────────────────────────────────────────────────────────────────────
const PINK     = '#ff007a'
const PINK_RGB = '255,0,122'

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewardChecker() {
  const [addr,      setAddr]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [result,    setResult]    = useState<CheckResult | null>(null)
  const [countdown, setCountdown] = useState<Countdown>({ hours: 0, mins: 0, epochPct: 0, daysLeft: 0 })

  // ── Live countdown + epoch progress ───────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = Math.floor(Date.now() / 1000)
      const elapsed = Math.max(0, now - FIXED_ERA_START_TS)

      // Next 6h payout boundary
      const nextOffset  = Math.ceil((elapsed + 1) / PAYOUT_INTERVAL_S) * PAYOUT_INTERVAL_S
      const remaining   = nextOffset - elapsed
      const hours       = Math.floor(remaining / 3600)
      const mins        = Math.floor((remaining % 3600) / 60)

      // Epoch progress (13 days from 3/31)
      const epochPct  = Math.min(100, (elapsed / EPOCH_DURATION_S) * 100)
      const daysLeft  = Math.max(0, Math.ceil((EPOCH_DURATION_S - elapsed) / 86400))

      setCountdown({ hours, mins, epochPct, daysLeft })
    }
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [])

  // ── Wallet lookup ──────────────────────────────────────────────────────────
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
      type Tup5 = readonly [bigint, bigint, bigint, bigint, bigint]
      type Tup6 = readonly [readonly bigint[], readonly bigint[], readonly bigint[], readonly bigint[], readonly bigint[], readonly boolean[]]
      type Tup2 = readonly [readonly Address[], readonly bigint[]]

      const [rawUserInfo, rawLocks, rawPending, rawCurPts, rawTotalPts, moatApiRaw] =
        await Promise.all([
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'userInfo',             args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getUserAllLocks',      args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getAllPendingRewards',  args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getCurrentPoints',     args: [address] }).catch(() => null),
          client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'totalPoints',          args: [] }).catch(() => null),
          fetch(MOAT_API)
            .then((r): Promise<MoatApiResponse | null> => r.ok ? r.json() as Promise<MoatApiResponse> : Promise.resolve(null))
            .catch((): MoatApiResponse | null => null),
        ])

      // ── Claim history — best-effort (public RPC block range may be limited) ─
      const claimLogs = await client
        .getLogs({ address: MOAT_CONTRACT, event: CLAIM_EVENT, args: { user: address }, fromBlock: 0n })
        .catch((): [] => [])

      // ── Fetch block timestamps to split claims by era ──────────────────────
      const blockTsMap: Record<string, number> = {}
      const uniqueBlocks = [...new Set(
        claimLogs.map(l => l.blockNumber).filter((bn): bn is bigint => bn != null)
      )]
      await Promise.all(
        uniqueBlocks.map(async bn => {
          try {
            const block = await client.getBlock({ blockNumber: bn })
            blockTsMap[bn.toString()] = Number(block.timestamp)
          } catch { /* ignore */ }
        })
      )

      // ── Cast to indexed tuples ─────────────────────────────────────────────
      const ui = rawUserInfo as unknown as Tup5 | null
      const lk = rawLocks    as unknown as Tup6 | null
      const pd = rawPending  as unknown as Tup2 | null
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

      // ── Era-split claimed history (program start: 3/16) ───────────────────
      let claimedLegacy = 0, claimedFixed = 0
      for (const log of claimLogs) {
        const amount = (log.args as { amount?: bigint }).amount ?? 0n
        const ts     = log.blockNumber ? (blockTsMap[log.blockNumber.toString()] ?? null) : null
        const avax   = fmtE(amount)
        // Exclude pre-program claims (before 3/16)
        if (ts !== null && ts < PROGRAM_START_TS) continue
        // Unknown timestamp → assign to fixed era (most recent)
        if (ts === null || ts >= FIXED_ERA_START_TS) claimedFixed += avax
        else                                          claimedLegacy += avax
      }
      const claimedTotal = claimedLegacy + claimedFixed
      const claimCount   = claimLogs.length

      // ── Points display: Moat API primary, on-chain fallback ───────────────
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

      // ── Earning Power: linear duration formula → pulse share ──────────────
      const userEarningPower = calcEarningPower(stakedAmount, lockItems, totalBurnUser)
      const projectedPulse   = (userEarningPower / GLOBAL_EARNING_POWER) * PULSE_AVAX
      const estimatedDaily   = projectedPulse * PULSES_PER_DAY

      setResult({
        pendingAvax,
        userPts:         userPtsDisplay,
        totalPts:        totalPtsDisplay,
        shareRat,
        estimatedDaily,
        projectedPulse,
        claimedLegacy,
        claimedFixed,
        claimedTotal,
        claimCount,
        stakedAmount,
        totalLockedUser,
        activeLockCount,
        totalBurnUser,
        userEarningPower,
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
  const sub  = 'text-[10px] text-zinc-600 mt-0.5'

  // ── Epoch progress bar fill ────────────────────────────────────────────────
  const epochBarFill = `linear-gradient(90deg, ${PINK} 0%, #8b5cf6 ${countdown.epochPct}%, rgba(255,255,255,0.06) ${countdown.epochPct}%)`

  return (
    <div
      className="border rounded-2xl p-6 backdrop-blur-xl bg-zinc-900/50"
      style={{ borderColor: `rgba(${PINK_RGB},0.45)`, boxShadow: `0 0 28px rgba(${PINK_RGB},0.07)` }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div className="flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PINK }}>
            Reward Checker
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Fixed-interval era · 3/31 → 4/13 · {EPOCH_POOL_AVAX} $AVAX pool
          </p>
        </div>
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
            className="px-5 py-2 rounded-xl text-xs font-bold text-white border transition-all hover:scale-105 hover:shadow-[0_0_10px_rgba(255,0,122,0.35)] disabled:opacity-40 whitespace-nowrap [box-sizing:border-box]"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,0,122,0.75)' }}
          >
            {loading ? '…' : 'Check'}
          </button>
        </div>
      </div>

      {/* ── Epoch Progress Bar ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: epochBarFill }} />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-zinc-600">Mar 31</span>
          <span className="text-[10px] text-zinc-500">
            {countdown.daysLeft > 0 ? `${countdown.daysLeft} day${countdown.daysLeft !== 1 ? 's' : ''} remaining` : 'Epoch complete'}
          </span>
          <span className="text-[10px] text-zinc-600">Apr 13</span>
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

          {/* Row 1 — Full-width Pending Rewards (centered) ───────────────────── */}
          <div
            className="rounded-xl px-5 py-5 border text-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(34,211,238,0.25)' }}
          >
            <span className={lbl + ' justify-center'}>Pending Rewards (Claimable)</span>
            {/* 3-col grid: left spacer mirrors right group → number stays dead-center */}
            <div className="grid items-center mt-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              <div />
              <span className="text-6xl font-black [text-shadow:none] leading-none" style={{ color: '#22d3ee' }}>
                {result.pendingAvax.toFixed(6)}
              </span>
              <div className="flex items-center pl-3">
                <span className="text-zinc-400 text-sm font-medium leading-none">$AVAX</span>
                <a
                  href={`https://moats.app/moat/${MOAT_CONTRACT.toLowerCase()}`}
                  target="_blank" rel="noopener noreferrer"
                  className="ml-10 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-105 [text-shadow:none] whitespace-nowrap"
                  style={{ backgroundColor: 'rgba(34,211,238,0.12)', borderColor: 'rgba(34,211,238,0.4)', color: '#22d3ee', boxShadow: '0 0 10px rgba(34,211,238,0.15)' }}
                >
                  Claim
                </a>
              </div>
            </div>
          </div>

          {/* Row 2 — 3 cols: Moat Points · Est. Daily Earnings · Next Payout ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className={card}>
              <span className={lbl}>Your Moat Points</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: '#22d3ee' }}>
                {fmtN(result.userPts)}
              </span>
              <p className={sub}>Pool: {fmtN(result.totalPts)} pts</p>
            </div>

            <div className={card} style={{ borderColor: `rgba(${PINK_RGB},0.3)` }}>
              <span className={lbl}>Earning Power</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: PINK }}>
                {fmtPwr(result.userEarningPower)}
              </span>
              <p className={sub}>~{result.estimatedDaily.toFixed(4)} $AVAX / day</p>
            </div>

            <div className={card}>
              <span className={lbl}>Next Payout · {PULSE_AVAX.toFixed(4)} $AVAX</span>
              <span className="text-xl font-black leading-tight [text-shadow:none] text-white">
                In {countdown.hours}h {String(countdown.mins).padStart(2, '0')}m
              </span>
              <p className={sub}>{(PULSE_AVAX * PULSES_PER_DAY).toFixed(4)} $AVAX daily · every 6 hours</p>
            </div>
          </div>

          {/* Global Moat Density strip ───────────────────────────────────────── */}
          <div
            className="rounded-xl px-4 py-2.5 border"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div className="flex flex-wrap gap-x-5 gap-y-1 items-center">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest">Global Moat Density</span>
              <span className="text-[10px] text-zinc-400">
                <span className="text-white font-bold">{MOAT_DENSITY}%</span> active
              </span>
              <span className="text-[10px] text-zinc-400">
                Staked <span className="font-bold" style={{ color: '#67e8f9' }}>{fmtPwr(GLOBAL_STAKED)}</span>
                {' · '}Locked <span className="font-bold" style={{ color: '#a78bfa' }}>{fmtPwr(GLOBAL_LOCKED)}</span>
                {' · '}Burned <span className="font-bold" style={{ color: '#fb923c' }}>{fmtPwr(GLOBAL_BURNED)}</span>
              </span>
              <span className="text-[10px] text-zinc-400">
                Your share: <span className="text-white font-bold">
                  {result.userEarningPower > 0 ? ((result.userEarningPower / GLOBAL_EARNING_POWER) * 100).toFixed(4) : '0.0000'}%
                </span>
              </span>
            </div>
          </div>

          {/* Row 3 — 3 cols: Legacy Claimed · Fixed Claimed · Total Earned ───── */}
          <div className="grid grid-cols-3 gap-3">
            <div className={card}>
              <span className={lbl}>Claimed · % Era (3/16–3/30)</span>
              <span className="text-xl font-black leading-tight [text-shadow:none] text-white">
                {result.claimedLegacy.toFixed(6)}
              </span>
              <p className={sub}>{(LEGACY_ERA_RATE * 100).toFixed(3)}% pool model · {LEGACY_INJECTION_AVAX} $AVAX injected</p>
            </div>

            <div className={card}>
              <span className={lbl}>Claimed · Fixed Era (3/31+)</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: '#4ade80' }}>
                {result.claimedFixed.toFixed(6)}
              </span>
              <p className={sub}>Fixed-interval · {PULSE_AVAX.toFixed(4)} $AVAX / 6h</p>
            </div>

            <div className={card}>
              <span className={lbl}>Total Earned (Lifetime)</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: '#4ade80' }}>
                {(result.claimedTotal + result.pendingAvax).toFixed(6)}
              </span>
              <p className={sub}>
                {result.claimedTotal.toFixed(6)} claimed · {result.claimCount} tx
              </p>
            </div>
          </div>

          {/* Row 4 — 3 cols: Moat Position ──────────────────────────────────── */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-1">Your Moat Position</p>
          <div className="grid grid-cols-3 gap-3">
            <div className={card}>
              <span className={lbl}>Staked</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: '#22d3ee' }}>
                {fmtN(result.stakedAmount)}
              </span>
              <p className={sub}>LIL · 1× earning power</p>
            </div>
            <div className={card}>
              <span className={lbl}>Locked</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: '#a78bfa' }}>
                {fmtN(result.totalLockedUser)}
              </span>
              <p className={sub}>LIL · {result.activeLockCount} active lock(s)</p>
            </div>
            <div className={card}>
              <span className={lbl}>Burned</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: '#f97316' }}>
                {fmtN(result.totalBurnUser)}
              </span>
              <p className={sub}>LIL · 10× earning power</p>
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
