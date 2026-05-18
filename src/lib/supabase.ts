import { createServerClient, createBrowserClient, type CookieMethodsServer } from '@supabase/ssr';

export function createSupabaseServerClient(cookies: CookieMethodsServer) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    { cookies }
  );
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  );
}
