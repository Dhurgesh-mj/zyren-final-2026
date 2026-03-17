'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type CodeEditorProps = {
  code: string;
  language: string;
  onChange: (value: string) => void;
  onRun?: () => void;
};

export default function CodeEditor({ code, language, onChange, onRun }: CodeEditorProps) {
  const editorRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;
    
    // Add keyboard shortcuts
    editor.addAction({
      id: 'run-code',
      label: 'Run Code',
      keybindings: [
        // Ctrl/Cmd + Enter
        2048 | 3, // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.Enter
      ],
      run: () => onRun?.(),
    });

    // Focus editor
    editor.focus();
  }, [onRun]);

  const monacoLanguage = language === 'javascript' ? 'javascript' : 'python';

  if (!mounted) {
    return (
      <div className="w-full h-full bg-surface-900 rounded-xl flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="monaco-container w-full h-full">
      <MonacoEditor
        height="100%"
        language={monacoLanguage}
        value={code}
        onChange={(value) => onChange(value || '')}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          lineHeight: 24,
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          bracketPairColorization: { enabled: true },
          renderLineHighlight: 'all',
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
        }}
      />
    </div>
  );
}
