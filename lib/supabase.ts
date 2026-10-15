import { createClient, SupabaseClient } from '@supabase/supabase-js';
let cached: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Nastavi NEXT_PUBLIC_SUPABASE_URL in NEXT_PUBLIC_SUPABASE_ANON_KEY v .env.local.');
  cached = createClient(url, key, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return cached;
}
