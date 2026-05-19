import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, request, redirect, cookies }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const rawNonce = cookies.get('kakao_nonce')?.value;

  if (!code || !rawNonce) return redirect('/login?error=auth_failed');

  cookies.delete('kakao_nonce', { path: '/' });

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

  if (!tokenRes.ok) return redirect('/login?error=auth_failed');

  const tokens = await tokenRes.json();
  const idToken: string = tokens.id_token;

  if (!idToken) return redirect('/login?error=auth_failed');

  // Supabase에 카카오 ID 토큰으로 로그인
  const { error } = await locals.supabase.auth.signInWithIdToken({
    provider: 'kakao',
    token: idToken,
    nonce: rawNonce,
  });

  if (error) {
    console.error('Kakao login error:', error.message);
    return redirect('/login?error=auth_failed');
  }

  return redirect('/');
};
