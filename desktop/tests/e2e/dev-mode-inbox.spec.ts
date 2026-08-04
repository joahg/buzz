import { expect, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

// The developer-mode Inbox (⌘⇧I / top-bar "inbox") lists channel families
// the user sent into within the past 24h — agent sessions map to channels,
// not threads — each with its status line and a quick composer.

async function openDevMode(page: import("@playwright/test").Page) {
  await installMockBridge(page);
  await page.addInitScript(() => {
    localStorage.setItem("buzz.displayStyle", "developer");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("dev-mode-composer").waitFor();
}

async function openChannelFromNavigator(
  page: import("@playwright/test").Page,
  channelName: string,
) {
  await page.getByTestId("dev-mode-composer").focus();
  const topBar = page.getByTestId("dev-mode-topbar-channel");
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("ArrowUp");
    const previewed = (await topBar.innerText()).replace(/^#\s*/, "").trim();
    if (previewed === channelName) break;
  }
  await expect(topBar).toContainText(channelName);
  await page.keyboard.press("Enter");
}

test("inbox opens empty, closes on escape, and toggles via shortcut", async ({
  page,
}) => {
  await openDevMode(page);

  await page.getByTestId("dev-mode-inbox-toggle").click();
  const inbox = page.getByTestId("dev-mode-inbox");
  await expect(inbox).toBeVisible();
  await expect(inbox).toContainText("nothing yet");

  await page.keyboard.press("Escape");
  await expect(inbox).not.toBeVisible();

  await page.keyboard.press("Meta+Shift+i");
  await expect(inbox).toBeVisible();
  await page.keyboard.press("Meta+Shift+i");
  await expect(inbox).not.toBeVisible();
});

test("inbox lists a channel after sending into it and opens it from the row", async ({
  page,
}) => {
  await openDevMode(page);

  await page.evaluate((agent) => {
    const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
    if (!emit) throw new Error("mock bridge missing");
    emit({
      channelName: "general",
      content: "seed message from the agent",
      pubkey: agent,
      createdAt: Math.floor(Date.now() / 1000) - 120,
    });
  }, TEST_IDENTITIES.alice.pubkey);

  await openChannelFromNavigator(page, "general");
  const composer = page.getByTestId("dev-mode-composer");
  await composer.focus();
  await composer.fill("checking in on this session");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dev-mode-transcript")).toContainText(
    "checking in on this session",
  );

  await page.getByTestId("dev-mode-inbox-toggle").click();
  const inbox = page.getByTestId("dev-mode-inbox");
  await expect(inbox).toBeVisible();
  const row = page.getByTestId("dev-mode-inbox-row").filter({
    hasText: "# general",
  });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("dev-mode-inbox-input")).toBeVisible();

  await row.getByRole("button", { name: "# general" }).click();
  await expect(inbox).not.toBeVisible();
  await expect(page.getByTestId("dev-mode-topbar-channel")).toContainText(
    "general",
  );
});
