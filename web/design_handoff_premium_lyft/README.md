# Handoff: Orbit — Designsystem & premium-lyft

## Overview
Orbit är ett inspirationssök-verktyg för nordiska kreatörer, byråer och content-team:
sök ett ämne → få de starkaste TikTok-/Reels-videorna rankade efter **Trend Score**,
filtrera, läs en **trendöversikt** (Virlo-inspirerad "intelligence report") och spara
till **samlingar**.

Det här paketet är ett **premium-lyft** av den befintliga nordiska designen. Det höjer
fidelity på tre sätt:
1. **Förfinad palett** — varm cream-bakgrund + en enda, djupare accent **"Ember" `#A8501E`**
   (ersätter den tidigare ljusare orangea `#C2541E`).
2. **Nytt typsnitt-par** — **Schibsted Grotesk** (rubriker + brödtext, nordiskt/editoriellt)
   och **Geist Mono** (Trend Score, metrik, etiketter).
3. **Rikare data-viz & djup** — Trend Score som en **ifylld ring** på varje kort, area-/sparkline-grafer
   i trendöversikten, subtila skuggor och en starkare märkesidentitet (orbit-motivet).

## About the Design Files
Filerna i detta paket är **designreferenser skapade i HTML** (Design Components, `.dc.html`)
— de visar avsedd look & beteende, de är **inte produktionskod att kopiera rakt av**.
Uppgiften är att **återskapa designen i den befintliga kodbasen** (`web/`: Next.js 16 App
Router, React 19, Tailwind v4, shadcn/ui, Supabase) med dess etablerade mönster.

Eftersom kodbasen redan använder semantiska tokens (`text-ink`, `border-line`, `bg-signal`,
`bg-muted-surface`, `text-ink-dim` …) är **merparten av reskinningen ett byte av variabel-
värden i `web/app/globals.css`** — resten är fontbyte i `layout.tsx` plus förfining av ett
fåtal komponenter.

### Så öppnar du referenserna
Öppna `Orbit Designsystem.dc.html` i en webbläsare (den hämtar `support.js` + `OrbitCard.dc.html`
i samma mapp). Dokumentet är i **canvas-läge** — panorera/zooma för att se grunderna och alla
skärmar bredvid varandra.

## Fidelity
**Hög fidelitet (hifi).** Färger, typografi, spacing och radie nedan är slutgiltiga och
exakta. Återskapa UI:t pixel-troget med kodbasens befintliga komponenter och klassnamn.

---

## STEG 1 — Designtokens (`web/app/globals.css`)
Ersätt värdena i `:root` med blocket nedan. Detta ensamt reskinnar nästan hela appen
(kort, filter, favoriter, auth, status-lägen) eftersom komponenterna redan refererar tokens.
Behåll `@theme inline`-mappningarna oförändrade.

```css
:root {
  --radius: 1rem;            /* kort/panel 16px */

  --ink: #1A1713;            /* near-black, varm */
  --ink-dim: #6A6359;
  --ink-faint: #A39C8E;
  --line: #E6E1D7;           /* hårfin linje */
  --muted-surface: #F1EEE7;

  --rise: #547F4A;           /* dämpad sage-grön */
  --rise-soft: #E9EFE4;
  --fall: #A6473E;           /* dämpad tegel — direction down */

  /* EN accent — "Ember", djup cinnamon. Används sparsamt. */
  --signal: #A8501E;
  --signal-soft: #F4E8DE;
  --signal-deep: #8A4218;    /* NY token: text ovanpå signal-soft */

  /* shadcn-bryggan → varm cream-neutral */
  --background: #FAF8F3;     /* varm off-white (något varmare än förr) */
  --foreground: #1A1713;
  --card: #FFFFFF;
  --card-foreground: #1A1713;
  --popover: #FFFFFF;
  --popover-foreground: #1A1713;
  --primary: #1A1713;
  --primary-foreground: #FAF8F3;
  --secondary: #F1EEE7;
  --secondary-foreground: #1A1713;
  --muted: #F1EEE7;
  --muted-foreground: #8A857A;
  --accent: #F1EEE7;
  --accent-foreground: #1A1713;
  --destructive: #A6473E;
  --border: #E6E1D7;
  --input: #E0DACE;
  --ring: #A8501E;
}
```

Lägg till `--signal-deep` i `@theme inline` så `text-signal-deep` blir användbar:
```css
@theme inline {
  /* …befintligt… */
  --color-signal-deep: var(--signal-deep);
}
```

Justera även hjälp-klasserna i samma fil:
- `.hero-wash` → `radial-gradient(120% 95% at 50% -12%, #F4ECE0 0%, #FAF8F3 58%)`.
- `.ring-signal:focus-within` fungerar vidare (använder `--signal` / `--signal-soft`).

