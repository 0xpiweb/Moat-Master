// Visual theme — all optional, defaults to the standard dark theme
export interface HubTheme {
  // Background layers
  bgBase?: string           // solid base color, e.g. '#FDF6E3' | '#080808'
  bgImage?: string          // texture/photo URL, e.g. '/the-face.jpg'
  bgImageOpacity?: number   // 0-1 (default: 1)
  bgImageBlend?: string     // CSS mix-blend-mode, e.g. 'multiply'
  bgImageFilter?: string    // CSS filter, e.g. 'blur(8px) saturate(0.7)'
  bgOverlay?: string        // solid overlay on top of image, e.g. 'rgba(0,0,0,0.45)'
  bgImagePosition?: string  // CSS background-position (default: 'center')
  bgImageSize?: string      // CSS background-size (default: 'cover')
  bgImageMask?: string      // CSS mask-image for fade effects, e.g. linear-gradient fade-out
  bgImageFade?: string      // gradient prepended to backgroundImage for bottom fade, e.g. linear-gradient(...)
  bgVignette?: boolean      // bottom-to-black gradient

  // Appearance
  dark?: boolean            // true = light background / dark text
  cardVariant?: 'light' | 'frosted'  // undefined → default dark cards
  buttonVariant?: 'pop-art' | 'ghost' // undefined → default filled buttons

  // Accents
  deltaPositiveColor?: string         // positive delta chip color (default '#00FF41')
  stripe?: [string, string, string]   // 3-color top/bottom stripe (e.g. BENSI pop-art)
  accentColor?: string                // market box accent override (default: cfg.color)
  headerWhite?: boolean               // force header sub-text to #fff (for dark bg images)
  supplyValueWhite?: boolean          // force supply value number to #fff (LIL neon bg)
}

export interface TokenConfig {
  id: string
  slug: string        // URL segment: lil | supercycle | hefe | freak
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
    lpPairsExtra?: string[]   // additional LP addresses
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
  theme?: HubTheme
  rewards?: Array<{
    label:  string   // e.g. 'Epoch 27 Rewards'
    amount: string   // e.g. '30.41 $AVAX'
    period: string   // e.g. '3/30 - 4/2'
  }>
}

