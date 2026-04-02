'use client'

import { useState, useEffect } from 'react'
import {
  createPublicClient,
  http,
  formatEther,
  getAddress,
  isAddress,
  parseAbi,
  type Address,
  type PublicClient,
} from 'viem'

// ── Avalanche chain ────────────────────────────────────────────────────────────
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
const REWARD_ADDRESS = '0x5E1AC781157AAF1492f15c351183EEFCa5Fbd746' as Address

// ── Distribution timeline ──────────────────────────────────────────────────────
const PROGRAM_START_TS   = Math.floor(new Date('2026-03-16T00:00:00Z').getTime() / 1000)
const FIXED_ERA_START_TS = Math.floor(new Date('2026-03-31T00:00:00Z').getTime() / 1000)
const PULSES_PER_DAY     = 4
const PAYOUT_INTERVAL_S  = 6 * 3600
const PULSE_AVAX         = 0.577

// Phase 1 (Mar 16–29): 14 days, 7.148% diminishing daily from 30.6 AVAX
const LEGACY_ERA_RATE       = 0.07148
const LEGACY_INJECTION_AVAX = 30.6
const PHASE1_TOTAL = LEGACY_INJECTION_AVAX * (1 - Math.pow(1 - LEGACY_ERA_RATE, 14))

// Transition (Mar 30): 30.41 AVAX loaded, 7.148% released
const TRANSITION_TOTAL = 30.41 * LEGACY_ERA_RATE

// Global reward power anchor
const GLOBAL_REWARD_POWER = 3_942_855_424

// Ecosystem snapshot
const TOTAL_SUPPLY  = 1_350_000_000
const GLOBAL_STAKED =   155_693_804
const GLOBAL_LOCKED =   152_330_218
const GLOBAL_BURNED =   321_438_924
const MOAT_DENSITY  = ((GLOBAL_STAKED + GLOBAL_LOCKED + GLOBAL_BURNED) / TOTAL_SUPPLY * 100).toFixed(2)

// ── Phase 2 elapsed AVAX (computed at runtime) ─────────────────────────────────
function getPhase2ElapsedAvax(): number {
  const now     = Math.floor(Date.now() / 1000)
  const elapsed = Math.max(0, now - FIXED_ERA_START_TS)
  const pulses  = Math.floor(elapsed / PAYOUT_INTERVAL_S)
  return pulses * PULSE_AVAX
}

const MOAT_ABI = parseAbi([
  'function userInfo(address) view returns (uint256 stakedAmount, uint256 totalUserBurn, uint256 stakingPoints, uint256 burnPoints, uint256 activeLockCount)',
  'function getUserAllLocks(address) view returns (uint256[] amounts, uint256[] ends, uint256[] points, uint256[] originalDurations, uint256[] lastUpdated, bool[] active)',
  'function getAllPendingRewards(address) view returns (address[] tokens, uint256[] amounts)',
] as const)