**Alternativa accenter** (kund-val, ej default): Ockra `#9E6B2E`, Claret `#7A2E33`,
Petrol `#1F5450`. Byt bara `--signal`/`--ring` + härled en mjuk tint för `--signal-soft`.

## STEG 2 — Fonter (`web/app/layout.tsx`)
Byt `next/font/google`-importerna:
- `--font-sans` **och** `--font-display` → **Schibsted Grotesk** (400/500/600/700)
- `--font-mono` → **Geist Mono** (400/500/600)

```ts
import { Schibsted_Grotesk, Geist_Mono } from "next/font/google";

const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", weight: ["400","500","600","700"] });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400","500","600"] });
// --font-display delar sans-facet: sätt style={{ ['--font-display']: 'var(--font-sans)' }} på <html>,
// eller ge Schibsted en andra `variable`.
```
Effekt: alla `font-display`-rubriker blir Schibsted Grotesk 700 (tight `tracking`,
`letter-spacing: -.02em` till `-.03em` på stora storlekar). All `font-mono` (Trend Score,
metrik, etiketter) blir Geist Mono.

---

## STEG 3 — Komponenter

### 3a. Märke / wordmark (`web/components/site-header.tsx` + auth)
Lägg till **orbit-symbolen** före ordet "Orbit" (en lutad ring + kärna + Ember-satellit).
Behåll prick-lockupen som fallback. Inline-SVG (geometrisk, inga assets):

```html
<svg width="22" height="22" viewBox="0 0 40 40" aria-hidden>
  <ellipse cx="20" cy="20" rx="17" ry="8" fill="none" stroke="currentColor" stroke-width="2.4" transform="rotate(-28 20 20)"/>
  <circle cx="20" cy="20" r="4.5" fill="currentColor"/>
  <circle cx="33.5" cy="12.6" r="3.4" fill="var(--signal)"/>
</svg>
```
Wordmark: `font-display`, `font-bold`, `tracking-[-0.025em]`, `text-ink`. Nav: aktiv länk
får `bg-muted` + `text-ink` + `rounded-[9px]`; inaktiva `text-ink-dim`, hover `text-ink`.

### 3b. `video-card.tsx` (kärnan — se `OrbitCard.dc.html`)
Behåll 9:16-poster (faktiskt `aspect-[9/16]` i mocken; din nuvarande `3/4` funkar också,
men referensen är 9:16), plattforms-pill (uppe vänster), spara-hjärta (uppe höger).
Premium-ändringar:

1. **Trend Score = ring** (ersätter prick+siffra). Vit chip nere vänster på postern med en
   liten SVG-ring som fylls efter poängen 0–10:
   ```
   r = 9, viewBox 0 0 24 24, transform rotate(-90)
   bakgrundsring stroke #EDE6DA, 3px
   progressring stroke var(--signal), 3px, stroke-linecap round
   stroke-dasharray = `${(score/10) * (2*π*9)} ${(2*π*9).toFixed(2)}`   (omkrets ≈ 56.55)
   ```
   Bredvid ringen: tal (Geist Mono 12px/600, `text-ink`) + etikett "TREND" (Geist Mono 7px,
   `tracking-[.14em]`, `text-ink-faint`).
2. **Views** nere höger på postern (Geist Mono 10px, vit, mjuk text-shadow).
3. **Signal-rad** i kroppen: vänster sparkline (`polyline`, stroke `var(--signal)`, 2px,
   52×18, rounded) + etikett "tempo"; höger **outlier-chip** `bg-signal-soft text-signal-deep`,
   radie 8px, text `▲ {outlier}× snittet`. Behåll graceful hide när `outlierRatio == null`.
4. **Metrik-grid** 4 kol (Visn./Likes/Komm./Del.): mono-värde 12px + versal mono-etikett 8px,
   `text-ink` resp. `text-[#B3AC9E]`, hårfin topplinje `#F0ECE4`. (Ikonlöst — referensen är ren.)
5. **Hover:** `-translate-y-1`, skugga `0 22px 46px -24px rgba(46,37,26,.42)`, border → `#DCD5C8`.
   Vila: `border #E6E1D7` + skugga `0 1px 2px rgba(40,33,24,.04)`, radie 16px.

### 3c. `trend-brief.tsx` (intelligence report)
Vit panel, `border-line`, radie 16px, skugga vila. Innehåll:
- **Header:** eyebrow (Geist Mono versal, `text-signal`) "Trendöversikt" + rubrik
  `Vad som driver «{q}» just nu` (q i `text-signal`); status-pill `bg-rise-soft text-[#3F6037]`
  med grön prick "Uppdaterad nyss".
