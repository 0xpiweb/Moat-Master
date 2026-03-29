import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { fetchMoatData, fetchChainData, fetchTokenBalance } from '@/lib/chain'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cfg = getConfig()

  try {
    const [moat, chain, extraLp] = await Promise.all([
      fetchMoatData(cfg.contracts.moat),
      fetchChainData(cfg.contracts.token, cfg.contracts.lpPair),
      Promise.all(
        (cfg.contracts.lpPairsExtra ?? []).map(addr => fetchTokenBalance(cfg.contracts.token, addr))
      ).then(bals => bals.reduce((s, n) => s + n, 0)),
    ])

    const { staked, locked, burned } = moat
    const { dead, lp: primaryLp } = chain
    const lp = primaryLp + extraLp

    const { error } = await supabase.from('moat_snapshots').insert({
      token_id: cfg.id,
      staked:   Math.round(staked),
      locked:   Math.round(locked),
      burned:   Math.round(burned),
      dead:     Math.round(dead),
      lp:       Math.round(lp),
    })

    if (error) throw error

    return NextResponse.json({ saved: true })
  } catch (err) {
    console.error('/api/snapshot error:', err)
    return NextResponse.json({ error: 'Snapshot failed' }, { status: 500 })
  }
}
