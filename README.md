# CV Patch Registry

CV Patch Registry is a browser based tool for creating and organizing analogue synthesizer patches, so they can be remembered, rebuilt and shared. Choose a synth, adjust its controls, toggle LEDs and switches, and draw patch cables between its inputs and outputs. Patch changes are saved automatically in the browser for the selected synth.

The app is structured to support multiple synthesizers. **Behringer Proton is currently the only implemented synth.** Its display name and versioned control layout are defined in `src/lib/instrument/behringer-proton/behringer-proton-layout.json`; the available instruments are registered in `src/lib/instruments/registry.ts`.

## Features

- Create, rename, select, and delete patches. Each patch has a last changed timestamp.
- Store patch libraries locally in the browser, separately for each synth.
- Signed-in users can download a synth's patch library as a versioned JSON file or import and merge one. Imports are checked for synth ID and data version; differing local and imported patches can be resolved during import.
- Draw patch cables by dragging between an input and an output in either direction. Each endpoint can be used by one cable at a time. Cable colors can be changed after creation.
- Use the instrument layout editor in development to adjust control positions.
- Switch between German and English; the browser's language setting selects the initial language.

## Run locally

Next.js 16 requires Node.js 20.9 or newer.

```sh
nvm use
npm install
cp .env.example .env.development.local
npm run dev
```

Open <http://localhost:3000>.

Environment files are local and are not committed. Start with `.env.example`, copy it to `.env.development.local`, and adjust the values there as needed. Next.js loads `.env.development.local` automatically.

## Instrument layout editor

Set `NEXT_PUBLIC_DEBUG_LAYOUT=true` in `.env.development.local` and sign in to show the built-in layout adjustment controls, then restart the dev server. This allows positioning each control element manually. The default in `.env.example` is `false`. Select an encoder, LED, switch, or patch point and use the arrow keys to adjust its position one layout unit at a time. Save the layout to write the positions to that instrument's JSON layout file. The current Proton layout is stored at `src/lib/instrument/behringer-proton/behringer-proton-layout.json`.

Each control has a stable ID and position in the layout JSON. Shared shapes and sizes are defined once in the layout's `geometry` section. The overlay and background image use the same viewBox so controls scale with the image.

## Tests

Vitest runs unit, component, and accessibility tests in `jsdom`. The current suite covers patch lifecycle and merge rules, versioned import/export, layout validation, local storage and Proton switch behavior, plus patch manager and cable interactions. `jest-axe` checks the primary interfaces for accessibility violations.

```sh
npm test       # watch mode
npm run test:run
```

Test files use the `*.test.ts` or `*.test.tsx` suffix under `tests/unit/`, `tests/components/`, or `tests/a11y/`.

### Pre-commit hook

The repository includes a Git pre-commit hook that runs the full test suite. Enable it once in your local clone from the project root:

```sh
git config core.hooksPath .githooks
```

After enabling it, `git commit` runs `npm run test:run` and is stopped if any test fails. To disable the hook for this clone, run `git config --unset core.hooksPath`.

## Project structure

- `src/lib/domain`: patch types and patch/library operations.
- `src/lib/instrument`: shared layout types and instrument-specific, versioned layout data.
- `src/lib/instruments`: instrument definitions, switch adapters, and the synth registry.
- `src/lib/adapters`: validation and mapping for layout and patch JSON documents.
- `src/lib/storage`: local patch storage and layout-file persistence.
- `src/components`: interactive patch manager and instrument panel.
- `src/app`: Next.js pages, API routes, and global styles.
- `src/i18n`: German and English UI messages and locale selection.
- `prototype/`: the original standalone prototype, kept as a reference and not used by the Next.js app.

Copyright © 2026 Michael Ilg

Licensed under the GNU Affero General Public License v3.0.
See LICENSE for details.

## Accounts, synthesizers and shared patches (beta)

Everything happens on the start page:

- Choose a synthesizer in the selector. Its patches appear in the patch list, and the panel plays the active patch.
- **+ New synthesizer** opens a dialog for name, manufacturer, identifier and panel image.
- **Edit synth** (owner only) turns the panel into a layout editor. Drag controls from the palette onto the panel or click to place them in the centre. Drag them on the panel or use the arrow keys to move them in half-unit steps. Save creates a new revision.
- Signed-in users keep patches on the server, and changes are saved automatically. Anonymous visitors keep them in this browser.

