# CV Patch Registry

CV Patch Registry is a browser-based tool for documenting patches of analog and semi-modular synthesizers, so they can be remembered, rebuilt and shared. Add a synthesizer from a photo or drawing of its panel and place its knobs, switches, LEDs and patch points on it. Then record patches on that panel: turn knobs, toggle switches and LEDs, and draw cables between outputs and inputs. Keep patches private or share them with everyone.

Visitors can try everything without an account; their patches stay in the browser. With an account, patches and synthesizers are saved on the server. Admins approve new synthesizers, look after accounts and make backups.

## Features

### Patches

- Choose a synthesizer in the selector on the start page. Its patches appear in the patch list (a dialog opened with **Patches**), and the panel shows the active patch.
- Create, rename, select and delete patches. Each patch has a last changed timestamp. Changes are saved automatically: in the browser for visitors, in the account for signed-in users.
- Turn knobs by dragging or with the arrow keys, toggle switches and LEDs by clicking.
- Draw patch cables by dragging between an input and an output in either direction. Each endpoint takes one cable at a time. Clicking an endpoint changes the cable's color; dragging an end to another port reroutes it, dragging it away from all ports removes the cable.
- Patches are private or public. Public patches are listed under **Explore** and readable without signing in. Only their owner can edit them.
- Tags are entered as chips: typing suggests existing tags (curated ones, tags of public patches and your own), Enter or a comma adds the typed text. Tags start with an uppercase letter; an existing tag keeps its spelling.
- Signed-in users can download a synth's patch library as a versioned JSON file, or import and merge one, both from the patch list. Imports are checked for synth ID and data version; differing local and imported patches can be resolved during import.
- When a visitor creates an account, the patches kept in the browser for every synth move into the account at the first sign-in there; the browser copy is removed afterwards.
- Optional audio samples per patch (MP3 or M4A/AAC, up to 30 s and 1.5 MB), switched on with `FEATURE_AUDIO`. The file type is detected from the content. A patch's owner can replace its sample; the previous file is removed.

### Synthesizers

