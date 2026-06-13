# Handoff: Intersport Club IDF — Home Page (Accueil) Redesign

## Overview
This is a high-energy, "stadium-atmosphere" redesign of the home page for **Intersport Club IDF** — a B2B-style e-commerce platform that lets amateur sports clubs in Île-de-France (France) order official, personalized team equipment (jerseys, training kit, accessories) with group orders and printed/embroidered club branding ("floquage").

The redesign goal was a dynamic, fun, "crazy" first impression while staying strictly on the existing brand colors (navy + red). The page is in **French**.

> ⚠️ **Scope note:** This handoff intentionally **excludes the footer**. Do not document or rebuild the footer from these files — use the host codebase's existing footer.

---

## About the Design Files
The files in this bundle are **design references created in HTML/CSS/vanilla JS** — a prototype demonstrating the intended look, motion, and behavior. **They are not production code to copy verbatim.**

Your task is to **recreate this design in the target codebase's existing environment** (React, Vue, Next, etc.) using its established component patterns, styling system (CSS Modules / Tailwind / styled-components / etc.), icon set, and asset pipeline. If no front-end environment exists yet, choose the most appropriate framework for the project and implement the design there.

Where the prototype uses a CDN font or icon webfont, swap in the codebase's equivalent. Where it builds DOM via `innerHTML` from data arrays, prefer real components driven by props/state.

---

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all specified below and should be reproduced closely. Product imagery is the one exception — the prototype uses **striped placeholder boxes** labelled "visuel produit / visuel maillot" where real product photos belong.

---

## Tech & Dependencies (in the prototype)
- **Fonts:** Google Fonts — `Barlow` (body, weights 400–700) and `Barlow Condensed` (display/headlines, weights 500–900). Condensed is applied via a `.cond` helper class.
- **Icons:** Tabler Icons webfont (`@tabler/icons-webfont`), referenced as `<i class="ti ti-*">`. Replace with the codebase's icon library; an icon-name mapping is given per component below.
- **Video asset:** `assets/stadium-intro.mp4` (1280×720, ~10s, 3.6 MB) — blue smoke-grenade stadium footage resolving to the Intersport logo. Used in two places (intro curtain + hero background). Provided by the client.
- No framework; plain JS with `requestAnimationFrame`, `IntersectionObserver`, and pointer events.

---

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| `--navy` | `#1b2a6b` | Primary brand navy (logo, headings on light, pills bg) |
| `--navy-deep` | `#0f1a40` | Darkest navy (topbar, brand marquee bg) |
| `--navy-mid` | `#2d3591` | Mid navy (hero default gradient, about card bg) |
| `--red` / `--accent` | `#e8251f` | Brand red — primary CTA, accents, highlights |
| `--accent-deep` | `#b51410` | Darker red (button shadow/hover depth) |
| `--paper` | `#f4f4f2` | Page background (warm off-white) |
| `--ink` | `#13151c` | Default text color |
| Hero base | `#05081a` | Near-black behind the hero video for smoke contrast |
| Intro bg | `#0a1230` | Intro curtain base |
| Card border | `#ececec` / `#e6e6e3` | Light borders |
| Placeholder stripes | `#eef0f6` / `#e3e7f1` | Product image placeholder fill |
| Muted text | `#777`, `#8a8a8a`, `#aaa` | Secondary copy on light |

> **Important:** The accent is a single CSS variable. An earlier version cycled the accent through sport-specific hues (orange/blue/green); this was **removed** — the accent must stay red (`#e8251f`) everywhere. All six sport entries now use red.

