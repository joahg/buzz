import * as React from "react";
import { Check, Copy } from "lucide-react";

import { copyCodeBlockToClipboard } from "@/shared/lib/codeBlockClipboard";
import {
  CODE_BLOCK_CLASS,
  SyntaxHighlightedCode,
} from "@/shared/ui/markdown/CodeBlock";

const DIFF_LANGUAGES = new Set(["diff", "patch"]);

/**
 * Line class for unified-diff content: added lines get a green tint, removed
 * lines red, hunk headers fade out. File headers (`+++ a/…`, `--- b/…`) stay
 * plain so they don't read as giant additions/removals.
 */
export function diffLineClass(line: string): string | undefined {
  if (/^(\+\+\+|---)(\s|$)/.test(line)) return undefined;
  if (line.startsWith("+")) return "code-line-diff-add";
  if (line.startsWith("-")) return "code-line-diff-remove";
  if (line.startsWith("@@")) return "text-muted-foreground";
  return undefined;
}

function CodeLines({
  code,
  classify,
}: {
  code: string;
  classify?: (line: string) => string | undefined;
}) {
  return (
    <code className={CODE_BLOCK_CLASS}>
      {code.split("\n").map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and never reordered
        <span key={i} data-line="" className={classify?.(line)}>
          {line}
        </span>
      ))}
    </code>
  );
}

/**
 * Fenced code block for developer-mode transcripts: square corners, shiki
 * syntax highlighting when the fence carries a language tag, dedicated +/−
 * line coloring for ```diff / ```patch fences (independent of shiki, so it
 * works on any diff length), and a hover copy button.
 */
export function DevCodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const resetTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const handleCopy = React.useCallback(async () => {
    try {
      await copyCodeBlockToClipboard(code);
      setCopied(true);
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy code block", error);
    }
  }, [code]);

  return (
    <div className="group/devcode relative my-1" data-block-code="">
      <pre className="max-h-96 overflow-x-auto overflow-y-auto rounded-none border border-border/50 bg-muted/40 py-1 pl-2 pr-8">
        {DIFF_LANGUAGES.has(language) ? (
          <CodeLines classify={diffLineClass} code={code} />
        ) : language ? (
          <SyntaxHighlightedCode code={code} language={language} />
        ) : (
          <CodeLines code={code} />
        )}
      </pre>
      <button
        aria-label="Copy code block"
        className="absolute right-1 top-1 cursor-pointer p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/devcode:opacity-100"
        onClick={handleCopy}
        title="Copy code"
        type="button"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span className="sr-only">Copy code block</span>
      </button>
    </div>
  );
}
