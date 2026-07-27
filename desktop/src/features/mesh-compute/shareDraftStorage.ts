export type MeshShareDraftField = "model" | "max-vram-gb";

const STORAGE_PREFIX = "buzz.mesh-compute.share.v2";
const LEGACY_STORAGE_KEYS: Record<MeshShareDraftField, string> = {
  model: "buzz.mesh-compute.share.model.v1",
  "max-vram-gb": "buzz.mesh-compute.share.max-vram-gb.v1",
};

/**
 * Community-scoped draft key. `communityScope` is the opaque canonical relay
 * identity returned by the backend, so localStorage never needs the relay URL.
 */
export function meshShareDraftStorageKey(
  field: MeshShareDraftField,
  communityScope: string | null | undefined,
): string | null {
  const scope = communityScope?.trim();
  return scope ? `${STORAGE_PREFIX}:${scope}:${field}` : null;
}

export function readMeshShareDraft(
  key: string | null,
  field: MeshShareDraftField,
): string {
  if (!key) return "";
  try {
    const scoped = window.localStorage.getItem(key);
    const legacyKey = LEGACY_STORAGE_KEYS[field];
    const legacy = window.localStorage.getItem(legacyKey);
    if (scoped !== null) {
      // A downgrade may have recreated the old app-wide draft after this
      // community already saved a scoped value. Retire it so another
      // community cannot inherit it later.
      if (legacy !== null) window.localStorage.removeItem(legacyKey);
      return scoped;
    }
    if (legacy !== null) {
      // Claim the old global draft for exactly the first community that
      // hydrates after upgrade, then remove the global source.
      window.localStorage.setItem(key, legacy);
      window.localStorage.removeItem(legacyKey);
      return legacy;
    }
    return "";
  } catch {
    return "";
  }
}

export function writeMeshShareDraft(key: string | null, value: string): void {
  if (!key) return;
  try {
    if (value === "") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore unavailable/full storage; the input still works for this session.
  }
}
