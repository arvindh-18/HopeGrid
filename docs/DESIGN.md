---
version: alpha
name: "Woba Platform"
description: "A modern HR and HSE risk-detection platform built on a warm neutral canvas punctuated by electric lime voltage. Near-black ink type in the proprietary Alt Riviera face carries editorial weight, while generous rounded corners and a restrained dark-mode nav create approachable authority. The brand lives in CTAs, accent highlights, and toggle active states."

colors:
  # Brand
  primary: "#c7eb08"
  primary-dark: "#a5c406"
  primary-active: "#9ab305"
  accent: "#014adb"

  # Surface
  canvas: "#f4f4f4"
  surface-soft: "#c7eb08"
  surface-strong: "#e6e6e6"
  surface-elevated: "#ffffff"
  surface-dark: "#212121"
  surface-dark-hover: "#1e1e1e"
  overlay: "rgba(0, 0, 0, 0.7)"

  # Text
  ink: "#000000"
  body: "#222222"
  body-secondary: "#212121"
  muted: "#979797"
  muted-strong: "#5d5d5d"
  muted-soft: "#d0d0d0"
  on-primary: "#000000"
  on-dark: "#ffffff"
  on-surface: "#2b2f1a"

  # Hairlines & Borders
  hairline: "#d0d0d0"
  hairline-dark: "#888888"
  border-strong: "#212121"

  # Semantic
  error: "#c13515"
  success: "#2c622c"
  link: "#014adb"
  link-active: "#003d8c"
  toggle-off: "#888888"
  toggle-track: "#e6e6e6"

typography:
  display-xl:
    fontFamily: "Altriviera, Arial, sans-serif"
    fontSize: "64px"
    fontWeight: "300"
    lineHeight: "1.1"
    letterSpacing: "-0.96px"
  display-lg:
    fontFamily: "Altriviera, Arial, sans-serif"
    fontSize: "54px"
    fontWeight: "400"
    lineHeight: "1"
    letterSpacing: "-0.81px"
  title-lg:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "32px"
    fontWeight: "400"
    lineHeight: "1.15"
    letterSpacing: "-0.32px"
  title-md:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "27px"
    fontWeight: "500"
    lineHeight: "1.2"
    letterSpacing: "-0.405px"
  title-sm:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "20px"
    fontWeight: "600"
    lineHeight: "1.3"
    letterSpacing: "-0.15px"
  body-md:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "1.5"
    letterSpacing: "-0.16px"
  body-sm:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "1.45"
    letterSpacing: "-0.14px"
  caption:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "1.38"
    letterSpacing: "-0.12px"
  button:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "14px"
    fontWeight: "500"
    lineHeight: "1.25"
    letterSpacing: "0"
  label-md:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "1.4"
    letterSpacing: "0"
  modal-title:
    fontFamily: "\"Alt Riviera\", Arial, sans-serif"
    fontSize: "24px"
    fontWeight: "400"
    lineHeight: "1.3"
    letterSpacing: "-0.24px"

rounded:
  xs: "3px"
  sm: "5px"
  DEFAULT: "16px"
  md: "100px"
  lg: "720px"
  pill: "999px"
  full: "9999px"

spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "32px"
  section-sm: "40px"
  section: "48px"
  section-lg: "56px"
  hero: "80px"

extensions:
  shadows:
    sm: "rgba(0, 0, 0, 0.25) 0px 0px 0px 0px"
    md: "0 4px 16px rgba(0, 0, 0, 0.12)"
    lg: "0 16px 48px rgba(0, 0, 0, 0.18)"
    overlay: "0 8px 32px rgba(0, 0, 0, 0.25)"
  motion:
    duration: "300ms"
    easing: "cubic-bezier(0.6, 0.6, 0, 1)"
    level: "moderate"
  icons: "custom"
  framework: "unknown"
  mode: "light"
  fontPairings:
    - head: "Altriviera"
      sub: null
      body: "Alt Riviera"

components:
  top-nav:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-sm}"
    height: "72px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    padding: "{spacing.sm} {spacing.md}"
  nav-link-active:
    backgroundColor: "transparent"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
  nav-button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.hero} {spacing.xxl}"
  hero-headline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
  hero-subtext:
    backgroundColor: "transparent"
    textColor: "{colors.body-secondary}"
    typography: "{typography.body-md}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-primary-active:
    backgroundColor: "{colors.surface-dark-hover}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-secondary-active:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.border-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.DEFAULT}"
    padding: "12px 24px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.body-secondary}"
    typography: "{typography.body-md}"
    padding: "0"
  modal-overlay:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.ink}"
  modal-card:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.DEFAULT}"
    padding: "{spacing.xl} {spacing.section-lg}"
  modal-title:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.modal-title}"
  modal-body:
    backgroundColor: "transparent"
    textColor: "{colors.body-secondary}"
    typography: "{typography.body-md}"
  modal-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  modal-link-inline:
    backgroundColor: "transparent"
    textColor: "{colors.link}"
    typography: "{typography.body-md}"
  consent-banner:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.body-secondary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.DEFAULT}"
    padding: "{spacing.xl} {spacing.section-lg}"
  consent-decline-btn:
    backgroundColor: "transparent"
    textColor: "{colors.border-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.DEFAULT}"
    padding: "14px 32px"
  consent-accept-btn:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.DEFAULT}"
    padding: "14px 32px"
  consent-category-label:
    backgroundColor: "transparent"
    textColor: "{colors.body-secondary}"
    typography: "{typography.label-md}"
  consent-toggle-track:
    backgroundColor: "{colors.toggle-track}"
    textColor: "{colors.muted-soft}"
    rounded: "{rounded.pill}"
  consent-toggle-thumb:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
  consent-toggle-active:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  consent-toggle-disabled:
    backgroundColor: "{colors.toggle-track}"
    textColor: "{colors.muted-soft}"
    rounded: "{rounded.pill}"
  text-input:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
    height: "44px"
  text-input-focus:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  card-default:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    padding: "{spacing.section} {spacing.xxl}"
  logo-mark:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
