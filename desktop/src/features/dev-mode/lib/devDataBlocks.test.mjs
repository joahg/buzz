import assert from "node:assert/strict";
import test from "node:test";

import {
  barWidths,
  parseBarBlock,
  parseKvBlock,
  parseTimelineBlock,
  taskGlyph,
} from "./devDataBlocks.tsx";

test("parseKvBlock_parsesKeyValueLines", () => {
  const rows = parseKvBlock("Status: green\nOwner: @joah\n\nRuns: 12");
  assert.deepEqual(rows, [
    { key: "Status", value: "green" },
    { key: "Owner", value: "@joah" },
    { key: "Runs", value: "12" },
  ]);
});

test("parseKvBlock_valueMayContainColons", () => {
  const rows = parseKvBlock("URL: https://example.com/a:b");
  assert.deepEqual(rows, [{ key: "URL", value: "https://example.com/a:b" }]);
});

test("parseKvBlock_rejectsNonKvLines", () => {
  assert.equal(parseKvBlock("Status: green\njust prose"), null);
  assert.equal(parseKvBlock("no colon here"), null);
  assert.equal(parseKvBlock(""), null);
});

test("parseKvBlock_rejectsColonWithoutSpace", () => {
  // `key:value` (no space) is more likely code than a fact row.
  assert.equal(parseKvBlock("a:b"), null);
});

test("parseBarBlock_parsesColonAndPipeForms", () => {
  const rows = parseBarBlock("api: 120ms\nweb | 80ms");
  assert.deepEqual(rows, [
    { label: "api", text: "120ms", value: 120 },
    { label: "web", text: "80ms", value: 80 },
  ]);
});

test("parseBarBlock_parsesPercentsDecimalsAndSeparators", () => {
  const rows = parseBarBlock("done: 72.5%\nbig: 1,200\nunder: 1_000");
  assert.deepEqual(
    rows.map((r) => r.value),
    [72.5, 1200, 1000],
  );
  assert.equal(rows[0].text, "72.5%");
});

test("parseBarBlock_rejectsNonNumericValues", () => {
  assert.equal(parseBarBlock("api: fast"), null);
  assert.equal(parseBarBlock("api: 12 and more words"), null);
  assert.equal(parseBarBlock(""), null);
});

test("parseBarBlock_rejectsMalformedNumbers", () => {
  assert.equal(parseBarBlock("a: 1__2"), null);
  assert.equal(parseBarBlock("a: 1,"), null);
  assert.equal(parseBarBlock("a: 1,20"), null);
  assert.equal(parseBarBlock("a: 1.2.3"), null);
  assert.equal(parseBarBlock("a: 1e3"), null);
});

test("barWidths_percentsUseFixedHundredScale", () => {
  const rows = parseBarBlock("half: 50%\nfull: 100%\nover: 200%");
  assert.deepEqual(barWidths(rows), [50, 100, 100]);
});

test("barWidths_nonPercentsScaleToMaxMagnitude", () => {
  const rows = parseBarBlock("api: 120ms\nweb: 60ms\ndip: -30ms");
  assert.deepEqual(barWidths(rows), [100, 50, 25]);
});

test("barWidths_mixedRowsScaleIndependently", () => {
  const rows = parseBarBlock("pct: 50%\nraw: 400");
  assert.deepEqual(barWidths(rows), [50, 100]);
});

test("parseTimelineBlock_splitsOnFirstPipe", () => {
  const rows = parseTimelineBlock(
    "14:02 | deploy started\n14:07 | canary green | promoted",
  );
  assert.deepEqual(rows, [
    { time: "14:02", text: "deploy started" },
    { time: "14:07", text: "canary green | promoted" },
  ]);
});

test("parseTimelineBlock_rejectsLinesWithoutPipeOrEmptySides", () => {
  assert.equal(parseTimelineBlock("no pipe here"), null);
  assert.equal(parseTimelineBlock("| text only"), null);
  assert.equal(parseTimelineBlock("14:02 |"), null);
  assert.equal(parseTimelineBlock(""), null);
});

test("taskGlyph_mapsMarkersAndRejectsUnknown", () => {
  assert.equal(taskGlyph("x").glyph, "✓");
  assert.equal(taskGlyph("X").glyph, "✓");
  assert.equal(taskGlyph(" ").glyph, "○");
  assert.equal(taskGlyph("~").glyph, "◐");
  assert.equal(taskGlyph("!").glyph, "⊘");
  assert.equal(taskGlyph("?"), null);
});
