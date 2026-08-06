import assert from "node:assert/strict";
import test from "node:test";

import { DevCodeBlock, diffLineClass } from "./devCodeBlock.tsx";
import {
  DevAlertBlock,
  DevBarBlock,
  DevKvBlock,
  DevTimelineBlock,
} from "./devDataBlocks.tsx";
import { renderDevMarkdown } from "./devMarkdown.tsx";

function elements(nodes, type) {
  return nodes.filter(
    (node) => typeof node === "object" && node !== null && node.type === type,
  );
}

function textOf(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") return textOf(node.props?.children);
  return String(node);
}

test("plainText_staysOnePreWrapParagraph", () => {
  const nodes = renderDevMarkdown("hello\nworld");
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, "p");
  assert.equal(textOf(nodes[0]), "hello\nworld");
});

test("blankLine_splitsParagraphs", () => {
  const nodes = renderDevMarkdown("one\n\ntwo");
  assert.equal(elements(nodes, "p").length, 2);
});

test("fencedCode_rendersCodeBlockWithoutFenceLines", () => {
  const nodes = renderDevMarkdown("before\n```ts\nconst a = 1;\n```\nafter");
  const [block] = elements(nodes, DevCodeBlock);
  assert.ok(block);
  assert.equal(block.props.code, "const a = 1;");
  assert.equal(block.props.language, "ts");
  assert.equal(elements(nodes, "p").length, 2);
});

test("unterminatedFence_capturesRestOfMessage", () => {
  const nodes = renderDevMarkdown("```\nline1\nline2");
  const [block] = elements(nodes, DevCodeBlock);
  assert.equal(block.props.code, "line1\nline2");
  assert.equal(block.props.language, "");
});

test("fenceInfoString_takesFirstWordLowercased", () => {
  const nodes = renderDevMarkdown("```Diff render=fancy\n+a\n```");
  const [block] = elements(nodes, DevCodeBlock);
  assert.equal(block.props.language, "diff");
});

test("diffLineClass_colorsAddsRemovesAndHunks", () => {
  assert.equal(diffLineClass("+added"), "code-line-diff-add");
  assert.equal(diffLineClass("-removed"), "code-line-diff-remove");
  assert.equal(diffLineClass("@@ -1,2 +1,2 @@"), "text-muted-foreground");
  assert.equal(diffLineClass(" context"), undefined);
  assert.equal(diffLineClass("+++ b/file.ts"), undefined);
  assert.equal(diffLineClass("--- a/file.ts"), undefined);
});

test("heading_rendersBoldWithoutHashes", () => {
  const nodes = renderDevMarkdown("## Findings");
  assert.equal(nodes.length, 1);
  assert.equal(textOf(nodes[0]), "Findings");
  assert.ok(nodes[0].props.className.includes("font-bold"));
});

test("bulletList_rendersMarkerAndInlineContent", () => {
  const nodes = renderDevMarkdown("- **Saved rule state** — conforms");
  assert.equal(nodes.length, 1);
  const [marker, body] = nodes[0].props.children;
  assert.equal(textOf(marker), "•");
  assert.equal(textOf(body), "Saved rule state — conforms");
});

test("numberedList_keepsNumbers", () => {
  const nodes = renderDevMarkdown("1. first\n2. second");
  assert.equal(nodes.length, 2);
  assert.equal(textOf(nodes[0].props.children[0]), "1.");
  assert.equal(textOf(nodes[1].props.children[0]), "2.");
});

test("nestedListItem_indents", () => {
  const nodes = renderDevMarkdown("- top\n  - nested");
  assert.equal(nodes[1].props.style.paddingLeft, "2ch");
});

test("blockquote_groupsConsecutiveLines", () => {
  const nodes = renderDevMarkdown("> one\n> two\nplain");
  const [quote] = elements(nodes, "blockquote");
  assert.equal(textOf(quote), "one\ntwo");
  assert.equal(elements(nodes, "p").length, 1);
});

test("horizontalRule_rendersDivider", () => {
  const nodes = renderDevMarkdown("above\n---\nbelow");
  const divider = nodes.find(
    (node) =>
      typeof node === "object" && node.props?.className?.includes("border-t"),
  );
  assert.ok(divider);
});