---

# Woba Platform Design System

## Overview

Woba's design language is defined by its striking contrast between warmth and precision: a soft neutral canvas in `{colors.canvas}` hosts near-black `{colors.ink}` type set in the proprietary **Alt Riviera** family, while an electric lime `{colors.primary}` delivers brand voltage exactly where it counts — on secondary CTAs, toggle active states, and accent moments. The system feels simultaneously approachable and authoritative, like a Scandinavian SaaS product that respects the user's intelligence without sacrificing clarity.

The dominant typographic move is restraint. Display headings top out at 54px (`{typography.display-lg}`) with a modest 400 weight, relying on generous negative letter-spacing rather than heaviness for presence. Body copy sits at 15px with tight tracking (-0.16px), creating a dense but readable texture that feels editorial rather than utilitarian. The shape vocabulary is unusually varied — `{rounded.lg}` (720px) creates nearly circular card containers on hero imagery, while `{rounded.pill}` (999px) gives every CTA a friendly capsule silhouette.

Two sub-systems are visible in this view: the main editorial surface (canvas + ink + lime accents) and the consent/banner dialect (white elevated cards with dark forest-green confirmation actions). The navigation operates in inverted mode — `{colors.surface-dark}` background with `{colors.on-dark}` text — creating a persistent anchor that reads as both premium and functional.

