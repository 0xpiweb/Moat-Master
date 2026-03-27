export interface TokenConfig {
  id: string
  ticker: string
  name: string
  supply: number
  color: string
  colorRgb: string
  logo: string
  contracts: {
    token: string
    moat: string
    lpPair: string
    lpPairsExtra?: string[]   // additional LP addresses (HEFE-specific for now)
  }
  urls: {
    moat: string
    buy: string
    burn: string
    lp: string
    dexApi: string
    dexChart: string
  }
  hubUrl: string
  theme?: {
    primary: string
    glow: string
    chartColors: string[]
    neonClass: string
  }
}

export const TOKENS: Record<string, TokenConfig> = {
  LIL: {
    id: 'LIL',
    ticker: 'LIL',
    name: '$LIL Hub',
    supply: 1_350_000_000,
    color: '#A100FF',
    colorRgb: '161,0,255',
    logo: '/logo-lil.png',
    contracts: {
      token:  '0x22683BbaDD01473969F23709879187705a253763',
      moat:   '0x7a4d20261a765bd9ba67d49fbf8189843eec3393',
      lpPair: '0x8acc49857a1259d25eb3ca0aa15b398d0e149ef2',
    },
    urls: {
      moat:     'https://moats.app/moat/0x7a4d20261a765bd9ba67d49fbf8189843eec3393',
      buy:      'https://pharaoh.exchange/swap?outputCurrency=0x22683BbaDD01473969F23709879187705a253763&to=0x22683BbaDD01473969F23709879187705a253763',
      burn:     'https://snowtrace.io/token/0x22683BbaDD01473969F23709879187705a253763?a=0x000000000000000000000000000000000000dead',
      lp:       'https://pharaoh.exchange/liquidity/v2/0x8acc49857a1259d25eb3ca0aa15b398d0e149ef2',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0x8acc49857a1259d25eb3ca0aa15b398d0e149ef2',
      dexChart: 'https://dexscreener.com/avalanche/0x8acc49857a1259d25eb3ca0aa15b398d0e149ef2',
    },
    hubUrl: 'https://lil-hub.vercel.app',
  },
  SUPER: {
    id: 'SUPER',
    ticker: 'SUPERCYCLE',
    name: '$SUPERCYCLE Hub',
    supply: 10_000_000_000,
    color: '#39FF14',
    colorRgb: '57,255,20',
    logo: '/logo-super.png',
    contracts: {
      token:  '0xCA2e0f72653337d05B1ABceBEA5718A4A3E57a0b',
      moat:   '0x464b2817f16f6117602ad05bae446c2fc5ba6fb7',
      lpPair: '0x017c5608a8ab29ab23093726cf7c64e5ef88e191',
    },
    urls: {
      moat:     'https://moats.app/moat/0x464b2817f16f6117602ad05bae446c2fc5ba6fb7',
      buy:      'https://pharaoh.exchange/swap?outputCurrency=0xCA2e0f72653337d05B1ABceBEA5718A4A3E57a0b&to=0xCA2e0f72653337d05B1ABceBEA5718A4A3E57a0b',
      burn:     'https://snowtrace.io/token/0xCA2e0f72653337d05B1ABceBEA5718A4A3E57a0b?a=0x000000000000000000000000000000000000dead',
      lp:       'https://pharaoh.exchange/liquidity/v2/0x017c5608a8ab29ab23093726cf7c64e5ef88e191',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0x017c5608a8ab29ab23093726cf7c64e5ef88e191',
      dexChart: 'https://dexscreener.com/avalanche/0x017c5608a8ab29ab23093726cf7c64e5ef88e191',
    },
    hubUrl: 'https://supercycle-hub.vercel.app',
  },
  HEFE: {
    id: 'HEFE',
    ticker: 'HEFE',
    name: '$HEFE Hub',
    supply: 690_420_000,
    color: '#39FF14',
    colorRgb: '57,255,20',
    logo: '/logo-hefe.png',
    contracts: {
      token:  '0x18E3605B13F10016901eAC609b9E188CF7c18973',
      moat:   '0xcf65744c955a292d11de2a4184e9fabedbfc7b40',
      lpPair: '0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
      lpPairsExtra: ['0x9b214d9c2872B5CD33F548AADb9c5396FA7E8546', '0xC4FA66b4839Af7379a4fCBE5dD048B18fE99A2AC'],
    },
    urls: {
      moat:     'https://moats.app/moat/0xcf65744c955a292d11de2a4184e9fabedbfc7b40',
      buy:      'https://dexscreener.com/avalanche/0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
      burn:     'https://snowtrace.io/token/0x18E3605B13F10016901eAC609b9E188CF7c18973?a=0x000000000000000000000000000000000000dead',
      lp:       'https://pharaoh.exchange/liquidity/v2/0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
      dexChart: 'https://dexscreener.com/avalanche/0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
    },
    hubUrl: 'https://hefe-hub.vercel.app',
  },
  FREAK: {
    id: 'FREAK',
    ticker: 'FREAK',
    name: '$FREAK Hub',
    supply: 1_000_000_000,
    color: '#FF8C00',
    colorRgb: '255,140,0',
    logo: '/logo-freak.png',
    contracts: {
      token:  '0x201d04f88Bc9B3bdAcdf0519a95E117f25062D38',
      moat:   '0x020c73b55d139d5e259bad89b126f2a446c22ac6',
      lpPair: '0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
    },
    urls: {
      moat:     'https://moats.app/moat/0x020c73b55d139d5e259bad89b126f2a446c22ac6',
      buy:      'https://dexscreener.com/avalanche/0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
      burn:     'https://snowtrace.io/token/0x201d04f88Bc9B3bdAcdf0519a95E117f25062D38?a=0x000000000000000000000000000000000000dead',
      lp:       'https://pharaoh.exchange/liquidity/v2/0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
      dexChart: 'https://dexscreener.com/avalanche/0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
    },
    hubUrl: 'https://freak-hub.vercel.app',
  },
}