// ── Lock multiplier (piecewise linear) ────────────────────────────────────────
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
function fmtPwr(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return Math.round(n).toLocaleString('en-US')
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface LockItem { amount: number; endTs: number; durDays: number; active: boolean }
interface CheckResult {
  pendingAvax:      number   // live contract state — hero
  userTotalEarned:  number   // timeline estimate
  alreadyWithdrawn: number   // userTotalEarned − pendingAvax
  stakedAmount:     number
  totalLockedUser:  number
  activeLockCount:  number
  totalBurnUser:    number
  userEarningPower: number
  estimatedDaily:   number
  locks:            LockItem[]
}
interface Countdown { hours: number; mins: number; epochPct: number; daysLeft: number }

// ── Theme ──────────────────────────────────────────────────────────────────────
const PINK     = '#ff007a'
const PINK_RGB = '255,0,122'

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewardChecker() {
  const [addr,           setAddr]           = useState('')
  const [checkedAddress, setCheckedAddress] = useState('')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [result,         setResult]         = useState<CheckResult | null>(null)
  const [countdown,      setCountdown]      = useState<Countdown>({ hours: 0, mins: 0, epochPct: 0, daysLeft: 0 })

  // ── Live countdown + epoch progress ───────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now           = Math.floor(Date.now() / 1000)
      const elapsed       = Math.max(0, now - FIXED_ERA_START_TS)
      const nextOffset    = Math.ceil((elapsed + 1) / PAYOUT_INTERVAL_S) * PAYOUT_INTERVAL_S
      const remaining     = nextOffset - elapsed
      const hours         = Math.floor(remaining / 3600)
      const mins          = Math.floor((remaining % 3600) / 60)
      const EPOCH_DURATION_S = 14 * 86400
      const epochPct      = Math.min(100, (elapsed / EPOCH_DURATION_S) * 100)
      const daysLeft      = Math.max(0, Math.ceil((EPOCH_DURATION_S - elapsed) / 86400))
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
      setCheckedAddress(address)

      const client: PublicClient = createPublicClient({
        chain:     avalanche,
        transport: http('https://api.avax.network/ext/bc/C/rpc'),
      })

      type Tup5 = readonly [bigint, bigint, bigint, bigint, bigint]
      type Tup6 = readonly [readonly bigint[], readonly bigint[], readonly bigint[], readonly bigint[], readonly bigint[], readonly boolean[]]
      type Tup2 = readonly [readonly Address[], readonly bigint[]]

      const [rawUserInfo, rawLocks, rawPending] = await Promise.all([
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'userInfo',           args: [address] }).catch(() => null),
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getUserAllLocks',    args: [address] }).catch(() => null),
        client.readContract({ address: MOAT_CONTRACT, abi: MOAT_ABI, functionName: 'getAllPendingRewards', args: [address] }).catch(() => null),
      ])

      const ui = rawUserInfo as unknown as Tup5 | null
      const lk = rawLocks    as unknown as Tup6 | null
      const pd = rawPending  as unknown as Tup2 | null

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

      // ── Live pending from contract (hero metric) ───────────────────────────
      const pendingAvax = (pd?.[1] ?? []).reduce((s, a) => s + fmtE(a), 0)

      // ── Earning Power: (burned×10) + (locked×mult) + (staked×1) ──────────
      const lockEP = lockItems
        .filter(l => l.active)
        .reduce((s, l) => s + l.amount * getLockMultiplier(l.durDays), 0)
      const userEarningPower = (totalBurnUser * 10) + lockEP + (stakedAmount * 1)
      const estimatedDaily   = (userEarningPower / GLOBAL_REWARD_POWER) * PULSE_AVAX * PULSES_PER_DAY

      // ── Timeline estimate: Phase1 + Transition + Phase2 ───────────────────
      const totalDistributed = PHASE1_TOTAL + TRANSITION_TOTAL + getPhase2ElapsedAvax()
      const userTotalEarned  = (userEarningPower / GLOBAL_REWARD_POWER) * totalDistributed
      // Already withdrawn = estimated lifetime accrual minus what's still pending
      const alreadyWithdrawn = Math.max(0, userTotalEarned - pendingAvax)

      setResult({
        pendingAvax,
        userTotalEarned,
        alreadyWithdrawn,
        stakedAmount,
        totalLockedUser,
        activeLockCount,
        totalBurnUser,
        userEarningPower,
        estimatedDaily,
        locks: lockItems,
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
            Reward Auditor
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Timeline-based · Phase 1 → Transition → Fixed Pulse
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
            {loading ? '…' : 'Audit'}
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
          <span className="text-zinc-500 text-sm">Auditing on-chain data…</span>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && !loading && (
        <div className="flex flex-col gap-3">

          {/* Hero — Your Unclaimed Balance (live contract) ────────────────── */}
          <div
            className="rounded-xl px-5 py-5 border text-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(34,211,238,0.25)' }}
          >
            <span className={lbl + ' justify-center'}>Your Unclaimed Balance</span>
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
            <p className="text-[10px] text-zinc-600 mt-2">
              Live contract state · ~{result.estimatedDaily.toFixed(4)} $AVAX / day
            </p>
          </div>

          {/* Row 2 — Life-to-Date Accrued · Already Withdrawn · Next Payout ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className={card}>
              <span className={lbl}>Total Life-to-Date Accrued (Est.)</span>
              <span className="text-xl font-black leading-tight [text-shadow:none]" style={{ color: '#4ade80' }}>
                {result.userTotalEarned.toFixed(6)}
              </span>
              <p className={sub}>$AVAX · Phase 1 + Transition + Phase 2 timeline</p>
            </div>

            <div className={card}>
              <span className={lbl}>Already Withdrawn</span>
              <span className="text-xl font-black leading-tight [text-shadow:none] text-white">
                {result.alreadyWithdrawn.toFixed(6)}
              </span>
              <a
                href={`https://snowtrace.io/txsInternal?a=${checkedAddress}&tadd=${REWARD_ADDRESS}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5 inline-block"
              >
                Est. accrued − pending · View on Snowtrace ↗
              </a>
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
                  {result.userEarningPower > 0
                    ? ((result.userEarningPower / GLOBAL_REWARD_POWER) * 100).toFixed(4)
                    : '0.0000'}%
                </span>
              </span>
            </div>
          </div>

          {/* Your Moat Position ──────────────────────────────────────────────── */}
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

          {/* Active Locks ────────────────────────────────────────────────────── */}
          {result.locks.length > 0 && (
            <div className={card}>
              <p className={lbl + ' mb-3'}>Active Locks</p>
              <div className="flex flex-col divide-y divide-zinc-800">
                {result.locks.map((lk, i) => {
                  const endDate = new Date(lk.endTs * 1000).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })
                  const expired  = lk.endTs < Date.now() / 1000
                  const isActive = lk.active && !expired
                  const dur = lk.durDays >= 365
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
