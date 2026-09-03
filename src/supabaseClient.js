import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qzpwvtbsiirtzbbbgubw.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_dy9lhlSklqIDXU4qxuOCvA_gmTMBNrv'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
})