import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');

// Parse .env file
const envContent = readFileSync(join(rootDir, '.env'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) continue;
  const key = line.slice(0, eqIdx).trim();
  const val = line.slice(eqIdx + 1).trim();
  if (key) env[key] = val;
}

const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseFrontmatter(fileContent) {
  const sep = '---';
  const first = fileContent.indexOf(sep);
  const second = fileContent.indexOf(sep, first + sep.length);
  if (first === -1 || second === -1) throw new Error('No frontmatter');

  const yamlStr = fileContent.slice(first + sep.length, second).trim();
  const body = fileContent.slice(second + sep.length).trim();

  const fm = { hosts: [], tags: [], published: true, order: 999 };

  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();
    const val = rawVal.replace(/^["']|["']$/g, '');

    switch (key) {
      case 'title':   fm.title = val; break;
      case 'date':    fm.date = val; break;
      case 'show':    fm.show = val; break;
      case 'summary': fm.summary = val; break;
      case 'published': fm.published = rawVal !== 'false'; break;
      case 'order':   fm.order = parseInt(rawVal) || 999; break;
      case 'hosts':   fm.hosts = []; break;
      case 'tags': {
        const m = rawVal.match(/\[([^\]]*)\]/);
        fm.tags = m && m[1] ? m[1].split(',').map(t => t.trim()).filter(Boolean) : [];
        break;
      }
    }
  }

  return { fm, body };
}

const postsDir = join(rootDir, 'src/content/posts');
const files = readdirSync(postsDir).filter(f => f.endsWith('.md')).sort();

console.log(`\n📂 포스트 ${files.length}개 마이그레이션 시작\n`);

let ok = 0, fail = 0;

for (const filename of files) {
  const slug = basename(filename, '.md');
  const content = readFileSync(join(postsDir, filename), 'utf-8');

  try {
    const { fm, body } = parseFrontmatter(content);

    const { error } = await supabase.from('posts').upsert(
      {
        title:         fm.title,
        content:       body,
        slug:          slug,
        is_premium:    false,
        show:          fm.show,
        hosts:         fm.hosts,
        summary:       fm.summary,
        tags:          fm.tags,
        date:          fm.date,
        display_order: fm.order,
        published:     fm.published,
      },
      { onConflict: 'slug' }
    );

    if (error) {
      console.error(`❌  ${slug}\n    ${error.message}`);
      fail++;
    } else {
      console.log(`✅  ${slug}`);
      ok++;
    }
  } catch (err) {
    console.error(`❌  ${slug}\n    parse error: ${err.message}`);
    fail++;
  }
}

console.log(`\n완료: ${ok}개 성공, ${fail}개 실패\n`);
