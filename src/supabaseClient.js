import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Synligt fel i konsolen om miljövariabler saknas — appen ska aldrig hårdkoda nycklar.
  console.error(
    'Saknar VITE_SUPABASE_URL eller VITE_SUPABASE_ANON_KEY. Kopiera .env.example till .env och fyll i värdena.'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'focushealth-auth',
  },
})