### Typography scale
| Role | Family | Weight | Size | Other |
|---|---|---|---|---|
| Hero headline | Barlow Condensed | 900 | `clamp(54px,7.4vw,116px)` | `line-height:.86; letter-spacing:-.015em; text-transform:uppercase` |
| Section title `.stitle` | Barlow Condensed | 900 | `clamp(36px,4.6vw,58px)` | `line-height:.92; uppercase` |
| CTA headline | Barlow Condensed | 900 | `clamp(34px,4.2vw,52px)` | uppercase |
| Marquee item | Barlow Condensed | 900 | 30px | uppercase, `.02em` |
| Brand marquee | Barlow Condensed | 900 | 40px | outline stroke text |
| Card title `.cn` | Barlow Condensed | 800 | 26px | uppercase |
| Buttons / pills | Barlow Condensed | 800 | 18px / 15px | uppercase, `.04em` |
| Eyebrow / kicker | Barlow | 800 | 11px | uppercase, `.18–.2em` letter-spacing |
| Body copy | Barlow | 400–500 | 14–16.5px | `line-height:1.55–1.65` |

### Spacing / layout
- Content max-width: **1340px** (`.wrap`, `.nav-in`, `.hero-in`); about/CTA use **1260px**.
- Horizontal page padding: **40px** desktop, **20px** at ≤620px.
- Section vertical padding: **78px** top (help, showcase), **44px** (brand marquee).

### Radii
- Buttons / search: `11–12px` · Cards `.card`: `22px` · Product cards: `18–20px` · About & CTA boxes: `26px` · Pills & dots: pill/`30px`/`50%`.

### Shadows
- Primary button: `0 10px 26px rgba(232,37,31,.36)` → hover `0 16px 38px rgba(232,37,31,.5)`
- Card hover: `0 22px 50px rgba(15,26,64,.14)`
- Deck cards: `0 26px 60px rgba(0,0,0,.42)`
- Stickers: `0 14px 32px rgba(0,0,0,.24)`

---

## Screens / Views
Single scrolling page. Sections top → bottom (footer excluded):

### 1. Cinematic Intro Curtain (first launch only)
- **Purpose:** Wow moment on entry. Fullscreen overlay (`position:fixed; z-index:1000`) plays `stadium-intro.mp4` once.
- **Behavior:**
  - Plays **muted autoplay** (browser policy). Controls bottom-right: a **Son** (sound) toggle and **Passer l'intro** (skip) button (pill style, translucent white, `backdrop-filter:blur(8px)`). Bouncing 3-dot loader bottom-center while buffering.
  - On video `ended`, on skip click, on error, or after a safety-net timeout → adds `.fade` (1s scale-up + fade) then removed from DOM.
  - Gated by `sessionStorage['isidf_intro_seen']` so it only plays **once per session**.
  - Animated blue radial-gradient "smoke" pseudo-element (`.intro::before`) sits behind the video as a fallback so a slow buffer never shows black.
  - Hidden entirely under `prefers-reduced-motion: reduce`.
- **State:** `dismissed` (bool), `started` (bool), session flag.

### 2. Top Ticker Bar (`.topbar`)
- Dark navy (`--navy-deep`) strip, 12px white text, infinite horizontal marquee (CSS `@keyframes marq` translateX -50%, 28s linear). Pauses on hover.
- Red icon + red dot separators between items. Built from a JS `ticker` array (duplicated once for seamless loop). Current items:
  1. `ti-discount-2` — "Packs multisports & multimarques au **meilleur prix**"
  2. `ti-shirt` — "Floquage & personnalisation **inclus**"
  3. `ti-shield-check` — "Équipements **officiels certifiés**"

