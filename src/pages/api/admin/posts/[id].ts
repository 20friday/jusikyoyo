import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/adminGuard';

export const DELETE: APIRoute = async ({ locals, params }) => {
  if (!locals.session || !isAdmin(locals.user?.email)) {
    return new Response('Forbidden', { status: 403 });
  }
  const { error } = await locals.supabase.from('posts').delete().eq('id', params.id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response('ok');
};
