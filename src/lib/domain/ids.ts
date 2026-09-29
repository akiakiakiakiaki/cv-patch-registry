export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `patch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
