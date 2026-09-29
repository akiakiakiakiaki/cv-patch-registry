# CV Patch Registry

CV Patch Registry is a browser based tool for creating and organizing analogue synthesizer patches. Choose a synth, adjust its controls using MIDI values from 0 to 127, toggle LEDs and switches, and draw patch cables between its inputs and outputs. Patch changes are saved automatically in the browser for the selected synth.

The app is structured to support multiple synthesizers. **Behringer Proton is currently the only implemented synth.** Its display name and versioned control layout are defined in `src/lib/instrument/behringer-proton/behringer-proton-layout.json`; the available instruments are registered in `src/lib/instruments/registry.ts`.

## Features

- Create, rename, select, and delete patches. Each patch has a last changed timestamp.
- Store patch libraries locally in the browser, separately for each synth.
- Download a synth's patch library as a versioned JSON file or import and merge one. Imports are checked for synth ID and data version; differing local and imported patches can be resolved during import.
- Draw patch cables by dragging between an input and an output in either direction. Each endpoint can be used by one cable at a time. Cable colors can be changed after creation.
- Use the instrument layout editor in development to adjust control positions.
- Switch between German and English; the browser's language setting selects the initial language.

## Run locally

Next.js 16 requires Node.js 20.9 or newer. The project uses Node 22.23.2 through `.nvmrc`.

```sh
nvm use
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>.

Environment files are local and are not committed. Start with `.env.example`, copy it to `.env.local`, and adjust the values there as needed. Next.js loads `.env.local` automatically.

## Instrument layout editor

Set `NEXT_PUBLIC_DEBUG_LAYOUT=true` in `.env.local` to show the layout editor controls, then restart the dev server. this allows for positioning every control element manually. The default in `.env.example` is `false`. Select an encoder, LED, switch, or patch point and use the arrow keys to adjust its position one layout unit at a time. Save the layout to write the positions to that instrument's JSON layout file. The current Proton layout is stored at `src/lib/instrument/behringer-proton/behringer-proton-layout.json`.

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
