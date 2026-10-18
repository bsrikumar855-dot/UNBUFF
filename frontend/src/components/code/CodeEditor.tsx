import React from "react";
import Editor from "@monaco-editor/react";
import type { CodeLanguageId } from "@/types/contract";
import "./monacoSetup";

const MONACO_LANGUAGE: Record<CodeLanguageId, string> = {
  python: "python",
  javascript: "javascript",
  cpp: "cpp",
  java: "java",
};

export interface CodeEditorProps {
  value: string;
  language: CodeLanguageId;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** CSS height of the editor; the workspace gives it "100%" of a sized pane. */
  height?: string;
}

/**
 * Monaco editor (loaded on demand). Keyboard note: Tab inserts indentation inside the editor; press Esc and
 * then Tab to move focus out. The page also offers a plain text editor for anyone who prefers it.
 */
const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  language,
  onChange,
  ariaLabel,
  height = "420px",
}) => (
  <Editor
    height={height}
    language={MONACO_LANGUAGE[language]}
    theme="unbluff"
    value={value}
    onChange={(v) => onChange(v ?? "")}
    loading={<p className="p-4 text-sm text-ink-secondary">Loading editor…</p>}
    options={{
      ariaLabel,
      minimap: { enabled: false },
      fontSize: 14,
      tabSize: 4,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: "on",
      renderLineHighlight: "line",
      padding: { top: 8, bottom: 8 },
      hover: { enabled: "off" },
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
    }}
  />
);

export default CodeEditor;
