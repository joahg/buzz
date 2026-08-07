import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

// Developer-mode transcripts must keep chat content inside their pane: long
// unbroken words wrap, link labels wrap, and nothing pushes the shell wider
// than the window (the shell is a flex item — without min-w-0 its intrinsic
// min-content width lets nowrap content blow the layout out to the right).

const LONG_MESSAGE = `check https://example.com/${"averylongpathsegment-".repeat(12)}end and ${"Supercalifragilistic".repeat(14)} tail`;

// Display-toolkit blocks (kv/bar/timeline fences, checklist glyphs, alerts)
// must be as overflow-safe as plain text. The fixed label/time/value columns
// in bar and timeline blocks give rows a hard min-content width, so this
// content must scroll inside its block on narrow panes — never widen the
// transcript (the 0.6.5 regression: a bar chart in a narrow pane pushed
// every message's wrap boundary past the pane edge).
const TOOLKIT_MESSAGE = [
  "```kv",
  "Endpoint: https://example.com/media/4b34b261b02374e193d3fa9ff62889ac0022b6ab4039181008da056345c9b9af.png",
  `Long: ${"unbrokenvalue".repeat(20)}`,
  "```",
  "",
  "```bar",
  "p50: 42ms",
  `${"averylongbarlabel".repeat(8)}: 1,240ms`,
  "cpu: 87%",
  "```",
  "",
  "```timeline",
  `2026-08-06T09:45:57-05:00 | ${"unbrokenevent".repeat(20)}`,
  "t+5s | short",
  "```",
  "",
  `- [ ] checklist item with a long unbroken word ${"Supercalifragilistic".repeat(14)}`,
  "",
  "> [!WARNING]",
  `> alert body with a long unbroken word ${"Supercalifragilistic".repeat(14)}`,
  "",
  "toolkit-tail",
].join("\n");

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(() => {
    const rootWidth = document.documentElement.clientWidth;
    const shell = document.querySelector<HTMLElement>(
      '[data-testid="dev-mode-shell"]',
    );
    if (!shell) return { missing: true, offenders: [] as string[] };
    const offenders: string[] = [];
    const walk = (el: HTMLElement) => {
      // Ignore sub-pixel rounding; anything a pixel past the window is real.
      if (el.getBoundingClientRect().right > rootWidth + 1) {
        offenders.push(
          `${el.tagName.toLowerCase()}[${el.dataset.testid ?? ""}] right=${Math.round(el.getBoundingClientRect().right)}`,
        );
      }
      // Deliberate horizontal scroll containers (tables, <pre>, data blocks)
      // clip their children; rects inside them may extend past the window
      // without anything actually overflowing visually.
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return;
      for (const child of el.children) walk(child as HTMLElement);
    };
    walk(shell);
    return { missing: false, offenders: offenders.slice(0, 10) };
  });
  expect(overflow.missing).toBe(false);
  expect(overflow.offenders).toEqual([]);
}

async function expectPaneContainsContent(
  page: import("@playwright/test").Page,
  testId: string,
) {
  const viewport = page.getByTestId(testId);
  const widths = await viewport.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
}

test("dev-mode chat content stays inside its pane", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await installMockBridge(page);
  await page.addInitScript(() => {
    localStorage.setItem("buzz.displayStyle", "developer");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const composer = page.getByTestId("dev-mode-composer");
  await composer.waitFor();

  // Open an existing channel: ArrowUp previews the newest channel, Enter opens.
  await composer.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.getByTestId("dev-mode-transcript").waitFor();

  await composer.fill(LONG_MESSAGE);
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("dev-mode-transcript").getByText("tail", { exact: false }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectPaneContainsContent(page, "dev-mode-transcript");

  // Side chat splits the screen; both panes must still contain their content.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.getByTestId("dev-mode-thread-panel").waitFor();

  await expectNoHorizontalOverflow(page);
  await expectPaneContainsContent(page, "dev-mode-transcript");
});

// 700px is the reproducing width for the 0.6.5 regression: with the side
// chat open the transcript pane drops to ~200px, narrower than a bar row's
// fixed columns.
test("display-toolkit blocks stay inside the transcript pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 700 });
  await installMockBridge(page);
  await page.addInitScript(() => {
    localStorage.setItem("buzz.displayStyle", "developer");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const composer = page.getByTestId("dev-mode-composer");
  await composer.waitFor();

  await composer.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.getByTestId("dev-mode-transcript").waitFor();

  await composer.fill(TOOLKIT_MESSAGE);
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("dev-mode-transcript").getByText("toolkit-tail"),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectPaneContainsContent(page, "dev-mode-transcript");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.getByTestId("dev-mode-thread-panel").waitFor();

  await expectNoHorizontalOverflow(page);
  await expectPaneContainsContent(page, "dev-mode-transcript");
});

// Multiple communities mount the 56px community rail beside the shell — a
// case the specs above never hit (the harness seeds one community). The
// sidebar wrapper's w-full used to floor its automatic flex minimum at the
// window width, so the rail pushed the whole shell past the right edge.
test("dev-mode content stays inside the window with the community rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await installMockBridge(page);
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("buzz-communities");
    if (!raw) return;
    const communities = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (communities.length !== 1) return;
    communities.push({
      ...communities[0],
      id: "e2e-second-community",
      name: "Second",
    });
    window.localStorage.setItem(
      "buzz-communities",
      JSON.stringify(communities),
    );
    localStorage.setItem("buzz.displayStyle", "developer");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const composer = page.getByTestId("dev-mode-composer");
  await composer.waitFor();

  await composer.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.getByTestId("dev-mode-transcript").waitFor();

  await composer.fill(LONG_MESSAGE);
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("dev-mode-transcript").getByText("tail", { exact: false }),
  ).toBeVisible();

  await composer.fill(TOOLKIT_MESSAGE);
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("dev-mode-transcript").getByText("toolkit-tail"),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectPaneContainsContent(page, "dev-mode-transcript");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.getByTestId("dev-mode-thread-panel").waitFor();

  await expectNoHorizontalOverflow(page);
  await expectPaneContainsContent(page, "dev-mode-transcript");
});