### 3. Sticky Nav (`.nav`)
- Sticky top, translucent paper bg with `backdrop-filter:blur(16px)`, 1px bottom border. On scroll >10px adds `.scrolled` (drop shadow + reduced padding).
- **Logo:** "**INTER**SPORT" (INTER in red, SPORT in navy), Barlow Condensed 900 25px, with small uppercase "Club IDF" beneath.
- **Search:** flex-grow input (max 520px), white, 1.5px border `#e6e6e3`, focus border navy. Icon `ti-search`. Placeholder: "Rechercher un produit, une marque, un club…". Hidden ≤980px.
- **Links** (`.nav-links`, hidden ≤620px): Accueil (active), Catalogue (#help), Boutique (#showcase), Contact (#about). Animated red underline (`scaleX`) on hover/active.
- **Icons:** user (`ti-user`) and cart (`ti-shopping-cart`) as 42px bordered buttons; cart has a red count badge ("2").

### 4. Hero (`.hero`) — the centerpiece
Near-black base (`#05081a`), `min-height:72vh`, layered stack (all `z-index:0` except content at `z-index:2`):
- **`.hero-grad`** — default navy radial gradient (revealed after the video).
- **`.hero-bg`** — `<video>` (`stadium-intro.mp4`), `object-fit:cover`, `filter:saturate(1.25) contrast(1.08) brightness(1.18)`. Opacity 0→1 via `.on`. Plays **once** on launch then fades out.
- **`.hero-scrim`** — directional dark gradient (dark left → transparent right) for headline legibility while video plays. **Opacity `.5` when `.on`** (deliberately halved so the footage reads bright).
- **`.hero-stripes`** — faint diagonal moving stripes (decorative).
- **`.hero-glow`** — red radial glow that follows the cursor (pointermove parallax).
- **Content (`.hero-in`)** — centered flex. Contains only **`.hero-vis`** (the product card deck), max-width 520px, height 460px. *(Note: the left text column — eyebrow, big headline with rotating sport word, description, two CTA buttons — was **removed** at the client's request. The CSS for `.eyebrow/.htitle/.rot/.hdesc/.cta/.btn*` remains in the stylesheet but is unused in the hero; keep or prune as your codebase prefers.)*
- **Card deck (`.deck` / `.dcard`)** — see Interactions. Two floating **stickers** overlaid: `ti-bolt` "Floquage inclus" (top-left, bobbing) and `ti-truck` "Livraison 48h" (bottom-right, bobbing).
- **Hero marquee (`.hero-marq`)** — full-width strip at the hero's bottom, top+bottom 1px hairline borders, `rgba(0,0,0,.18)` bg. Infinite marquee (22s) of big condensed words with **red dot** separators (`.hm-item .dot` fixed `#e8251f`). Alternating items use outline style (`.out` = transparent fill + white text-stroke). Words: **ÉQUIPEZ VOTRE CLUB AVEC STYLE · SPORTS · ÉQUIPEMENT OFFICIEL · STYLE · PERFORM · CLUBS**. This strip is **hidden while the launch video plays** (`.hide-for-video` → opacity 0 + translateY).

### 5. Smoke Band (`.smokeband`)
- A **transparent** overlay section pulled up over the hero's bottom edge (`height:174px; margin-top:-174px`, so it sits entirely *on* the banner with no spill below). `pointer-events:none`, `z-index:6`.
- Contains a `<canvas id="smokeCanvas">` running a particle "smoke-bomb" effect: 6 streams of soft radial-gradient puffs (mixed **blue and red**) drifting in from both screen edges with a sine-wave wander and slight upward rise, anchored near the banner's bottom so smoke never crosses the edge.
- Pauses via `IntersectionObserver` when off-screen; static haze fallback for reduced-motion. Canvas uses DPR scaling (capped at 2).

### 6. "Comment pouvons-nous vous accompagner" cards (`.help`)
- White section. *(The section header/eyebrow/subtitle were **removed**; cards lead directly.)*
- 3-column grid (`repeat(3,1fr)`, gap 20px; 2-col ≤980px; 1-col ≤620px). Each `.card`:
  - 1.6px border `#ececec`, radius 22px, padding `32px 28px 28px`.
  - Giant outlined **number** ("01/02/03") bleeding from bottom-right (`::after`, 150px stroke text).
  - Top accent bar (`.top`) scales in on hover; card lifts with shadow; icon box scales+rotates; **3D tilt** follows pointer (`perspective(800px) rotateX/Y`).
  - **Card 1 — navy** (`#1b2a6b`): icon `ti-book`, title "Catalogues", copy about browsing brand catalogues for group orders, link "Explorer →".
  - **Card 2 — red** (`#e8251f`): tag "Populaire", icon `ti-shopping-bag`, title "Boutique Club", copy about ordering referenced articles with floquage + fast delivery, link "Commander →".
  - **Card 3 — red**: tag "-50%", icon `ti-tag`, title "Soldes & Déstockage", copy about end-of-collection deals, link "Voir les offres →".

### 7. Brand Marquee (`.brands`)
- `--navy-deep` bg. Centered label "NOS MARQUES PARTENAIRES". Two rows of big outlined-stroke brand names scrolling **in opposite directions** (row A normal, row B reversed, 32s). Names fill solid white on hover. Brands: Nike, adidas, Puma, Asics, Mizuno, Kipsta, Under Armour, New Balance, Errea, Joma.

### 8. Product Carousel (`.showcase`)
- Paper bg. Header: kicker "Les essentiels du club" + title "Prêts à floquer", with prev/next circular buttons (`ti-chevron-left/right`, hover fills navy).
- Horizontal **drag-to-scroll** rail of product cards (`.pc`, `flex:0 0 300px`, gap 18px). Each card: 230px striped placeholder image, navy category tag (top-left), circular favorite heart button `ti-heart` (top-right, hover red), category label, name, price row (struck-through old price + red current price) and a navy "Ajouter +" button (hover red). Prev/next buttons scroll by 336px; pointer drag scrolls and suppresses click if dragged.
- Product data array (tag, category, name, oldPrice, price):
  1. Football · Maillot · "Domicile 25/26" · 44€ → 35€
  2. Training · Survêtement · "Veste Club Zip" · 69€ → 54€
  3. Basket · Short · "Short Mesh Pro" · 29€ → 22€
  4. Running · Textile · "Tee Tech Léger" · 32€ → 24€
  5. Accessoire · Sac · "Sac de Sport 40L" · 49€ → 39€
  6. Handball · Protection · "Genouillères Pro" · 24€ → 18€
  7. Football · Chaussettes · "Pack x3 Club" · 18€ → 13€

### 9. About (`.about`)
- `--navy-mid` rounded card (radius 26px), diagonal hairline texture + soft red glow blob. Title "Qui sommes-nous ?" + 3-column grid of circular-outline icon + heading + paragraph:
  - `ti-refresh` — "Intersport Club IDF" — platform dedicated to IDF sports clubs, 360° ecosystem.
  - `ti-headset` — "À votre écoute" — order with confidence, specialist team via phone/mail/chat.
  - `ti-crown` — "Une expérience premium" — fast intuitive site, secure ordering.

### 10. Big CTA (`.cta-strip`)
- Red (`--accent`) rounded box. Giant faded "GO" watermark + ring decoration. Headline "Prêt à équiper votre club ?" + subcopy about creating a club shop and first group order. White button "Démarrer maintenant →" (`ti-arrow-right`).

*(Footer intentionally omitted from this handoff.)*

---

## Interactions & Behavior

### Product card deck (hero) — the signature interaction
- A stack of 6 cards (one per sport: Football, Rugby, Basket, Handball, Running, Multisport), each showing a placeholder jersey image, sport badge, discount, product name, and price.
- Stacking: front card full size/opacity; cards behind are offset `+20px x / -13px y`, scaled `1 - depth*0.05`, rotated `depth*2°`, with decreasing opacity (`[1,1,0.82,0.5]`); `z-index = 120 - depth`. Only 3 peek behind.
- **Auto-advance every 3.4s** (when not interacted): the front card **throws off to the right** (`translate(480px,-26px) scale(.96) rotate(15deg)` + fade, easing `cubic-bezier(.5,0,.15,1)`, ~0.62s), the next card surfaces, and the thrown card recycles to the back. Each surface calls `setTheme()`.
- **Click the front card** → throws it and advances (pauses autoplay).
- A `setTheme(i)` function exists that previously recolored the whole page per sport; **accent recolor is disabled** (all sports are red). It still drives the (now-removed) rotating word / pills if present — all such references are null-guarded.
- While the **launch video plays**, the deck animates away: `.hero-vis.cards-away` → `opacity:0; translateY(70px) scale(.82) rotate(2deg)`, springing back (`cubic-bezier(.34,1.4,.5,1)`) when the video ends.

### Launch video lifecycle
1. First visit: intro curtain plays → on dismiss, hero shows default navy bg (clip already seen).
2. Return visits (session flag set): hero background video plays **once**, with deck + marquee hidden; on `ended` → `revertToDefault()` fades video+scrim out, brings deck + marquee back.
3. Fail-safes: autoplay rejection or stalled buffer → revert to default background; never traps the user.

### Global motion
- **Custom cursor** (fine-pointer only): a lagging ring (`.cur`, lerp 0.18) + instant dot (`.cur-dot`), `mix-blend-mode:difference`. Grows over interactive elements (`a, button, .pressable, .pill, .card, .dcard, .ic-btn, input`) and on pointer-down. Disabled on touch/coarse pointers.
- **Scroll progress bar** (`.progress`, fixed top, red) tracks scroll %.
- **Reveal on scroll** (`.rv` → `.in`): fade + translateY via `IntersectionObserver` (threshold .14), unobserved after first reveal.
- **Marquees** (ticker, hero, brands) are CSS `@keyframes marq` loops; tracks duplicated in JS for seamless wrap.
- All decorative/looping motion is gated behind `prefers-reduced-motion: no-preference`; reduced-motion disables marquees, bobbing, rise-in, intro, and uses a static smoke haze.

### Hover/active states (summary)
- Buttons lift `translateY(-2px)` + deeper shadow; primary/ghost/white variants. Arrow icons nudge right on hover.
- Nav links: red underline scaleX. Icon buttons: lift + navy border. Cards: lift + shadow + tilt + icon pop + top bar reveal. Product "Ajouter" + favorite turn red. Brand names fill white.

---

## State Management (for a framework rebuild)
- `introSeen` (session-scoped) — gate the intro curtain.
- `videoPhase` — `playing | done` for the hero background; drives `cards-away` on the deck and `hide-for-video` on the marquee.
- `deckOrder` — array describing current stack order; `front` index; `busy` lock during a throw; `autoplay` (pauses on user interaction).
- `cartCount` — nav badge (static "2" in mock).
- Carousel scroll position (drag + prev/next).
- Reduced-motion preference — branch all motion.
- Data arrays (`ticker`, `sports`/deck, `brands`, `products`) should become typed data/props feeding components.

---

## Responsive behavior
- **≤980px:** hero stacks to single column; search hidden; help/about grids → 2 columns.
- **≤620px:** nav links hidden (needs a mobile menu in production); grids → 1 column; reduced page padding (20px); smaller marquee text (24px); smoke band height 138px.
- Headlines/section titles use `clamp()` for fluid scaling.

---

## Assets
- **`assets/stadium-intro.mp4`** — client-provided stadium / blue-smoke-grenade → Intersport-logo clip (1280×720, ~10s). Used for the intro curtain and the hero background. Bundled in this handoff under `assets/`.
- **Icons:** Tabler Icons (webfont in the prototype). Map each `ti-*` name to the codebase's icon set: `ti-search, ti-user, ti-shopping-cart, ti-bolt, ti-truck, ti-plus, ti-book, ti-shopping-bag, ti-tag, ti-arrow-right, ti-chevron-left, ti-chevron-right, ti-heart, ti-refresh, ti-headset, ti-crown, ti-volume-3, ti-volume, ti-player-track-next-filled, ti-ball-football, ti-ball-american-football, ti-ball-basketball, ti-ball-volleyball, ti-run, ti-medal, ti-discount-2, ti-shirt, ti-shield-check`.
- **Fonts:** Barlow + Barlow Condensed (Google Fonts). Use the codebase's font-loading strategy.
- **Product images:** none yet — placeholders ("visuel produit"). Real photos must be supplied to replace the striped boxes.
- **Logo:** rendered as styled text ("INTERSPORT Club IDF"); swap for the official brand asset if available.

---

## Files
- **`Accueil Redesign v2.html`** — the full home-page prototype (single self-contained file: markup + CSS + JS). This is the source of truth for the design.
- **`Smoke Effect.html`** — a standalone, isolated version of the canvas smoke-bomb effect (handy for porting the particle system on its own).
- **`assets/stadium-intro.mp4`** — the video asset referenced by the hero.

> Reminder: implement everything **above the footer**. The footer in the HTML is out of scope — use the host app's footer.
