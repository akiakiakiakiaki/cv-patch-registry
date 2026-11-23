# CV Patch Registry

CV Patch Registry is a browser based tool for creating and organizing analogue synthesizer patches, so they can be remembered, rebuilt and shared. Choose a synth, adjust its controls, toggle LEDs and switches, and draw patch cables between its inputs and outputs. Patch changes are saved automatically in the browser for the selected synth.

The app supports multiple synthesizers. **Behringer Proton** is included as a built-in synth; its display name and versioned control layout are defined in `src/lib/instrument/behringer-proton/behringer-proton-layout.json`, and built-in instruments are registered in `src/lib/instruments/registry.ts`. Signed-in users can add their own synthesizers from a panel image.

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

Set `NEXT_PUBLIC_DEBUG_LAYOUT=true` in `.env.development.local` and sign in with an `admin` account to show the built-in layout adjustment controls, then restart the dev server. This allows positioning each control element manually. The default in `.env.example` is `false`. Select an encoder, LED, switch, or patch point and use the arrow keys to adjust its position one layout unit at a time. Save the layout to write the positions to that instrument's JSON layout file. The current Proton layout is stored at `src/lib/instrument/behringer-proton/behringer-proton-layout.json`.

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

Copyright © 2026 Michael Ilg

Source-available under the CV Patch Registry Source-Available License.
See LICENSE for details.

## Accounts, synthesizers and shared patches (beta)

Everything happens on the start page:

- Choose a synthesizer in the selector. Its patches appear in the patch list, and the panel plays the active patch.
- **+ New synthesizer** opens a dialog for name, manufacturer, identifier and panel image.
- **Edit synth** (owner only) turns the panel into a layout editor. Drag controls from the palette onto the panel or click to place them in the centre. Drag them on the panel or use the arrow keys to move them in half-unit steps. Save creates a new revision.
- Signed-in users keep patches on the server, and changes are saved automatically. Anonymous visitors keep them in this browser.

- Register and sign in with e-mail and password. Forgotten passwords: the login page links to a reset form. In local development the reset link is printed to the server console. Set `AUTH_REQUIRE_EMAIL_VERIFICATION=true` and `NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION=true` to require verification. Locally the verification link is printed to the server console. Production deliberately has no console mail fallback; configure a real mail sender before enabling password reset or email verification there.
- Guest visitors can explore and keep patches in this browser. Registered accounts receive the `user` role and can use account storage, patch import/export and synthesizer editing. `admin` is a separately assigned role; role values are server-owned and cannot be selected during registration. Guest-only behavior is also enforced by the write APIs.
- `user` and `admin` have the same member features, except that only `admin` can adjust the built-in synth layouts (development only, see above).
- Assign or remove an admin with `npm run db:set-role -- admin@example.com admin` (or use `user` to demote the account). Stop the dev server first when using PGlite; PostgreSQL uses the configured `DATABASE_URL`. Sign in again to refresh the role in the session. Role assignment is not available through public registration.
- Create synthesizers from a panel image (PNG, JPEG or SVG, up to 5 MB) and place knobs, switches, LEDs, inputs, outputs and universal ports. Each save creates a revision and advances the current pointer in one transaction. A stale concurrent save gets a conflict without leaving a partial revision behind.
- Patches are private or public. Public patches are listed in `/explore` and readable without signing in. Only the owner can edit them.
- Data lives in an embedded Postgres (PGlite) in `.data/pglite`. Uploaded panels and samples live in `public/assets/uploads/`. Both paths are gitignored.
- Each user has 50 MB of storage, shared by panel images and audio samples, and at most 50 panels. Uploaded panels that no synth uses are removed after 24 hours, at the owner's next panel upload.
- Audio samples (MP3 or M4A/AAC, up to 30 s, 1.5 MB, counted against the 50 MB) are behind `FEATURE_AUDIO`. Off by default. The file type is detected from the content. A patch's owner can replace its sample; the previous file is removed.

### Environment

