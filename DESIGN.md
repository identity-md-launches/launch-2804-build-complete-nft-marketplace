# Squeek Market design system

## Overview

A dark marketplace for Squeek collectors comparing the live positions that travel with each NFT. Warm biscuit actions and a small hamster mark sit against olive charcoal surfaces. Real DotGrid art provides the collection’s color; the surrounding UI stays quiet. The collection, wallet control, listing action, search, and first NFTs appear on the first 390px screen.

The source of truth is `src/app/globals.css`; product patterns live in `src/components/Market.tsx`. The app deliberately uses one dark theme and English copy. It is a working marketplace interface, with short collection context rather than a separate marketing landing page.

## Colors

The CSS primitive ramp feeds semantic tokens. Components use the semantic roles; keep exact hex values rather than adding a parallel color notation.

| Role | Token | Value |
| --- | --- | --- |
| Page | `--bg` → `--neutral-950` | `#11130f` |
| Card / field / dialog | `--surface` → `--neutral-900` | `#191c16` |
| Hover / selected neutral | `--surface-hover` → `--neutral-850` | `#20241c` |
| Secondary neutral primitive | `--neutral-800` | `#282d23` |
| Control border | `--border` → `--neutral-700` | `#373d31` |
| Main text | `--text` → `--neutral-100` | `#f0f1e9` |
| Supporting text | `--muted` → `--neutral-400` | `#a7ae9d` |
| Main action fill | `--accent` → `--biscuit-300` | `#efc78e` |
| Main action hover / focus | `--accent-hover`, `--focus` → `--biscuit-200` | `#f8dba7` |
| Ready / successful | `--success` → `--green-300` | `#bfda9d` |
| Error / cancellation | `--danger` → `--red-300` | `#ffb2a5` |

Primary button text is `#241e13`. Structural dividers use quieter olive neutrals local to the section. Warning copy is `#f0c994`; statuses also carry text and icons. The DotGrid art and official wallet marks retain their own colors.

Calculated contrast for the implemented solid pairs is recorded in `artifacts/color-contrast.json`: main text/page 16.43:1, muted/page 8.17:1, muted/card 7.53:1, primary button 10.42:1, success/card 11.26:1, and error/card 9.98:1. The browser probe separately measures rendered pairs; text over image regions is explicitly outside that probe’s solid-background calculation.

## Typography

DM Sans is bundled locally at `public/fonts/dm-sans-latin.woff2`, with Arial and generic sans-serif fallbacks. It is a variable font; the UI uses weights 400, 600, and 700. Its OFL is beside the font. No remote font request is needed. The export script rewrites the compiled CSS reference to `../media/` so the font also loads under a gateway subpath.

The entire scale contains six sizes:

| Token | Size | Usage |
| --- | --- | --- |
| `--text-sm` | 14px / .875rem | Metadata, support copy, compact actions |
| `--text-base` | 16px / 1rem | Body, form inputs, mobile card title |
| `--text-md` | 18px / 1.125rem | Card titles, compact figures |
| `--text-lg` | 24px / 1.5rem | Section headings, desktop facts, detail figures |
| `--text-xl` | 32px / 2rem | Mobile and intermediate main headings |
| `--text-display` | 44px / 2.75rem | Desktop main heading |

Body line height is 1.5; headings use 1.15 and balanced wrapping. Main headings use −.045em tracking on desktop and −.04em on phones; smaller heading tracking is −.02em or −.01em. Prose uses natural casing and no tracked-capital labels. Long descriptions cap at about 65 characters where relevant. Inputs remain 16px on phones. Prices, powers, rewards, and block values use tabular numbers. Full addresses and exact reward values wrap with `overflow-wrap:anywhere`; card abbreviations expose the full address through a title and the detail page.

## Layout

The page, header, and footer share a centered 1360px outer width and 40px inline padding. Above 1500px, the outer width becomes 1480px. Grouping uses 4/8/12/16/20/24/28/32/40/64px spacing, with larger gaps between sections than between related labels and values.

- Wide screens: a compact collection intro with decorative NFT art, four collection facts, a view navigation bar, and controls above a 200px filter sidebar plus a three-column NFT grid. Above 1500px the NFT grid has four columns.
- At 1100px and below: 28px page gutters, a 180px sidebar, and two grid columns. Decorative intro art is hidden because its full fan no longer fits; product controls keep the space.
- At 800px and below: the header navigation is replaced by the collection view navigation. Filters move into an explicit disclosure above the results; search, sort, and layout controls remain visible. The sidebar disappears.
- At 600px and below: 16px gutters, the hero art and repeated collection identity are hidden, three compact facts remain, and the collection navigation has 58px targets. Search plus Filters occupy one row; sort and grid/list controls occupy the next. The grid has two columns, with power and reward values stacked beneath their labels.
- At 350px and below: each token becomes a horizontal row in a one-column collection. The main heading can wrap. Filter fields use one column.

Detail pages use two columns for the large image and trading panel, then two columns of supporting data. Both become single columns at 600px. The mobile wallet/import dialog is a bottom sheet with safe-area padding; desktop dialogs are centered and at most 460px wide. Activity rows drop the secondary address column on phones. These are content-driven adaptations, not alternate pages.

