import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/adminGuard';
import { createAdminClient } from '../../../../lib/adminSupabase';

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  if (!locals.session || !isAdmin(locals.user?.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const { role, expires_at } = await request.json();
  const { error } = await createAdminClient()
    .from('profiles')
    .update({ role, expires_at: expires_at || null })
    .eq('user_id', params.uid);

  if (error) return new Response(error.message, { status: 500 });
  return new Response('ok');
};
