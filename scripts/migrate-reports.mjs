import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const SUPABASE_URL = 'https://uosnaiuxtqmswkhtosud.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY 환경변수가 필요해요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function parseMd(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`프론트매터 없음: ${filePath}`);
  return yaml.load(match[1]);
}

async function migrateReports() {
  const dir = 'src/content/reports';
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  console.log(`\n📅 오늘의 PICK ${files.length}개 마이그레이션 시작...`);

  for (const file of files) {
    const data = parseMd(join(dir, file));
    const row = {
      date: data.date,
      headline: data.headline ?? null,
      shows: data.shows ?? [],
      stocks: data.stocks ?? [],
      comparisons: data.comparisons ?? [],
      sectors: data.sectors ?? [],
      insight: data.insight ?? null,
      published: true,
    };

    const { error } = await supabase
      .from('daily_reports')
      .upsert(row, { onConflict: 'date' });

    if (error) console.error(`  ❌ ${file}: ${error.message}`);
    else console.log(`  ✅ ${file}`);
  }
}

async function migrateWeekly() {
  const dir = 'src/content/weekly_reports';
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  console.log(`\n📊 주간 픽 ${files.length}개 마이그레이션 시작...`);

  for (const file of files) {
    const data = parseMd(join(dir, file));
    const row = {
      date: data.date,
      period: data.period ?? null,
      headline: data.headline ?? null,
      insight: data.insight ?? [],
      sectors: data.sectors ?? [],
      stocks: data.stocks ?? [],
      splits: data.splits ?? [],
      gaps: data.gaps ?? [],
      watchlist: data.watchlist ?? [],
      checkpoints: data.checkpoints ?? [],
      published: true,
    };

    const { error } = await supabase
      .from('weekly_reports')
      .upsert(row, { onConflict: 'date' });

    if (error) console.error(`  ❌ ${file}: ${error.message}`);
    else console.log(`  ✅ ${file}`);
  }
}

await migrateReports();
await migrateWeekly();
console.log('\n🎉 마이그레이션 완료!');
