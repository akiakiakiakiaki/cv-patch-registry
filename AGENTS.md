# AGENTS

- TypeScript strict; no `any`.
- Do not change public API contracts.
- Keep layers separated: raw API data, cache, adapters, UI.
- Mapping belongs in adapters, not components or routes.
- Prefer minimal diffs; modify only what is necessary.
- Reuse existing utilities; no duplication.
- No new dependencies unless strictly necessary.
- Keep logging minimal; remove debug logs after use.
- Verify framework APIs if unsure.
- When changing existing code, update the relevant tests in the same change.
- When adding new code, add corresponding tests in the same change.
- Run all changed or newly added tests and verify that the implementation behaves as expected.

## Adding a synthesizer

- Add its versioned layout JSON and artwork under `src/lib/instrument/<id>/`.
- Add a definition and any instrument-specific switch/state adapter under `src/lib/instruments/<id>/`, then register it in `src/lib/instruments/registry.ts`.
- Use a stable slug ID and a `displayName` from the layout JSON; never reuse control IDs for different controls.
- Increase `layoutVersion` for layout revisions and `schemaVersion` for incompatible layout structure changes.
- Keep patch state in the shared patch shape. Add instrument-specific migration in adapters when required.
- Patch-library exports must carry `format`, `schemaVersion`, and `instrumentId`; reject unsupported versions or a mismatched synth, while retaining legacy Proton import support.
