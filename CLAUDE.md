# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (uses Turbopack)
npm run build    # Production build
npm run start    # Start production server
```

No lint or test scripts are configured.

## Architecture Overview

This is a **Next.js 16 App Router** project — a multi-token dashboard hub for Moat ecosystem tokens on the Avalanche C-Chain.

### Multi-tenant routing

The app serves multiple tokens under a single codebase via two mechanisms:

1. **`middleware.ts`** — maps Vercel deployment hostnames (e.g. `lil-hub.vercel.app`) to token slugs, then rewrites the root path to `/{slug}`.
2. **`app/[token]/page.tsx`** — dynamic route that receives the slug, resolves a `TokenConfig` via `lib/config.ts` → `lib/tokens.ts`, and renders the full hub page.

Root `/` hardcodes a redirect to `/lil` (the primary token).

### Token registry (`lib/tokens.ts`)

All token configuration lives in `TOKENS: Record<string, TokenConfig>`. Each entry contains:
- Contract addresses (`token`, `moat`, `lpPair`, `lpPairsExtra`)
- External URLs (DEX, buy, burn, LP, DexScreener API)
- Visual theme (`HubTheme`) — controls bg image, card style, colors, overlays, etc.
- Optional `rewards` array for the rewards ledger

**To add a new token:** add an entry to `TOKENS` and map its hostname in `middleware.ts`.

### Data flow

- **On-chain reads** (`lib/chain.ts`): uses `viem` with an Avalanche public client. Reads moat contract (`getTotalAmounts`), ERC-20 balances (dead wallet, LP pair), and holder count from Snowtrace API.
- **Supabase** (`lib/supabase.ts`): stores daily snapshots in `moat_snapshots` table. Schema: `{ id, created_at, token_id, staked, locked, burned, dead, lp }`.
- **Snapshot cron** (`app/api/snapshot/route.ts`): called daily at midnight via `vercel.json` cron. Requires `Authorization: Bearer {CRON_SECRET}` header.
- **Last deposit** (`app/api/last-deposit/route.ts`): fetches the most recent epoch AVAX deposit (≥1 AVAX) to the reward address from Snowtrace, used by `MoatOptimizer`.

### Key components

- **`MoatOptimizer`** — reward share calculator. Uses Moat Points formula: `normalize(sqrt((Stake×1) + (Lock×5) + (Burn×10)))` against 1B total. Yield is then calculated as `(MoatPoints × avgMultiplier) / globalEarningPower`. Fetches last epoch deposit from `/api/last-deposit` for default reward estimate.
- **`RewardChecker`** — wallet-based reward lookup using Supabase snapshots.
- **`CommunityTools`** — rendered conditionally based on `theme.communityTools` in token config; shells out to `MoatOptimizer` and `RewardChecker`.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_TOKEN_ID` | Active token key (e.g. `LIL`) — used server-side only by `getConfig()` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `AVAX_RPC_URL` | Avalanche RPC endpoint (defaults to public) |
| `SNOWTRACE_API_KEY` | Snowtrace API key for on-chain queries |
| `CRON_SECRET` | Bearer token protecting `/api/snapshot` |
