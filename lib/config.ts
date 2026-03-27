import { TOKENS, type TokenConfig } from './tokens'

export function getConfig(): TokenConfig {
  const id = (process.env.NEXT_PUBLIC_TOKEN_ID ?? 'LIL').toUpperCase()
  const cfg = TOKENS[id]
  if (!cfg) throw new Error(`Unknown NEXT_PUBLIC_TOKEN_ID: "${id}"`)
  return cfg
}

export function getConfigBySlug(slug: string): TokenConfig | null {
  return Object.values(TOKENS).find(t => t.slug === slug.toLowerCase()) ?? null
}
