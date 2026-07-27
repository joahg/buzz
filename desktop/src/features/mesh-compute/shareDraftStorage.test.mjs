import assert from "node:assert/strict";
import test from "node:test";

import {
  meshShareDraftStorageKey,
  readMeshShareDraft,
  writeMeshShareDraft,
} from "./shareDraftStorage.ts";

test("shared-compute drafts are isolated by opaque community scope", () => {
  const relayA = "buzz-community-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const relayB = "buzz-community-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  assert.notEqual(
    meshShareDraftStorageKey("model", relayA),
    meshShareDraftStorageKey("model", relayB),
  );
  assert.notEqual(
    meshShareDraftStorageKey("max-vram-gb", relayA),
    meshShareDraftStorageKey("max-vram-gb", relayB),
  );
});

test("shared-compute draft keys do not expose relay URLs", () => {
  const scope = "buzz-community-0123456789abcdef0123456789abcdef";
  const key = meshShareDraftStorageKey("model", scope);

  assert.equal(key, `buzz.mesh-compute.share.v2:${scope}:model`);
  assert.equal(key?.includes("relay.example.com"), false);
  assert.equal(meshShareDraftStorageKey("model", ""), null);
});

test("legacy global draft is claimed once and relay drafts stay independent", () => {
  const values = new Map([
    ["buzz.mesh-compute.share.model.v1", "legacy-model"],
  ]);
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };

  try {
    const relayAKey = meshShareDraftStorageKey(
      "model",
      "buzz-community-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const relayBKey = meshShareDraftStorageKey(
      "model",
      "buzz-community-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );

    assert.equal(readMeshShareDraft(relayAKey, "model"), "legacy-model");
    assert.equal(
      values.has("buzz.mesh-compute.share.model.v1"),
      false,
      "legacy global key is retired after the first community claims it",
    );
    assert.equal(readMeshShareDraft(relayBKey, "model"), "");

    writeMeshShareDraft(relayBKey, "relay-b-model");
    assert.equal(readMeshShareDraft(relayAKey, "model"), "legacy-model");
    assert.equal(readMeshShareDraft(relayBKey, "model"), "relay-b-model");
  } finally {
    globalThis.window = previousWindow;
  }
});
