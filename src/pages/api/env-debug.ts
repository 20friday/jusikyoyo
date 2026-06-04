import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const env = process.env;
  return new Response(JSON.stringify({
    hasAnthropicEnv: !!env['ANTHROPIC_API_KEY'],
    hasAnthropicMeta: !!import.meta.env.ANTHROPIC_API_KEY,
    prefix: (env['ANTHROPIC_API_KEY'] ?? '').slice(0, 8),
    allKeys: Object.keys(env).filter(k => k.includes('ANTHRO') || k.includes('KIWOOM') || k.includes('SUPABASE')),
  }), { headers: { 'Content-Type': 'application/json' } });
};
