import React, { useMemo } from 'react';

interface PostMeta {
  title: string;
  date: string;
  show: string;
  hosts: string;
  summary: string;
  tags: string;
  published: boolean;
}

interface Props {
  meta: PostMeta;
  body: string;
}

// Simple client-side markdown → HTML renderer for preview
function renderMarkdown(md: string): string {
  let html = md
    // Custom blocks first
    .replace(/:::callout\{type="(\w+)"\}\n([\s\S]*?)\n:::/g, (_, type, content) =>
      `<div class="block-callout ${type}">${escHtml(content.trim())}</div>`)
    .replace(/::index\{([^}]*)\}/g, (_, attrs) => {
      const get = (k: string) => { const m = attrs.match(new RegExp(`${k}="([^"]*)"`)); return m ? m[1] : ''; };
      const dir = get('dir'), arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
      return `<span class="block-index ${dir}">${escHtml(get('name'))} ${arrow} ${escHtml(get('change'))}</span>`;
    })
    .replace(/::stock\{([^}]*)\}/g, (_, attrs) => {
      const get = (k: string) => { const m = attrs.match(new RegExp(`${k}="([^"]*)"`)); return m ? m[1] : ''; };
      const dir = get('dir');
      return `<div class="block-stock ${dir}"><span class="block-stock-name">${escHtml(get('name'))}</span><span class="block-stock-change">${escHtml(get('change'))}</span></div>`;
    })
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Bold / italic
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Tables
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (_, header, rows) => {
      const th = header.split('|').filter(Boolean).map(c => `<th>${c.trim()}</th>`).join('');
      const tr = rows.trim().split('\n').map((row: string) =>
        '<tr>' + row.split('|').filter(Boolean).map(c => `<td>${c.trim()}</td>`).join('') + '</tr>'
      ).join('');
      return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
    })
    // Unordered lists
    .replace(/((?:^- .+\n?)+)/gm, (block) => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    })
    // Ordered lists
    .replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    })
    // Paragraphs (lines not already wrapped)
    .replace(/^(?!<[a-z]|::)(.+)$/gm, '<p>$1</p>')
    // HR
    .replace(/^---$/gm, '<hr />');

  return html;
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function PostPreview({ meta, body }: Props) {
  const html = useMemo(() => renderMarkdown(body), [body]);
  const tags = meta.tags.split(',').map(s => s.trim()).filter(Boolean);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="post-detail" style={{ border: 'none', background: 'transparent', padding: '0' }}>
        <div className="detail-meta">
          {meta.show && <span className="detail-show">{meta.show}</span>}
          {meta.show && meta.date && <span className="card-dot" />}
          {meta.date && <span className="detail-date">{meta.date}</span>}
          {meta.hosts && <><span className="card-dot" /><span className="detail-hosts">{meta.hosts}</span></>}
        </div>
        {meta.title && <h1 className="detail-title">{meta.title}</h1>}
        {meta.summary && <p className="detail-summary">{meta.summary}</p>}
        {tags.length > 0 && (
          <div className="detail-tags">
            {tags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        )}
        {meta.title && <hr className="detail-divider" />}
        <div
          className="prose"
          style={{ '--table-border': '1px solid var(--border)' } as React.CSSProperties}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <style>{`
        .prose table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
        .prose th, .prose td { padding: 8px 12px; border: 1px solid var(--border); text-align: left; }
        .prose th { background: var(--bg); font-weight: 700; }
      `}</style>
    </div>
  );
}
