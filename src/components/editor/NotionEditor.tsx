import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';

// ── Custom block nodes ──────────────────────────────────────────────

const IndexBlock = Node.create({
  name: 'indexBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      name: { default: '코스피' },
      change: { default: '0%' },
      dir: { default: 'flat' },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="index-block"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'index-block' }, HTMLAttributes)];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span');
      dom.className = `notion-block-index ${node.attrs.dir}`;
      dom.innerHTML = `<span>${node.attrs.name}</span><span>${node.attrs.change}</span>`;
      const del = document.createElement('button');
      del.textContent = '×'; del.className = 'nb-del';
      del.onclick = () => {
        if (typeof getPos === 'function')
          editor.chain().focus().deleteRange({ from: getPos(), to: getPos() + node.nodeSize }).run();
      };
      dom.appendChild(del);
      return { dom };
    };
  },
});

const StockBlock = Node.create({
  name: 'stockBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      name: { default: '삼성전자' },
      change: { default: '0%' },
      dir: { default: 'flat' },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="stock-block"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'stock-block' }, HTMLAttributes)];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = `notion-block-stock ${node.attrs.dir}`;
      dom.innerHTML = `<span class="nbs-name">${node.attrs.name}</span><span class="nbs-change">${node.attrs.change}</span>`;
      const del = document.createElement('button');
      del.textContent = '×'; del.className = 'nb-del';
      del.onclick = () => {
        if (typeof getPos === 'function')
          editor.chain().focus().deleteRange({ from: getPos(), to: getPos() + node.nodeSize }).run();
      };
      dom.appendChild(del);
      return { dom };
    };
  },
});

const CalloutBlock = Node.create({
  name: 'calloutBlock',
  group: 'block',
  content: 'inline*',
  addAttributes() { return { type: { default: 'info' } }; },
  parseHTML() { return [{ tag: 'div[data-type="callout-block"]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'callout-block', class: `notion-block-callout ${node.attrs.type}` }, HTMLAttributes), 0];
  },
});

// ── Slash command ───────────────────────────────────────────────────

interface SlashItem {
  title: string;
  desc: string;
  icon: string;
  command: (editor: any) => void;
}

const ALL_SLASH_ITEMS: SlashItem[] = [
  { title: '제목 2', desc: '큰 섹션 제목', icon: 'H2', command: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: '제목 3', desc: '중간 섹션 제목', icon: 'H3', command: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: '목록', desc: '글머리 기호 목록', icon: '•', command: e => e.chain().focus().toggleBulletList().run() },
  { title: '번호 목록', desc: '순서 있는 목록', icon: '1.', command: e => e.chain().focus().toggleOrderedList().run() },
  { title: '인용', desc: '인용 블록', icon: '"', command: e => e.chain().focus().toggleBlockquote().run() },
  { title: '구분선', desc: '가로선', icon: '—', command: e => e.chain().focus().setHorizontalRule().run() },
  {
    title: '지수 블록', desc: '코스피·나스닥 등', icon: '📊',
    command: e => {
      const name = prompt('지수명 (예: 코스피)') || '코스피';
      const change = prompt('변동 (예: -0.8%)') || '0%';
      const dir = (prompt('방향: up / down / flat') || 'flat') as string;
      e.chain().focus().insertContent({ type: 'indexBlock', attrs: { name, change, dir } }).run();
    },
  },
  {
    title: '종목 카드', desc: '주식 종목 등락', icon: '📈',
    command: e => {
      const name = prompt('종목명 (예: 삼성전자)') || '삼성전자';
      const change = prompt('변동 (예: -1.2%)') || '0%';
      const dir = (prompt('방향: up / down / flat') || 'flat') as string;
      e.chain().focus().insertContent({ type: 'stockBlock', attrs: { name, change, dir } }).run();
    },
  },
  { title: '박스 ↑ 상승', desc: '빨간 강조 박스', icon: '↑', command: e => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { type: 'up' }, content: [{ type: 'text', text: '내용 입력' }] }).run() },
  { title: '박스 ↓ 하락', desc: '파란 강조 박스', icon: '↓', command: e => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { type: 'down' }, content: [{ type: 'text', text: '내용 입력' }] }).run() },
  { title: '박스 ℹ 정보', desc: '정보 박스', icon: 'ℹ', command: e => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { type: 'info' }, content: [{ type: 'text', text: '내용 입력' }] }).run() },
];

