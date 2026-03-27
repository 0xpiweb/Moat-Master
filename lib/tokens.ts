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
  }
  theme?: {
    primary: string;
    glow: string;
    chartColors: string[];
    neonClass: string;
  };
  urls: {
    moat: string
    buy: string
    burn: string
    lp: string
    dexApi: string
    dexChart: string
  }
  hubUrl: string
}

export const TOKENS: Record<string, TokenConfig> = {
  LIL: {
    id: 'LIL',
    ticker: 'LIL',
    name: '$LIL Hub',
    supply: 1350000000,
    color: '#A100FF',
    colorRgb: '161,0,255',
    logo: '/logo-lil.png',
    contracts: {
      token:  '0x22683BbaDD01473969F23709879187705a253763',
      moat:   '0x7a4d20261a765bd9ba67d49fbf8189843eec3393',
      lpPair: '0x8acc49857a1259d25eb3ca0aa15b398d0e149ef2',
    },
  },
  SUPER: {
    id: 'SUPER',
    ticker: 'SUPER',
    name: '$SUPER Hub',
    supply: 1000000000, // Replace with actual supply
    color: '#00FFA3', // Example: Greenish
    colorRgb: '0,255,163',
    logo: '/logo-super.png',
    contracts: {
      token:  '0x...', // Your SUPER Token address
      moat:   '0x...', // Your SUPER Moat address
      lpPair: '0x...', 
    },
  },
  FREAK: {
    id: 'FREAK',
    ticker: 'FREAK',
    name: '$FREAK Hub',
    supply: 1000000000, // Replace with actual supply
    color: '#FF0055', // Example: Pink/Red
    colorRgb: '255,0,85',
    logo: '/logo-freak.png',
    contracts: {
      token:  '0x...', // Your FREAK Token address
      moat:   '0x...', // Your FREAK Moat address
      lpPair: '0x...',
    },
  }
};