import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/extension-bubble-menu';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import tippy from 'tippy.js';

// ───────────────────────────────────────────────
// Custom nodes: IndexBlock, StockBlock, CalloutBlock
// ───────────────────────────────────────────────

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
      const dom = document.createElement('div');
      dom.className = `notion-block-index ${node.attrs.dir}`;
      dom.setAttribute('data-type', 'index-block');
      dom.innerHTML = `
        <span class="nbi-name">${node.attrs.name}</span>
        <span class="nbi-change">${node.attrs.change}</span>
        <button class="nbi-delete" title="삭제">×</button>
      `;
      dom.querySelector('.nbi-delete')?.addEventListener('click', () => {
        if (typeof getPos === 'function') {
          editor.chain().focus().deleteRange({ from: getPos(), to: getPos() + node.nodeSize }).run();
        }
      });
      return { dom };
    };
  },
  addStorage() { return {}; },
  // Serialize to ::index{...} markdown
  renderText({ node }) {
    return `::index{name="${node.attrs.name}" change="${node.attrs.change}" dir="${node.attrs.dir}"}`;
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
      dom.setAttribute('data-type', 'stock-block');
      dom.innerHTML = `
        <span class="nbs-name">${node.attrs.name}</span>
        <span class="nbs-change">${node.attrs.change}</span>
        <button class="nbs-delete" title="삭제">×</button>
      `;
      dom.querySelector('.nbs-delete')?.addEventListener('click', () => {
        if (typeof getPos === 'function') {
          editor.chain().focus().deleteRange({ from: getPos(), to: getPos() + node.nodeSize }).run();
        }
      });
      return { dom };
    };
  },
  renderText({ node }) {
    return `::stock{name="${node.attrs.name}" change="${node.attrs.change}" dir="${node.attrs.dir}"}`;
  },
});

const CalloutBlock = Node.create({
  name: 'calloutBlock',
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return { type: { default: 'info' } };
  },
  parseHTML() { return [{ tag: 'div[data-type="callout-block"]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'callout-block', class: `notion-block-callout ${node.attrs.type}` }, HTMLAttributes), 0];
  },
  renderText({ node }) {
    return `:::callout{type="${node.attrs.type}"}\n${node.textContent}\n:::`;
  },
});

// ───────────────────────────────────────────────
// Slash command menu
// ───────────────────────────────────────────────

interface SlashItem {
  title: string;
  desc: string;
  icon: string;
  command: (editor: any) => void;
}

function getSlashItems(query: string): SlashItem[] {
  const all: SlashItem[] = [
    {
      title: '제목 2', desc: '큰 섹션 제목', icon: 'H2',
      command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: '제목 3', desc: '중간 섹션 제목', icon: 'H3',
      command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: '목록', desc: '글머리 기호 목록', icon: '•',
      command: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      title: '번호 목록', desc: '순서가 있는 목록', icon: '1.',
      command: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      title: '인용', desc: '인용 블록', icon: '"',
      command: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      title: '구분선', desc: '가로 구분선', icon: '—',
      command: (e) => e.chain().focus().setHorizontalRule().run(),
    },
    {
      title: '지수 블록', desc: '코스피, 나스닥 등 지수 표시', icon: '📊',
      command: (e) => {
        const name = prompt('지수명 (예: 코스피)') || '코스피';
        const change = prompt('변동 (예: -0.8%)') || '0%';
        const dir = prompt('방향 up/down/flat') || 'flat';
        e.chain().focus().insertContent({ type: 'indexBlock', attrs: { name, change, dir } }).run();
      },
    },
    {
      title: '종목 카드', desc: '주식 종목 등락 표시', icon: '📈',
      command: (e) => {
        const name = prompt('종목명 (예: 삼성전자)') || '삼성전자';
        const change = prompt('변동 (예: -1.2%)') || '0%';
        const dir = prompt('방향 up/down/flat') || 'flat';
        e.chain().focus().insertContent({ type: 'stockBlock', attrs: { name, change, dir } }).run();
      },
    },
    {
      title: '박스 (상승)', desc: '파란 강조 박스', icon: '↑',
      command: (e) => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { type: 'up' }, content: [{ type: 'text', text: '내용을 입력하세요' }] }).run(),
    },
    {
      title: '박스 (하락)', desc: '빨간 강조 박스', icon: '↓',
      command: (e) => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { type: 'down' }, content: [{ type: 'text', text: '내용을 입력하세요' }] }).run(),
    },
    {
      title: '박스 (정보)', desc: '파란 정보 박스', icon: 'ℹ',
      command: (e) => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { type: 'info' }, content: [{ type: 'text', text: '내용을 입력하세요' }] }).run(),
    },
  ];
  if (!query) return all;
  return all.filter(i => i.title.includes(query) || i.desc.includes(query));
}

