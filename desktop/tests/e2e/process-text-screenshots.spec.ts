import { expect, test, type Page } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import { waitForAnimations } from "../helpers/animations";

const SHOTS = "test-results/process-text";
const AGENT_PUBKEY = "ab".repeat(32);
const AGENT_NAME =
  "Brain process status with a deliberately long operation label that should ellipsize cleanly";
const KIND_TYPING_INDICATOR = 20002;

async function waitForMockLiveSubscription(
  page: Page,
  channelName: string,
  kind?: number,
) {
  await expect
    .poll(async () => {
      return page.evaluate(
        ({ ch, k }) =>
          (
            window as Window & {
              __BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?: (input: {
                channelName: string;
                kind?: number;
              }) => boolean;
            }
          ).__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
            channelName: ch,
            kind: k,
          }) ?? false,
        { ch: channelName, k: kind },
      );
    })
    .toBe(true);
}

async function seedMainBotTyping(page: Page) {
  await waitForMockLiveSubscription(page, "general", KIND_TYPING_INDICATOR);
  await page.evaluate((pubkey) => {
    (
      window as Window & {
        __BUZZ_E2E_EMIT_MOCK_TYPING__?: (input: {
          channelName: string;
          pubkey?: string;
        }) => unknown;
      }
    ).__BUZZ_E2E_EMIT_MOCK_TYPING__?.({ channelName: "general", pubkey });
  }, AGENT_PUBKEY);
}

async function seedThreadBotTyping(page: Page) {
  await page.evaluate((pubkey) => {
    (
      window as Window & {
        __BUZZ_E2E_EMIT_MOCK_MESSAGE__?: (input: {
          channelName: string;
          content: string;
          kind?: number;
          pubkey?: string;
          extraTags?: string[][];
        }) => unknown;
      }
    ).__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
      channelName: "general",
      content: "",
      kind: 20002,
      pubkey,
      extraTags: [["e", "mock-general-welcome", "", "reply"]],
    });
  }, AGENT_PUBKEY);
}

test.describe("process text truncation screenshots", () => {
  test.use({ viewport: { width: 960, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await installMockBridge(page, {
      managedAgents: [
        {
          pubkey: AGENT_PUBKEY,
          name: AGENT_NAME,
          status: "running",
          channelNames: ["general"],
        },
      ],
    });
    await page.goto("/");
    await page.getByTestId("channel-general").click();
    await expect(page.getByTestId("chat-title")).toHaveText("general");
  });

  test("main composer process text ellipsizes", async ({ page }) => {
    await seedMainBotTyping(page);
    const trigger = page.getByTestId("bot-activity-composer-trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("Working");

    await expect
      .poll(async () =>
        trigger.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const parent = el.parentElement?.getBoundingClientRect();
          return {
            contained: parent
              ? rect.left >= parent.left && rect.right <= parent.right + 1
              : false,
            width: Math.round(rect.width),
            parentWidth: parent ? Math.round(parent.width) : 0,
          };
        }),
      )
      .toMatchObject({ contained: true });

    await waitForAnimations(page);
    await page.screenshot({
      path: `${SHOTS}/01-main-composer-process-text.png`,
      clip: { x: 245, y: 590, width: 690, height: 105 },
    });
  });

  test("thread composer process text ellipsizes", async ({ page }) => {
    await page.evaluate(() => {
      (
        window as Window & {
          __BUZZ_E2E_EMIT_MOCK_MESSAGE__?: (input: {
            channelName: string;
            content: string;
            parentEventId?: string;
          }) => unknown;
        }
      ).__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        content: "Initial thread reply so the thread panel can open",
        parentEventId: "mock-general-welcome",
      });
    });

    const threadSummary = page.getByTestId("message-thread-summary").first();
    await expect(threadSummary).toBeVisible();
    await threadSummary.click();
    await expect(page.getByTestId("message-thread-panel")).toBeVisible();

    await seedThreadBotTyping(page);
    const panel = page.getByTestId("message-thread-panel");
    const trigger = panel.getByTestId("bot-activity-composer-trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("Working");

    await expect
      .poll(async () =>
        trigger.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const parent = el.parentElement?.getBoundingClientRect();
          return {
            contained: parent
              ? rect.left >= parent.left && rect.right <= parent.right + 1
              : false,
            width: Math.round(rect.width),
            parentWidth: parent ? Math.round(parent.width) : 0,
          };
        }),
      )
      .toMatchObject({ contained: true });

    await waitForAnimations(page);
    await page.screenshot({
      path: `${SHOTS}/02-thread-composer-process-text.png`,
      clip: { x: 525, y: 565, width: 420, height: 135 },
    });
  });
});