- **Statremsa** med hårfina avdelare. Första tilen "Momentum, 14 dagar" får en **mini-area-graf**
  (inline-SVG: `polygon` fill `var(--signal)` @0.08 + `polyline` stroke `var(--signal)` 2.2px +
  slut-`circle`). Övriga tiles: Snitt Trend Score (`8.4 / 10`), Breakouts ("3 nya"),
  Bästa tid ("07–09"). Etikett Geist Mono 9px versal; värde 24px/700.
- **Hooks-rad** (botten, `bg-[#FBFAF6]`): etikett "Hooks som funkar" + chips (vit, border-line)
  med siffran i `text-signal` (mono).

Driv allt från `summarizeSearch` precis som idag; rendera bara tiles datan stöder.

### 3d. Filter (`search-filters.tsx` / `search-controls.tsx`)
Aktiv sortering visas som chip `bg-signal-soft text-signal-deep border-[#ECDCCB]` med ✕.
Övriga aktiva filter: vit chip `border-line text-ink-dim` med ✕. "Filter"-knappen:
vit, `border-[#E0DACE]`, `SlidersHorizontal`-ikon + antal-badge (`bg-primary text-white`,
Geist Mono). (Valfritt: command-dropdown enligt tidigare handoff — bockar i `text-signal`.)

### 3e. Hero (`search-hero.tsx`)
- Eyebrow Geist Mono versal `tracking-[.24em]` i `text-signal`.
- H1 `font-display` 54px/700, `tracking-[-0.03em]`; "innan den toppar." i `text-signal`.
- Sökfält: vit, `border-[#E0DACE]`, radie 14px, skugga `0 18px 44px -20px rgba(60,45,30,.3)`,
  Ember-sökikon, `/`-kbd.
- Förslags-pills: vita, `rounded-full`, `border-line`.
- **NY**: svagt orbit-motiv som bakgrund (stor genomskinlig `ellipse`, opacity ~.5) uppe höger,
  samt en mono-statremsa under: "12 430 ämnen indexerade · TikTok & Reels · uppdateras dygnet runt"
  (siffror riktiga om datan finns, annars dölj).

### 3f. Favoriter (`favoriter/page.tsx`)
Samlingar som **pill-tabs** (`rounded-full`): aktiv `bg-primary text-white` + mono-antal;
inaktiv vit `border-line text-ink-dim` + faint mono-antal; "+ Ny samling" streckad pill.
Rubrik `font-display` 32px/700. Grid oförändrad (`OrbitCard`).

### 3g. Auth (`login`, `register`, `auth-form.tsx`)
Reskinnas av token-bytet. Detaljer: orbit-symbol ovanför wordmarken; kort radie 16px med
skugga `0 18px 44px -22px rgba(60,45,30,.25)`; inputs radie 11px, fokus
`border-signal` + `ring-4 ring-signal-soft`; länkar ("Registrera"/"Logga in") i
`text-signal font-semibold`. Felruta: `bg-[#F8EAE7] border-[#EBCDC8] text-fall` med
varnings-ikon. Behåll all copy & Supabase-felöversättningar.

### 3h. Status (`search-collecting.tsx`) + tom-läge (`ResultsEmpty` i `search/page.tsx`)
- Slim-pill: `bg-signal-soft border-[#ECDCCB]`, mono-spinner (border-top `--signal`).
- Cold-panel: `radial-gradient(120% 100% at 50% 0%, #F6ECE0, #FCFAF6 70%)`, radie 16px, svagt
  orbit-motiv bakom; rubrik `font-display` 22px/700.
- Tom-läge: streckad `border-line` panel `bg-[#FBFAF6]`, sök-ikon i rundad `bg-muted`-bricka,
  rubrik 24px/700, förslags-pills.

---

## Interactions & Behavior
- **Sök:** `/search?q=…` (oförändrat). Sortering/filter via query-params.
- **Spara:** hjärtat togglar via befintlig `save-button` server action.
- **Collecting:** pollar var 4:e sekund (befintlig logik), max 3 min.
- **Hover på kort:** lyft + skugga, `transition 220ms cubic-bezier(.2,.7,.3,1)`.
- **Reduced motion:** behåll `prefers-reduced-motion`-respekt; orbit-motivets rotation
  (`@keyframes`) ska stängas av under reduced motion.
- Inga nya tunga animationer — håll det lugnt.

