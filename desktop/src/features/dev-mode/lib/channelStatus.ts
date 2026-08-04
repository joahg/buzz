import { DEV_MESSAGE_KINDS } from "@/features/dev-mode/lib/transcriptRoots";
import { generateAgentCompletion } from "@/shared/api/agentCompletion";
import { meshNodeStatus } from "@/shared/api/tauriMesh";
import type { Channel, RelayEvent } from "@/shared/api/types";
import { truncatePubkey } from "@/shared/lib/pubkey";

/**
 * Short LLM-generated status lines for channels: one line beneath each
 * navigator row (and in the Inbox) saying where the conversation stands, so
 * unread channels can be triaged without opening them.
 *
 * Generation mirrors channel naming: a one-shot completion through a managed
 * agent's harness, falling back to the mesh LLM node, falling back to a
 * deterministic snippet of the latest message. Cached per channel in
 * localStorage keyed to the activity timestamp the status describes.
 */

export type ChannelStatusEntry = {
  status: string;
  /** ISO lastMessageAt of the family activity this status describes. */
  activityAt: string;
  generatedAt: number;
  /** True when no LLM was reachable and status is a message snippet. */
  fallback?: boolean;
};

export type ChannelStatusMap = Record<string, ChannelStatusEntry>;

const STORAGE_KEY = "buzz.devMode.channelStatus.v1";
/** Bound the cache so hundreds of dead sessions do not accrete forever. */
const MAX_ENTRIES = 300;

export const channelStatusStore = {
  read(): ChannelStatusMap {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return {};
      const result: ChannelStatusMap = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (
          typeof value === "object" &&
          value !== null &&
          "status" in value &&
          typeof value.status === "string" &&
          "activityAt" in value &&
          typeof value.activityAt === "string" &&
          "generatedAt" in value &&
          typeof value.generatedAt === "number"
        ) {
          result[key] = {
            status: value.status,
            activityAt: value.activityAt,
            generatedAt: value.generatedAt,
            fallback:
              "fallback" in value && value.fallback === true ? true : undefined,
          };
        }
      }
      return result;
    } catch {
      return {};
    }
  },
  write(map: ChannelStatusMap): void {
    try {
      const entries = Object.entries(map);
      if (entries.length > MAX_ENTRIES) {
        const evicted = entries
          .sort(([, a], [, b]) => b.generatedAt - a.generatedAt)
          .slice(MAX_ENTRIES);
        for (const [key] of evicted) delete map[key];
      }
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Best-effort persistence; the in-memory map still applies.
    }
  },
};

/**
 * A cached status is fresh while no newer family activity exists. Compared
 * as instants: backend timestamps ("…00Z") and live toISOString() updates
 * ("…00.000Z") must treat the same moment as equal.
 */
export function statusIsFresh(
  entry: ChannelStatusEntry | undefined,
  activityAt: string,
): boolean {
  if (entry === undefined) return false;
  const cachedAt = Date.parse(entry.activityAt);
  const newAt = Date.parse(activityAt);
  if (!Number.isFinite(cachedAt) || !Number.isFinite(newAt)) {
    return entry.activityAt >= activityAt;
  }
  return cachedAt >= newAt;
}

/** Only families active this recently get (re)generated statuses. */
export const STATUS_ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type StatusTarget = {
  mainId: string;
  /** The family channel whose activity is newest — where the session lives. */
  sourceChannelId: string;
  activityAt: string;
};

/**
 * Family activity targets, newest first. A main's status covers its whole
 * family (main + tabs) and is sourced from the family channel with the
 * newest activity.
 */
export function selectStatusTargets(
  mains: readonly Channel[],
  subsByParentId: ReadonlyMap<string, readonly Channel[]>,
  now: number,
): StatusTarget[] {
  const targets: (StatusTarget & { activityTime: number })[] = [];
  for (const main of mains) {
    let source = main;
    let activityAt = main.lastMessageAt ?? "";
    let activityTime = activityAt ? Date.parse(activityAt) : Number.NaN;
    for (const sub of subsByParentId.get(main.id) ?? []) {
      const subAt = sub.lastMessageAt ?? "";
      const subTime = subAt ? Date.parse(subAt) : Number.NaN;
      if (Number.isFinite(subTime) && !(subTime <= activityTime)) {
        source = sub;
        activityAt = subAt;
        activityTime = subTime;
      }
    }
    if (!Number.isFinite(activityTime)) continue;
    if (now - activityTime > STATUS_ACTIVITY_WINDOW_MS) continue;
    targets.push({
      mainId: main.id,
      sourceChannelId: source.id,
      activityAt,
      activityTime,
    });
  }
  return targets
    .sort((a, b) => b.activityTime - a.activityTime)
    .map(({ mainId, sourceChannelId, activityAt }) => ({
      mainId,
      sourceChannelId,
      activityAt,
    }));
}

