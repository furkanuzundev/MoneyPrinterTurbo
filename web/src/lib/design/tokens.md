# Design Tokens

Binding source: `.superpowers/sdd/design-system.md`. This file documents the
tokens as wired into `web/src/app/globals.css` (`@theme`) and
`web/src/app/layout.tsx` (`next/font/google`). No new colors or fonts are
added beyond what's listed here.

## Color

Editing suite at night — ink (not pure black), signature caption-yellow accent
(subtitle color), no second accent.

| Token       | Hex       | Utility                          | Usage                                   |
| ----------- | --------- | --------------------------------- | ---------------------------------------- |
| `ink`       | `#111420` | `bg-ink`, `text-ink`               | Base background                          |
| `panel`     | `#191D2B` | `bg-panel`                         | Raised surfaces (cards/panels)           |
| `line`      | `#2A2F42` | `border-line`                      | Borders/dividers                         |
| `bone`      | `#EDEDE6` | `text-bone`, `bg-bone`             | Primary text (warm off-white)            |
| `muted`     | `#9BA0B4` | `text-muted`                       | Secondary text                           |
| `caption`   | `#FFD84D` | `bg-caption`, `text-caption`       | Sole accent: CTAs, active state, caption chips |

## Typography

| Role      | Font                 | Variable            | Utility           | Usage                                  |
| --------- | -------------------- | -------------------- | ------------------ | --------------------------------------- |
| Display   | Bricolage Grotesque (700/800) | `--font-bricolage`  | `font-display`      | Headings, hero (-2% letter-spacing)     |
| Body/UI   | Instrument Sans (400/500/600) | `--font-instrument` | `font-sans`         | Default body/UI text                    |
| Data/Mono | IBM Plex Mono (400/500)       | `--font-plex-mono`  | `font-mono-data`    | Credit counts, durations, ETA, progress %|

## Signature elements

1. **Caption chip** — `<CaptionChip>` (`web/src/components/ui.tsx`): subtitle-style
   label, `bg-caption text-ink font-bold px-2 py-0.5 rounded-md rotate-[-1deg]`.
   Used for hero highlights, price tags, credit badges.
2. **Live 9:16 preview card** (landing hero, later task): pure CSS animation,
   three caption chips cycling in sequence + thin progress bar. No JS;
   static first frame under `prefers-reduced-motion`.
3. **Timeline strip** ("How it works", later task): horizontal strip of 4 clip
   blocks (Topic → Script → Footage → Post-ready) with a playhead line.

## Constraints

- Border radius: 16px for cards, 6px (`rounded-md`) for chips.
- No shadows — depth comes from `line`/`ink`/`panel` contrast only.
- Animation limited to the hero card + hover micro-transitions; no JS animation
  libraries.
- Visible focus ring in `caption` color; respect `prefers-reduced-motion`;
  fluid down to 360px viewports.

## Primitives

`web/src/components/ui.tsx` exports `Button` (`variant="primary"|"ghost"`),
`Card`, `CaptionChip`, and `MonoStat` (`label`, `value`). All accept
`className` passthrough. Later tasks must use these instead of ad hoc styling.
