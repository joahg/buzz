import type * as React from "react";

import {
  renderHighlightedContent,
  type ChannelRefOptions,
  type MentionStyle,
} from "@/features/dev-mode/lib/highlightContent";
import { cn } from "@/shared/lib/cn";
import { Markdown } from "@/shared/ui/markdown";
import type { ImetaLookup } from "@/shared/ui/markdown/types";

/**
 * Block-level markdown for developer-mode transcripts, layered over the
 * span-based inline highlighter: fenced code blocks, headings, bullet and
 * numbered lists, blockquotes, and horizontal rules. Everything renders as
 * React nodes — never HTML — and keeps the terminal aesthetic (monospace,
 * square corners). Anything unrecognized stays a pre-wrap paragraph, so
 * plain human chat renders exactly as typed.
 */

const FENCE_RE = /^\s{0,3}```/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const LIST_ITEM_RE = /^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(.+)$/;
const HR_RE = /^ {0,3}([-*_])\s*(?:\1\s*){2,}$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;
/** A standalone `![alt](url)` line — the shape `buildOutgoingMessage` emits
 * for image/video attachments (URLs are paren- and space-free). */
const MEDIA_LINE_RE = /^!\[([^\]]*)\]\((\S+)\)\s*$/;
/** GFM table rows must start and end with a pipe — looser forms stay prose. */
const TABLE_ROW_RE = /^\s{0,3}\|.*\|\s*$/;
const TABLE_DELIM_RE = /^\s{0,3}\|(?:\s*:?-+:?\s*\|)+\s*$/;

type CellAlign = "left" | "center" | "right";

/** Split a `| a | b |` row into trimmed cell strings, honoring `\|` escapes. */
function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let j = 0; j < inner.length; j++) {
    const ch = inner[j];
    if (ch === "\\" && inner[j + 1] === "|") {
      cell += "|";
      j += 1;
    } else if (ch === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function delimiterAlign(cell: string): CellAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

const ALIGN_CLASS: Record<CellAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * One attached image or video in a dev-mode transcript, rendered through the
 * standard `Markdown` component so developer mode inherits the lightbox,
 * context menus, video controls, and relay URL handling.
 */
function DevMediaBlock({
  line,
  imetaByUrl,
}: {
  line: string;
  imetaByUrl: ImetaLookup | undefined;
}) {
  return (
    <div className="my-1 min-w-0 max-w-md" data-block-media="">
      <Markdown content={line} imetaByUrl={imetaByUrl} />
    </div>
  );
}

export function renderDevMarkdown(
  content: string,
  mentions: MentionStyle[] = [],
  channelRefs?: ChannelRefOptions,
  imetaByUrl?: ImetaLookup,
): React.ReactNode[] {
  const inline = (text: string) =>
    renderHighlightedContent(text, mentions, channelRefs);

  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    nodes.push(
      <p key={`p${nodes.length}`} className="whitespace-pre-wrap">
        {inline(paragraph.join("\n"))}
      </p>,
    );
    paragraph = [];
  };

  const flushQuote = () => {
    if (quote.length === 0) return;
    nodes.push(
      <blockquote
        key={`q${nodes.length}`}
        className="whitespace-pre-wrap border-l-2 border-border pl-2 text-muted-foreground"
      >
        {inline(quote.join("\n"))}
      </blockquote>,
    );
    quote = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      flushParagraph();
      flushQuote();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // Closing fence (or end of message on an unterminated fence).
      nodes.push(
        <pre
          key={`c${nodes.length}`}
          className="my-1 overflow-x-auto rounded-none border border-border/50 bg-muted/40 px-2 py-1"
        >
          {code.join("\n")}
        </pre>,
      );
      continue;
    }

    const quoted = QUOTE_RE.exec(line);
    if (quoted) {
      flushParagraph();
      quote.push(quoted[1]);
      i += 1;
      continue;
    }
    flushQuote();

    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      flushParagraph();
      nodes.push(
        <div
          key={`hr${nodes.length}`}
          className="my-1 border-t border-border/40"
        />,
      );
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      nodes.push(
        <div
          key={`h${nodes.length}`}
          className={cn(
            level <= 2 ? "font-bold" : "font-semibold",
            level === 1 && "text-base",
          )}
        >
          {inline(heading[2])}
        </div>,
      );
      i += 1;
      continue;
    }

    const media = MEDIA_LINE_RE.exec(line.trim());
    if (media) {
      flushParagraph();
      nodes.push(
        <DevMediaBlock
          key={`m${nodes.length}`}
          imetaByUrl={imetaByUrl}
          line={line.trim()}
        />,
      );
      i += 1;
      continue;
    }

    if (
      TABLE_ROW_RE.test(line) &&
      i + 1 < lines.length &&
      TABLE_DELIM_RE.test(lines[i + 1])
    ) {
      const header = splitTableRow(line);
      const aligns = splitTableRow(lines[i + 1]).map(delimiterAlign);
      if (header.length === aligns.length) {
        flushParagraph();
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        nodes.push(
          <div key={`t${nodes.length}`} className="my-1 overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  {header.map((cell, c) => (
                    <th
                      // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional and never reordered
                      key={c}
                      className={cn(
                        "border border-border/50 bg-muted/40 px-2 py-0.5 font-semibold",
                        ALIGN_CLASS[aligns[c]],
                      )}
                    >
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and never reordered
                  <tr key={r}>
                    {header.map((_, c) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional and never reordered
                        key={c}
                        className={cn(
                          "border border-border/50 px-2 py-0.5 align-top",
                          ALIGN_CLASS[aligns[c]],
                        )}
                      >
                        {inline(row[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
    }

    const item = LIST_ITEM_RE.exec(line);
    if (item) {
      flushParagraph();
      const [, indent, bullet, number, rest] = item;
      nodes.push(
        <div
          key={`li${nodes.length}`}
          className="flex"
          style={indent ? { paddingLeft: `${indent.length}ch` } : undefined}
        >
          <span className="shrink-0 select-none pr-2 text-muted-foreground">
            {bullet ? "•" : `${number}.`}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap">
            {inline(rest)}
          </span>
        </div>,
      );
      i += 1;
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();
  flushQuote();
  return nodes;
}
