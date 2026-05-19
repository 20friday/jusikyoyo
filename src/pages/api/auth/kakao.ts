import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, redirect, cookies }) => {
  const origin = new URL(request.url).origin;

  // raw nonce 생성 후 SHA-256 해시 (Supabase signInWithIdToken 규격)
  const rawNonce = crypto.randomUUID();
  const encoded = new TextEncoder().encode(rawNonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  cookies.set('kakao_nonce', rawNonce, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 300,
  });

  const params = new URLSearchParams({
    client_id: import.meta.env.KAKAO_REST_API_KEY,
    redirect_uri: `${origin}/api/auth/kakao/callback`,
    response_type: 'code',
    scope: 'openid profile_nickname profile_image',
    nonce: hashedNonce,
  });

  return redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
};