- Register and sign in with e-mail and password. Forgotten passwords: the login page links to a reset form. In local development the reset link is printed to the server console. Set `AUTH_REQUIRE_EMAIL_VERIFICATION=true` and `NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION=true` to require verification. Locally the verification link is printed to the server console. Production deliberately has no console mail fallback; configure a real mail sender before enabling password reset or email verification there.
- Guest visitors can explore and keep patches in this browser. Registered accounts receive the `user` role and can use account storage, patch import/export and synthesizer editing. `admin` is a separately assigned role; role values are server-owned and cannot be selected during registration. Guest-only behavior is also enforced by the write APIs.
- `user` and `admin` currently have the same member features. The `admin` role is ready for additional administrative permissions, but there is no admin console yet.
- Assign or remove an admin with `npm run db:set-role -- admin@example.com admin` (or use `user` to demote the account). Stop the dev server first when using PGlite; PostgreSQL uses the configured `DATABASE_URL`. Sign in again to refresh the role in the session. Role assignment is not available through public registration.
- Create synthesizers from a panel image (PNG, JPEG or SVG, up to 5 MB) and place knobs, switches, LEDs, inputs, outputs and universal ports. Each save creates a revision and advances the current pointer in one transaction. A stale concurrent save gets a conflict without leaving a partial revision behind.
- Patches are private or public. Public patches are listed in `/explore` and readable without signing in. Only the owner can edit them.
- Data lives in an embedded Postgres (PGlite) in `.data/pglite`. Uploaded panels and samples live in `public/assets/uploads/`. Both paths are gitignored.
- Audio samples (MP3, up to 30 s, 1.5 MB, 50 MB per user) are behind `FEATURE_AUDIO`. Off by default.

### Environment

| Variable | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Session secret. Required outside local development. |
| `BETTER_AUTH_URL` | Public base URL, e.g. `http://localhost:3000`. |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `true` blocks sign-in until the address is verified. |
| `NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION` | Same flag for the client, which shows the "check your mail" message. |
| `FEATURE_AUDIO` / `NEXT_PUBLIC_FEATURE_AUDIO` | Enables sample upload and playback. |
| `PATCH_DB_PROVIDER` | `pglite` (default) or `postgres`. Supabase also uses `postgres` here. |
| `PATCH_DB_DIR` | Optional database directory. Defaults to `.data/pglite`. |
| `DATABASE_URL` | PostgreSQL connection string. Required with `PATCH_DB_PROVIDER=postgres`; use the Supabase database connection string if applicable. |
| `PATCH_DB_POOL_MAX` | PostgreSQL client connections per app process. Defaults to `1`; increase only if the app shows connection queuing. |

PGlite uses a lock file next to its data directory, so only one process opens that directory. A stale lock from a killed process is taken over automatically. On Ctrl+C or SIGTERM the database is closed cleanly. Use a different `PATCH_DB_DIR` to run a second instance on purpose. PostgreSQL is managed by its server and has no local directory lock.

To use local PGlite, set `PATCH_DB_PROVIDER=pglite` (or leave it unset). To use a PostgreSQL server, set `PATCH_DB_PROVIDER=postgres` and provide `DATABASE_URL`. The same Drizzle schema and SQL migrations are used for both. Better Auth continues to own users, password verification and sessions in either mode; Supabase Auth is not enabled. Switching providers points the app at a different database and does not copy existing data between them. The PostgreSQL pool defaults to one connection per process; increase `PATCH_DB_POOL_MAX` only when an always-on server shows queuing.

### Hosting notes

- Use `PATCH_DB_PROVIDER=postgres` with `DATABASE_URL` for a server PostgreSQL database, including Supabase's PostgreSQL service. Select the direct or pooler connection string appropriate for the hosting environment. Schema and migrations are plain SQL in `drizzle/`.
- Storage is the local filesystem behind the `StorageProvider` interface. An S3-compatible or Supabase Storage provider can replace it without a data migration, because only relative keys are stored.
- Uploaded files are served by `src/app/assets/uploads/[key]/route.ts` with `nosniff` and a sandboxing CSP. The same headers are set in `next.config.mjs` for static files.
- Cookie-authenticated mutation routes reject a supplied cross-origin `Origin`, and JSON mutation bodies have byte limits. These checks do not replace request-rate limits: configure limits at the hosting proxy for uploads and other expensive operations before public access.

### Before public operation

- [ ] Privacy policy and imprint. Sessions store IP address and user agent, so say so and set a deletion period.
- [ ] Data processing agreements with the hosting and mail providers.
- [ ] Account deletion, including the user's uploads (not implemented yet).
- [ ] Report button on public patches, synths and samples, with a takedown process (EU DSA Art. 16). Not implemented yet.
- [ ] Copyright: manufacturer panel artwork (e.g. Behringer Proton) must be cleared before it is public.
- [ ] Sample rights: the upload confirms the rights, but the takedown process above still applies.
- [ ] License conflict: `LICENSE` is AGPL v3, while `CONTRIBUTING.md` restricts commercial hosting. Resolve before public operation.
- [ ] Upload rate limits and a registration captcha (both missing).
- [ ] Database backups and a tested restore.
- [ ] Known gaps: samples are unlisted but not access-protected, sample duration is only checked in the browser, and samples cannot be deleted yet.