export const TOKENS: Record<string, TokenConfig> = {
  LIL: {
    id: 'LIL',
    slug: 'lil',
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
    theme: {
      bgBase:        '#000000',
      bgImage:       '/lil-bg.jpg',
      bgOverlay:     'rgba(0,0,0,0.50)',
      bgVignette:    true,
      headerWhite:        true,
      supplyValueWhite:   true,
    },
    rewards: [
      { label: 'Epoch 27 Rewards',   amount: '30.41 $AVAX',    period: '3/30 - 4/12' },
      { label: 'Moat Total Rewards', amount: '61.01 $AVAX',    period: 'Cumulative since 3/16' },
      { label: 'Lifetime Rewards',   amount: '2,036.22 $AVAX', period: 'Total ecosystem value distributed' },
    ],
  },
  SUPER: {
    id: 'SUPER',
    slug: 'supercycle',
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
    theme: {
      bgBase:          '#0a0b0d',
      bgImage:         '/super-remove-bg.png',
      bgImageSize:     '75%',
      bgImagePosition: 'center 40%',
      bgImageFade:     'linear-gradient(to bottom, transparent 60%, #0a0b0d 98%)',
      bgOverlay:       'rgba(0,0,0,0.40)',
    },
  },
  HEFE: {
    id: 'HEFE',
    slug: 'hefe',
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
      buy:      'https://www.phar.gg/trade?inputCurrency=0x0000000000000000000000000000000000000000&outputCurrency=0x18E3605B13F10016901eAC609b9E188CF7c18973',
      burn:     'https://snowtrace.io/token/0x18E3605B13F10016901eAC609b9E188CF7c18973?a=0x000000000000000000000000000000000000dead',
      lp:       'https://pharaoh.exchange/liquidity/v2/0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
      dexChart: 'https://dexscreener.com/avalanche/0xe11e871D312Cc9BaE9Eb24c7bDc2031f8453bf44',
    },
    hubUrl: 'https://hefe-hub.vercel.app',
    theme: {
      bgBase: '#000000',
    },
  },
  BENSI: {
    id: 'BENSI',
    slug: 'bensi',
    ticker: 'BENSI',
    name: '$BENSI Hub',
    supply: 1_000_000_000,
    color: '#E31E24',
    colorRgb: '227,30,36',
    logo: '/logo-bensi.png',
    contracts: {
      token:  '0x00697f5f6dc2ca0a17e6c89bccd1173a61ea24a6',
      moat:   '0x3399d03566bb6db0cb4f1e13047589a1499cebbc',
      lpPair: '0x7984cd0fa3daa31f8b305a0544b6097ba40fd3b8',
    },
    urls: {
      moat:     'https://moats.app/moat/0x3399d03566bb6db0cb4f1e13047589a1499cebbc',
      buy:      'https://www.phar.gg/trade?inputCurrency=0x0000000000000000000000000000000000000000&outputCurrency=0x00697f5f6dc2ca0a17e6c89bccd1173a61ea24a6',
      burn:     'https://snowtrace.io/token/0x00697f5f6dc2ca0a17e6c89bccd1173a61ea24a6?a=0x000000000000000000000000000000000000dead',
      lp:       'https://www.phar.gg/liquidity/0x7984cd0fa3daa31f8b305a0544b6097ba40fd3b8',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0x7984cd0fa3daa31f8b305a0544b6097ba40fd3b8',
      dexChart: 'https://dexscreener.com/avalanche/0x7984cd0fa3daa31f8b305a0544b6097ba40fd3b8',
    },
    hubUrl: 'https://bensi-hub.vercel.app',
    theme: {
      bgBase:          '#FDF6E3',
      bgImage:         '/the-face.jpg',
      bgImageOpacity:  0.15,
      bgImageBlend:    'multiply',
      dark:            true,
      cardVariant:     'light',
      buttonVariant:   'pop-art',
      deltaPositiveColor: '#10B981',
      stripe:          ['#E31E24', '#FFD700', '#0055A4'],
      accentColor:     '#0055A4',
    },
  },
  DISH: {
    id: 'DISH',
    slug: 'dish',
    ticker: 'DISH',
    name: '$DISH Hub',
    supply: 1_000_000_000,
    color: '#FF4500',
    colorRgb: '255,69,0',
    logo: '/dish-logo.png',
    contracts: {
      token:        '0x40146E96EE5297187022D1ca62A3169B5e45B0a4',
      moat:         '0x93d8cc111233f8c5b9a019df7c159b6f9be7b44b',
      lpPair:       '0x09d5B9a66A14081700Af3245C0717eE5b1Be199c',
      lpPairsExtra: ['0x3edc0126e36758419ba7eeb44b2a3a094e7e9bb7'],
    },
    urls: {
      moat:     'https://moats.app/moat/0x93d8cc111233f8c5b9a019df7c159b6f9be7b44b',
      buy:      'https://www.phar.gg/trade?outputCurrency=0x40146E96EE5297187022D1ca62A3169B5e45B0a4',
      burn:     'https://snowtrace.io/token/0x40146E96EE5297187022D1ca62A3169B5e45B0a4?a=0x000000000000000000000000000000000000dead',
      lp:       'https://www.phar.gg/liquidity/0x09d5B9a66A14081700Af3245C0717eE5b1Be199c',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0x09d5b9a66a14081700af3245c0717ee5b1be199c',
      dexChart: 'https://dexscreener.com/avalanche/0x09d5b9a66a14081700af3245c0717ee5b1be199c',
    },
    hubUrl: 'https://dimish-hub.vercel.app',
    theme: {
      bgBase:        '#080808',
      bgImage:       '/dimish.jpg',
      bgImageFilter: 'blur(8px) saturate(0.7)',
      bgOverlay:     'rgba(0,0,0,0.45)',
      bgVignette:    true,
      cardVariant:   'frosted',
      buttonVariant: 'ghost',
      deltaPositiveColor: '#10B981',
    },
  },
  FREAK: {
    id: 'FREAK',
    slug: 'freak',
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
      buy:      'https://pharaoh.exchange/swap?to=0x201d04f88Bc9B3bdAcdf0519a95E117f25062D38',
      burn:     'https://snowtrace.io/token/0x201d04f88Bc9B3bdAcdf0519a95E117f25062D38?a=0x000000000000000000000000000000000000dead',
      lp:       'https://pharaoh.exchange/liquidity/v2/0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
      dexChart: 'https://dexscreener.com/avalanche/0x0e13283315fd3d996b22ef40f54c38f24c7f4ee0',
    },
    hubUrl: 'https://freak-hub.vercel.app',
    theme: {
      bgBase:        '#000000',
      bgImage:       '/lucid-freak.jpg',
      bgOverlay:        'rgba(0,0,0,0.75)',
      bgImagePosition:  'top',
      bgVignette:       true,
      cardVariant:      'frosted',
      buttonVariant:    'ghost',
      headerWhite:      true,
      accentColor:      '#FF8C00',
    },
  },
  BALLN: {
    id: 'BALLN',
    slug: 'balln',
    ticker: 'BALLN',
    name: '$BALLN Hub',
    supply: 100_000,
    color: '#bcff00',
    colorRgb: '188,255,0',
    logo: '/balln-logo.png',
    contracts: {
      token:        '0x4Afc7838167b77530278483c3d8c1fFe698a912E',
      moat:         '0x7e1f28c9622aa68001fe0b200f5e5f93f6b35cc9',
      lpPair:       '0xA8F87e026481cF03DC9a68570584A664186B41C7',
      lpPairsExtra: ['0x4eE8920b3a1073dC8c8Ec2bF8C2397Be62EC6B74'],
    },
    urls: {
      moat:     'https://moats.app/moat/0x7e1f28c9622aa68001fe0b200f5e5f93f6b35cc9',
      buy:      'https://pharaoh.exchange/swap?to=0x4Afc7838167b77530278483c3d8c1fFe698a912E',
      burn:     'https://snowtrace.io/token/0x4Afc7838167b77530278483c3d8c1fFe698a912E?a=0x000000000000000000000000000000000000dead',
      lp:       'https://pharaoh.exchange/liquidity/v2/0xA8F87e026481cF03DC9a68570584A664186B41C7',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0xa8f87e026481cf03dc9a68570584a664186b41c7',
      dexChart: 'https://dexscreener.com/avalanche/0xa8f87e026481cf03dc9a68570584a664186b41c7',
    },
    hubUrl: 'https://balln-hub.vercel.app',
    theme: {
      bgBase:          '#0f172a',
      bgImage:         '/balln-bg.jpg',
      bgImagePosition: 'top center',
      bgImageFade:     'linear-gradient(to bottom, transparent 0%, #0f172a 50%)',
      cardVariant:     'frosted',
      buttonVariant:   'ghost',
      headerWhite:     true,
      accentColor:     '#00d1ff',
    },
  },
  VITRENE: {
    id: 'VITRENE',
    slug: 'vitrene',
    ticker: 'VIT',
    name: '$VIT Hub',
    supply: 1_000_000_000,   // ⚠️ placeholder — confirm actual supply
    color: '#00adb5',
    colorRgb: '0,173,181',
    logo: '/vitrene-logo.png',
    contracts: {
      token:  '0xde34C06de75FB446b5e7b8dd272D014F2A19009D',
      moat:   '0x940b7f7d73a504ec566157eebb0566b81d57e8f8',
      // V3 pool key is 32 bytes — replace with the actual 20-byte pool contract address
      lpPair: '0x0000000000000000000000000000000000000000',
    },
    urls: {
      moat:     'https://moats.app/moat/0x940b7f7d73a504ec566157eebb0566b81d57e8f8',
      buy:      'https://app.uniswap.org/swap?outputCurrency=0xde34C06de75FB446b5e7b8dd272D014F2A19009D&chain=avalanche',
      burn:     'https://snowtrace.io/token/0xde34C06de75FB446b5e7b8dd272D014F2A19009D?a=0x000000000000000000000000000000000000dead',
      lp:       'https://dexscreener.com/avalanche/0x1ed3c7234ed58700cb99dfd5eb1bad4242855ad8995b6dc5d25a9c12821fefbc',
      dexApi:   'https://api.dexscreener.com/latest/dex/pairs/avalanche/0x1ed3c7234ed58700cb99dfd5eb1bad4242855ad8995b6dc5d25a9c12821fefbc',
      dexChart: 'https://dexscreener.com/avalanche/0x1ed3c7234ed58700cb99dfd5eb1bad4242855ad8995b6dc5d25a9c12821fefbc',
    },
    hubUrl: 'https://vitrene-hub.vercel.app',
    theme: {
      bgBase:           '#00adb5',
      cardVariant:      'frosted',
      buttonVariant:    'ghost',
      headerWhite:      true,
      supplyValueWhite: true,
      accentColor:      '#ffffff',
    },
  },
}
