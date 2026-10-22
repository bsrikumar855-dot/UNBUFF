import React from "react";

/**
 * Small, safe markdown for LLM text: paragraphs, # headings (shown as bold lines), "-" / "*" bullets, numbered lists,
 * **bold**, *italic*, `code`, and $math$ (shown as code, since the app does not typeset LaTeX).
 * Everything is rendered as React text nodes (no dangerouslySetInnerHTML), so it cannot inject HTML.
 */
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\$[^$\n]+\$|(?<![*\w])\*[^*\s][^*\n]*\*(?![*\w]))/g;
const CODE = "rounded bg-surface-100 px-1 font-mono text-[0.85em]";

function inline(text: string): React.ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className={CODE}>
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2)
      return (
        <code key={i} className={CODE}>
          {part.slice(1, -1).replace(/\\(?=[A-Za-z{])/g, "")}
        </code>
      );
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] } | { kind: "h"; text: string };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      blocks.push({ kind: "p", lines: [] }); // a paragraph break
      continue;
    }
    const h = HEADING.exec(line);
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    const last = blocks[blocks.length - 1];
    if (h) blocks.push({ kind: "h", text: h[1]!.trim() });
    else if (b) {
      if (last?.kind === "ul") last.items.push(b[1]!);
      else blocks.push({ kind: "ul", items: [b[1]!] });
    } else if (n) {
      if (last?.kind === "ol") last.items.push(n[1]!);
      else blocks.push({ kind: "ol", items: [n[1]!] });
    } else if (last?.kind === "p") last.lines.push(line.trim());
    else blocks.push({ kind: "p", lines: [line.trim()] });
  }
  return blocks.filter((x) => x.kind !== "p" || x.lines.length > 0);
}

export const InlineMarkdown: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <div className={className}>
    {parse(text).map((blk, i) => {
      if (blk.kind === "h")
        return (
          <p key={i} className="mb-1 mt-2 font-semibold">
            {inline(blk.text)}
          </p>
        );
      if (blk.kind === "ul" || blk.kind === "ol") {
        const List = blk.kind === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={`mb-2 pl-5 ${blk.kind === "ul" ? "list-disc" : "list-decimal"}`}>
            {blk.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </List>
        );
      }
      if (blk.kind !== "p") return null;
      return (
        <p key={i} className="mb-2 wrap-break-word">
          {blk.lines.map((l, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              {inline(l)}
            </React.Fragment>
          ))}
        </p>
      );
    })}
  </div>
);
