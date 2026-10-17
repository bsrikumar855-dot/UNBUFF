import React from "react";
import Editor from "@monaco-editor/react";
import "@/components/code/monacoSetup";
import { GRAPHQL_LANGUAGE_ID, registerGraphqlLanguage } from "./graphqlLanguage";

export interface GraphqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  height?: string;
  /** Called once with a function that inserts text at the cursor (used by the schema reference). */
  onReady?: (insert: (text: string) => void) => void;
}

/**
 * The same Monaco build as the code workspace (loaded on demand), with GraphQL highlighting. Tab inserts indentation
 * inside the editor; press Esc and then Tab to move focus out. The page also offers a plain text editor.
 */
const GraphqlEditor: React.FC<GraphqlEditorProps> = ({
  value,
  onChange,
  ariaLabel,
  height = "260px",
  onReady,
}) => (
  <Editor
    height={height}
    language={GRAPHQL_LANGUAGE_ID}
    value={value}
    onChange={(v) => onChange(v ?? "")}
    beforeMount={() => registerGraphqlLanguage()}
    onMount={(editor) => {
      onReady?.((text) => {
        const selection = editor.getSelection();
        if (!selection) return;
        editor.executeEdits("schema-reference", [
          { range: selection, text, forceMoveMarkers: true },
        ]);
        editor.focus();
      });
    }}
    loading={<p className="p-4 text-sm text-ink-secondary">Loading editor…</p>}
    options={{
      ariaLabel,
      minimap: { enabled: false },
      fontSize: 14,
      tabSize: 2,
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

export default GraphqlEditor;
