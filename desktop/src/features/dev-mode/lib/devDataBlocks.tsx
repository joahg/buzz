import * as React from "react";
import {
  Info,
  Lightbulb,
  Megaphone,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/shared/lib/cn";

/**
 * Data-presentation blocks for developer-mode transcripts. Each block is a
 * plain-text convention agents emit in ordinary message content — a fenced
 * block with a reserved language tag, or a GFM alert quote — that this
 * client renders as structured UI. Every convention degrades gracefully in
 * clients that don't know it (fenced blocks show as code, alerts as
 * blockquotes), and every parser is all-or-nothing: content that doesn't
 * fully match falls back to the plain rendering, so malformed input stays
 * readable instead of half-rendering.
 */

/** Renders one cell/value's inline markup (code, links, mentions, …). */
export type InlineRenderer = (text: string) => React.ReactNode;

// --- GFM alerts ------------------------------------------------------------

export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

export const ALERT_MARKER_RE =
  /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

const ALERT_META: Record<
  AlertType,
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    border: string;
    text: string;
  }
> = {
  note: {
    label: "Note",
    Icon: Info,
    border: "border-sky-500/70",
    text: "text-sky-600 dark:text-sky-400",
  },
  tip: {
    label: "Tip",
    Icon: Lightbulb,
    border: "border-emerald-500/70",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  important: {
    label: "Important",
    Icon: Megaphone,
    border: "border-violet-500/70",
    text: "text-violet-600 dark:text-violet-400",
  },
  warning: {
    label: "Warning",
    Icon: TriangleAlert,
    border: "border-amber-500/70",
    text: "text-amber-600 dark:text-amber-400",
  },
  caution: {
    label: "Caution",
    Icon: OctagonAlert,
    border: "border-red-500/70",
    text: "text-red-600 dark:text-red-400",
  },
};

export function DevAlertBlock({
  type,
  children,
}: {
  type: AlertType;
  children: React.ReactNode;
}) {
  const meta = ALERT_META[type];
  return (
    <div
      className={cn("my-1 border-l-2 pl-2", meta.border)}
      data-block-alert={type}
    >
      <div
        className={cn(
          "flex select-none items-center gap-1 font-semibold",
          meta.text,
        )}
      >
        <meta.Icon className="h-3.5 w-3.5 shrink-0" />
        {meta.label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// --- Status checklist glyphs -------------------------------------------------

/** `[x]`/`[ ]`/`[~]`/`[!]` prefix on a list item's text. */
export const TASK_MARKER_RE = /^\[([ xX~!])\]\s+(\S.*)$/;

const TASK_GLYPHS: Record<string, { glyph: string; className: string }> = {
  x: { glyph: "✓", className: "text-emerald-600 dark:text-emerald-400" },
  " ": { glyph: "○", className: "text-muted-foreground" },
  "~": { glyph: "◐", className: "text-amber-600 dark:text-amber-400" },
  "!": { glyph: "⊘", className: "text-red-600 dark:text-red-400" },
};

/**
 * Read-only status glyph for a checklist item. Deliberately plain text, not
 * an `<input type="checkbox">`: agent messages must never look editable.
 */
export function taskGlyph(
  marker: string,
): { glyph: string; className: string } | null {
  return TASK_GLYPHS[marker.toLowerCase()] ?? null;
}

// --- ```kv fact grid ---------------------------------------------------------

export type KvRow = { key: string; value: string };

const KV_LINE_RE = /^([^:\n]+?):[ \t]+(\S.*)$/;

/** Every non-blank line must be `Key: value`; anything else is not a kv block. */
export function parseKvBlock(code: string): KvRow[] | null {
  const rows: KvRow[] = [];
  for (const line of code.split("\n")) {
    if (line.trim() === "") continue;
    const match = KV_LINE_RE.exec(line.trim());
    if (!match) return null;
    rows.push({ key: match[1].trim(), value: match[2].trim() });
  }
  return rows.length > 0 ? rows : null;
}

export function DevKvBlock({
  rows,
  inline,
}: {
  rows: KvRow[];
  inline: InlineRenderer;
}) {
  return (
    // overflow-x-auto zeroes the block's min-content contribution (the same
    // containment tables and <pre> use) so a long key or value can never push
    // the transcript pane wider than its window.
    <div
      className="my-1 grid w-fit max-w-full grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 overflow-x-auto border-l-2 border-border/50 pl-2"
      data-block-kv=""
    >
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and never reordered
        <React.Fragment key={i}>
          <span className="select-none text-muted-foreground">{row.key}</span>
          <span className="min-w-0 whitespace-pre-wrap">
            {inline(row.value)}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// --- ```bar horizontal bar chart ----------------------------------------------

export type BarRow = { label: string; text: string; value: number };

/**
 * `label: value` / `label | value` where value is a number — optional sign,
 * `,`/`_` only as thousands separators, one optional decimal part — followed
 * by an optional unit suffix that cannot start with a digit or separator
 * (so `1.2.3` and `1__2` reject rather than half-parse) or scientific
 * notation (`1e3` rejects rather than charting 1).
 */
const BAR_LINE_RE =
  /^(.+?)(?::[ \t]+|[ \t]*\|[ \t]*)(-?\d+(?:[,_]\d{3})*(?:\.\d+)?)(?![eE]\d)[ \t]*([^\s\d.,_]\S*)?$/;

/**
 * Every non-blank line must be `label: value` or `label | value`, where value
 * is a number with an optional unit suffix (`%`, `ms`, `req/s`, …).
 */
export function parseBarBlock(code: string): BarRow[] | null {
  const rows: BarRow[] = [];
  for (const line of code.split("\n")) {
    if (line.trim() === "") continue;
    const match = BAR_LINE_RE.exec(line.trim());
    if (!match) return null;
    const value = Number.parseFloat(match[2].replace(/[_,]/g, ""));
    if (!Number.isFinite(value)) return null;
    rows.push({
      label: match[1].trim(),
      text: `${match[2]}${match[3] ?? ""}`,
      value,
    });
  }
  return rows.length > 0 ? rows : null;
}

/**
 * Bar width per row as a 0–100 percentage. Percent-suffixed rows are
 * fractions of a fixed 100% scale; everything else scales against the
 * largest non-percent magnitude. Both clamp at full width.
 */
export function barWidths(rows: BarRow[]): number[] {
  const maxOther = Math.max(
    0,
    ...rows
      .filter((row) => !row.text.endsWith("%"))
      .map((row) => Math.abs(row.value)),
  );
  return rows.map((row) => {
    const magnitude = Math.abs(row.value);
    const scale = row.text.endsWith("%") ? 100 : maxOther;
    return scale > 0 ? Math.min((magnitude / scale) * 100, 100) : 0;
  });
}

export function DevBarBlock({ rows }: { rows: BarRow[] }) {
  const widths = barWidths(rows);
  const labelCh = Math.min(
    Math.max(...rows.map((row) => row.label.length)),
    24,
  );
  const textCh = Math.min(Math.max(...rows.map((row) => row.text.length)), 24);
  return (
    // overflow-x-auto: the fixed label/value columns give each row a hard
    // min-content width, which must scroll inside the block rather than push
    // the transcript pane wider than its window.
    <div className="my-1 space-y-0.5 overflow-x-auto" data-block-bar="">
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and never reordered
        <div key={i} className="flex items-center gap-2">
          <span
            className="shrink-0 truncate text-right text-muted-foreground"
            style={{ width: `${labelCh}ch` }}
            title={row.label}
          >
            {row.label}
          </span>
          <div className="h-3.5 min-w-12 max-w-96 flex-1 border border-border/40 bg-muted/20">
            <div
              className="h-full bg-sky-500/60"
              style={{ width: `${widths[i]}%` }}
            />
          </div>
          <span
            className="shrink-0 truncate text-right tabular-nums text-muted-foreground"
            style={{ width: `${textCh}ch` }}
            title={row.text}
          >
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- ```timeline -----------------------------------------------------------

export type TimelineRow = { time: string; text: string };

/** Every non-blank line must be `time | event`. */
export function parseTimelineBlock(code: string): TimelineRow[] | null {
  const rows: TimelineRow[] = [];
  for (const line of code.split("\n")) {
    if (line.trim() === "") continue;
    const pipe = line.indexOf("|");
    if (pipe <= 0) return null;
    const time = line.slice(0, pipe).trim();
    const text = line.slice(pipe + 1).trim();
    if (time === "" || text === "") return null;
    rows.push({ time, text });
  }
  return rows.length > 0 ? rows : null;
}

export function DevTimelineBlock({
  rows,
  inline,
}: {
  rows: TimelineRow[];
  inline: InlineRenderer;
}) {
  const timeCh = Math.min(Math.max(...rows.map((row) => row.time.length)), 24);
  return (
    // overflow-x-auto: the fixed time column gives each row a hard
    // min-content width — scroll it inside the block on narrow panes.
    <div className="my-1 overflow-x-auto" data-block-timeline="">
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and never reordered
        <div key={i} className="relative flex gap-2 pb-0.5 pl-3">
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-0 bottom-0 flex w-3 flex-col items-center",
            )}
          >
            <span
              className={cn(
                "w-px flex-1 bg-border/60",
                i === 0 && "bg-transparent",
              )}
            />
            <span className="my-0.5 h-1.5 w-1.5 shrink-0 bg-muted-foreground/70" />
            <span
              className={cn(
                "w-px flex-[2] bg-border/60",
                i === rows.length - 1 && "bg-transparent",
              )}
            />
          </span>
          <span
            className="shrink-0 tabular-nums text-muted-foreground"
            style={{ width: `${timeCh}ch` }}
          >
            {row.time}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap">
            {inline(row.text)}
          </span>
        </div>
      ))}
    </div>
  );
}
