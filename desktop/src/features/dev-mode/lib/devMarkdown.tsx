import type * as React from "react";

import { DevCodeBlock } from "@/features/dev-mode/lib/devCodeBlock";
import {
  ALERT_MARKER_RE,
  DevAlertBlock,
  DevBarBlock,
  DevKvBlock,
  DevTimelineBlock,
  TASK_MARKER_RE,
  parseBarBlock,
  parseKvBlock,
  parseTimelineBlock,
  taskGlyph,
  type AlertType,
} from "@/features/dev-mode/lib/devDataBlocks";
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
 * numbered lists (with read-only status glyphs), blockquotes, GFM alerts,
 * horizontal rules, GFM tables, `<details>` folds, and data-presentation
 * fences (```kv, ```bar, ```timeline — see devDataBlocks). Everything
 * renders as React nodes — never HTML — and keeps the terminal aesthetic
 * (monospace, square corners). Anything unrecognized stays a pre-wrap
 * paragraph, so plain human chat renders exactly as typed.
 */

const FENCE_RE = /^\s{0,3}```/;
const FENCE_INFO_RE = /^\s{0,3}`{3,}\s*([^\s`]*)/;
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
/** `<details>` opener, optionally `open`, optionally with an inline summary. */
const DETAILS_OPEN_RE =
  /^\s{0,3}<details(\s+open)?>\s*(?:<summary>(.*?)<\/summary>\s*)?$/i;
const DETAILS_CLOSE_RE = /^\s{0,3}<\/details>\s*$/i;
const SUMMARY_LINE_RE = /^\s*<summary>(.*?)<\/summary>\s*$/i;
/** An indented, non-blank line that continues the preceding list item. */
const LIST_CONTINUATION_RE = /^[ \t]+\S/;

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
 * A fenced block whose language tag is a data-presentation convention
 * (```kv, ```bar / ```chart, ```timeline). Returns null when the tag is
 * unknown or the content doesn't fully parse, so the caller falls back to a
 * plain code block and malformed input stays readable.
 */
function dataBlockNode(
  language: string,
  code: string,
  inline: (text: string) => React.ReactNode,
  key: string,
): React.ReactNode | null {
  if (language === "kv") {
    const rows = parseKvBlock(code);
    return rows && <DevKvBlock key={key} inline={inline} rows={rows} />;
  }
  if (language === "bar" || language === "chart") {
    const rows = parseBarBlock(code);
    return rows && <DevBarBlock key={key} rows={rows} />;
  }
  if (language === "timeline") {
    const rows = parseTimelineBlock(code);
    return rows && <DevTimelineBlock key={key} inline={inline} rows={rows} />;
  }
  return null;
}

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
    // A GFM alert: `> [!NOTE]` (or TIP/IMPORTANT/WARNING/CAUTION) on the
    // first quoted line turns the blockquote into a colored callout.
    const alertMarker = ALERT_MARKER_RE.exec(quote[0].trim());
    if (alertMarker && quote.slice(1).some((line) => line.trim() !== "")) {
      const type = alertMarker[1].toLowerCase() as AlertType;
      const body = quote.slice(1).join("\n");
      quote = [];
      nodes.push(
        <DevAlertBlock key={`a${nodes.length}`} type={type}>
          {renderDevMarkdown(body, mentions, channelRefs, imetaByUrl)}
        </DevAlertBlock>,
      );
      return;
    }
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
      const language = (FENCE_INFO_RE.exec(line)?.[1] ?? "").toLowerCase();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // Closing fence (or end of message on an unterminated fence).
      const codeText = code.join("\n");
      const dataBlock = dataBlockNode(
        language,
        codeText,
        inline,
        `c${nodes.length}`,
      );
      nodes.push(
        dataBlock ?? (
          <DevCodeBlock
            key={`c${nodes.length}`}
            code={codeText}
            language={language}
          />
        ),
      );
      continue;
    }

    const detailsOpen = DETAILS_OPEN_RE.exec(line);
    if (detailsOpen) {
      flushParagraph();
      flushQuote();
      const startOpen = Boolean(detailsOpen[1]);
      let summary = detailsOpen[2];
      const body: string[] = [];
      let depth = 1;
      i += 1;
      while (i < lines.length) {
        const inner = lines[i];
        if (DETAILS_OPEN_RE.test(inner)) depth += 1;
        else if (DETAILS_CLOSE_RE.test(inner)) {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
        body.push(inner);
        i += 1;
      }
      if (summary === undefined) {
        let j = 0;
        while (j < body.length && body[j].trim() === "") j += 1;
        const hoisted =
          body[j] === undefined ? null : SUMMARY_LINE_RE.exec(body[j]);
        if (hoisted) {
          summary = hoisted[1];
          body.splice(0, j + 1);
        }
      }
      nodes.push(
        <details
          key={`d${nodes.length}`}
          className="my-1"
          open={startOpen || undefined}
        >
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            {summary?.trim() ? inline(summary.trim()) : "Details"}
          </summary>
          <div className="mt-1 border-l border-border/40 pl-2">
            {renderDevMarkdown(
              body.join("\n"),
              mentions,
              channelRefs,
              imetaByUrl,
            )}
          </div>
        </details>,
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
      // `- [x] text` renders a read-only status glyph in place of the
      // bullet (never a checkbox — agent messages must not look editable).
      const task = TASK_MARKER_RE.exec(rest);
      const status = task ? taskGlyph(task[1]) : null;
      const body = [status && task ? task[2] : rest];
      i += 1;
      // Indented follow-up lines continue the item (GFM lazy continuation)
      // unless they start a block of their own — a nested item, fence,
      // quote, rule, or table row.
      while (
        i < lines.length &&
        LIST_CONTINUATION_RE.test(lines[i]) &&
        !LIST_ITEM_RE.test(lines[i]) &&
        !FENCE_RE.test(lines[i]) &&
        !QUOTE_RE.test(lines[i]) &&
        !HR_RE.test(lines[i]) &&
        !TABLE_ROW_RE.test(lines[i]) &&
        !DETAILS_OPEN_RE.test(lines[i])
      ) {
        body.push(lines[i].trim());
        i += 1;
      }
      nodes.push(
        <div
          key={`li${nodes.length}`}
          className="flex"
          style={indent ? { paddingLeft: `${indent.length}ch` } : undefined}
        >
          <span
            className={cn(
              "shrink-0 select-none pr-2",
              status && bullet ? status.className : "text-muted-foreground",
            )}
          >
            {bullet ? (status ? status.glyph : "•") : `${number}.`}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap">
            {status && !bullet ? (
              <span className={cn("select-none", status.className)}>
                {status.glyph}{" "}
              </span>
            ) : null}
            {inline(body.join("\n"))}
          </span>
        </div>,
      );
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();
  flushQuote();
  return nodes;
}
