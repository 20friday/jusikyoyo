import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, request, redirect }) => {
  const origin = new URL(request.url).origin;
  const { data, error } = await locals.supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    return redirect('/login?error=auth_failed');
  }
  return redirect(data.url);
};
