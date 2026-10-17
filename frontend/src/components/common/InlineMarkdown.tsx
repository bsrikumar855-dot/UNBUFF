import React from "react";

/**
 * Minimal, safe markdown for LLM text: paragraphs, "- " bullets, **bold** and `code`.
 * Everything is rendered as React text nodes (no dangerouslySetInnerHTML), so it can't inject HTML.
 */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded bg-surface-100 px-1 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

export const InlineMarkdown: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i} className="mb-2 list-disc pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.trim().slice(2))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mb-2 whitespace-pre-line">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
};