test("hyphenListItem_isNotAHorizontalRule", () => {
  const nodes = renderDevMarkdown("- item");
  assert.equal(textOf(nodes[0].props.children[0]), "•");
});

function findTable(nodes) {
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    if (node.type === "table") return node;
    const child = node.props?.children;
    const kids = Array.isArray(child) ? child : child ? [child] : [];
    const found = findTable(kids);
    if (found) return found;
  }
  return null;
}

function tableCells(table) {
  const [thead, tbody] = table.props.children;
  const headerRow = thead.props.children;
  const header = headerRow.props.children.map(textOf);
  const bodyRows = tbody.props.children.map((row) =>
    row.props.children.map(textOf),
  );
  return { header, bodyRows };
}

test("gfmTable_rendersHeaderAndBodyCells", () => {
  const nodes = renderDevMarkdown(
    "| Flag | Default |\n|---|---|\n| `a` | false |\n| `b` | true |",
  );
  const table = findTable(nodes);
  assert.ok(table);
  const { header, bodyRows } = tableCells(table);
  assert.deepEqual(header, ["Flag", "Default"]);
  assert.deepEqual(bodyRows, [
    ["a", "false"],
    ["b", "true"],
  ]);
});

test("gfmTable_shortRowPadsMissingCells", () => {
  const nodes = renderDevMarkdown("| a | b |\n|---|---|\n| only |");
  const { bodyRows } = tableCells(findTable(nodes));
  assert.deepEqual(bodyRows, [["only", ""]]);
});

test("gfmTable_alignmentFromDelimiterRow", () => {
  const nodes = renderDevMarkdown(
    "| l | c | r |\n|:--|:-:|--:|\n| 1 | 2 | 3 |",
  );
  const table = findTable(nodes);
  const headerRow = table.props.children[0].props.children;
  const classes = headerRow.props.children.map((th) => th.props.className);
  assert.ok(classes[0].includes("text-left"));
  assert.ok(classes[1].includes("text-center"));
  assert.ok(classes[2].includes("text-right"));
});

test("gfmTable_escapedPipeStaysInCell", () => {
  const nodes = renderDevMarkdown("| a | b |\n|---|---|\n| x \\| y | z |");
  const { bodyRows } = tableCells(findTable(nodes));
  assert.deepEqual(bodyRows, [["x | y", "z"]]);
});

test("pipeLineWithoutDelimiterRow_staysParagraph", () => {
  const nodes = renderDevMarkdown("| not | a table |\nplain text");
  assert.equal(findTable(nodes), null);
  assert.equal(elements(nodes, "p").length, 1);
});

test("delimiterCountMismatch_staysParagraph", () => {
  const nodes = renderDevMarkdown("| a | b | c |\n|---|---|\n| 1 | 2 |");
  assert.equal(findTable(nodes), null);
});

test("tableEndsAtFirstNonRowLine", () => {
  const nodes = renderDevMarkdown("| a |\n|---|\n| 1 |\nafter");
  assert.ok(findTable(nodes));
  assert.equal(elements(nodes, "p").length, 1);
  assert.equal(textOf(elements(nodes, "p")[0]), "after");
});

test("detailsBlock_rendersSummaryAndFoldedBody", () => {
  const nodes = renderDevMarkdown(
    "<details>\n<summary>Full log</summary>\n\nline one\n\nline two\n</details>",
  );
  const [details] = elements(nodes, "details");
  assert.ok(details);
  assert.equal(details.props.open, undefined);
  const [summary, body] = details.props.children;
  assert.equal(summary.type, "summary");
  assert.equal(textOf(summary), "Full log");
  assert.equal(textOf(body), "line one" + "line two");
});

test("detailsOpenAttribute_startsExpanded", () => {
  const nodes = renderDevMarkdown("<details open>\nbody\n</details>");
  const [details] = elements(nodes, "details");
  assert.equal(details.props.open, true);
});

