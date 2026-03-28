import Image from 'next/image'
import { TOKENS } from '@/lib/tokens'
import { fetchMoatData, fetchChainData, fetchHolderCount } from '@/lib/chain'
import { supabase, type SnapshotRow } from '@/lib/supabase'
import DeltaRow from '@/components/DeltaRow'

const cfg = TOKENS['DISH']

// ─── Fire palette ────────────────────────────────────────────────────────────
const FIRE  = '#FF4500'   // fire orange-red — primary
const EMBER = '#FF8C00'   // amber — secondary

export const revalidate = 60

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number): string { return Math.round(n).toLocaleString('en-US') }
function pct(v: number): string { return (v / cfg.supply * 100).toFixed(2) }

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)         return '$' + Math.round(n).toLocaleString('en-US')
  return '$' + n.toFixed(4)
}

// ─── Data card ───────────────────────────────────────────────────────────────
function DishCard({
  icon, iconSrc, label, value, delta, floorAtZero = false, provenance,
}: {
  icon?: string
  iconSrc?: string
  label: string
  value: number
  delta: number | null
  floorAtZero?: boolean
  provenance?: string
}) {
  const field = label.toLowerCase().replace(/\s+/g, '_')
  return (
    <div className="relative bg-white border-2 border-black rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-black text-sm font-bold flex items-center gap-1.5">
          {iconSrc
            ? <div className="h-6 w-6 rounded-full overflow-hidden border-2 border-black flex-shrink-0">
                <Image src={iconSrc} width={128} height={128} className="h-full w-full object-cover" alt="token" />
              </div>
            : <span>{icon}</span>
          }
          {label}
        </span>
        <span
          className="text-xs font-black px-2 py-0.5 rounded-full border-2 border-black"
          style={{ backgroundColor: FIRE, color: '#fff' }}
        >
          {pct(value)}%
        </span>
      </div>
      <p className="text-2xl font-black tracking-tight text-black">
        {fmt(value)}
        <span className="text-gray-500 text-base font-normal ml-1">${cfg.ticker}</span>
      </p>
      <div className="h-4 flex items-center">
        <DeltaRow tokenId={cfg.id} field={field} current={value} serverDelta={delta} floorAtZero={floorAtZero} positiveColor="#10B981" />
      </div>
      {provenance && (
        <span className="absolute bottom-3 right-3 text-[14px] select-none">{provenance}</span>
      )}
    </div>
  )
}

// ─── Market box ──────────────────────────────────────────────────────────────
function MarketBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="bg-zinc-900 rounded-xl p-4 flex flex-col gap-1"
      style={{ border: `2px solid ${accent ? FIRE : 'rgb(63 63 70)'}` }}
    >
      <span className="text-zinc-400 text-xs font-bold tracking-wider uppercase">{label}</span>
      <span className="text-base font-black text-white">{value}</span>
    </div>
  )
}

