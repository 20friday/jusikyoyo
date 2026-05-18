import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient({
    getAll: () =>
      context.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (cookiesToSet) =>
      cookiesToSet.forEach(({ name, value, options }) =>
        context.cookies.set(name, value, options ?? {})
      ),
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  context.locals.supabase = supabase;
  context.locals.session = session;
  context.locals.user = session?.user ?? null;

  return next();
});
