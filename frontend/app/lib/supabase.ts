import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Supabase browser client — lazy singleton instance.
 *
 * Used for:
 * - Authentication (sign up, sign in, sign out)
 * - Client-side authenticated requests to the FastAPI backend
 *
 * The JWT issued by Supabase is validated by the backend's
 * security.py using HS256 with the shared JWT_SECRET.
 *
 * During build time, env vars may be placeholders — the client
 * is only created when actually needed at runtime.
 */

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith("http")) {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
      );
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}
