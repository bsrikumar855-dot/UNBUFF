// A deliberately small Monaco build: the core API, plain-editing features and four syntax definitions.
// Hover/markdown widgets (the only users of Monaco's HTML sanitizer) and the TypeScript/JSON/CSS language
// services are left out, so there are no language workers beyond the base editor worker.
import * as monaco from "monaco-editor/editor/editor.api.js";
import "../../../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/comment/browser/comment.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/indentation/browser/indentation.js";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/java/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { loader } from "@monaco-editor/react";

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Use the locally bundled Monaco instead of @monaco-editor/react's default CDN download.
loader.config({ monaco });

// The product's editor theme: the same warm paper and ink as the rest of the interface (contrast of the
// foreground on the background is above 16:1; comment and line-number colours are above 4.5:1).
monaco.editor.defineTheme("unbluff", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6E675A", fontStyle: "italic" },
    { token: "keyword", foreground: "8F1F13" },
    { token: "string", foreground: "1F6B4A" },
    { token: "number", foreground: "7A4E00" },
    { token: "type", foreground: "2B3A67" },
    { token: "delimiter", foreground: "3A362E" },
  ],
  colors: {
    "editor.background": "#FBF9F4",
    "editor.foreground": "#15130F",
    "editorLineNumber.foreground": "#6E675A",
    "editorLineNumber.activeForeground": "#15130F",
    "editor.lineHighlightBackground": "#F4F1EA",
    "editor.selectionBackground": "#F1C9C1",
    "editor.inactiveSelectionBackground": "#ECE8DE",
    "editorCursor.foreground": "#B3291A",
    "editorIndentGuide.background1": "#DDD7C9",
    "editorWidget.background": "#FBF9F4",
    "editorWidget.border": "#B9B19D",
    "scrollbarSlider.background": "#B9B19D66",
  },
});

export { monaco };
