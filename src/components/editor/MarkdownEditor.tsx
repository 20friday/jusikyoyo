import React, { useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px' },
  '.cm-scroller': { fontFamily: "'Pretendard Variable', monospace", overflow: 'auto', lineHeight: '1.7' },
  '.cm-content': { padding: '16px', caretColor: '#3182f6' },
  '.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0 4px' },
});

export function MarkdownEditor({ value, onChange }: Props) {
  const handleChange = useCallback((val: string) => onChange(val), [onChange]);

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={[markdown(), theme, EditorView.lineWrapping]}
        style={{ flex: 1, height: '100%', overflow: 'auto' }}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
        }}
      />
    </div>
  );
}
