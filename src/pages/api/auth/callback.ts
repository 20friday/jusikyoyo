import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');

  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirect('/');
    }
  }

  return redirect('/login?error=auth_failed');
};
