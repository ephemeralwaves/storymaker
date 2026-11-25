# Design system

StoryMaker should feel like a desk at dusk: warm paper, soft corners, a lamp, and no sharp black or pure white in the default theme.

## Type

- Fraunces for titles and the manuscript (OFL)
- Nunito for interface text (OFL)
- Atkinson Hyperlegible when Clear type is on (OFL)

Shipped through Fontsource so the app does not call a font CDN.

## Tokens

Defined on `:root` in `apps/desktop/src/styles.css`.

- `--bg`, `--bg-deep`, `--paper`, `--ink`, `--muted`, `--accent`, `--line`
- `--radius` (22px), `--shadow`, `--font-scale`
- `--serif`, `--sans`, `--clear`

Themes set `document.documentElement.dataset.theme`.

| id | name | mood |
| --- | --- | --- |
| hearth | Hearth Parchment | warm paper, ember |
| moss | Moss and Lantern | green and cream |
| harbor | Harbor Ink | fog blue |
| blossom | Blossom Tea | petal and cocoa |
| candlelit | Candlelit Study | dark wood, honey type |
| plum | Royal Plum | evening violet |

Dark themes (`candlelit`, `plum`) set `color-scheme: dark` and lighten `--ink`.

## Cozy layer

- Paper grain is a fixed dot overlay (`.atmosphere`).
- Room tones are Web Audio noises, not audio files. Rain, hearth, library, forest, and cafe.
- "Light the lamp" starts a session word count. Resting the lamp shows a short summary.
- Streaks count consecutive days with new words. Copy never scolds a missed day.
- Lumen, the lantern-fox, is an original SVG used in the brand lockup and empty states.
- Warm lamp is a full-screen multiply wash. Reduced motion disables transitions.

## Components

Buttons are pills. Cards use `--paper`, `--radius`, and `--shadow`. Lists in People, Lore, Threads, and Hearth share `.list-item`. Focus mode hides the rail, binder, and context column so only the manuscript remains.