The first focusable control is **Skip to content**. It prevents hash navigation, focuses the existing `main#main-content` (`tabIndex={-1}`), and scrolls it into view while preserving the current detail, portfolio, or activity route. It reuses the existing focus token and 2px focus-visible indicator.

The tested export uses hash routes (`#explore`, `#portfolio`, `#activity`, `#squeek/ID`, and shared `#order=` links) so static hosts need no route rewrite. Filters apply to the explicitly labeled loaded page; imported listings have their own browser-local collection.

## Elevation & Depth

The interface is flat: cards, fields, and selection states use borders and tonal changes, without card shadows. Dialogs alone use `0 24px 100px #0008` and a dark native backdrop, with no dialog border. Image elements get a one-pixel translucent white outline inside their bounds. The decorative fan uses rotation as the collection’s one depth treatment and is omitted at narrower widths.

Native `<dialog>` places overlays in the top layer, traps focus, and makes background content inert. The previous focused control is restored on close. Escape and the visible close button dismiss the dialog. Overflow belongs to the dialog content; body content remains reachable.

## Shapes

Canonical radius tokens are 8px (`--radius-sm`), 12px (`--radius`), and 20px (`--radius-lg`). Buttons and fields use 8px, desktop NFT cards 12px, and large art/dialog surfaces 20px. Nested art corners become smaller with their padding. Phone cards use 10px with 5px inner art; dialog bottom sheets retain rounded upper corners. Icon affordances may be circular; square utility buttons keep the standard 8px radius.

## Components

| Component / source | Reuse and states |
| --- | --- |
| `ConnectButton`, `Providers.tsx` | One global wallet control. Disconnected label, connected short address, wrong-chain label, account/disconnect sheet. EIP-6963 names and icons precede Coinbase; phones show app-opening rows and Coinbase Smart Wallet. Provider errors remain visible. |
| `Modal.tsx` | Native modal with title, close button, Escape, focus restoration, inert background, and responsive bottom-sheet layout. Used for wallet and order import. |
| `TokenCard`, `Market.tsx` | Real NFT image, level, active power, rewards, cooldown, expandable position/ownership, price or honest unlisted state. `layout` chooses grid or horizontal list. The art link’s accessible name includes its visible level. |
| `FilterFields`, `Market.tsx` | The same labeled native inputs/selects in desktop sidebar and mobile disclosure. Includes reset, numeric constraints, status choices, and loaded-page scope. |
| `TokenImage`, `Market.tsx` | Isolated image element using on-chain data only, with meaningful alt text and stable aspect ratio. It never injects SVG markup. `large` selects the detail treatment. |
| `TradePanel.tsx` | Availability/price, owner listing form, separate approval and EIP-712 signing steps, purchase review, explicit confirmation, cancellation, and export/share. `inactiveReason` labels a saved seller order whose availability could not be verified; revoked approval keeps cancellation visible with a saved asking price. Loading, simulation result, wallet prompt, receipt, rejection, and failure have text states. Wrong-chain actions stop. |
| `Empty`, `Market.tsx` | Small hamster mark, concrete explanation, one recovery action. Used for filters, order book, disconnected portfolio, and unavailable tokens. |
| Buttons and fields, `globals.css` | Neutral default, biscuit primary, danger text variant, full-width option, and icon-only utility. Controls provide hover, pressed, disabled, and 2px focus-visible states. Native semantics supply keyboard behavior. |

The **Your inactive orders** section (`Market.tsx`, `.inactive-orders`) appears in Listed only for the connected offerer. It reuses `.data-table`, `.text-link`, `.fine`, `.muted`, and `.warning-text`; its only added spacing is 20px block margin, 8px below the heading, and 12px below the explanation. It links to the existing detail cancellation action and is separate from active buyer listings. Saved snapshots identify their historical block/date and ask for a refresh; live captions describe the 12-confirmation policy **at refresh time**.

Cards truncate reward display to six decimals but expose the exact 18-decimal value on detail. Tiny nonzero values are shown as below the display precision rather than zero. The detail also shows the remaining scaled sub-base-unit fraction. Data is never replaced by decorative samples in loading or error states.

Hover treatment is guarded by pointer capability. Under `prefers-reduced-motion: no-preference`, buttons use only background, border, and transform transitions at 120ms; press scale is .96. Card border feedback is 150ms. There is no entrance sequence, autoplay, or endless motion.

## Do’s and Don’ts

- Start another view inside `.page-container`, retain one `h1`, use the six-size scale, and reuse the existing navigation and recovery states.
- Use the biscuit fill for the view’s main wallet or transaction action; secondary actions stay neutral. Ready status uses green with an explicit label.
- Keep chain identity, snapshot age, royalty, ownership, and execution-time caveats adjacent to the action they qualify. Never style saved data as live.
- Keep the collection’s actual DotGrid art. Do not substitute generated NFT thumbnails or invented prices.
- Reuse `FilterFields` and the `TokenCard` pattern rather than creating a second filter or card vocabulary.
- Do not add card shadows, background glows, remote fonts, or extra typography scales. Do not clip full addresses or exact transaction amounts.
- Preserve wallet discovery, mobile app rows, native dialog semantics, keyboard focus, and reduced-motion behavior when extending a screen.

Rendered verification and remaining native-device, screen-reader, zoom, and WebKit limits are documented in `artifacts/validation.md`; this document describes the implemented source rather than claiming those unperformed checks passed.