// Slash command React component
const SlashMenu = React.forwardRef<any, { items: SlashItem[]; command: (item: SlashItem) => void }>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => { setSelected(0); }, [items]);

    React.useImperativeHandle(ref, () => ({
      onKeyDown({ event }: { event: KeyboardEvent }) {
        if (event.key === 'ArrowUp') { setSelected(s => (s - 1 + items.length) % items.length); return true; }
        if (event.key === 'ArrowDown') { setSelected(s => (s + 1) % items.length); return true; }
        if (event.key === 'Enter') { if (items[selected]) command(items[selected]); return true; }
        return false;
      },
    }));

    if (!items.length) return null;

    return (
      <div className="slash-menu">
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`slash-item ${i === selected ? 'active' : ''}`}
            onClick={() => command(item)}
            onMouseEnter={() => setSelected(i)}
          >
            <span className="slash-icon">{item.icon}</span>
            <span className="slash-text">
              <span className="slash-title">{item.title}</span>
              <span className="slash-desc">{item.desc}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }
);

function buildSlashExtension() {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            props.command(editor);
          },
          items: ({ query }) => getSlashItems(query),
          render: () => {
            let component: ReactRenderer;
            let popup: any;

            return {
              onStart(props: any) {
                component = new ReactRenderer(SlashMenu, {
                  props,
                  editor: props.editor,
                });
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  theme: 'slash',
                });
              },
              onUpdate(props: any) {
                component.updateProps(props);
                popup[0].setProps({ getReferenceClientRect: props.clientRect });
              },
              onKeyDown(props: any) {
                if (props.event.key === 'Escape') { popup[0].hide(); return true; }
                return (component.ref as any)?.onKeyDown(props) ?? false;
              },
              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        }),
      ];
    },
  });
}

// ───────────────────────────────────────────────
// Markdown serializer — handles custom nodes
// ───────────────────────────────────────────────

function editorToMarkdown(editor: any): string {
  const json = editor.getJSON();
  return nodesToMarkdown(json.content || []);
}

function nodesToMarkdown(nodes: any[]): string {
  return nodes.map(nodeToMarkdown).join('\n');
}

function nodeToMarkdown(node: any): string {
  if (!node) return '';
  switch (node.type) {
    case 'paragraph':
      return inlineToText(node.content) || '';
    case 'heading':
      return '#'.repeat(node.attrs?.level || 2) + ' ' + inlineToText(node.content);
    case 'bulletList':
      return (node.content || []).map((li: any) =>
        '- ' + nodesToMarkdown(li.content?.[0]?.content || [])
      ).join('\n');
    case 'orderedList':
      return (node.content || []).map((li: any, i: number) =>
        `${i + 1}. ` + nodesToMarkdown(li.content?.[0]?.content || [])
      ).join('\n');
    case 'blockquote':
      return nodesToMarkdown(node.content || []).split('\n').map((l: string) => '> ' + l).join('\n');
    case 'horizontalRule':
      return '---';
    case 'codeBlock':
      return '```\n' + inlineToText(node.content) + '\n```';
    case 'indexBlock':
      return `::index{name="${node.attrs.name}" change="${node.attrs.change}" dir="${node.attrs.dir}"}`;
    case 'stockBlock':
      return `::stock{name="${node.attrs.name}" change="${node.attrs.change}" dir="${node.attrs.dir}"}`;
    case 'calloutBlock':
      return `:::callout{type="${node.attrs.type}"}\n${inlineToText(node.content)}\n:::`;
    default:
      return inlineToText(node.content);
  }
}

function inlineToText(nodes?: any[]): string {
  if (!nodes) return '';
  return nodes.map((n: any) => {
    if (n.type === 'text') {
      let t = n.text || '';
      if (n.marks) {
        for (const m of n.marks) {
          if (m.type === 'bold') t = `**${t}**`;
          else if (m.type === 'italic') t = `*${t}*`;
          else if (m.type === 'code') t = `\`${t}\``;
          else if (m.type === 'link') t = `[${t}](${m.attrs?.href})`;
        }
      }
      return t;
    }
    if (n.type === 'hardBreak') return '\n';
    return '';
  }).join('');
}