test("detailsInlineSummaryOnOpenLine_isHoisted", () => {
  const nodes = renderDevMarkdown(
    "<details><summary>Gist</summary>\nbody\n</details>",
  );
  const [details] = elements(nodes, "details");
  const [summary] = details.props.children;
  assert.equal(textOf(summary), "Gist");
});

test("detailsWithoutSummary_fallsBackToDefaultLabel", () => {
  const nodes = renderDevMarkdown("<details>\nbody\n</details>");
  const [details] = elements(nodes, "details");
  const [summary] = details.props.children;
  assert.equal(textOf(summary), "Details");
});

test("nestedDetails_staysInsideOuterBody", () => {
  const nodes = renderDevMarkdown(
    "<details>\n<summary>outer</summary>\n<details>\n<summary>inner</summary>\ndeep\n</details>\n</details>\nafter",
  );
  const outer = elements(nodes, "details");
  assert.equal(outer.length, 1);
  const [, body] = outer[0].props.children;
  const inner = elements(body.props.children, "details");
  assert.equal(inner.length, 1);
  assert.equal(textOf(elements(nodes, "p")[0]), "after");
});

test("unterminatedDetails_capturesRestOfMessage", () => {
  const nodes = renderDevMarkdown("<details>\n<summary>s</summary>\nrest");
  const [details] = elements(nodes, "details");
  const [, body] = details.props.children;
  assert.equal(textOf(body), "rest");
});

test("detailsBody_rendersBlockMarkdown", () => {
  const nodes = renderDevMarkdown(
    "<details>\n<summary>code</summary>\n\n```ts\nconst a = 1;\n```\n</details>",
  );
  const [details] = elements(nodes, "details");
  const [, body] = details.props.children;
  const blocks = elements(body.props.children, DevCodeBlock);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].props.code, "const a = 1;");
});

test("listItem_joinsIndentedContinuationLines", () => {
  const nodes = renderDevMarkdown("- first line\n  second line\n- next item");
  assert.equal(nodes.length, 2);
  assert.equal(textOf(nodes[0].props.children[1]), "first line\nsecond line");
  assert.equal(textOf(nodes[1].props.children[1]), "next item");
});

test("listContinuation_stopsAtBlankLineAndUnindentedText", () => {
  const nodes = renderDevMarkdown("- item\n\nparagraph");
  assert.equal(textOf(nodes[0].props.children[1]), "item");
  assert.equal(elements(nodes, "p").length, 1);
});

test("nestedListItem_isNotAContinuation", () => {
  const nodes = renderDevMarkdown("- top\n  - nested");
  assert.equal(nodes.length, 2);
  assert.equal(textOf(nodes[0].props.children[1]), "top");
});

test("indentedFenceAfterListItem_staysACodeBlock", () => {
  const nodes = renderDevMarkdown("- item\n  ```\n  code\n  ```");
  assert.equal(textOf(nodes[0].props.children[1]), "item");
  assert.equal(elements(nodes, DevCodeBlock).length, 1);
});

test("gfmAlert_rendersColoredCalloutWithBody", () => {
  const nodes = renderDevMarkdown("> [!WARNING]\n> Do not deploy");
  const [alert] = elements(nodes, DevAlertBlock);
  assert.ok(alert);
  assert.equal(alert.props.type, "warning");
  assert.equal(textOf(alert.props.children), "Do not deploy");
  assert.equal(elements(nodes, "blockquote").length, 0);
});

test("gfmAlert_markerIsCaseInsensitive", () => {
  const nodes = renderDevMarkdown("> [!note]\n> heads up");
  const [alert] = elements(nodes, DevAlertBlock);
  assert.equal(alert.props.type, "note");
});

test("gfmAlert_withoutBodyStaysBlockquote", () => {
  const nodes = renderDevMarkdown("> [!NOTE]");
  assert.equal(elements(nodes, DevAlertBlock).length, 0);
  assert.equal(elements(nodes, "blockquote").length, 1);
});

test("gfmAlert_withOnlyBlankBodyLinesStaysBlockquote", () => {
  const nodes = renderDevMarkdown("> [!NOTE]\n>\n> ");
  assert.equal(elements(nodes, DevAlertBlock).length, 0);
  assert.equal(elements(nodes, "blockquote").length, 1);
});

