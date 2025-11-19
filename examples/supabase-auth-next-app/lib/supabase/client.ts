import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "__NEXT_PUBLIC_SUPABASE_URL__",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "__NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__",
  );
}