// ───────────────────────────────────────────────
// Markdown parser → TipTap JSON
// ───────────────────────────────────────────────

function markdownToContent(md: string): any[] {
  const lines = md.split('\n');
  const nodes: any[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // custom callout :::callout{type="up"}
    const calloutMatch = line.match(/^:::callout\{type="(\w+)"\}/);
    if (calloutMatch) {
      const parts: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== ':::') { parts.push(lines[i]); i++; }
      nodes.push({ type: 'calloutBlock', attrs: { type: calloutMatch[1] }, content: [{ type: 'text', text: parts.join('\n') }] });
      i++; continue;
    }

    // ::index{...}
    const idxMatch = line.match(/^::index\{name="([^"]+)"\s+change="([^"]+)"\s+dir="([^"]+)"\}/);
    if (idxMatch) {
      nodes.push({ type: 'indexBlock', attrs: { name: idxMatch[1], change: idxMatch[2], dir: idxMatch[3] } });
      i++; continue;
    }

    // ::stock{...}
    const stockMatch = line.match(/^::stock\{name="([^"]+)"\s+change="([^"]+)"\s+dir="([^"]+)"\}/);
    if (stockMatch) {
      nodes.push({ type: 'stockBlock', attrs: { name: stockMatch[1], change: stockMatch[2], dir: stockMatch[3] } });
      i++; continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      nodes.push({ type: 'heading', attrs: { level: h[1].length }, content: parseInline(h[2]) });
      i++; continue;
    }

    // hr
    if (/^---+$/.test(line.trim())) {
      nodes.push({ type: 'horizontalRule' });
      i++; continue;
    }

    // blockquote
    if (line.startsWith('> ')) {
      const parts = [line.slice(2)];
      while (i + 1 < lines.length && lines[i + 1].startsWith('> ')) { i++; parts.push(lines[i].slice(2)); }
      nodes.push({ type: 'blockquote', content: [{ type: 'paragraph', content: parseInline(parts.join('\n')) }] });
      i++; continue;
    }

    // bullet list
    if (/^[-*] /.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInline(lines[i].slice(2)) }] });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    // ordered list
    if (/^\d+\. /.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInline(lines[i].replace(/^\d+\.\s/, '')) }] });
        i++;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    // table — keep as paragraph for now
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++; }
      nodes.push({ type: 'paragraph', content: [{ type: 'text', text: tableLines.join('\n') }] });
      continue;
    }

    // empty line → skip (paragraph breaks handled implicitly)
    if (line.trim() === '') { i++; continue; }

    // regular paragraph
    nodes.push({ type: 'paragraph', content: parseInline(line) });
    i++;
  }

  return nodes.length ? nodes : [{ type: 'paragraph' }];
}

function parseInline(text: string): any[] {
  if (!text) return [];
  const result: any[] = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1]) result.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] });
    else if (m[3]) result.push({ type: 'text', text: m[4], marks: [{ type: 'italic' }] });
    else if (m[5]) result.push({ type: 'text', text: m[6], marks: [{ type: 'code' }] });
    else if (m[7]) result.push({ type: 'text', text: m[8], marks: [{ type: 'link', attrs: { href: m[9] } }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push({ type: 'text', text: text.slice(last) });
  return result;
}

// ───────────────────────────────────────────────
// Main NotionEditor component
// ───────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (md: string) => void;
}

export function NotionEditor({ value, onChange }: Props) {
  const SlashExt = useRef(buildSlashExtension()).current;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: '글을 작성하세요. "/" 를 입력하면 블록을 추가할 수 있어요.' }),
      IndexBlock,
      StockBlock,
      CalloutBlock,
      SlashExt,
    ],
    content: { type: 'doc', content: markdownToContent(value) },
    onUpdate({ editor }) {
      onChange(editorToMarkdown(editor));
    },
    editorProps: {
      attributes: { class: 'notion-editor-content' },
    },
  });

  // Sync external value changes (e.g. when loading a different file)
  const prevValue = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value !== prevValue.current) {
      prevValue.current = value;
      const content = { type: 'doc', content: markdownToContent(value) };
      editor.commands.setContent(content, false);
    }
  }, [value, editor]);

  return (
    <div className="notion-editor-wrap">
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
          <div className="bubble-menu">
            <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'active' : ''}>B</button>
            <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'active' : ''} style={{ fontStyle: 'italic' }}>I</button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}>H2</button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}>H3</button>
            <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'active' : ''}>• 목록</button>
            <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={editor.isActive('blockquote') ? 'active' : ''}>" 인용</button>
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