function buildSlashExtension(onSuggest: (items: SlashItem[], rect: DOMRect | null) => void) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        Suggestion({
          editor,
          char: '/',
          allowSpaces: false,
          command: ({ editor: e, range, props }: any) => {
            e.chain().focus().deleteRange(range).run();
            props.command(e);
          },
          items: ({ query }: { query: string }) => {
            return query
              ? ALL_SLASH_ITEMS.filter(i => i.title.includes(query) || i.desc.includes(query))
              : ALL_SLASH_ITEMS;
          },
          render: () => ({
            onStart: (props: any) => { onSuggest(props.items, props.clientRect?.()); },
            onUpdate: (props: any) => { onSuggest(props.items, props.clientRect?.()); },
            onExit: () => { onSuggest([], null); },
            onKeyDown: () => false,
          }),
        }),
      ];
    },
  });
}

// ── Markdown ↔ JSON ─────────────────────────────────────────────────

export function editorToMarkdown(editor: any): string {
  return nodesToMd(editor.getJSON().content || []);
}

function nodesToMd(nodes: any[]): string {
  return nodes.map(n => nodeToMd(n)).filter(s => s !== null).join('\n');
}

function nodeToMd(node: any): string {
  switch (node.type) {
    case 'paragraph': return inlineToText(node.content) || '';
    case 'heading': return '#'.repeat(node.attrs?.level || 2) + ' ' + inlineToText(node.content);
    case 'bulletList': return (node.content || []).map((li: any) => '- ' + nodesToMd(li.content?.[0]?.content || [])).join('\n');
    case 'orderedList': return (node.content || []).map((li: any, i: number) => `${i + 1}. ` + nodesToMd(li.content?.[0]?.content || [])).join('\n');
    case 'blockquote': return nodesToMd(node.content || []).split('\n').map((l: string) => '> ' + l).join('\n');
    case 'horizontalRule': return '---';
    case 'indexBlock': return `::index{name="${node.attrs.name}" change="${node.attrs.change}" dir="${node.attrs.dir}"}`;
    case 'stockBlock': return `::stock{name="${node.attrs.name}" change="${node.attrs.change}" dir="${node.attrs.dir}"}`;
    case 'calloutBlock': return `:::callout{type="${node.attrs.type}"}\n${inlineToText(node.content)}\n:::`;
    default: return inlineToText(node.content) || '';
  }
}

function inlineToText(nodes?: any[]): string {
  if (!nodes) return '';
  return nodes.map((n: any) => {
    if (n.type === 'hardBreak') return '\n';
    if (n.type !== 'text') return '';
    let t = n.text || '';
    for (const m of n.marks || []) {
      if (m.type === 'bold') t = `**${t}**`;
      else if (m.type === 'italic') t = `*${t}*`;
      else if (m.type === 'code') t = `\`${t}\``;
      else if (m.type === 'link') t = `[${t}](${m.attrs?.href})`;
    }
    return t;
  }).join('');
}

function markdownToContent(md: string): any[] {
  const lines = md.split('\n');
  const nodes: any[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const callout = line.match(/^:::callout\{type="(\w+)"\}/);
    if (callout) {
      const parts: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== ':::') { parts.push(lines[i]); i++; }
      nodes.push({ type: 'calloutBlock', attrs: { type: callout[1] }, content: [{ type: 'text', text: parts.join('\n') }] });
      i++; continue;
    }

    const idx = line.match(/^::index\{name="([^"]+)"\s+change="([^"]+)"\s+dir="([^"]+)"\}/);
    if (idx) { nodes.push({ type: 'indexBlock', attrs: { name: idx[1], change: idx[2], dir: idx[3] } }); i++; continue; }

    const stk = line.match(/^::stock\{name="([^"]+)"\s+change="([^"]+)"\s+dir="([^"]+)"\}/);
    if (stk) { nodes.push({ type: 'stockBlock', attrs: { name: stk[1], change: stk[2], dir: stk[3] } }); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) { nodes.push({ type: 'heading', attrs: { level: h[1].length }, content: parseInline(h[2]) }); i++; continue; }

    if (/^-{3,}$/.test(line.trim())) { nodes.push({ type: 'horizontalRule' }); i++; continue; }

    if (line.startsWith('> ')) {
      const parts = [line.slice(2)];
      while (i + 1 < lines.length && lines[i + 1].startsWith('> ')) { i++; parts.push(lines[i].slice(2)); }
      nodes.push({ type: 'blockquote', content: [{ type: 'paragraph', content: parseInline(parts.join('\n')) }] });
      i++; continue;
    }

    if (/^[-*] /.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInline(lines[i].slice(2)) }] });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items }); continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInline(lines[i].replace(/^\d+\.\s/, '')) }] });
        i++;
      }
      nodes.push({ type: 'orderedList', content: items }); continue;
    }

    // Table rows — keep as-is in a paragraph
    if (line.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
      rows.forEach(r => nodes.push({ type: 'paragraph', content: parseInline(r) }));
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    nodes.push({ type: 'paragraph', content: parseInline(line) });
    i++;
  }
  return nodes.length ? nodes : [{ type: 'paragraph' }];
}

