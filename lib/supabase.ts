import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

export interface SnapshotRow {
  id: number
  created_at: string
  token_id: string
  staked: number
  locked: number
  burned: number
  dead: number
  lp: number
}