const STATUS_INSTRUCTION =
  "You summarize the state of an agent-work chat channel. Reply with one " +
  "short status line (at most 12 words) saying what just happened or what " +
  "the channel is waiting on. Plain lowercase text. No quotes, no channel " +
  "name prefix, no explanation — just the status line.";

const MAX_TRANSCRIPT_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 240;
const MAX_STATUS_CHARS = 90;

/** Both chat kinds the dev transcript renders (9 and 40002). */
function isStatusMessage(event: RelayEvent): boolean {
  return DEV_MESSAGE_KINDS.has(event.kind) && event.content.trim().length > 0;
}

/** Newest-last chat messages formatted for the summarization prompt. */
export function statusTranscript(events: readonly RelayEvent[]): string {
  const messages = events
    .filter(isStatusMessage)
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-MAX_TRANSCRIPT_MESSAGES);
  return messages
    .map(
      (event) =>
        `${truncatePubkey(event.pubkey)}: ${event.content
          .replaceAll("\n", " ")
          .slice(0, MAX_MESSAGE_CHARS)}`,
    )
    .join("\n");
}

/** Reduce raw LLM output to one bounded status line, or null if unusable. */
export function toStatusLine(raw: string): string | null {
  const lastLine = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  if (!lastLine) return null;
  const cleaned = lastLine.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (cleaned.length < 3) return null;
  return cleaned.length > MAX_STATUS_CHARS
    ? `${cleaned.slice(0, MAX_STATUS_CHARS - 1)}…`
    : cleaned;
}

/** Deterministic fallback when no LLM is reachable: latest message snippet. */
export function snippetStatus(events: readonly RelayEvent[]): string | null {
  const latest = events
    .filter(isStatusMessage)
    .sort((a, b) => a.created_at - b.created_at)
    .at(-1);
  if (!latest) return null;
  const firstLine = latest.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;
  return firstLine.length > MAX_STATUS_CHARS
    ? `${firstLine.slice(0, MAX_STATUS_CHARS - 1)}…`
    : firstLine;
}

/**
 * The native completion command has no cancellation, so a hung harness
 * subprocess cannot be killed from here — the timeout only unblocks the
 * generation queue. After a couple of timeouts in a row, stop launching
 * harness completions for the rest of the session (mesh/snippet still run)
 * so hung subprocesses cannot pile up in the background.
 */
const AGENT_TIMEOUT_MS = 25_000;
const AGENT_BREAKER_LIMIT = 2;
let agentTimeoutsInARow = 0;

async function agentStatus(
  transcript: string,
  agentPubkey: string,
): Promise<string | null> {
  if (agentTimeoutsInARow >= AGENT_BREAKER_LIMIT) return null;
  const TIMED_OUT = Symbol("timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      generateAgentCompletion({
        pubkey: agentPubkey,
        prompt: `${STATUS_INSTRUCTION}\n\nConversation (newest last):\n${transcript}`,
        systemPrompt: STATUS_INSTRUCTION,
      }),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), AGENT_TIMEOUT_MS);
      }),
    ]);
    if (result === TIMED_OUT) {
      agentTimeoutsInARow += 1;
      return null;
    }
    agentTimeoutsInARow = 0;
    return toStatusLine(result);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const MESH_TIMEOUT_MS = 8_000;

async function meshStatus(transcript: string): Promise<string | null> {
  let apiBaseUrl: string;
  let modelId: string;
  try {
    const status = await meshNodeStatus();
    if (status.state !== "running" || !status.apiBaseUrl || !status.modelId) {
      return null;
    }
    apiBaseUrl = status.apiBaseUrl;
    modelId = status.modelId;
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: STATUS_INSTRUCTION },
          { role: "user", content: transcript },
        ],
        max_tokens: 48,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(MESH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const content = (
      payload as { choices?: { message?: { content?: unknown } }[] }
    ).choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return toStatusLine(content);
  } catch {
    return null;
  }
}

/**
 * Generate one status line from a channel's recent events. Never throws;
 * null means the channel had no usable messages at all.
 */
export async function generateChannelStatus(
  events: readonly RelayEvent[],
  agentPubkey: string | null,
): Promise<{ status: string; fallback: boolean } | null> {
  const transcript = statusTranscript(events);
  if (transcript.length === 0) return null;
  if (agentPubkey) {
    const status = await agentStatus(transcript, agentPubkey);
    if (status) return { status, fallback: false };
  }
  const mesh = await meshStatus(transcript);
  if (mesh) return { status: mesh, fallback: false };
  const snippet = snippetStatus(events);
  return snippet ? { status: snippet, fallback: true } : null;
}