function parseInline(text: string): any[] {
  if (!text) return [];
  const result: any[] = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1]) result.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] });
    else if (m[3]) result.push({ type: 'text', text: m[4], marks: [{ type: 'italic' }] });
    else if (m[5]) result.push({ type: 'text', text: m[6], marks: [{ type: 'code' }] });
    else if (m[7]) result.push({ type: 'text', text: m[8], marks: [{ type: 'link', attrs: { href: m[9] } }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push({ type: 'text', text: text.slice(last) });
  return result.length ? result : [{ type: 'text', text }];
}

// ── Component ───────────────────────────────────────────────────────

interface Props { value: string; onChange: (md: string) => void; }

export function NotionEditor({ value, onChange }: Props) {
  const [slashItems, setSlashItems] = useState<SlashItem[]>([]);
  const [slashRect, setSlashRect] = useState<DOMRect | null>(null);
  const [slashSel, setSlashSel] = useState(0);
  const prevValue = useRef(value);

  const SlashExt = useRef(
    buildSlashExtension((items, rect) => {
      setSlashItems(items);
      setSlashRect(rect);
      setSlashSel(0);
    })
  ).current;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '글을 작성하세요.  /  를 입력하면 블록을 추가할 수 있어요.' }),
      IndexBlock,
      StockBlock,
      CalloutBlock,
      SlashExt,
    ],
    content: { type: 'doc', content: markdownToContent(value) },
    onUpdate({ editor: e }) { onChange(editorToMarkdown(e)); },
    editorProps: { attributes: { class: 'notion-editor-content' } },
  });

  // sync when file changes
  useEffect(() => {
    if (!editor || value === prevValue.current) return;
    prevValue.current = value;
    editor.commands.setContent({ type: 'doc', content: markdownToContent(value) }, false);
  }, [value, editor]);

  // keyboard nav for slash menu
  useEffect(() => {
    if (!slashItems.length) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSel(s => (s + 1) % slashItems.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSel(s => (s - 1 + slashItems.length) % slashItems.length); }
      else if (e.key === 'Enter' && editor) {
        e.preventDefault();
        const item = slashItems[slashSel];
        if (item) item.command(editor);
        setSlashItems([]);
      } else if (e.key === 'Escape') { setSlashItems([]); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [slashItems, slashSel, editor]);

  const showSlash = slashItems.length > 0 && slashRect;

  return (
    <div className="notion-editor-wrap">
      <EditorContent editor={editor} />

      {/* Slash menu */}
      {showSlash && (
        <div
          className="slash-menu"
          style={{ position: 'fixed', top: slashRect.bottom + 4, left: slashRect.left, zIndex: 1000 }}
        >
          {slashItems.map((item, i) => (
            <button
              key={item.title}
              className={`slash-item ${i === slashSel ? 'active' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                if (editor) item.command(editor);
                setSlashItems([]);
              }}
              onMouseEnter={() => setSlashSel(i)}
            >
              <span className="slash-icon">{item.icon}</span>
              <span className="slash-text">
                <span className="slash-title">{item.title}</span>
                <span className="slash-desc">{item.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Inline formatting toolbar (shown on text select) */}
      {editor && (
        <InlineToolbar editor={editor} />
      )}
    </div>
  );
}

// ── Inline toolbar ──────────────────────────────────────────────────

function InlineToolbar({ editor }: { editor: any }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setVisible(false); return; }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) { setVisible(false); return; }
      setPos({ top: rect.top - 48, left: rect.left + rect.width / 2 - 100 });
      setVisible(true);
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  if (!visible) return null;

  return (
    <div className="bubble-menu" style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 999 }}>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} className={editor.isActive('bold') ? 'active' : ''}>B</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} className={editor.isActive('italic') ? 'active' : ''} style={{ fontStyle: 'italic' }}>I</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }} className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}>H2</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); }} className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}>H3</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} className={editor.isActive('bulletList') ? 'active' : ''}>목록</button>
    </div>
  );
}