**Key Characteristics:**
- Electric lime `{colors.primary}` (#c7eb08) as sole brand voltage — never gradients, never paired with complementary hues
- Dual-font family: **Altriviera** for display/hero scale, **Alt Riviera** (quoted variant) for everything else
- Pill-shaped CTAs (`{rounded.pill}`) with asymmetric padding — wider than tall, breathing room for fingers and eyes
- Dark-mode navigation band (`{component.top-nav}`) floating above light canvas — consistent elevation anchor
- Consent modal using forest-green `{colors.success}` for acceptance — distinct from brand lime, signaling legal gravity
- Toggle switches with `{colors.surface-soft}` (lime) active state — brand color doubles as feedback signal
- Generous corner radii up to `{rounded.lg}` (720px) — nearly full circles for image masks and feature cards
- Negative letter-spacing throughout type scale — tighter than typical web defaults, more editorial feel
- Section vertical rhythm anchored at `{spacing.section-lg}` (56px) and `{spacing.hero}` (80px)

## Colors

### Brand & Accent

- **Primary** (`{colors.primary}` — #c7eb08): Electric lime used on secondary CTAs (`{component.button-secondary}`), toggle active states (`{component.consent-toggle-active}`), and accent highlights. This is the sole brand color — it appears nowhere else in the system.
- **Primary Dark** (`{colors.primary-dark}` — #a5c406): Pressed/deeper state for lime surfaces, used when `{colors.primary}` needs to recede or indicate activation depth.
- **Primary Active** (`{colors.primary-active}` — #9ab305): Deepest lime tone, reserved for focused or actively pressed states of primary-colored elements.
- **Accent Blue** (`{colors.accent}` — #014adb): Link color and interactive highlight, appearing only on inline links within modals and body copy. Provides functional contrast to lime without competing.

### Surface

- **Canvas** (`{colors.canvas}` — #f4f4f4): Page-level background for hero bands and main content areas. Warm neutral, not pure white — reduces glare and feels organic.
- **Surface Soft** (`{colors.surface-soft}` — #c7eb08): Alias for primary color when used as a surface (toggle tracks, accent panels). Same hex as `{colors.primary}`, separate token for semantic clarity.
- **Surface Strong** (`{colors.surface-strong}` — #e6e6e6): Subtle dividers, disabled track backgrounds, and subtle container fills. Barely darker than canvas, provides gentle layering.
- **Surface Elevated** (`{colors.surface-elevated}` — #ffffff): Cards, modals, dropdowns, inputs — anything that floats above canvas. Pure white for maximum contrast against `{colors.canvas}`.
- **Surface Dark** (`{colors.surface-dark}` — #212121): Navigation bar background and primary button fills. Near-black with slight warmth, softer than `#000000`.
- **Surface Dark Hover** (`{colors.surface-dark-hover}` — #1e1e1e): Hover state for dark surfaces, marginally lighter than base to show interaction response.
- **Overlay** (`{colors.overlay}` — rgba(0, 0, 0, 0.7)): Modal backdrop scrim. 70% opacity balances focus-on-modal with visible underlying context.

### Text / Ink

- **Ink** (`{colors.ink}` — #000000): Pure black for headlines and highest-emphasis text. Used in `{component.hero-headline}`, `{component.modal-title}`, and the logo mark.
- **Body** (`{colors.body}` — #222222): Standard reading text, slightly softened from pure black. Default for paragraphs in `{component.modal-body}` and general body copy.
- **Body Secondary** (`{colors.body-secondary}` — #212121): Alternative body shade, nearly identical to `{colors.body}` — appears in subtexts and secondary descriptions where subtle differentiation is needed.
- **Muted** (`{colors.muted}` — #979797): Disabled states, timestamps, metadata, footer text. Clearly subordinate to body text.
- **Muted Strong** (`{colors.muted-strong}` — #5d5d5d): Placeholder text in inputs, subtle labels that need more presence than `{colors.muted}`.
- **Muted Soft** (`{colors.muted-soft}` — #d0d0d0): Very light text for decorative or extremely low-emphasis contexts — divider lines rendered as text, etc.
- **On Primary** (`{colors.on-primary}` — #000000): Text atop lime surfaces ({`colors.primary}`). Black passes AA contrast against #c7eb08.
- **On Dark** (`{colors.on-dark}` — #ffffff): White text for navigation, primary buttons, and anything on `{colors.surface-dark}` backgrounds.
- **On Surface** (`{colors.on-surface}` — #2b2f1a): Deep olive-drab, likely used for text on very light lime-tinted surfaces or specialized contexts.

### Hairlines & Borders

- **Hairline** (`{colors.hairline}` — #d0d0d0): Default border color for outlined buttons, input fields, and card edges. Matches `{colors.muted-soft}` intentionally.
- **Hairline Dark** (`{colors.hairline-dark}` — #888888): Mid-tone borders for elements needing more definition than hairline — toggle inactive tracks, stronger dividers.
- **Border Strong** (`{colors.border-strong}` — #212121): Heavy borders matching `{colors.surface-dark}`. Used on decline buttons and outline CTAs that need significant visual weight.

### Semantic

- **Error** (`{colors.error}` — #c13515): Validation failures, destructive action warnings. Not observed in this viewport but present in palette.
- **Success** (`{colors.success}` — #2c622c): Forest green used specifically for the "Accept All" consent button (`{component.consent-accept-btn}`). Distinct from brand lime to convey legal/formal gravity.
- **Link** (`{colors.link}` — #014adb): Inline clickable text, matching `{colors.accent}`. Underlined or colored only, no background.
- **Link Active** (`{colors.link-active}` — #003c8c): Visited or pressed link state, deeper blue for recognition.
- **Toggle Off** (`{colors.toggle-off}` — #888888): Inactive toggle thumb/track fill. Neutral gray indicating "off" without negative connotation.
- **Toggle Track** (`{colors.toggle-track}` — #e6e6e6): Background rail for toggle switches when off/inactive. Matches `{colors.surface-strong}`.

## Typography

### Font Family

The system employs two faces from the same type family with distinct naming conventions in the source:

**Altriviera** (unquoted, Title Case) serves display and headline roles — the H1-equivalent at 54px (`{typography.display-lg}`), H4 white-on-dark headings at 32px (`{typography.title-lg}`), and any text requiring maximum presence. This variant includes Light (300), Regular (400), Medium (500), and Bold (700) cuts loaded via WOFF and OTF sources from Woba's CDN.

**"Alt Riviera"** (quoted, mixed case) handles everything else: body copy at 15px (`{typography.body-md}`), titles at 27px (`{typography.title-md}`), small labels, captions, buttons, and UI chrome. The Regular (400) cut dominates; Medium (500) and Semi-Bold (600) appear sparingly for emphasis.

Both fall back to `Arial, sans-serif`. The dual-naming pattern suggests different @font-face declarations — possibly different file formats or vendor-delivered subsets. Implementation should treat them as a single family with style-linked weights where possible.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 64px | 300 | 1.1 | -0.96px | Hero headlines (inferred max) |
| `{typography.display-lg}` | 54px | 400 | 1.0 | -0.81px | Main hero headline, H1 |
| `{typography.title-lg}` | 32px | 400 | 1.15 | -0.32px | Section headings on dark backgrounds |
| `{typography.title-md}` | 27px | 500 | 1.2 | -0.405px | Modal titles, H2 |
| `{typography.title-sm}` | 20px | 600 | 1.3 | -0.15px | Small section headings, H3 |
| `{typography.body-md}` | 15px | 400 | 1.5 | -0.16px | Paragraphs, body copy, standard text |
| `{typography.body-sm}` | 14px | 400 | 1.45 | -0.14px | Secondary body, fine print |
| `{typography.caption}` | 13px | 400 | 1.38 | -0.12px | Metadata, timestamps, footnotes |
| `{typography.button}` | 14px | 500 | 1.25 | 0 | Button labels, CTAs |
| `{typography.label-md}` | 15px | 400 | 1.4 | 0 | Form labels, toggle category names |
| `{typography.modal-title}` | 24px | 400 | 1.3 | -0.24px | Modal/dialog headings |

### Principles

The typography system trusts size and letter-spacing over weight to create hierarchy. Note that `{typography.display-lg}` sits at 54px with weight 400 — no boldness, just scale and aggressive tracking (-0.81px). This is a deliberate editorial choice: the typeface itself carries enough character that bolding would cheapen it. When emphasis is needed, the system reaches for `{typography.title-md}` at 500 weight or `{typography.title-sm}` at 600 — modest bumps, never heavy.

Negative letter-spacing is applied consistently from display down through body (-0.16px at 15px). This tightens word shapes and gives the text a bespoke, almost custom-lettered quality. It also means line lengths should be carefully managed — tight tracking on long lines reduces readability.

Color does minimal hierarchical work beyond the obvious (dark nav vs light body). There are no mixed-color spans in headings, no gradient text, no decorative initial caps. The system's voice comes from typeface choice, scale, and spatial arrangement alone.

Uppercase is reserved exclusively for button labels in `{typography.button}` ("DECLINE ALL", "ACCEPT ALL") — and even then, it's the button's semantic role demanding uppercase, not the typography system. Headline casing follows sentence case convention.

### Note on Font Substitutes

**Alt Riviera / Altriviera** is a proprietary typeface (likely commissioned or exclusive to Woba). For development environments without access to the licensed fonts, substitute with **DM Sans** (Google Fonts) for body/UI roles and **Plus Jakarta Sans** or **Outfit** for display headings. Both share Alt Riviera's geometric-humanist skeleton with similar x-height proportions.

Define CSS variables:
```css
:root {
  --font-display: 'Altriviera', 'Plus Jakarta Sans', 'Outfit', sans-serif;
  --font-body: 'Alt Riviera', 'DM Sans', sans-serif;
}
```

## Layout

### Spacing System

- **Base unit:** 8px (implied by `{spacing.sm}`), with most tokens deriving from 4px and 8px multiples.
- **Tokens:** `{spacing.xxs}` (2px — micro-offsets), `{spacing.xs}` (4px — icon gaps), `{spacing.sm}` (8px — internal element spacing), `{spacing.md}` (12px — compact padding), `{spacing.base}` (16px — standard padding), `{spacing.lg}` (20px — comfortable padding), `{spacing.xl}` (24px — card internal padding), `{spacing.xxl}` (32px — most common gap, section margins), `{spacing.section-sm}` (40px — minor section breaks), `{spacing.section}` (48px — standard vertical rhythm), `{spacing.section-lg}` (56px — major section breaks), `{spacing.hero}` (80px — hero band vertical padding).
- **Section padding (vertical):** `{spacing.hero}` (80px) for hero bands, `{spacing.section-lg}` (56px) for standard content sections.
- **Card internal padding:** `{spacing.xl}` (24px) horizontal and vertical for `{component.card-default}`, `{spacing.xl}` to `{spacing.section-lg}` for modals depending on density.
- **Gutters:** `{spacing.xxl}` (32px) between grid columns in multi-column layouts; `{spacing.base}` to `{spacing.lg}` between adjacent inline elements (button pairs, label-input groups).

### Grid & Container

- Max content width: **1440px** (extracted from section container). Content centers within viewport beyond this.
- Editorial density: generous whitespace between blocks, single-column hero text with ~60% width allocation leaving room for imagery.
- Desktop grid behavior: hero section uses asymmetric split — text column left (~50-60%), image/illustration right. Below-fold sections likely use 2-3 column cards.
- Hero column splits: headline + subtext + CTA stack left-aligned in left column, laptop/product photography right-aligned with overlap potential.

### Whitespace Philosophy

The system embraces editorial airiness. Vertical rhythm is deliberate and generous — 56-80px between major sections prevents visual crowding despite information density. Horizontal padding in modals and cards (up to 56px) ensures text columns never feel cramped. This is not a dashboard-density product; it's a marketing/explanation surface that uses space to guide attention.

### Header Architecture

```
[Logo]                    [Platform] [Solutions ▾] [Pricing] [Use Cases] [Resources] [About Us]     [EN ▾] [Log In ▾] [Book a demo]
← 1440px max-width centered →
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘  height: 72px
   surface-dark (#212121) background, on-dark text, pill-shaped primary CTA
```

### Hero Section

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Detect risks early.              ┌─────────────────────────────────┐   │
│  Turn signals into action.        │                                 │   │
│                                   │     Laptop/Product Photo        │   │
│  A platform for proactive         │     (rounded-corners mask)       │   │
│  HR and HSE teams                 │     with lime accents            │   │
│                                   │                                 │   │
│  Collect continuous employee...   │                                 │   │
│                                   └─────────────────────────────────┘   │
│  [Book a demo →]  [Secondary]                                          │
│                                                                          │
│  padding: 80px vertical, 32px horizontal                                │
│  canvas (#f4f4f4) background                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Consent Modal Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  You control your data                              [× close]  │
│                                                                 │
│  We and our business partners use technologies, including       │
│  cookies, to collect information about you for various          │
│  purposes...                                                    │
│                                                                 │
│  Read more about cookies                                        │
│  Show details ▾                                                 │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────────────────────────┐  │
│  │  DECLINE ALL    │  │  ACCEPT ALL                         │  │
│  └─────────────────┘  └─────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌───────────┐   │
│  │ Necessary│  │ Functional│  │ Statistical│  │ Marketing │   │
│  │  [===●]  │  │   [○==]   │  │   [○==]    │  │   [○==]   │   │
│  └──────────┘  └───────────┘  └────────────┘  └───────────┘   │
│                                                                 │
│                          powered by CookieInformation           │
│  rounded: 16px, padding: 24px/56px, surface-elevated bg        │
└─────────────────────────────────────────────────────────────────┘
```

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (Flat) | No shadow, `{colors.canvas}` or transparent background | Base page surface, hero band |
| 1 (Raised) | Minimal shadow (`{shadows.sm}`), `{colors.surface-elevated}` background | Cards, input containers |
| 2 (Floating) | Medium drop (`{shadows.md}`), `{colors.surface-elevated}` background | Dropdowns, tooltips |
| 3 (Modal) | Overlay scrim + strong shadow (`{shadows.overlay}`), `{colors.surface-elevated}` background | Consent banner, dialogs |
| 4 (Nav Bar) | No shadow, solid `{colors.surface-dark}` background | Persistent top navigation |

The system favors color-block elevation over shadow-based depth. Modals and floating elements lift primarily through background contrast (white on gray canvas, or white on dark scrim) rather than dramatic shadows. When shadows do appear, they're neutral-toned — no cool blue or warm amber tints, just honest darkness.

### Decorative Depth

The hero section's laptop photograph appears to be masked with `{rounded.lg}` (720px radius — essentially a circle/squircle), creating a "window into product" effect that feels more integrated than a rectangular frame would. The lime `{colors.primary}` accent visible on screen within the photo ties the imagery back to the brand color system.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 3px | Subtle inner corners, badge containers |
| `{rounded.sm}` | 5px | Input fields, small contained elements |
| `{rounded.DEFAULT}` | 16px | Default card radius, modal containers, outlined buttons |
| `{rounded.md}` | 100px | Wide pill/horizontal capsule shapes (unusual, may be legacy) |
| `{rounded.lg}` | 720px | Image masks, feature cards — effectively circular/squircular |
| `{rounded.pill}` | 999px | Full pill/CTA buttons, toggle tracks |
| `{rounded.full}` | 9999px | Avatar circles, perfect circles (theoretical) |

### Photography Geometry

Hero imagery (laptop mockup) uses `{rounded.lg}` (720px) corner radius, producing a squircle mask that softens the technology-product aesthetic. The image appears to sit on the right side of the hero band with possible slight overlap or close proximity to the text column. No aspect ratio constraints were explicitly extractable, but the composition suggests roughly 4:3 or 16:10 landscape orientation for device photography.

## Components

> **No hover states documented.** Hover behavior is unreliable to extract from a single screenshot. State variants live as separate entries in the `components:` frontmatter (e.g. `{component.button-primary-active}`, `{component.text-input-focus}`); add hover styling at implementation time per your stack's conventions.

### Buttons

**`{component.top-nav}`** — The persistent navigation bar anchoring every page. Background `{colors.surface-dark}` (#212121), text `{colors.on-dark}` (#ffffff), height 72px. Contains logo mark left, navigation links center, utility actions right (language selector, login, primary CTA). No visible border or shadow — relies on color contrast for separation from canvas below. Transforms vertically on mobile menu open (`transform 0.75s ease`).

**`{component.nav-link}`** — Navigation menu items within the top bar. Transparent background, `{colors.on-dark}` text, `{typography.body-md}` sizing. Padding `{spacing.sm} {spacing.md}`. On desktop these are inline text links; on mobile they stack vertically in a dropdown panel.

**`{component.nav-button-primary}`** — "Book a demo" CTA in the navigation bar. Background `{colors.ink}` (pure black), text `{colors.on-dark}`, `{typography.button}` sizing, `{rounded.pill}` shape. Padding `10px 20px` — slightly more compact than hero CTAs due to nav height constraints. State variant: `{component.nav-button-primary-active}` uses `{colors.surface-dark-hover}`.

**`{component.button-primary}`** — Primary call-to-action for conversion moments. Background `{colors.ink}`, text `{colors.on-dark}`, pill-shaped (`{rounded.pill}`), generous padding `14px 28px`. Appears as "Book a demo →" in hero context. Includes arrow indicator (icon) after text. Active state: `{component.button-primary-active}` darkens to `{colors.surface-dark-hover}`.

**`{component.button-secondary}`** — Lime-branded alternative CTA. Background `{colors.primary}` (#c7eb08), text `{colors.on-primary}` (black for contrast), same pill shape and padding as primary. Creates visual hierarchy when paired with primary — secondary reads as lighter/friendlier option. Active state: `{component.button-secondary-active}` shifts to `{colors.primary-dark}`.

**`{component.button-outline}`** — Bordered ghost button for lower-priority actions. Transparent background, `{colors.border-strong}` text/color, `{rounded.DEFAULT}` (16px) corners — notably less rounded than primary/secondary CTAs. Padding `12px 24px`. Used for "Decline All" in consent context where the action is deliberately de-emphasized.

**`{component.button-text}`** — Naked text button for tertiary actions. Transparent background, `{colors.body-secondary}` text, no padding (inline flow), `{typography.body-md}` sizing. Used for "Show details", "Hide details", "Read more about cookies" links within modal body. Relies entirely on color and cursor change for affordance.

### Cards & Containers

**`{component.hero-band}`** — Full-width hero section container. Background `{colors.canvas}` (#f4f4f4), contains headline, subtext, and CTA group. Vertical padding `{spacing.hero}` (80px). No visible border or shadow — blends seamlessly with page body.

**`{component.modal-overlay}`** — Full-viewport scrim behind modals. Background `{colors.overlay}` at 70% opacity. Covers entire viewport, traps focus to modal child.

**`{component.consent-banner}`** — The cookie consent modal/card. Background `{colors.surface-elevated}` (white), text `{colors.body-secondary}`, `{typography.body-md}` for body copy. Rounded `{rounded.DEFAULT}` (16px). Generous padding `{spacing.xl} {spacing.section-lg}` (24px/56px). Centers in viewport with `{shadows.overlay}` depth. Contains title, body text, links, action buttons row, and toggle categories row.

**`{component.modal-card}`** — Generic elevated container for any dialog/drawer. White background, standard body text color, 16px radius, 24px/56px padding. Reusable for future dialogs beyond consent.

**`{component.card-default}`** — Standard content card for features, testimonials, or info blocks. White background, `{rounded.lg}` (720px — highly rounded, nearly circular), `{spacing.xl}` internal padding. Likely used for feature cards below the fold.

**`{component.footer}`** — Page footer container. Canvas background, muted text, body-sm typography. Padding `{spacing.section} {spacing.xx}` (48px/32px).

### Inputs & Forms

**`{component.text-input}`** — Standard text input field. White background (`{colors.surface-elevated}`), black text (`{colors.ink}`), `{rounded.sm}` (5px) corners, padding `10px 14px`, fixed height 44px. Border likely 1px `{colors.hairline}` on default. Focus state (`{component.text-input-focus}`) maintains same dimensions — focus ring implementation TBD per stack.

**`{component.consent-decline-btn}`** — "Decline All" button in consent banner. Outlined style: transparent background, `{colors.border-strong}` text and implied border, `{rounded.DEFAULT}` (16px), padding `14px 32px`. More padding than generic `{component.button-outline}` for easier touch target in modal context.

**`{component.consent-accept-btn}`** — "Accept All" button in consent banner. Solid `{colors.success}` (forest green #2c622c) background, white text (`{colors.on-dark}`), `{rounded.DEFAULT}` (16px), same padding as decline. Green deliberately distinct from brand lime — signals legal/consent domain, not brand expression.

**`{component.consent-category-label}`** — "Necessary", "Functional", "Statistical", "Marketing" labels above each toggle. Transparent background, `{colors.body-secondary}` text, `{typography.label-md}` sizing. These are technically buttons (interactive for accessibility) but render as static labels.

**`{component.consent-toggle-track}`** — Inactive toggle switch track/background. Background `{colors.toggle-track}` (#e6e6e6), pill-shaped (`{rounded.pill}`), contains thumb element. Width approximately 48-52px based on proportion.

**`{component.consent-toggle-thumb}`** — Circular thumb inside toggle track. White (`{colors.surface-elevated}`) background, `{colors.ink}` text (for icon if any), `{rounded.full}` (perfect circle). Sits left-side when off, slides right when on.

**`{component.consent-toggle-active}`** — Active/enabled toggle state. Track background becomes `{colors.surface-soft}` (lime #c7eb08) — brand color as feedback signal. Thumb remains white. The "Necessary" toggle shows this state (forced-on, likely visually distinct).

**`{component.consent-toggle-disabled}`** — Disabled/unavailable toggle. Track `{colors.toggle-track}`, thumb `{colors.muted-soft}`, reduced opacity. Used for "Necessary" category which cannot be toggled off.

### Navigation

**`{component.logo-mark}`** — Woba wordmark in navigation. Black text (`{colors.ink}`) against dark nav background — implying either the logo has intrinsic color (not dependent on parent) or this is the light-logo variant. Custom SVG or font-based glyph.

### Signature Components

**`{component.modal-title}`** — "You control your data" heading in consent modal. Transparent background, `{colors.ink}` text, `{typography.modal-title}` (24px, 400 weight, -0.24px tracking). Sets modal context immediately below top edge.

**`{component.modal-body}`** — Multi-paragraph explanation text in consent banner. `{colors.body-secondary}` text, `{typography.body-md}`, comfortable line length (~70-80 chars). Contains legal/compliance language about cookies, partners, purposes.

**`{component.modal-link}`** — Inline text links within modal body. `{colors.ink}` by default, likely underline decoration. Example: "Show details" toggle trigger.

**`{component.modal-link-inline}`** — Highlighted link "Read more about cookies". Uses `{colors.link}` (#014adb) instead of body text color — stands out as external/navigation link within body block. May have underline.

## Do's and Don'ts

### Do

- Do use `{colors.primary}` (#c7eb08) only for brand-significant surfaces: secondary CTAs, toggle active states, and accent moments. Its electric quality demands scarcity.
- Do apply `{rounded.pill}` (999px) radius to all primary and secondary conversion buttons — the capsule shape is non-negotiable for CTA identity.
- Do maintain negative letter-spacing on all typography tokens — the system's editorial tightness depends on `-0.16px` minimum at body scale, scaling proportionally larger at display sizes.
- Do reserve `{colors.success}` (#2c622c) forest green for consent/legal confirmation actions — never substitute brand lime here, as the color shift signals domain importance.
- Do set hero headlines in `{typography.display-lg}` (54px/400 weight) with Altriviera unquoted variant — the display face carries the brand voice at large scale.
- Do use `{spacing.section-lg}` (56px) as baseline vertical rhythm between major content sections — the airy feel requires consistent breathing room.
- Do apply `{colors.overlay}` at 70% opacity for modal backdrops — this specific value balances focus with context visibility.
- Do keep navigation in inverted mode (`{colors.surface-dark}` bg, `{colors.on-dark}` text) regardless of page scroll position — it's a persistent anchor, not a scroll-responsive element.
- Do use `{rounded.lg}` (720px) for image masks on hero/product photography — the squircle treatment softens technology imagery.
- Do pair `{typography.body-md}` (15px) with `-0.16px` letter-spacing for all paragraph text — this combination defines the readable-yet-editorial texture.

### Don't

- Don't use `{colors.primary}` as a background for large areas — it's an accent voltage, not a surface color. Maximum extent should be button-sized or toggle-track-sized.
- Don't bold display headings — `{typography.display-lg}` is intentionally weight 400. If emphasis is needed, increase size to inferred `{typography.display-xl}` or tighten tracking further.
- Don't mix the two font-family names arbitrarily — **Altriviera** (unquoted) for display/hero scale, **"Alt Riviera"** (quoted) for everything else. They may be the same design, but the CSS treats them as separate families.
- Don't add gradients to buttons, cards, or hero backgrounds — the system is flat-color by philosophy. Any gradient would break the clean material honesty.
- Don't round input corners beyond `{rounded.sm}` (5px) — inputs need to feel precise and functional, not pill-like.
- Don't use `{colors.link}` (#014adb) blue for primary CTAs or brand elements — it's strictly for inline navigation links and interactive text.
- Don't expand the radius vocabulary beyond the eight defined tokens — especially avoid inventing intermediate values between `{rounded.DEFAULT}` (16px) and `{rounded.lg}` (720px).
- Don't place light text directly on `{colors.canvas}` (#f4f4f4) — contrast fails. Always use `{colors.ink}` or `{colors.body}` on canvas; reserve `{colors.on-dark}` for `{colors.surface-dark}` surfaces.
- Don't omit the arrow icon from primary CTA buttons when they imply navigation ("Book a demo →") — the directional indicator is part of the component contract.
- Don't make consent toggles smaller than 44×26px approximate — WCAG AAA touch targets apply even within modals.

## Motion & Animation

### Transition Tokens

```css
--transition-color: color 0.25s cubic-bezier(0.6, 0.6, 0, 1);
--transition-bg: background-color 0.2s cubic-bezier(0.6, 0.6, 0, 1);
--transition-opacity: opacity 0.2s cubic-bezier(0.6, 0.6, 0, 1);
--transition-shadow: box-shadow 0.4s cubic-bezier(0.6, 0.6, 0, 1);
--transition-transform: transform 0.75s ease;
--transition-all: all 0.3s ease;
--transition-width: width 0.275s ease;
```

The easing curve `cubic-bezier(0.6, 0.6, 0, 1)` dominates color, background, and opacity transitions — it's a deceleration-heavy curve (ease-out-quart adjacent) that feels snappy yet smooth. Transform transitions (nav slide, modal entrance) use longer durations (0.75s) with standard `ease`, giving spatial movements more cinematic weight.

### Keyframe Animations

- **spin** — Rotational animation, likely for loading indicators or decorative spinner elements.
- **ci-bounce** — Bounce/elastic motion, probably for CookieInformation consent widget micro-interactions (toggle snap, banner appearance).
- **drawCircle** — SVG stroke-dashoffset animation for progress rings or animated circle indicators. Connected to `.animated-circle` class with `stroke-dasharray: 97.39` (circumference of r≈15.5 circle).

### Interaction Patterns

- **Navigation transform**: Nav component translates vertically (`transform 0.75s ease`) when mobile menu opens/closes — slides down to reveal menu, up to dismiss.
- **Toggle slide**: Consent category toggles animate thumb position with width transition (`width 0.275s`) and likely transform for the lateral slide.
- **Modal fade-in**: Consent banner appears with opacity transition (`opacity 0.2s`) on overlay and potentially scale/translate for the card itself.
- **Focus ring expansion**: Box-shadow transitions (`box-shadow 0.4s`) suggest animated focus ring growth on interactive elements.
- **Button background shift**: Color transitions on `{colors.primary}` and `{colors.surface-dark}` surfaces provide instant (200ms) feedback on press/active states.
- **Circle draw animation**: Progress indicators use stroke-dashoffset animation for satisfying "completion" visualization.

## Imagery Style

- **Photography**: Product/laptop photography with real hands typing — authentic workplace context, not stock-stiff. Shot from slight angle showing screen content (dashboard UI with lime accents).
- **Color treatment**: Photos appear minimally processed — natural lighting, realistic skin tones. The lime brand color visible *on-screen within* the photo ties imagery to the system without artificial tinting.
- **Geometry**: Hero image masked with `{rounded.lg}` (720px radius) creating squircle window — softens the tech-product feel, makes the device feel like an object-in-environment rather than a spec sheet.
- **Role**: Imagery supports rather than dominates — text column gets priority, image occupies right ~40% of hero band with breathing room.
- **Depth**: Laptop sits on what appears to be a wooden table with notebook/pencil props nearby — warm, human, approachable. Not sterile white-background product shot.
- **Consistency expectation**: Future imagery likely follows same mask-radius convention, same warm-authentic aesthetic, same "screen-within-screen" brand-color echo technique.

## Icon System

- **Library**: Custom SVG (no detected third-party icon library in framework analysis). Icons are inline SVGs or sprite-referenced.
- **Specific icons observed**: 
  - Arrow-right (→) in "Book a demo →" CTA
  - Chevron-down (▾) in "Solutions", "EN", "Log In" navigation triggers
  - Close (×) on consent banner (implied)
  - Toggle thumb indicator (circle within pill track)
  - Possible hamburger menu icon on mobile (inferred from nav structure)
- **Treatment**: Stroke-based for arrows and chevrons (likely 1.5-2px stroke, `currentColor` fill). Toggle thumbs are filled circles. Icons align baseline with adjacent text, sized approximately 16-20px for inline use, 20-24px for standalone buttons.
- **Color**: All icons use `currentColor` inheriting from parent text color — black on light surfaces, white on dark nav, inherited from button text color in CTAs.

## Recommended Frontend Stack

```
- Framework:      Next.js 14+ or Astro (static-leaning with React islands)
- Styling:        Tailwind CSS v3.4+ (utility-first matches token granularity)
- Fonts:          Self-hosted Alt Riviera/Altriviera WOFF2 files from Woba CDN;
                  fallback chain: Alt Riviera → DM Sans → system-ui
- Animation:      Framer Motion (for layout transitions) + vanilla CSS keyframes (for spins/toggles)
- Icons:          Custom SVG components (Lucide shapes as base geometry reference)
- Component lib:  Radix Primitives (accessible dialog/toggle foundations) + custom styling
```

**Font loading strategy:** Preload the Regular (400) cut of both family variants critical for LCP. Defer Bold (700) and Medium (500) loads. Define `@font-face` with `font-display: swap` to prevent FOIT.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 640px | Single-column hero, stacked CTAs, hamburger nav, full-width modal |
| Tablet | 640–1024px | Two-column hero (narrower), condensed nav items, modal padding reduces |
| Desktop | 1024–1440px | Full layout as shown, 1440px max container |
| Wide | > 1440px | Container centers with auto margins, hero may gain additional padding |

### Touch Targets

- `{component.button-primary}`: ~280×48px minimum (padding 14px 28px + text) — exceeds 44×44px WCAG AAA comfortably.
- `{component.button-secondary}`: Same dimensions as primary — excellent touch affordance.
- `{component.consent-accept-btn}` / `{component.consent-decline-btn}`: ~180×48px — adequate, though decline could feel narrow on small screens.
- `{component.text-input}`: 44px height explicit — meets AAA minimum, width context-dependent.
- Toggle switches: Estimated 52×28px — tap target includes track, meets minimum when properly padded.
- Navigation links: Height derived from 72px nav — more than sufficient; horizontal spacing needs `{spacing.md}`+ between items.

### Collapsing Strategy

- **Navigation**: Desktop shows inline links; mobile collapses to hamburger menu triggering slide-down panel (confirmed by `nav_component` transform transition and `w-nav-overlay` class pattern).
- **Hero columns**: Single-column on mobile — headline stacks above image (or image hides/reorders), CTAs stack vertically with primary on top.
- **Consent modal**: Full-viewport on mobile with reduced horizontal padding (from 56px to ~24px). Toggle categories may stack 2×2 or scroll horizontally.
- **Button pairs**: Horizontal on desktop (primary + secondary side-by-side); vertical stack on mobile with `{spacing.md}` gap.
- **Grid cards**: Multi-column feature grids collapse to single column; `{rounded.lg}` card radius maintained but width becomes 100% of container minus gutters.

### Image Behavior

- Hero laptop photo: On mobile, likely reduces to ~80% width, maintains aspect ratio, keeps `{rounded.lg}` mask. May move below headline text or become background with opacity reduction.
- Product screenshots within photo: Scale with container; the "lime accent on screen" detail must remain visible at small sizes for brand reinforcement.
- Logo: Consistent size across breakpoints, never scales below ~24px height.

## Iteration Guide

1. Build a landing page closely mimicking the Woba design system using Next.js with Tailwind CSS. Reference this DESIGN.md for all token values.
2. Extract every color, font, radius, and spacing value from the YAML frontmatter via `{section.token}` paths. Define Tailwind config `theme.extend.colors`, `theme.extend.fontSize`, `theme.extend.borderRadius`, and `theme.extend.spacing` maps so utility classes resolve to exact specified values — never hard-code a value that has a token.
3. Implement state variants (`-hover`, `-disabled`, `-focus`, `-active`) per Tailwind's modifier conventions (`hover:`, `focus:`, `disabled:`). The spec documents Default and Active/Pressed states explicitly; infer hover from active where sensible.
4. When adding a new component, decide which sub-system it belongs to: **main editorial** (canvas + ink + lime accents) vs **consent dialect** (white elevated cards + forest-green confirmations). Do not cross-pollinate colors between systems (e.g., don't use `{colors.success}` green on a marketing CTA).
5. Variants of existing components live as separate frontmatter entries (`button-primary-active`, never nested under `button-primary.states.active`). Each variant gets its own prose description.
6. Run `npx @google/design.md lint DESIGN.md` after edits — `broken-ref`, `contrast-ratio`, and `orphaned-tokens` warnings flag issues automatically.
7. When in doubt about emphasis: bigger type before bolder type (the system maxes at 600 weight for small titles, 400 for display), signature surface card before solid accent, negative letter-spacing before positive.
8. Ensure both font-face names exist in your CSS: `"Alt Riviera"` (quoted, for body/UI) and `Altriviera` (unquoted, for display). They map to different @font-face blocks and cannot be conflated.
9. Test consent banner at 375px width — the four toggle categories must remain usable (tap-friendly) without horizontal scrolling. Consider stacking to 2×2 grid on small screens.
10. Validate contrast ratios: `{colors.primary}` (#c7eb08) on white must carry `{colors.on-primary}` (#000000) text at minimum 4.5:1 (it passes). `{colors.success}` (#2c622c) with white text passes easily.

### Font Setup

For development without licensed Alt Riviera fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap');

:root {
  --font-display: 'Plus Jakarta Sans', 'Altriviera', sans-serif;
  --font-body: 'DM Sans', 'Alt Riviera', sans-serif;
}
```

CSS variables to define for token resolution:
- `--color-canvas: #f4f4f4;`
- `--color-primary: #c7eb08;`
- `--color-ink: #000000;`
- `--color-surface-dark: #212121;`
- `--color-surface-elevated: #ffffff;`
- `--radius-pill: 999px;`
- `--radius-default: 16px;`
- `--radius-lg: 720px;`
- `--spacing-hero: 80px;`
- `--spacing-section-lg: 56px;`

## Known Gaps

- **Hover state styling**: Per no-hover policy, hover colors/shadows for buttons, links, nav items, and cards are not documented. Implementation teams should derive hover from active/pressed states or follow platform conventions (typically 10-15% darken or overlay with semi-transparent black).
- **Loading/skeleton states**: No loading indicators, skeletons, or pending-state styles were visible in the extracted DOM or screenshot. Recommend implementing shimmer skeletons using `{colors.surface-strong}` as base with `{colors.hairline}` stripe overlays.
- **Form validation beyond focus**: Error states (`{colors.error}` red), success checkmarks, helper text positioning beneath inputs — not observed. Follow accessible validation patterns (aria-describedby, role="alert").
- **Dashboard/authenticated surfaces**: The screenshot captures the marketing/landing view only. Internal app surfaces (dashboards, settings tables, data visualizations) may introduce new component patterns, denser grids, or additional color tokens not represented here.
- **Mobile navigation open state**: While CSS confirms transform animation exists for mobile menu, the actual opened-menu layout (overlay panel contents, item spacing, close button placement) was not captured.
- **Dark mode variant**: Entire system documented as light mode (`{extensions.mode}: "light"`). If a dark mode exists, it would require inverted surface/text mappings and potentially adjusted brand-color usage for contrast compliance.
- **Exact toggle switch dimensions**: Width, height, and thumb size for consent toggles estimated from visual proportion. Implementers should measure from production or design file for pixel-exact specs.
- **CookieInformation widget internals**: The consent banner markup comes from third-party JavaScript (CookieInformation). Some class names (`coi-consent-banner__category-name`, `coi-banner__wrapper`) and behaviors are vendor-controlled and may not reflect Woba's first-party component patterns.
- **Footer detailed structure**: Footer exists in DOM but was not visually prominent in screenshot. Its internal layout (link columns, legal text, newsletter signup) remains unspecified.
- **Accessibility focus indicators**: Focus-visible outlines/rings were not explicitly styled in extracted CSS (only `box-shadow 0.4s` transition implies some focus treatment). Implement robust focus rings (2-3px offset, `{colors.accent}` or `{colors.primary}` color) for keyboard navigation support.