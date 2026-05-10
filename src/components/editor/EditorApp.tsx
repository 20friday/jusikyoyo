import React, { useState, useEffect, useCallback, useRef } from 'react';

import { MarkdownEditor } from './MarkdownEditor';
import { PostPreview } from './PostPreview';

interface PostMeta {
  title: string;
  date: string;
  show: string;
  hosts: string;
  summary: string;
  tags: string;
  published: boolean;
}

type View = 'list' | 'edit';

interface FileEntry {
  name: string;
  slug: string;
  path: string;
  sha?: string;
  meta?: PostMeta;
  body?: string;
}

const GITHUB_TOKEN_KEY = 'gh_token';
const GITHUB_REPO_KEY = 'gh_repo';

// ===== GitHub API helpers =====
async function ghFetch(url: string, token: string, opts: RequestInit = {}) {
  const r = await fetch(`https://api.github.com${url}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${await r.text()}`);
  return r.json();
}

function parseFrontmatter(raw: string): { meta: PostMeta; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: emptyMeta(), body: raw };
  const fm = match[1];
  const body = match[2].trimStart();
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const getArr = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*\\[(.*)\\]$`, 'm'));
    return m ? m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
  };
  return {
    meta: {
      title: get('title'),
      date: get('date'),
      show: get('show'),
      hosts: getArr('hosts').join(', '),
      summary: get('summary'),
      tags: getArr('tags').join(', '),
      published: fm.includes('published: true'),
    },
    body,
  };
}

function buildFrontmatter(meta: PostMeta, body: string): string {
  const hosts = meta.hosts.split(',').map(s => s.trim()).filter(Boolean);
  const tags = meta.tags.split(',').map(s => s.trim()).filter(Boolean);
  return `---\ntitle: ${meta.title}\ndate: "${meta.date}"\nshow: ${meta.show}\nhosts: [${hosts.join(', ')}]\nsummary: ${meta.summary}\ntags: [${tags.join(', ')}]\npublished: ${meta.published}\n---\n\n${body}`;
}

function emptyMeta(): PostMeta {
  const today = new Date().toISOString().slice(0, 10);
  return { title: '', date: today, show: '', hosts: '', summary: '', tags: '', published: false };
}

// ===== Main App =====
function EditorApp() {
  const [token, setToken] = useState(() => localStorage.getItem(GITHUB_TOKEN_KEY) || '');
  const [repo, setRepo] = useState(() => localStorage.getItem(GITHUB_REPO_KEY) || '');
  const [view, setView] = useState<View>('list');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [current, setCurrent] = useState<FileEntry | null>(null);
  const [meta, setMeta] = useState<PostMeta>(emptyMeta());
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const isConfigured = token && repo;

  // Separate local state for the config form (so typing doesn't prematurely trigger transitions)
  const [formRepo, setFormRepo] = useState(repo);
  const [formToken, setFormToken] = useState('');
  const [configError, setConfigError] = useState('');

  const loadFiles = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setStatus('불러오는 중...');
    try {
      const data = await ghFetch(`/repos/${repo}/contents/src/content/posts`, token);
      const entries: FileEntry[] = await Promise.all(
        data
          .filter((f: any) => f.name.endsWith('.md'))
          .map(async (f: any) => {
            const raw = atob(
              (await ghFetch(`/repos/${repo}/contents/${f.path}`, token)).content.replace(/\n/g, '')
            );
            const { meta, body } = parseFrontmatter(raw);
            return {
              name: f.name,
              slug: f.name.replace(/\.md$/, ''),
              path: f.path,
              sha: f.sha,
              meta,
              body,
            };
          })
      );
      entries.sort((a, b) => (b.meta?.date || '').localeCompare(a.meta?.date || ''));
      setFiles(entries);
      setStatus('');
    } catch (e: any) {
      setStatus(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [token, repo, isConfigured]);

  useEffect(() => {
    if (isConfigured && view === 'list') loadFiles();
  }, [isConfigured, view, token, repo]); // re-run when credentials change

  function openNew() {
    setCurrent(null);
    setMeta(emptyMeta());
    setBody('');
    setStatus('');
    setView('edit');
  }

  function openFile(f: FileEntry) {
    setCurrent(f);
    setMeta(f.meta || emptyMeta());
    setBody(f.body || '');
    setStatus('');
    setView('edit');
  }

  async function save(publish: boolean) {
    if (!isConfigured) return;
    const finalMeta = { ...meta, published: publish };
    const content = buildFrontmatter(finalMeta, body);
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const slug = current?.slug || `${meta.date}-${meta.show.replace(/\s+/g, '')}`;
    const path = `src/content/posts/${slug}.md`;
    const payload: any = {
      message: publish ? `글 발행: ${meta.title}` : `글 저장: ${meta.title}`,
      content: encoded,
    };
    if (current?.sha) payload.sha = current.sha;
    setStatus('저장 중...');
    try {
      await ghFetch(`/repos/${repo}/contents/${path}`, token, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatus(publish ? '발행 완료! Vercel이 자동 빌드해요.' : '저장 완료!');
      setView('list');
    } catch (e: any) {
      setStatus(`저장 오류: ${e.message}`);
    }
  }

  async function deleteFile(f: FileEntry) {
    if (!confirm(`"${f.meta?.title || f.name}"을 삭제할까요?`)) return;
    if (!isConfigured || !f.sha) return;
    setStatus('삭제 중...');
    try {
      await ghFetch(`/repos/${repo}/contents/${f.path}`, token, {
        method: 'DELETE',
        body: JSON.stringify({ message: `글 삭제: ${f.name}`, sha: f.sha }),
      });
      setStatus('삭제 완료');
      loadFiles();
    } catch (e: any) {
      setStatus(`삭제 오류: ${e.message}`);
    }
  }

  // ===== CONFIG SCREEN =====
  if (!isConfigured) {
    function connect() {
      if (!formRepo.trim() || !formToken.trim()) {
        setConfigError('저장소와 토큰을 모두 입력해주세요.');
        return;
      }
      setConfigError('');
      setRepo(formRepo.trim());
      setToken(formToken.trim());
      localStorage.setItem(GITHUB_REPO_KEY, formRepo.trim());
      localStorage.setItem(GITHUB_TOKEN_KEY, formToken.trim());
    }
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>GitHub 연결</h2>
        <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.6 }}>
          에디터는 GitHub API를 통해 마크다운 파일을 직접 저장해요.<br />
          저장 → Vercel이 자동 감지 → 사이트 자동 빌드·배포
        </p>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>GitHub 저장소 (owner/repo)</span>
          <input
            className="meta-input" style={{ width: '100%' }}
            placeholder="20friday/jusikyoyo"
            value={formRepo}
            onChange={e => setFormRepo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>GitHub Personal Access Token</span>
          <input
            className="meta-input" style={{ width: '100%' }} type="password"
            placeholder="ghp_..."
            value={formToken}
            onChange={e => setFormToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
          />
        </label>
        {configError && (
          <p style={{ fontSize: 13, color: 'var(--up)', marginBottom: 12, fontWeight: 600 }}>{configError}</p>
        )}
        <button
          className="btn-pill primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={connect}
        >
          연결하기
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.6 }}>
          토큰은 브라우저에만 저장되고 서버에 전송되지 않아요.<br />
          GitHub → Settings → Developer Settings → Personal Access Tokens에서 발급하세요.
        </p>
      </div>
    );
  }

  // ===== LIST VIEW =====
  if (view === 'list') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800 }}>글 관리</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{repo}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-pill ghost" onClick={() => { setToken(''); setRepo(''); }}>재설정</button>
            <button className="btn-pill ghost" onClick={loadFiles}>새로고침</button>
            <button className="btn-pill primary" onClick={openNew}>+ 새 글</button>
          </div>
        </div>

        {status && <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>{status}</p>}
        {loading && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>불러오는 중...</p>}

        <div className="ed-list">
          {files.map(f => (
            <div key={f.slug} className="ed-list-item" onClick={() => openFile(f)}>
              <div>
                <div className="ed-list-title">{f.meta?.title || f.name}</div>
                <div className="ed-list-meta">
                  {f.meta?.show} · {f.meta?.date} · {f.meta?.published ? '발행됨' : '임시저장'}
                </div>
              </div>
              <div className="ed-list-actions" onClick={e => e.stopPropagation()}>
                <button className="btn-pill ghost" style={{ fontSize: 12 }} onClick={() => openFile(f)}>편집</button>
                <button
                  className="btn-pill ghost"
                  style={{ fontSize: 12, color: '#f04452' }}
                  onClick={() => deleteFile(f)}
                >삭제</button>
              </div>
            </div>
          ))}
          {!loading && files.length === 0 && (
            <p style={{ fontSize: 14, color: 'var(--text-3)', textAlign: 'center', padding: '40px 0' }}>
              글이 없어요. 새 글을 작성해보세요.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ===== EDIT VIEW =====
  const fullContent = buildFrontmatter(meta, body);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn-pill ghost" onClick={() => setView('list')}>← 목록</button>
        <input
          className="meta-input" style={{ flex: 1, fontWeight: 700, fontSize: 15 }}
          placeholder="제목 입력..."
          value={meta.title}
          onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
        />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{status}</span>
        <button className="btn-pill ghost" onClick={() => save(false)}>임시저장</button>
        <button className="btn-pill primary" onClick={() => save(true)}>발행</button>
      </div>

      {/* Meta bar */}
      <div className="meta-bar">
        <div className="meta-row">
          <span className="meta-label">날짜</span>
          <input className="meta-input" style={{ maxWidth: 130 }} value={meta.date}
            onChange={e => setMeta(m => ({ ...m, date: e.target.value }))} placeholder="2026-05-08" />
          <span className="meta-label">방송</span>
          <input className="meta-input" style={{ maxWidth: 160 }} value={meta.show}
            onChange={e => setMeta(m => ({ ...m, show: e.target.value }))} placeholder="삼프로TV" />
          <span className="meta-label">진행자</span>
          <input className="meta-input" value={meta.hosts}
            onChange={e => setMeta(m => ({ ...m, hosts: e.target.value }))} placeholder="여도훈, 박명석" />
        </div>
        <div className="meta-row">
          <span className="meta-label">요약</span>
          <input className="meta-input" style={{ flex: 1 }} value={meta.summary}
            onChange={e => setMeta(m => ({ ...m, summary: e.target.value }))} placeholder="한 줄 요약..." />
          <span className="meta-label">태그</span>
          <input className="meta-input" style={{ maxWidth: 200 }} value={meta.tags}
            onChange={e => setMeta(m => ({ ...m, tags: e.target.value }))} placeholder="반도체, 테슬라" />
        </div>
      </div>

      {/* Editor + Preview */}
      <div className="editor-shell" style={{ flex: 1 }}>
        <div className="editor-pane">
          <div className="editor-toolbar">
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>블록 삽입</span>
            <span className="toolbar-sep" />
            {[
              ['## 제목2', '## '],
              ['### 제목3', '### '],
              ['인용', '> '],
              ['목록', '- '],
            ].map(([label, prefix]) => (
              <button key={label} className="toolbar-btn"
                onClick={() => setBody(b => b + '\n' + prefix)}>
                {label}
              </button>
            ))}
            <span className="toolbar-sep" />
            {[
              ['지수', '::index{name="나스닥" change="-0.5%" dir="down"}'],
              ['종목', '::stock{name="삼성전자" change="-1.2%" dir="down"}'],
              ['박스↑', ':::callout{type="up"}\n내용\n:::'],
              ['박스↓', ':::callout{type="down"}\n내용\n:::'],
              ['박스ℹ', ':::callout{type="info"}\n내용\n:::'],
            ].map(([label, snippet]) => (
              <button key={label} className="toolbar-btn"
                onClick={() => setBody(b => b + '\n\n' + snippet + '\n')}>
                {label}
              </button>
            ))}
          </div>
          <MarkdownEditor value={body} onChange={setBody} />
        </div>
        <div className="preview-pane">
          <PostPreview meta={meta} body={body} />
        </div>
      </div>
    </div>
  );
}

export default EditorApp;
