import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { TOKENS } from '@/lib/tokens'
import { getConfigBySlug } from '@/lib/config'
import { fetchMoatData, fetchChainData, fetchTokenBalance, fetchHolderCount } from '@/lib/chain'
import { supabase, type SnapshotRow } from '@/lib/supabase'
import StatCard from '@/components/StatCard'
import SupplyBar from '@/components/SupplyBar'
import MarketTicker, { type MarketData } from '@/components/MarketTicker'
import MoatOptimizer from '@/components/MoatOptimizer'

export const revalidate = 60

export function generateStaticParams() {
  return Object.values(TOKENS).map(t => ({ token: t.slug }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params
  const cfg = getConfigBySlug(token)
  if (!cfg) return {}
  return {
    title: cfg.name,
    icons: { icon: [{ url: cfg.logo, type: 'image/png' }], apple: cfg.logo },
  }
}

function pct(value: number, supply: number): string {
  return (value / supply * 100).toFixed(2)
}

export default async function TokenDashboard(
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const cfg = getConfigBySlug(token)
  if (!cfg) notFound()

  const [moat, chain, supabaseRes, dexRes, extraLp, holders] = await Promise.all([
    fetchMoatData(cfg.contracts.moat),
    fetchChainData(cfg.contracts.token, cfg.contracts.lpPair),
    supabase
      .from('moat_snapshots')
      .select('*')
      .eq('token_id', cfg.id)
      .order('created_at', { ascending: false })
      .limit(1),
    fetch(cfg.urls.dexApi, { next: { revalidate: 60 } }),
    Promise.all(
      (cfg.contracts.lpPairsExtra ?? []).map(addr =>
        fetchTokenBalance(cfg.contracts.token, addr)
      )
    ).then(bals => bals.reduce((s, n) => s + n, 0)),
    fetchHolderCount(cfg.contracts.token),
  ])

  const { staked, locked, burned } = moat
  const { dead, lp: primaryLp } = chain
  const lp = cfg.staticLp ?? (primaryLp + extraLp)

  // Universal burn: ERC-20 burn() destroys tokens (burned > dead); dead-wallet-send increases dead.
  // Math.max covers both patterns correctly.
  const totalBurned  = Math.max(burned, dead)
  const circulating  = cfg.supply - staked - locked - totalBurned - lp

  // Snapshot null-guard: accept any row where moat or LP has real data
  const snapshot: SnapshotRow | null =
    supabaseRes.data && supabaseRes.data.length > 0 &&
    (supabaseRes.data[0].staked > 0 || supabaseRes.data[0].locked > 0 || supabaseRes.data[0].lp > 0)
      ? supabaseRes.data[0]
      : null

  let deltas: Record<string, number | null>
  if (snapshot) {
    const snapTotalBurned = Math.max(snapshot.burned, snapshot.dead)
    const snapCirc        = cfg.supply - snapshot.staked - snapshot.locked - snapTotalBurned - snapshot.lp
    const burnedDelta     = burned - snapshot.burned
    const deadDelta       = dead   - snapshot.dead
    deltas = {
      staked:      staked      - snapshot.staked,
      locked:      locked      - snapshot.locked,
      burned:      burnedDelta,
      // totalBurned delta follows whichever figure is dominant
      dead:        burned >= dead ? burnedDelta : deadDelta,
      lp:          lp          - snapshot.lp,
      circulating: circulating - snapCirc,
    }
    if ((deltas.burned as number) < 0) deltas.burned = 0
    if ((deltas.dead   as number) < 0) deltas.dead   = 0
  } else {
    deltas = { staked: null, locked: null, burned: null, dead: null, lp: null, circulating: null }
  }

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

  // ── Theme ─────────────────────────────────────────────────────────────────
  const theme       = cfg.theme
  const cv          = theme?.cardVariant           // 'light' | 'frosted' | undefined
  const bv          = theme?.buttonVariant         // 'pop-art' | 'ghost' | undefined
  const dpc         = theme?.deltaPositiveColor ?? '#00FF41'
  const isDark      = theme?.dark ?? false
  const hasCustomBg = !!(theme?.bgBase || theme?.bgImage)

  // Pop-art button palette — stripe[0]=burn, stripe[1]=buy, stripe[2]=stake
  const stripe  = theme?.stripe
  const btnBurn  = stripe?.[0] ?? cfg.color
  const btnBuy   = stripe?.[1] ?? cfg.color
  const btnStake = stripe?.[2] ?? cfg.color

  const cardProps = {
    tokenId: cfg.id,
    ticker: cfg.ticker,
    color: cfg.color,
    colorRgb: cfg.colorRgb,
    variant: cv,
    deltaPositiveColor: dpc,
    badgeColor: theme?.badgeColor,
  }
  const p = (v: number) => pct(v, cfg.supply)
  const ecosystem = Object.values(TOKENS).filter(t => t.id !== cfg.id)

  // ── Legend styles ──────────────────────────────────────────────────────────
  const legendClass =
    cv === 'light'
      ? 'bg-white border-2 border-black rounded-xl p-5 mt-4'
      : cv === 'frosted'
      ? 'bg-[#121212]/[.92] backdrop-blur-xl border border-zinc-800 border-t-white/10 rounded-xl p-5 mt-4 shadow-2xl'
      : 'bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 mt-4'

  const legendTitleClass =
    cv === 'light'
      ? 'text-black text-[10px] font-black uppercase tracking-widest mb-3'
      : 'text-zinc-600 text-[10px] font-bold uppercase tracking-widest mb-3'

  const legendItemTextClass =
    cv === 'light' ? 'text-xs text-gray-600' : 'text-xs text-zinc-500'

  const legendItemTitleClass =
    cv === 'light' ? 'text-black font-bold' : 'text-zinc-300 font-medium'

  const legendIconBorderClass =
    cv === 'light'
      ? 'h-5 w-5 min-w-[20px] rounded-full overflow-hidden border-2 border-black flex-shrink-0 mt-0.5'
      : 'h-5 w-5 min-w-[20px] rounded-full overflow-hidden border border-zinc-700 flex-shrink-0 mt-0.5'

  // ── Action buttons ─────────────────────────────────────────────────────────
  const actionButtons =
    bv === 'pop-art' ? (
      <div className="flex flex-wrap justify-center gap-2 py-6">
        <a href={cfg.urls.buy}      target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-black border-2 border-black transition-all hover:scale-105 [box-sizing:border-box]"
          style={{ backgroundColor: btnBuy, color: '#000' }}>
          🛒 Buy ${cfg.ticker}
        </a>
        <a href={cfg.urls.moat}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-black border-2 border-black transition-all hover:scale-105 [box-sizing:border-box]"
          style={{ backgroundColor: btnStake, color: '#fff' }}>
          🏰 Stake
        </a>
        <a href={cfg.urls.moat}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-black border-2 border-black transition-all hover:scale-105 [box-sizing:border-box]"
          style={{ backgroundColor: btnStake, color: '#fff' }}>
          🔐 Lock
        </a>
        <a href={cfg.urls.moat}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-black border-2 border-black transition-all hover:scale-105 [box-sizing:border-box]"
          style={{ backgroundColor: btnBurn, color: '#fff' }}>
          🔥 Burn
        </a>
        <a href={cfg.urls.burn}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-black border-2 border-black transition-all hover:scale-105 [box-sizing:border-box]"
          style={{ backgroundColor: btnBurn, color: '#fff' }}>
          💀 View Total Burn
        </a>
        <a href={cfg.urls.dexChart} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-black border-2 border-black transition-all hover:scale-105 [box-sizing:border-box]"
          style={{ backgroundColor: btnBuy, color: '#000' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="15 7 21 7 21 13" />
          </svg>
          Live Chart
        </a>
      </div>
    ) : bv === 'ghost' ? (
      <div
        className="my-6 rounded-2xl bg-[#121212]/[.92] backdrop-blur-xl shadow-2xl px-4 py-4"
        style={{
          '--btn-border':      `rgba(${cfg.colorRgb},0.4)`,
          '--btn-border-h':    `rgba(${cfg.colorRgb},0.8)`,
          '--btn-glow':        `rgba(${cfg.colorRgb},0.2)`,
        } as React.CSSProperties}
      >
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { label: `🛒 Buy $${cfg.ticker}`, href: cfg.urls.buy },
            { label: '🏰 Stake',              href: cfg.urls.moat },
            { label: '🔐 Lock',               href: cfg.urls.moat },
            { label: '🔥 Burn',               href: cfg.urls.moat },
            { label: '💀 View Total Burn',    href: cfg.urls.burn },
          ].map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border [border-color:var(--btn-border)] text-white bg-transparent transition-all hover:scale-105 hover:[border-color:var(--btn-border-h)] hover:[box-shadow:0_0_12px_var(--btn-glow)] [box-sizing:border-box]">
              {label}
            </a>
          ))}
          <a href={cfg.urls.dexChart} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border [border-color:var(--btn-border)] text-white bg-transparent transition-all hover:scale-105 hover:[border-color:var(--btn-border-h)] hover:[box-shadow:0_0_12px_var(--btn-glow)] [box-sizing:border-box]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="15 7 21 7 21 13" />
            </svg>
            Live Chart
          </a>
        </div>
      </div>
    ) : (
      // Default
      <div className="flex flex-wrap justify-center gap-2 py-6">
        <a href={cfg.urls.buy}      target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border transition-colors [box-sizing:border-box] will-change-transform [transform:translateZ(0)]"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(0,255,65,0.4)', color: '#00FF41' }}>
          🛒 Buy ${cfg.ticker}
        </a>
        <a href={cfg.urls.moat}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border transition-colors bg-blue-950 border-blue-700 text-blue-300 hover:bg-blue-900 [box-sizing:border-box]">
          🏰 Stake
        </a>
        <a href={cfg.urls.moat}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border transition-colors bg-violet-950 border-violet-700 text-violet-300 hover:bg-violet-900 [box-sizing:border-box]">
          🔐 Lock
        </a>
        <a href={cfg.urls.moat}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border transition-colors bg-red-950 border-red-800 text-red-300 hover:bg-red-900 [box-sizing:border-box]">
          🔥 Burn
        </a>
        <a href={cfg.urls.burn}     target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border transition-colors bg-red-950 border-red-800 text-red-300 hover:bg-red-900 [box-sizing:border-box]">
          💀 View Total Burn
        </a>
        <a href={cfg.urls.dexChart} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-medium border transition-colors [box-sizing:border-box] will-change-transform [transform:translateZ(0)]"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(0,255,65,0.4)', color: '#00FF41' }}>
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
    )

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerClass =
    isDark
      ? 'border-t-2 border-black bg-white pt-4 pb-6 mt-4'
      : bv === 'ghost'
      ? 'border-t border-zinc-800 bg-black pt-4 pb-6'
      : 'border-t border-white/5 bg-white/[0.03] pt-4 pb-6'

  const footerTitleClass =
    isDark ? 'text-center text-black text-[10px] font-black uppercase tracking-widest mb-5'
           : 'text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest mb-5'

  const footerLinkClass =
    isDark
      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border-2 border-black text-black text-xs font-black transition-all hover:scale-105'
      : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent border border-zinc-600 text-zinc-300 text-xs font-medium transition-all hover:scale-105 hover:border-zinc-400 hover:text-white'

  const footerImgBorderClass =
    isDark
      ? 'h-4 w-4 rounded-full overflow-hidden border border-black flex-shrink-0'
      : 'h-4 w-4 rounded-full overflow-hidden border border-zinc-700 flex-shrink-0'

  // ── Live dot ──────────────────────────────────────────────────────────────
  const dotColor = isDark ? '#10B981' : '#00FF41'
  const dotLabelClass = isDark
    ? 'text-gray-500 uppercase text-[10px] tracking-widest font-black'
    : theme?.headerWhite
    ? 'text-white uppercase text-[10px] tracking-widest font-bold'
    : 'text-zinc-500 uppercase text-[10px] tracking-widest font-bold'

  // ── Header text ───────────────────────────────────────────────────────────
  const supplyLabelClass  = isDark
    ? 'text-gray-700 mt-1 text-sm flex items-center gap-2 flex-wrap'
    : theme?.headerWhite
    ? 'text-white mt-1 text-sm flex items-center gap-2 flex-wrap'
    : 'text-zinc-400 mt-1 text-sm flex items-center gap-2 flex-wrap'
  const supplyValueClass  = isDark ? 'font-black' : theme?.supplyValueWhite ? 'font-bold' : 'font-medium'
  const logoRingClass     = isDark ? 'h-10 w-10 min-w-[40px] rounded-full border-2 border-black overflow-hidden flex-shrink-0' : 'h-10 w-10 min-w-[40px] rounded-full border-2 overflow-hidden flex-shrink-0'
  const titleClass        = isDark ? 'text-3xl font-black tracking-wider flex items-center gap-3' : 'text-3xl font-bold tracking-wider flex items-center gap-3'

  const timestampClass    = cv === 'frosted'
    ? 'text-center text-white text-xs mt-8'
    : isDark
    ? 'text-center text-gray-400 text-xs mt-8'
    : 'text-center text-zinc-600 text-xs mt-8'

  return (
    <>
      {/* Background layers (themed hubs only) */}
      {hasCustomBg && (
        <>
          <div className="fixed inset-0 pointer-events-none" style={{ backgroundColor: theme?.bgBase ?? '#000', zIndex: 0 }} />
          {theme?.bgImage && (
            <div
              className="fixed inset-0 pointer-events-none"
              style={{
                backgroundImage:    theme.bgImageFade ? `${theme.bgImageFade}, url('${theme.bgImage}')` : `url('${theme.bgImage}')`,
                backgroundSize:     theme.bgImageSize ?? 'cover',
                backgroundPosition: theme.bgImagePosition ?? 'center',
                backgroundRepeat:   'no-repeat',
                opacity:            theme.bgImageOpacity ?? 1,
                mixBlendMode:       theme.bgImageBlend as React.CSSProperties['mixBlendMode'],
                filter:             theme.bgImageFilter,
                maskImage:          theme.bgImageMask,
                WebkitMaskImage:    theme.bgImageMask,
                zIndex:             1,
              }}
            />
          )}
          {theme?.bgOverlay && (
            <div className="fixed inset-0 pointer-events-none" style={{ background: theme.bgOverlay, zIndex: 2 }} />
          )}
          {theme?.bgVignette && (
            <div className="fixed inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 55%, #000000 100%)', zIndex: 3 }} />
          )}
        </>
      )}

      <main
        className={`relative min-h-screen ${hasCustomBg ? 'bg-transparent' : 'bg-black'} ${isDark ? 'text-black' : 'text-white'}`}
        style={hasCustomBg ? { zIndex: 4 } : undefined}
      >
        {/* Top stripe (BENSI pop-art) */}
        {stripe && (
          <div className="h-2 flex">
            {stripe.map(c => <div key={c} className="flex-1" style={{ backgroundColor: c }} />)}
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 py-10">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
            <h1 className={titleClass}>
              <div
                className={logoRingClass}
                style={isDark ? undefined : { borderColor: cfg.color, boxShadow: `0 0 20px rgba(${cfg.colorRgb},0.4)` }}
              >
                <img src={cfg.logo} className="h-full w-full object-cover" alt={cfg.ticker} />
              </div>
              {cfg.name}
            </h1>
            <p className={supplyLabelClass}>
              <span>
                Total Supply:{' '}
                <span className={supplyValueClass} style={{ color: theme?.supplyValueWhite ? '#ffffff' : cfg.color }}>
                  {cfg.supply.toLocaleString('en-US')} ${cfg.ticker}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: dotColor }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: dotColor }} />
                </span>
                <span className={dotLabelClass}>Live Network</span>
              </span>
            </p>
            </div>
            {theme?.communityTools && theme.communityTools.length > 0 && (
              <nav className="hidden sm:flex flex-row items-start gap-2 pt-1 flex-shrink-0">
                {theme.communityTools.map(tool => (
                  <a
                    key={tool.id}
                    href={`#${tool.id}`}
                    className="text-xs font-semibold px-4 py-1.5 rounded-full border transition-all hover:scale-105 whitespace-nowrap"
                    style={{ borderColor: `rgba(${cfg.colorRgb},0.5)`, color: cfg.color, backgroundColor: 'rgba(0,0,0,0.4)' }}
                  >
                    {tool.label}
                  </a>
                ))}
              </nav>
            )}
          </div>

          {/* Market Metrics */}
          <MarketTicker
            initial={initialMarket}
            dexApiUrl={cfg.urls.dexApi}
            color={cfg.color}
            supply={cfg.supply}
            holders={holders}
            variant={cv}
            accentColor={theme?.accentColor}
          />

          {/* Row 1: Moat activity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <StatCard icon="🏛️" label="Staked"  value={staked}  pct={p(staked)}  delta={deltas.staked as number | null}  provenance="🏰" {...cardProps} />
            <StatCard icon="🔐" label="Locked"  value={locked}  pct={p(locked)}  delta={deltas.locked as number | null}  provenance="🏰" {...cardProps} />
            <StatCard icon="🔥" label="Burned"  value={burned}  pct={p(burned)}  delta={deltas.burned as number | null}  provenance="🏰" floorAtZero {...cardProps} />
          </div>

          {/* Row 2: Supply breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <StatCard icon="🔥" label="Total Burned"  value={totalBurned} pct={p(totalBurned)} delta={deltas.dead as number | null}        provenance="💀" floorAtZero {...cardProps} />
            <StatCard icon="⚖️" label="LP Pair"       value={lp}          pct={p(lp)}          delta={deltas.lp as number | null}          {...cardProps} />
            <StatCard icon="💎" label="Circulating"   value={circulating} pct={p(circulating)} delta={deltas.circulating as number | null} iconSrc={cfg.logo} {...cardProps} />
          </div>

          <SupplyBar
            staked={staked}
            locked={locked}
            burned={totalBurned}
            lp={lp}
            circulating={circulating}
            moatBurned={burned}
            supply={cfg.supply}
            color={cfg.color}
            colorRgb={cfg.colorRgb}
            variant={cv}
            badgeColor={theme?.badgeColor}
          />

          {/* Action buttons */}
          {actionButtons}

          {/* System Legend */}
          <div className={legendClass}>
            <p className={legendTitleClass}>System Legend</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { icon: '🏛️', title: 'Staked',       desc: `$${cfg.ticker} actively staked in The Moat.` },
                { icon: '🔐', title: 'Locked',        desc: `$${cfg.ticker} time-locked in The Moat.` },
                { icon: '🔥', title: 'Burned',        desc: `$${cfg.ticker} burned via The Moat contract.` },
                { icon: '🔥', title: 'Total Burned',  desc: `All $${cfg.ticker} removed from circulation.` },
                { icon: '⚖️', title: 'LP Pair',       desc: `$${cfg.ticker} liquidity locked in DEX pair.` },
                { icon: null, title: 'Circulating',   desc: `Total supply minus all secured supply.` },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-2">
                  {icon
                    ? <span className="text-base leading-none mt-0.5 flex-shrink-0">{icon}</span>
                    : <div className={legendIconBorderClass}>
                        <Image src={cfg.logo} width={128} height={128} className="h-full w-full object-cover" alt={cfg.ticker} />
                      </div>
                  }
                  <p className={legendItemTextClass}>
                    <span className={legendItemTitleClass}>{title}</span> — {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Rewards Ledger + NFT Boost — split row */}
          {cfg.rewards && cfg.rewards.length > 0 && (
            <div className="flex flex-row gap-4 mt-4">

              {/* Rewards Ledger — 2/3 width */}
              <div className={`${legendClass} mt-0 w-2/3`}>
                <p className={legendTitleClass}>Rewards Ledger</p>
                <div className="divide-y divide-zinc-800">
                  {cfg.rewards.map((row) => (
                    <div
                      key={row.label}
                      className="grid items-center gap-x-3 py-2.5 first:pt-0 last:pb-0"
                      style={{ gridTemplateColumns: '1fr 8rem 1fr' }}
                    >
                      <span className={`text-sm min-w-0 truncate ${cv === 'light' ? 'text-black font-bold' : 'text-zinc-300'}`}>
                        {row.label}
                      </span>
                      <span
                        className="text-sm font-bold tabular-nums text-right whitespace-nowrap"
                        style={{ color: '#F59E0B' }}
                      >
                        {row.amount}
                      </span>
                      <span className={`text-xs text-right min-w-0 ${cv === 'light' ? 'text-gray-500' : 'text-zinc-500'}`}>
                        {row.period}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* NFT Boost — 1/3 width */}
              <div className={`${legendClass} mt-0 w-1/3`}>
                <p className={legendTitleClass}>NFT Boost</p>
                <div className="divide-y divide-zinc-800">
                  <div
                    className="grid items-center gap-x-3 py-2.5 first:pt-0 last:pb-0"
                    style={{ gridTemplateColumns: '1fr 8rem' }}
                  >
                    <span className={`text-sm min-w-0 truncate ${cv === 'light' ? 'text-black font-bold' : 'text-zinc-300'}`}>
                      Lil-B 1/1 Auction
                    </span>
                    <span
                      className="text-sm font-bold tabular-nums text-right whitespace-nowrap"
                      style={{ color: '#F59E0B' }}
                    >
                      2%
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Community Tool sections */}
          {theme?.communityTools?.some(t => t.id === 'calculator') && (
            <div id="calculator" className="mt-8">
              <MoatOptimizer />
            </div>
          )}
          {theme?.communityTools?.some(t => t.id === 'rewards-checker') && (
            <div
              id="rewards-checker"
              className="bg-zinc-900/50 backdrop-blur-xl border rounded-2xl p-6 mt-4 min-h-[140px] flex flex-col gap-3"
              style={{ borderColor: `rgba(${cfg.colorRgb},0.45)` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>Reward Checker</p>
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-700 text-sm">Coming soon</span>
              </div>
            </div>
          )}
          {theme?.communityTools?.some(t => t.id === 'moat-explorer') && (
            <div
              id="moat-explorer"
              className="bg-zinc-900/50 backdrop-blur-xl border rounded-2xl p-6 mt-4 min-h-[140px] flex flex-col gap-3"
              style={{ borderColor: `rgba(${cfg.colorRgb},0.45)` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>Moat Explorer</p>
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-700 text-sm">Coming soon</span>
              </div>
            </div>
          )}

          <p className={timestampClass}>
            Last live check: {updatedAt}
          </p>
        </div>

        {/* Ecosystem footer */}
        <footer className={footerClass}>
          <p className={footerTitleClass}>The Moat Ecosystem</p>
          <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-2">
            {ecosystem.map((t) => (
              <a
                key={t.id}
                href={t.hubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={footerLinkClass}
              >
                <div className={footerImgBorderClass}>
                  <img src={t.logo} className="h-full w-full object-cover" alt={t.ticker} />
                </div>
                ${t.ticker} Hub
              </a>
            ))}
          </div>
        </footer>

        {/* Bottom stripe (BENSI pop-art) */}
        {stripe && (
          <div className="h-2 flex">
            {[...stripe].reverse().map(c => <div key={c} className="flex-1" style={{ backgroundColor: c }} />)}
          </div>
        )}
      </main>
    </>
  )
}