## State Management & Data
Inga nya datakrav utöver dagens. Fält UI:t använder (dölj graciöst om de saknas):
- **`outlierRatio`** → outlier-chip (`round` → "8× snittet"); null ⇒ dölj chip.
- **`viewsPerDay`** (velocity) → "+{x}/dag"-chip i `--rise`; null/≤0 ⇒ dölj.
- **`trendScore`** (0–10) → ringen; saknas ⇒ fall tillbaka till `engagementRate` (visa "ENG").
- **Sparkline-serie** (senaste ~6 view-snapshots) → `polyline`-punkter; saknas ⇒ dölj sparkline.
- **`summarizeSearch(items)`** → trendöversiktens tiles + hooks (befintlig `lib/trend-brief`).

> I mockupen är siffror/serier illustrativa. Markera tydligt vad som är riktiga mätvärden
> vs platshållare när backend kopplas.

## Design Tokens (sammanfattning)
- **Färg:** se STEG 1. Accent `--signal #A8501E`, soft `#F4E8DE`, deep `#8A4218`.
  Ink `#1A1713 / #6A6359 / #A39C8E`. Linje `#E6E1D7`, yta `#F1EEE7`, bg `#FAF8F3`, kort `#FFF`.
  Stiger `#547F4A` (soft `#E9EFE4`), faller `#A6473E`.
- **Avatar/poster-gradienter** (varma, jordnära): `#E6D2BE→#B07A4A`, `#E9D7C6→#A8623A`,
  `#EADFCE→#BBA06E`, `#DDE0CF→#7E8A66`, `#D9DBE0→#7F8794`, `#E7D2CC→#A87A72`.
- **Radie:** chip 8px, input/knapp 11px, kort/panel 16px, pill 999px.
- **Typografi:** Schibsted Grotesk (rubrik 700, `letter-spacing -.02em`→`-.03em`; brödtext 400/500);
  Geist Mono för score/metrik/etiketter (versal `letter-spacing .08–.14em`).
- **Skala:** hero H1 54px · sidrubrik 26–32px · underrubrik 19–21px · brödtext 14–18px ·
  metrik 12px · mono-etikett 8–11px (minsta 8px för versala mono-etiketter).
- **Skugga:** vila `0 1px 2px rgba(40,33,24,.04)`; kort-hover `0 22px 46px -24px rgba(46,37,26,.42)`;
  popover `0 24px 54px -22px rgba(46,37,26,.4)`; auth-kort `0 18px 44px -22px rgba(60,45,30,.25)`.
- **Sparkline/grafer:** stroke `--signal` 2–2.5px, `linecap/linejoin: round`; area fill `--signal` @0.08.

## Assets
Inga bild-assets. Märke, ikoner (sök, users, sliders, play, trend, klocka), Trend Score-ring,
sparklines och orbit-motivet är alla inline-SVG (geometriska former) — se referensfilerna.
Behåll `lucide-react` för app-ikoner där det redan används.

## Files (i detta paket)
- `Orbit Designsystem.dc.html` — huvudreferensen: grunder (märke, färg, typografi, ikonografi,
  komponentkatalog, elevation/radie/spacing) + alla skärmar (hero, sökresultat + trendöversikt,
  kort-anatomi, Trend Score/outlier förklarat, favoriter, login, register, fel, collecting, tomt).
- `OrbitCard.dc.html` — videokortets exakta anatomi (score-ring, sparkline, outlier-chip, metrik).
- `support.js` — runtime som behövs för att öppna `.dc.html`-filerna lokalt (byggs ej om).

## Kodbas-filer att röra (i `web/`)
```
app/globals.css                     → STEG 1 (tokens + hjälp-klasser)
app/layout.tsx                      → STEG 2 (fonter)
components/site-header.tsx          → 3a (orbit-symbol + nav)
components/video-card.tsx           → 3b (score-ring, signal-rad, metrik, hover)
components/trend-brief.tsx          → 3c (momentum-graf, hooks)
components/search-filters.tsx       → 3d
components/search-controls.tsx      → 3d
components/search-hero.tsx          → 3e (orbit-motiv, statremsa)
app/(app)/favoriter/page.tsx        → 3f (pill-tabs)
app/login/page.tsx · register/page.tsx · components/auth-form.tsx → 3g
components/search-collecting.tsx    → 3h
app/(app)/search/page.tsx           → 3h (ResultsEmpty)
```

## Implementeringsordning (förslag)
1. STEG 1 + 2 (tokens + fonter) → verifiera att hela appen reskinnats. Liten, hög utväxling.
2. `video-card.tsx` (score-ring + signal-rad + metrik + hover).
3. `trend-brief.tsx` (momentum-graf + hooks).
4. Hero + märke (orbit-symbol).
5. Favoriter, auth, status/tomt.
6. Filter-förfining (valfri dropdown).