- **+ New synthesizer** opens a dialog for name, manufacturer, identifier and panel image (PNG, JPEG or SVG, up to 5 MB).
- **Edit** next to the synth selector (for the synth's creator and admins) turns the panel into a layout editor. Place knobs, switches, slide switches, LEDs, inputs, outputs and universal ports by dragging them from the palette onto the panel, or click to place them in the centre. Hovering a palette button shows a short animation of the control.
- Move controls by dragging or with the arrow keys in half-unit steps. The zoom buttons enlarge the panel in 50 % steps up to 250 % and reset it to full width. On wide screens the editor fills the window between header and footer; the panel and the sidebar scroll separately.
- Cmd/Ctrl+C copies the selected control and Cmd/Ctrl+V pastes a copy with all its settings at the pointer (or next to the original when the pointer is not over the panel). Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z redoes changes to the controls.
- A slide switch is an on/off switch twice as wide as a push button (off left, on right); an existing switch can be turned into one and back without losing its state in patches.
- Optional color categories, edited in a dialog from the category list, give knobs, switches and LEDs their own color and size: a scale factor from 0.25 to 4, proportional or separately for width and height. The control list shows each control's categories, or its default color, as color dots.
- A switch can be a selector that cycles through two or more categories (like a Shift button); dependent switches keep a separate state for each of its categories. The editor checks this configuration on save and offers to correct it.
- Each save creates a new revision in one transaction; a stale concurrent save gets a conflict without leaving a partial revision behind. Unsaved changes are marked in the sidebar. Leaving the editor with unsaved changes (**Done**, choosing another synth or signing out) offers to save, discard them or keep editing; closing or reloading the tab shows the browser's warning.
- New synthesizers, also an admin's, are visible only to their creator and admins until an admin approves them. Their creator sees the status below the panel.

### Accounts

- Register and sign in with email and password. The login page links to a password reset form.
- With email verification switched on (`AUTH_REQUIRE_EMAIL_VERIFICATION` and `NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION`), the form shows where the mail went after registering and offers to send it again once a minute. The link in the mail signs the new account in and welcomes it.
- Signed-in users find their name at the top right. Its menu (on hover, click or keyboard) signs out and requests the deletion of the own account: the admins get a mail and the account is deactivated right away, until an admin deletes it.
- Each account has 50 MB of storage, shared by panel images and audio samples, and at most 50 panels. Uploaded panels that no synth uses are removed after 24 hours, at the owner's next panel upload.

### Roles and administration

- New accounts get the `user` role. `admin` is assigned separately, and `owner` is the super admin: every admin right, the only one who changes roles in the app, and it cannot be deactivated or changed there. Role values are owned by the server and cannot be chosen during registration.
- Assign a role on the command line with `npm run db:set-role -- someone@example.com <user|admin|owner>`; `owner` is assigned only this way. Stop the dev server first when using PGlite. Sign in again to refresh the role in the session. `npm run db:set-role:prod -- …` does the same with `.env.prod-scripts.local`.
- **Admin → Synth management** approves new synths (also with the switch below a synth's panel) and takes approvals back, deletes and restores synths, removes deleted synths for good (with all patches on them and their files) and reduces old revisions: it keeps the newest three, the current one and every revision a patch uses. Admins may edit and delete every user synth.
- **Admin → Users** deactivates and reactivates accounts (a deactivated account cannot sign in or use the app; a user who is still signed in is told to contact an admin and signed out), confirms email addresses by hand and, for the owner, changes roles. Nobody changes their own account or the owner's.
- A deactivated account can be deleted for good. Its owner first gets an email with everything stored about them (account, patches, synths, uploads) as a JSON file in a ZIP archive; nothing is deleted if that mail cannot be sent. Then its private patches, samples, unused uploads and sign-in data are removed. Public patches and its synths stay and show “Deleted user”.
- **Admin → Patches** lists every patch by synth (owner, visibility, tags, sample, dates, revisions). **Admin → Samples** lists every sample file by synth and marks the files no patch uses anymore.
- **Admin → Import/Export** downloads a complete backup (data and files, as a ZIP to this computer) or restores one, also from another instance or an older app version. A backup of the current state is downloaded first, and everyone signs in again afterwards. See [Backups](#backups) for the command-line version.

### Mail

- Mails (verification, password reset, the data copy before an account is deleted, and notices to admins when a new synth awaits approval or someone asks for deletion) go out in the reader's browser language.
- They are sent through the service set in `MAIL_PROVIDER`: `console` prints them to the server log (the default outside production), `brevo` sends them through Brevo. Every service sits behind one small adapter (`src/lib/mail/providers`), so another one needs only a new adapter and its settings.

### Interface

- German and English; the browser's language setting selects the initial language, and the footer switches it.
- Light and dark theme, following the system setting until switched in the footer.

## Run locally

Requires Node.js 20.19 or newer (22.12 or newer on Node 22); the test tooling needs these versions. `.nvmrc` names the version used in development.

```sh
nvm use
npm install
cp .env.example .env.development.local
npm run dev
```

Open <http://localhost:3000>.

Environment files are local and are not committed. Start with `.env.example`, copy it to `.env.development.local`, and adjust the values there as needed. Next.js loads `.env.development.local` automatically.

Set `DEVELOPMENT=true` in `.env.development.local` to show "Development mode · dev database" in the footer, so a development instance is not mistaken for production.

## Tests

Vitest runs unit, component, and accessibility tests in `jsdom`. The suite covers patch lifecycle and merge rules, versioned import/export, layout validation, the synth editor, accounts, mail, the admin area and the database services. `jest-axe` checks the primary interfaces for accessibility violations.

```sh
npm test       # watch mode
npm run test:run
```

Test files use the `*.test.ts` or `*.test.tsx` suffix under `tests/unit/`, `tests/components/`, or `tests/a11y/`.

### Browser tests

Browser tests in `e2e/` (Playwright, Chromium) use the app like a person does: signing up and in, turning knobs, plugging cables, the admin area. They run against the production build on their own throw-away PGlite database (`.data/e2e-pglite`, recreated on every run) with local file storage and mails in the log, so they never touch development or production data. Install the browser once, then build and run:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

`npm run test:e2e:ui` opens Playwright's interactive runner. After a failure, `npx playwright show-report` shows screenshots and traces. Browser test files use the `*.spec.ts` suffix.

### Git hooks

The repository includes two Git hooks. Enable them once in your local clone from the project root:

```sh
git config core.hooksPath .githooks
```

- `git commit` runs `npm run test:run` (the full unit and component test suite) and is stopped if any test fails.
- `git push` runs `npm run build` (including type checking) and `npm run test:e2e` and is stopped if either fails.

With nvm installed, the hooks use the Node version from `.nvmrc`, also when started from an editor. To disable the hooks for this clone, run `git config --unset core.hooksPath`.

## Configuration

| Variable                                      | Purpose                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`                          | Session secret. Required outside local development.                                                                                  |
| `BETTER_AUTH_URL`                             | Public base URL, e.g. `http://localhost:3000`.                                                                                       |
| `AUTH_REQUIRE_EMAIL_VERIFICATION`             | `true` blocks sign-in until the address is verified.                                                                                 |
| `NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION` | Same flag for the client, which shows the "check your mail" view with "send again".                                                  |
| `MAIL_PROVIDER`                               | `console` (default outside production) or `brevo`. Required in production.                                                           |
| `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME`        | Sender, on a domain the mail service has verified.                                                                                   |
| `BREVO_API_KEY`                               | Server-only API key for `MAIL_PROVIDER=brevo`.                                                                                       |
| `FEATURE_AUDIO` / `NEXT_PUBLIC_FEATURE_AUDIO` | Enables sample upload and playback.                                                                                                  |
| `DEVELOPMENT`                                 | `true` shows "Development mode · dev database" in the footer. `false` or unset in production.                                     |
| `PATCH_DB_PROVIDER`                           | `pglite` (default) or `postgres`. Supabase also uses `postgres` here.                                                                |
| `PATCH_DB_DIR`                                | Optional database directory. Defaults to `.data/pglite`.                                                                             |
| `DATABASE_URL`                                | PostgreSQL connection string. Required with `PATCH_DB_PROVIDER=postgres`; use the Supabase database connection string if applicable. |
| `PATCH_DB_POOL_MAX`                           | PostgreSQL client connections per app process. Defaults to `1`; increase only if the app shows connection queuing.                   |
| `STORAGE_PROVIDER`                            | `local` (default) or `supabase`. Vercel requires `supabase`.                                                                          |
| `SUPABASE_URL`                                | Supabase project URL. Required for Supabase Storage.                                                                                  |
| `SUPABASE_STORAGE_BUCKET`                     | Existing Storage bucket name; default example: `patch-assets`.                                                                        |
| `SUPABASE_SECRET_KEY`                         | Server-only Supabase secret key for Storage uploads and deletes. Legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted.                 |

PGlite uses a lock file next to its data directory, so only one process opens that directory. A stale lock from a killed process is taken over automatically. On Ctrl+C or SIGTERM the database is closed cleanly. Use a different `PATCH_DB_DIR` to run a second instance on purpose. PostgreSQL is managed by its server and has no local directory lock.

Without further settings, data lives in an embedded Postgres (PGlite) in `.data/pglite`, and uploaded panels and samples in `public/assets/uploads/`; both paths are ignored by git. To use local PGlite, set `PATCH_DB_PROVIDER=pglite` (or leave it unset). To use a PostgreSQL server, set `PATCH_DB_PROVIDER=postgres` and provide `DATABASE_URL`. The same Drizzle schema and SQL migrations are used for both. Better Auth continues to own users, password verification and sessions in either mode; Supabase Auth is not enabled. Switching providers points the app at a different database and does not copy existing data between them. The PostgreSQL pool defaults to one connection per process; increase `PATCH_DB_POOL_MAX` only when an always-on server shows queuing.

## Backups

- Admin → Import/Export makes and restores backups in the browser. Without the app (e.g. when it is down), `npm run backup:export -- [--out backups]` saves the same backup file from the database and storage of `.env.development.local`, and `npm run backup:restore -- <file.zip>` shows what it would restore; add `--apply` to replace all data. `npm run backup:export:prod` and `npm run backup:restore:prod -- <file.zip> [--apply]` do the same with the settings of `.env.prod-scripts.local`. For any other environment run the scripts with its env file: `node --env-file=<file> node_modules/.bin/tsx --tsconfig tsconfig.json scripts/backup-restore.mts <file.zip>`.
- Backups contain every account (with password hashes) and email address. Keep them on your own machine; `backups/` is ignored by git.

## Hosting notes

- For Vercel, set `PATCH_DB_PROVIDER=postgres`, `DATABASE_URL`, and `PATCH_DB_POOL_MAX=1`. Use the Supabase transaction pooler connection string for serverless requests. The application applies SQL migrations from `drizzle/` at startup; Next.js includes those files in server traces.
- Set `STORAGE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, and the server-only `SUPABASE_SECRET_KEY` on Vercel. Create that bucket in Supabase Storage as a public bucket. Uploads and deletes go through the app's authenticated API routes.
- Keep `BETTER_AUTH_SECRET` and the production `BETTER_AUTH_URL` set in Vercel. Preview deployments use Vercel's deployment URL for Better Auth automatically. Supabase Auth is not used.
- Storage keys stay in the database, while URLs are generated by the selected provider. Local development defaults to `STORAGE_PROVIDER=local`; do not set a Supabase secret with a `NEXT_PUBLIC_` prefix.
- If the Supabase database already contains asset rows created while files were stored locally, copy the matching files before deploying: configure the Supabase Storage variables in `.env.development.local`, create the public bucket, then run `npm run storage:migrate-local`. The script uploads files from `public/assets/uploads/` with their existing keys and can be rerun safely.
- Uploaded files in local mode are served by `src/app/assets/uploads/[key]/route.ts` with `nosniff` and a sandboxing CSP.
- Cookie-authenticated mutation routes reject a supplied cross-origin `Origin`, and JSON mutation bodies have byte limits.

## Project structure

- `src/lib/domain`: patch types and patch/library operations.
- `src/lib/instrument`: shared layout types and instrument-specific, versioned layout data.
- `src/lib/instruments`: instrument definitions, switch adapters, and the synth registry.
- `src/lib/adapters`: validation and mapping for layout and patch JSON documents.
- `src/lib/storage`: local patch storage and layout-file persistence.
- `src/lib/api`: the browser's typed client for the app's API routes.
- `src/hooks`: data hooks for the synth catalog and the patch libraries (browser and account).
- `src/components`: interactive patch manager, instrument panel and synth editor.
- `src/app`: Next.js pages, API routes, and global styles.
- `src/i18n`: German and English UI messages and locale selection.

## License

Copyright © 2026 Michael Ilg

Source-available under the CV Patch Registry Source-Available License.
See LICENSE for details.
