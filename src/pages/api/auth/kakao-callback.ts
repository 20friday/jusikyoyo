import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, request, redirect, cookies }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const rawNonce = cookies.get('kakao_nonce')?.value;

  if (!code) return redirect('/login?error=auth_failed');

  if (rawNonce) cookies.delete('kakao_nonce', { path: '/' });

  // 카카오에서 ID 토큰 발급
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: import.meta.env.KAKAO_REST_API_KEY,
      client_secret: import.meta.env.KAKAO_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/kakao-callback`,
      code,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Kakao token fetch failed:', tokenRes.status, errText);
    return redirect('/login?error=token_failed');
  }

  const tokens = await tokenRes.json();
  const idToken: string = tokens.id_token;

  if (!idToken) {
    console.error('No id_token in Kakao response:', JSON.stringify(tokens));
    return redirect('/login?error=no_token');
  }

  const { error } = await locals.supabase.auth.signInWithIdToken({
    provider: 'kakao',
    token: idToken,
    ...(rawNonce ? { nonce: rawNonce } : {}),
  });

  if (error) {
    console.error('Kakao signInWithIdToken error:', error.message);
    return redirect(`/login?error=supabase_${encodeURIComponent(error.message)}`);
  }

  return redirect('/');
};
