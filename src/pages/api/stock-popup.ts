import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, locals }) => {
  const name = url.searchParams.get('name');
  if (!name) {
    return new Response(JSON.stringify({ error: 'name required' }), { status: 400 });
  }

  const supabase = locals.supabase;

  // 최근 30일 daily_reports에서 해당 종목 언급 수집
  const fromDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);

  const { data: reports } = await supabase
    .from('daily_reports')
    .select('date, stocks')
    .eq('published', true)
    .gte('date', fromDate)
    .order('date', { ascending: false })
    .limit(20);

  const mentions: { date: string; show: string; view: string }[] = [];

  for (const report of (reports ?? [])) {
    for (const stock of (report.stocks ?? [])) {
      if (stock.name !== name) continue;
      for (const note of (stock.notes ?? [])) {
        if (note.view) {
          mentions.push({ date: report.date, show: note.show ?? '', view: note.view });
        }
      }
      // notes 없으면 shows만
      if (!stock.notes?.length && stock.shows?.length) {
        mentions.push({ date: report.date, show: stock.shows.join(' · '), view: '' });
      }
    }
  }

  return new Response(JSON.stringify({ name, mentions }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
