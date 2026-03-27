import { TOKENS } from '@/lib/tokens'
import { fetchMoatData, fetchChainData } from '@/lib/chain'
import { supabase, type SnapshotRow } from '@/lib/supabase'
import StatCard from '@/components/StatCard'
import SupplyBar from '@/components/SupplyBar'
import MarketTicker, { type MarketData } from '@/components/MarketTicker'

const cfg = TOKENS['HEFE']

// Crimson Red accent for burn actions
const CRIMSON     = '#DC143C'
const CRIMSON_RGB = '220,20,60'

function pct(value: number): string {
  return (value / cfg.supply * 100).toFixed(2)
}

export const revalidate = 60

export default async function HefeDashboard() {
  const [moat, chain, supabaseRes, dexRes] = await Promise.all([
    fetchMoatData(cfg.contracts.moat),
    fetchChainData(cfg.contracts.token, cfg.contracts.lpPair),
    supabase
      .from('moat_snapshots')
      .select('*')
      .eq('token_id', cfg.id)
      .order('created_at', { ascending: false })
      .limit(1),
    fetch(cfg.urls.dexApi, { next: { revalidate: 60 } }),
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
    const snapCirculating = cfg.supply - snapshot.staked - snapshot.locked - snapshot.dead - snapshot.lp
    deltas = {
      staked:      staked      - snapshot.staked,
      locked:      locked      - snapshot.locked,
      burned:      burned      - snapshot.burned,
      dead:        dead        - snapshot.dead,
      lp:          lp          - snapshot.lp,
      circulating: circulating - snapCirculating,
    }
    if (deltas.burned != null && deltas.dead != null && (deltas.burned as number) > (deltas.dead as number)) {
      deltas.burned = deltas.dead
    }
  } else {
    deltas = { staked: null, locked: null, burned: null, dead: null, lp: null, circulating: null }
  }

  // Market data
  const dexJson  = await dexRes.json().catch(() => null)
  const pair     = dexJson?.pairs?.[0] ?? null
  const priceUsd = pair?.priceUsd ? parseFloat(pair.priceUsd) : null
  const initialMarket: MarketData = {
    priceUsd,
    priceAvax: pair?.priceNative ? parseFloat(pair.priceNative) : null,
    liquidity: pair?.liquidity?.usd ?? null,
    marketCap: pair?.marketCap   ?? null,
    fdv:       priceUsd ? priceUsd * cfg.supply : null,
  }

  const updatedAt = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const btnBase = 'inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border transition-colors [box-sizing:border-box] will-change-transform [transform:translateZ(0)]'

  const cardProps = { ticker: cfg.ticker, color: cfg.color, colorRgb: cfg.colorRgb }

  const ecosystem = Object.values(TOKENS).filter(t => t.id !== cfg.id)

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-wider flex items-center gap-3">
            <div
              className="h-10 w-10 min-w-[40px] rounded-full border-2 overflow-hidden flex-shrink-0"
              style={{
                borderColor: cfg.color,
                boxShadow: `0 0 20px rgba(${cfg.colorRgb},0.4)`,
              }}
            >
              <img src={cfg.logo} className="h-full w-full object-cover" alt={cfg.ticker} />
            </div>
            {cfg.name}
          </h1>
          <p className="text-zinc-400 mt-1 text-sm flex items-center gap-2 flex-wrap">
            <span>
              Total Supply:{' '}
              <span className="font-medium" style={{ color: cfg.color }}>
                {cfg.supply.toLocaleString('en-US')} ${cfg.ticker}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00FF41] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00FF41]" />
              </span>
              <span className="text-zinc-500 uppercase text-[10px] tracking-widest font-bold">Live Network</span>
            </span>
          </p>
        </div>

        {/* Market Metrics */}
        <MarketTicker
          initial={initialMarket}
          dexApiUrl={cfg.urls.dexApi}
          color={cfg.color}
          supply={cfg.supply}
        />

        {/* Row 1: Moat activity */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <StatCard icon="🏛️" label="Staked"  value={staked}  pct={pct(staked)}  delta={deltas.staked as number | null}  provenance="🏰" {...cardProps} />
          <StatCard icon="🔐" label="Locked"  value={locked}  pct={pct(locked)}  delta={deltas.locked as number | null}  provenance="🏰" {...cardProps} />
          <StatCard icon="🔥" label="Burned"  value={burned}  pct={pct(burned)}  delta={deltas.burned as number | null}  provenance="🏰" {...cardProps} />
        </div>

        {/* Row 2: Supply breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <StatCard icon="🔥" label="Total Burned"  value={dead}        pct={pct(dead)}        delta={deltas.dead as number | null}        provenance="💀" {...cardProps} />
          <StatCard icon="⚖️" label="LP Pair"       value={lp}          pct={pct(lp)}          delta={deltas.lp as number | null}          {...cardProps} />
          <StatCard icon="💎" label="Circulating"   value={circulating} pct={pct(circulating)} delta={deltas.circulating as number | null} iconSrc={cfg.logo} {...cardProps} />
        </div>

        <SupplyBar
          staked={staked}
          locked={locked}
          burned={dead}
          lp={lp}
          circulating={circulating}
          moatBurned={burned}
          supply={cfg.supply}
          color={cfg.color}
          colorRgb={cfg.colorRgb}
        />

        {/* Action Bar */}
        <div className="flex flex-wrap justify-center gap-2 py-6">
          <a
            href={cfg.urls.buy} target="_blank" rel="noopener noreferrer"
            className={btnBase}
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(0,255,65,0.4)', color: '#00FF41' }}
          >
            🛒 Buy ${cfg.ticker}
          </a>
          <a
            href={cfg.urls.moat} target="_blank" rel="noopener noreferrer"
            className={`${btnBase} bg-blue-950 border-blue-700 text-blue-300 hover:bg-blue-900`}
          >
            🏰 Stake
          </a>
          <a
            href={cfg.urls.moat} target="_blank" rel="noopener noreferrer"
            className={`${btnBase} bg-violet-950 border-violet-700 text-violet-300 hover:bg-violet-900`}
          >
            🔐 Lock
          </a>
          <a
            href={cfg.urls.moat} target="_blank" rel="noopener noreferrer"
            className={btnBase}
            style={{ backgroundColor: `rgba(${CRIMSON_RGB},0.1)`, borderColor: `rgba(${CRIMSON_RGB},0.5)`, color: CRIMSON }}
          >
            🔥 Burn
          </a>
          <a
            href={cfg.urls.burn} target="_blank" rel="noopener noreferrer"
            className={btnBase}
            style={{ backgroundColor: `rgba(${CRIMSON_RGB},0.1)`, borderColor: `rgba(${CRIMSON_RGB},0.5)`, color: CRIMSON }}
          >
            💀 View Total Burn
          </a>
          <a
            href={cfg.urls.dexChart} target="_blank" rel="noopener noreferrer"
            className={btnBase}
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(0,255,65,0.4)', color: '#00FF41' }}
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#00FF41" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="15 7 21 7 21 13" />
            </svg>
            Live Chart
          </a>
        </div>

        {/* System Legend */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 mt-4">
          <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest mb-3">System Legend</p>
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
                  : <div className="h-5 w-5 min-w-[20px] rounded-full overflow-hidden flex-shrink-0 mt-0.5">
                      <img src={cfg.logo} className="h-full w-full object-cover" alt={cfg.ticker} />
                    </div>
                }
                <p className="text-xs text-zinc-500">
                  <span className="text-zinc-300 font-medium">{title}</span> — {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-8">
          Last live check: {updatedAt}
        </p>
      </div>

      {/* Ecosystem nav footer */}
      <footer className="border-t border-white/5 bg-white/[0.03] pt-4 pb-6">
        <p className="text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest mb-5">
          The Moat Ecosystem
        </p>
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-2">
          {ecosystem.map((t) => (
            <a
              key={t.id}
              href={t.hubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-medium transition-all duration-200 hover:scale-105 hover:border-white/40 hover:bg-white/15"
            >
              <div className="h-4 w-4 rounded-full overflow-hidden flex-shrink-0">
                <img src={t.logo} className="h-full w-full object-cover" alt={t.ticker} />
              </div>
              ${t.ticker} Hub
            </a>
          ))}
        </div>
      </footer>
    </main>
  )
}