// ─── Supply bar ──────────────────────────────────────────────────────────────
function DishSupplyBar({
  staked, locked, burned, lp, circulating, moatBurned, supply,
}: {
  staked: number; locked: number; burned: number; lp: number
  circulating: number; moatBurned: number; supply: number
}) {
  const w = (n: number) => `${Math.max(0, (n / supply) * 100).toFixed(4)}%`
  const moatTotal = staked + locked + moatBurned

  const segments = [
    { label: 'Staked',      value: staked,      color: '#3B82F6' },
    { label: 'Locked',      value: locked,      color: '#8B5CF6' },
    { label: 'Burned',      value: burned,      color: FIRE      },
    { label: 'LP',          value: lp,          color: '#10B981' },
    { label: 'Circulating', value: circulating, color: EMBER     },
  ]

  return (
    <div className="bg-zinc-900 border-2 border-zinc-700 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white text-xs font-black uppercase tracking-widest">
          Supply Distribution
        </span>
        <span
          className="text-xs font-black px-2 py-0.5 rounded-full border-2 border-black"
          style={{ backgroundColor: FIRE, color: '#fff' }}
        >
          {((moatTotal / supply) * 100).toFixed(2)}% Secured in Moat
        </span>
      </div>
      <div className="flex h-4 w-full overflow-hidden rounded-sm border-2 border-zinc-700 gap-px mb-3 bg-zinc-800">
        {segments.map(s => s.value > 0 && (
          <div key={s.label} style={{ width: w(s.value), backgroundColor: s.color, minWidth: '2px' }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {segments.map(s => (
          <span key={s.label} className="flex items-center gap-1 text-xs font-bold text-zinc-300">
            <span className="w-2 h-2 rounded-full border border-zinc-600" style={{ backgroundColor: s.color }} />
            {s.label} <span className="text-zinc-500 font-normal">{pct(s.value)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function DishDashboard() {
  const [moat, chain, supabaseRes, dexRes, holders] = await Promise.all([
    fetchMoatData(cfg.contracts.moat),
    fetchChainData(cfg.contracts.token, cfg.contracts.lpPair),
    supabase
      .from('moat_snapshots')
      .select('*')
      .eq('token_id', cfg.id)
      .order('created_at', { ascending: false })
      .limit(1),
    fetch(cfg.urls.dexApi, { next: { revalidate: 60 } }),
    fetchHolderCount(cfg.contracts.token),
  ])

  const { staked, locked, burned } = moat
  const { dead, lp } = chain
  const circulating = cfg.supply - staked - locked - dead - lp

  const snapshot: SnapshotRow | null =
    supabaseRes.data && supabaseRes.data.length > 0 && supabaseRes.data[0].lp > 0
      ? supabaseRes.data[0]
      : null

  let deltas: Record<string, number | null>
  if (snapshot) {
    const snapCirc = cfg.supply - snapshot.staked - snapshot.locked - snapshot.dead - snapshot.lp
    deltas = {
      staked:      staked      - snapshot.staked,
      locked:      locked      - snapshot.locked,
      burned:      burned      - snapshot.burned,
      dead:        dead        - snapshot.dead,
      lp:          lp          - snapshot.lp,
      circulating: circulating - snapCirc,
    }
    if ((deltas.burned as number) < 0) deltas.burned = 0
    if ((deltas.dead   as number) < 0) deltas.dead   = 0
    if ((deltas.burned as number) > (deltas.dead as number)) deltas.burned = deltas.dead
  } else {
    deltas = { staked: null, locked: null, burned: null, dead: null, lp: null, circulating: null }
  }

  const dexJson  = await dexRes.json().catch(() => null)
  const pair     = dexJson?.pairs?.[0] ?? null
  const priceUsd = pair?.priceUsd ? parseFloat(pair.priceUsd) : null

  const market = [
    { label: 'Price USD',        value: priceUsd                ? '$' + priceUsd.toFixed(6)               : '—' },
    { label: 'Price AVAX',       value: pair?.priceNative       ? parseFloat(pair.priceNative).toFixed(6)  : '—' },
    { label: 'Liquidity',        value: pair?.liquidity?.usd    ? fmtUsd(pair.liquidity.usd)               : '—' },
    { label: 'Market Cap',       value: pair?.marketCap         ? fmtUsd(pair.marketCap)                   : '—' },
    { label: 'Fully Diluted MC', value: priceUsd                ? fmtUsd(priceUsd * cfg.supply)            : '—', accent: true },
    { label: 'Holders',          value: holders != null         ? holders.toLocaleString('en-US')          : '---',            accent: true },
  ]

  const updatedAt = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const btnBase = 'inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-black border-2 border-black transition-all hover:scale-105 [box-sizing:border-box]'

  const ecosystem = Object.values(TOKENS).filter(t => t.id !== cfg.id)

  return (
    <>
      {/* Deep obsidian base */}
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundColor: '#121212', zIndex: 0 }} />
      {/* Fire texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:    "url('/dimish.jpg')",
          backgroundSize:     'cover',
          backgroundPosition: 'center',
          backgroundRepeat:   'no-repeat',
          opacity:            0.20,
          mixBlendMode:       'lighten',
          zIndex:             1,
        }}
      />
      <main className="relative min-h-screen bg-transparent text-white" style={{ zIndex: 2 }}>

      {/* Fire stripe */}
      <div className="h-2 flex">
        <div className="flex-1" style={{ backgroundColor: FIRE }} />
        <div className="flex-1" style={{ backgroundColor: EMBER }} />
        <div className="flex-1" style={{ backgroundColor: '#2A2A2A' }} />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-wider flex items-center gap-3">
            <div className="h-10 w-10 min-w-[40px] rounded-full border-2 border-zinc-600 overflow-hidden flex-shrink-0">
              <img src={cfg.logo} className="h-full w-full object-cover" alt={cfg.ticker} />
            </div>
            {cfg.name}
          </h1>
          <p className="text-zinc-400 mt-1 text-sm flex items-center gap-2 flex-wrap">
            <span>
              Total Supply:{' '}
              <span className="font-black" style={{ color: FIRE }}>
                {cfg.supply.toLocaleString('en-US')} ${cfg.ticker}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
              </span>
              <span className="text-zinc-500 uppercase text-[10px] tracking-widest font-black">Live Network</span>
            </span>
          </p>
        </div>

        {/* Market Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {market.map(m => <MarketBox key={m.label} {...m} />)}
        </div>

        {/* Row 1: Moat activity */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <DishCard icon="🏛️" label="Staked"  value={staked}  delta={deltas.staked as number | null}  provenance="🏰" />
          <DishCard icon="🔐" label="Locked"  value={locked}  delta={deltas.locked as number | null}  provenance="🏰" />
          <DishCard icon="🔥" label="Burned"  value={burned}  delta={deltas.burned as number | null}  provenance="🏰" floorAtZero />
        </div>

        {/* Row 2: Supply breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <DishCard icon="🔥" label="Total Burned"  value={dead}        delta={deltas.dead as number | null}        provenance="💀" floorAtZero />
          <DishCard icon="⚖️" label="LP Pair"       value={lp}          delta={deltas.lp as number | null}          />
          <DishCard iconSrc={cfg.logo} label="Circulating" value={circulating} delta={deltas.circulating as number | null} />
        </div>

        <DishSupplyBar
          staked={staked} locked={locked} burned={dead} lp={lp}
          circulating={circulating} moatBurned={burned} supply={cfg.supply}
        />

        {/* Action Bar */}
        <div className="flex flex-wrap justify-center gap-2 py-6">
          <a href={cfg.urls.buy} target="_blank" rel="noopener noreferrer"
            className={btnBase} style={{ backgroundColor: FIRE, color: '#fff' }}>
            🛒 Buy ${cfg.ticker}
          </a>
          <a href={cfg.urls.moat} target="_blank" rel="noopener noreferrer"
            className={btnBase} style={{ backgroundColor: '#1E3A5F', borderColor: '#2D5FA6', color: '#93C5FD' }}>
            🏰 Stake
          </a>
          <a href={cfg.urls.moat} target="_blank" rel="noopener noreferrer"
            className={btnBase} style={{ backgroundColor: '#2D1B4E', borderColor: '#5B21B6', color: '#C4B5FD' }}>
            🔐 Lock
          </a>
          <a href={cfg.urls.moat} target="_blank" rel="noopener noreferrer"
            className={btnBase} style={{ backgroundColor: '#3B0D0D', borderColor: '#7F1D1D', color: '#FCA5A5' }}>
            🔥 Burn
          </a>
          <a href={cfg.urls.burn} target="_blank" rel="noopener noreferrer"
            className={btnBase} style={{ backgroundColor: '#3B0D0D', borderColor: '#7F1D1D', color: '#FCA5A5' }}>
            💀 View Total Burn
          </a>
          <a href={cfg.urls.dexChart} target="_blank" rel="noopener noreferrer"
            className={btnBase} style={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(255,69,0,0.5)', color: EMBER }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={EMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="15 7 21 7 21 13" />
            </svg>
            Live Chart
          </a>
        </div>

        {/* System Legend */}
        <div className="bg-zinc-900 border-2 border-zinc-700 rounded-xl p-5 mt-4">
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-3">System Legend</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: '🏛️', title: 'Staked',       desc: `$${cfg.ticker} actively staked in The Moat.` },
              { icon: '🔐', title: 'Locked',        desc: `$${cfg.ticker} time-locked in The Moat.` },
              { icon: '🔥', title: 'Burned',        desc: `$${cfg.ticker} burned via The Moat contract.` },
              { icon: '🔥', title: 'Total Burned',  desc: `All $${cfg.ticker} sent to the dead address.` },
              { icon: '⚖️', title: 'LP Pair',       desc: `$${cfg.ticker} liquidity locked in DEX pair.` },
              { icon: null, title: 'Circulating',   desc: `Total supply minus all secured supply.` },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2">
                {icon
                  ? <span className="text-base leading-none mt-0.5 flex-shrink-0">{icon}</span>
                  : <div className="h-5 w-5 min-w-[20px] rounded-full overflow-hidden border-2 border-zinc-600 flex-shrink-0 mt-0.5">
                      <Image src={cfg.logo} width={128} height={128} className="h-full w-full object-cover" alt={cfg.ticker} />
                    </div>
                }
                <p className="text-xs text-zinc-500">
                  <span className="text-zinc-300 font-bold">{title}</span> — {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-8">
          Last live check: {updatedAt}
        </p>
      </div>

      {/* Ecosystem footer */}
      <footer className="border-t-2 border-zinc-800 bg-zinc-950 pt-4 pb-6 mt-4">
        <p className="text-center text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-5">
          The Moat Ecosystem
        </p>
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-2">
          {ecosystem.map(t => (
            <a key={t.id} href={t.hubUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border-2 border-zinc-700 text-zinc-300 text-xs font-black transition-all hover:scale-105 hover:border-zinc-500 hover:text-white"
            >
              <div className="h-4 w-4 rounded-full overflow-hidden border border-zinc-600 flex-shrink-0">
                <img src={t.logo} className="h-full w-full object-cover" alt={t.ticker} />
              </div>
              ${t.ticker} Hub
            </a>
          ))}
        </div>
      </footer>

      {/* Bottom fire stripe */}
      <div className="h-2 flex">
        <div className="flex-1" style={{ backgroundColor: '#2A2A2A' }} />
        <div className="flex-1" style={{ backgroundColor: EMBER }} />
        <div className="flex-1" style={{ backgroundColor: FIRE }} />
      </div>
      </main>
    </>
  )
}