| Variable                                      | Purpose                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`                          | Session secret. Required outside local development.                                                                                  |
| `BETTER_AUTH_URL`                             | Public base URL, e.g. `http://localhost:3000`.                                                                                       |
| `AUTH_REQUIRE_EMAIL_VERIFICATION`             | `true` blocks sign-in until the address is verified.                                                                                 |
| `NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION` | Same flag for the client, which shows the "check your mail" message.                                                                 |
| `FEATURE_AUDIO` / `NEXT_PUBLIC_FEATURE_AUDIO` | Enables sample upload and playback.                                                                                                  |
| `PATCH_DB_PROVIDER`                           | `pglite` (default) or `postgres`. Supabase also uses `postgres` here.                                                                |
| `PATCH_DB_DIR`                                | Optional database directory. Defaults to `.data/pglite`.                                                                             |
| `DATABASE_URL`                                | PostgreSQL connection string. Required with `PATCH_DB_PROVIDER=postgres`; use the Supabase database connection string if applicable. |
| `PATCH_DB_POOL_MAX`                           | PostgreSQL client connections per app process. Defaults to `1`; increase only if the app shows connection queuing.                   |
| `STORAGE_PROVIDER`                            | `local` (default) or `supabase`. Vercel requires `supabase`.                                                                          |
| `SUPABASE_URL`                                | Supabase project URL. Required for Supabase Storage.                                                                                  |
| `SUPABASE_STORAGE_BUCKET`                     | Existing Storage bucket name; default example: `patch-assets`.                                                                        |
| `SUPABASE_SECRET_KEY`                         | Server-only Supabase secret key for Storage uploads and deletes. Legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted.                 |

PGlite uses a lock file next to its data directory, so only one process opens that directory. A stale lock from a killed process is taken over automatically. On Ctrl+C or SIGTERM the database is closed cleanly. Use a different `PATCH_DB_DIR` to run a second instance on purpose. PostgreSQL is managed by its server and has no local directory lock.

To use local PGlite, set `PATCH_DB_PROVIDER=pglite` (or leave it unset). To use a PostgreSQL server, set `PATCH_DB_PROVIDER=postgres` and provide `DATABASE_URL`. The same Drizzle schema and SQL migrations are used for both. Better Auth continues to own users, password verification and sessions in either mode; Supabase Auth is not enabled. Switching providers points the app at a different database and does not copy existing data between them. The PostgreSQL pool defaults to one connection per process; increase `PATCH_DB_POOL_MAX` only when an always-on server shows queuing.

### Hosting notes

- For Vercel, set `PATCH_DB_PROVIDER=postgres`, `DATABASE_URL`, and `PATCH_DB_POOL_MAX=1`. Use the Supabase transaction pooler connection string for serverless requests. The application applies SQL migrations from `drizzle/` at startup; Next.js includes those files in server traces.
- Set `STORAGE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, and the server-only `SUPABASE_SECRET_KEY` on Vercel. Create that bucket in Supabase Storage as a public bucket. Uploads and deletes go through the app's authenticated API routes.
- Keep `BETTER_AUTH_SECRET` and the production `BETTER_AUTH_URL` set in Vercel. Preview deployments use Vercel's deployment URL for Better Auth automatically. Supabase Auth is not used.
- Storage keys stay in the database, while URLs are generated by the selected provider. Local development defaults to `STORAGE_PROVIDER=local`; do not set a Supabase secret with a `NEXT_PUBLIC_` prefix.
- If the Supabase database already contains asset rows created while files were stored locally, copy the matching files before deploying: configure the Supabase Storage variables in `.env.development.local`, create the public bucket, then run `npm run storage:migrate-local`. The script uploads files from `public/assets/uploads/` with their existing keys and can be rerun safely.
- Uploaded files in local mode are served by `src/app/assets/uploads/[key]/route.ts` with `nosniff` and a sandboxing CSP.
- Cookie-authenticated mutation routes reject a supplied cross-origin `Origin`, and JSON mutation bodies have byte limits.
