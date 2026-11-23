/** One storage budget per user, shared by panels and samples. */
export const STORAGE_QUOTA_BYTES = 50 * 1024 * 1024;

/** Panels a user may keep at once, including uploads no synth uses yet. */
export const PANEL_MAX_COUNT = 50;

/** Uploaded panels that no synth revision uses are removed after this time (the editor saves within it). */
export const UNUSED_PANEL_TTL_MS = 24 * 60 * 60 * 1000;
