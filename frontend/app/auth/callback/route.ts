import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /auth/callback
 *
 * Handles the OAuth redirect from Supabase after GitHub sign-in.
 * Exchanges the authorization code for a session, then redirects
 * the user to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth error from provider
  if (error) {
    const message = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(`${origin}/auth/sign-in?error=${message}`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/sign-in?error=${encodeURIComponent("Missing authorization code")}`
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(
      `${origin}/auth/sign-in?error=${encodeURIComponent("Supabase is not configured")}`
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/auth/sign-in?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // Success — redirect to dashboard
  return NextResponse.redirect(`${origin}/dashboard`);
}