test("plainBlockquote_isUnchangedByAlertSupport", () => {
  const nodes = renderDevMarkdown("> just a quote");
  assert.equal(elements(nodes, "blockquote").length, 1);
});

test("taskItem_rendersStatusGlyphInsteadOfBullet", () => {
  const nodes = renderDevMarkdown(
    "- [x] shipped\n- [ ] open\n- [~] running\n- [!] blocked",
  );
  const markers = nodes.map((node) => textOf(node.props.children[0]));
  assert.deepEqual(markers, ["✓", "○", "◐", "⊘"]);
  assert.equal(textOf(nodes[0].props.children[1]), "shipped");
});

test("numberedTaskItem_keepsNumberAndPrependsGlyph", () => {
  const nodes = renderDevMarkdown("1. [x] first step");
  assert.equal(textOf(nodes[0].props.children[0]), "1.");
  assert.ok(textOf(nodes[0].props.children[1]).startsWith("✓ "));
});

test("unknownTaskMarker_staysLiteralText", () => {
  const nodes = renderDevMarkdown("- [?] odd");
  assert.equal(textOf(nodes[0].props.children[0]), "•");
  assert.equal(textOf(nodes[0].props.children[1]), "[?] odd");
});

test("kvFence_rendersFactGrid", () => {
  const nodes = renderDevMarkdown("```kv\nStatus: green\nOwner: joah\n```");
  const [kv] = elements(nodes, DevKvBlock);
  assert.ok(kv);
  assert.deepEqual(kv.props.rows, [
    { key: "Status", value: "green" },
    { key: "Owner", value: "joah" },
  ]);
  assert.equal(elements(nodes, DevCodeBlock).length, 0);
});

test("malformedKvFence_fallsBackToCodeBlock", () => {
  const nodes = renderDevMarkdown("```kv\nnot a pair\n```");
  const [block] = elements(nodes, DevCodeBlock);
  assert.ok(block);
  assert.equal(block.props.code, "not a pair");
  assert.equal(block.props.language, "kv");
});

test("barFence_rendersBarChart_withChartAlias", () => {
  for (const tag of ["bar", "chart"]) {
    const nodes = renderDevMarkdown(
      `\`\`\`${tag}\napi: 120ms\nweb: 80ms\n\`\`\``,
    );
    const [bar] = elements(nodes, DevBarBlock);
    assert.ok(bar, tag);
    assert.equal(bar.props.rows.length, 2);
    assert.equal(bar.props.rows[0].value, 120);
  }
});

test("malformedBarFence_fallsBackToCodeBlock", () => {
  const nodes = renderDevMarkdown("```bar\napi: fast\n```");
  assert.equal(elements(nodes, DevBarBlock).length, 0);
  assert.equal(elements(nodes, DevCodeBlock).length, 1);
});

test("timelineFence_rendersTimeline", () => {
  const nodes = renderDevMarkdown(
    "```timeline\n14:02 | deploy started\n14:07 | canary green\n```",
  );
  const [timeline] = elements(nodes, DevTimelineBlock);
  assert.ok(timeline);
  assert.deepEqual(timeline.props.rows[1], {
    time: "14:07",
    text: "canary green",
  });
});

test("malformedTimelineFence_fallsBackToCodeBlock", () => {
  const nodes = renderDevMarkdown("```timeline\nno pipe\n```");
  assert.equal(elements(nodes, DevTimelineBlock).length, 0);
  assert.equal(elements(nodes, DevCodeBlock).length, 1);
});

function findDeep(node, type) {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findDeep(child, type);
      if (found) return found;
    }
    return null;
  }
  if (node.type === type) return node;
  return findDeep(node.props?.children, type);
}

test("dataBlocksInsideDetails_renderThroughRecursion", () => {
  const nodes = renderDevMarkdown(
    "<details>\n<summary>stats</summary>\n\n```kv\nRuns: 12\n```\n\n</details>",
  );
  const [details] = elements(nodes, "details");
  const kv = findDeep(details, DevKvBlock);
  assert.ok(kv);
  assert.deepEqual(kv.props.rows, [{ key: "Runs", value: "12" }]);
});
