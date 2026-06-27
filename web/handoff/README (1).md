# Handoff: Orbit — Nordisk UI/UX-omdesign

## Overview
Orbit är ett inspirationssök-verktyg för kreatörer: man söker ett ämne, får de starkaste
TikTok-/Reels-videorna rankade efter **Trend Score**, kan filtrera och spara till favoriter.
Den här omdesignen ger appen ett lugnt, ljust, **nordiskt** uttryck (bort från den mörka/hype-iga
"amerikanska" looken) och lägger till en **intelligenslagring** inspirerad av Virlo:
outlier-poäng, trendöversikt per sökning och en kreatörsanalys-sida.

## About the Design Files
Filerna i detta paket är **designreferenser skapade i HTML** (Design Components, `.dc.html`).
De visar avsedd look och beteende — de är **inte produktionskod att kopiera rakt av**.
Uppgiften är att **återskapa designen i den befintliga kodbasen** (Next.js App Router, React,
Tailwind v4, shadcn/ui, Supabase) med dess etablerade mönster. Eftersom kodbasen redan använder
semantiska tokens (`text-ink`, `border-line`, `bg-signal`, `bg-muted-surface` …) är **merparten av
omstylingen ett byte av variabelvärden i `globals.css`** — resten är fontbyte plus några nya
komponenter/sidor för de nya funktionerna.

## Fidelity
**Hög fidelitet (hifi).** Färger, typografi, spacing och radie är slutgiltiga och anges exakt nedan.
Återskapa UI:t pixel-troget med kodbasens befintliga komponenter och klassnamn.

---

## Kodbas-kontext (befintliga filer)
```
web/app/globals.css                      → designtokens (CSS-variabler) + @theme
web/app/layout.tsx                       → next/font (--font-sans, --font-mono, --font-display)
web/app/(app)/layout.tsx                 → app-shell, renderar <SiteHeader/>
web/app/(app)/search/page.tsx            → sök/landning + resultat (ResultsEmpty finns här)
web/app/(app)/favoriter/page.tsx         → favoriter + samlingar
web/app/login/page.tsx                   → login (renderar <AuthForm mode="login"/>)
web/app/register/page.tsx                → register
web/components/site-header.tsx           → toppnav
web/components/search-hero.tsx           → landningshero
web/components/search-bar.tsx            → sökfält
web/components/search-filters.tsx        → filter (segmented controls idag)
web/components/search-collecting.tsx     → live-scrape-status (cold + slim pill)
web/components/video-card.tsx            → videokort (kärnkomponenten)
web/components/save-button.tsx           → spara-hjärta
web/components/auth-form.tsx             → delat login/register-formulär
web/components/ui/*                       → shadcn (button, card, badge, tabs, separator)
```

---

## STEG 1 — Designtokens (`web/app/globals.css`)
Ersätt värdena i `:root` med detta block. Detta ensamt reskinnar hela appen
(kort, filter, favoriter, auth, status-lägen) eftersom komponenterna redan refererar tokens.

```css
:root {
  --radius: 0.875rem;

  --ink: #17171A;          /* near-black, något varm */
  --ink-dim: #6E6B64;
  --ink-faint: #A5A29B;
  --line: #EAEAE6;         /* hårfin linje */
  --muted-surface: #F4F2EE;

  --rise: #5C8A4E;         /* dämpad grön */
  --fall: #B23A2C;

  --signal: #C2541E;       /* tegel/ler-accent — "het/trend" men nordiskt dämpad */
  --signal-soft: #F6ECE3;

  /* shadcn-bryggan */
  --background: #FAFAF8;   /* varm off-white */
  --foreground: #17171A;
  --card: #FFFFFF;
  --card-foreground: #17171A;
  --popover: #FFFFFF;
  --popover-foreground: #17171A;
  --primary: #17171A;
  --primary-foreground: #FAFAF8;
  --secondary: #F4F2EE;
  --secondary-foreground: #17171A;
  --muted: #F4F2EE;
  --muted-foreground: #8A8780;
  --accent: #F4F2EE;
  --accent-foreground: #17171A;
  --destructive: #B23A2C;
  --border: #EAEAE6;
  --input: #E3E0D9;
  --ring: #C2541E;
}
```

Behåll `@theme inline`-mappningarna som de är. Justera även de befintliga hjälp-klasserna:
- `.hero-wash` → varm radial: `radial-gradient(120% 95% at 50% -12%, #F4EFE9 0%, #FAFAF8 58%)`.
- `.hero-grid` (prick-rutnätet) — ta bort eller dämpa; den nordiska heron är renare utan det.
- `.ring-signal:focus-within` fungerar vidare (använder `--signal` / `--signal-soft`).

## STEG 2 — Fonter (`web/app/layout.tsx`)
Byt `next/font/google`-importerna. Mål:
- `--font-sans` **och** `--font-display` → **Hanken Grotesk** (vikter 400/500/600/700)
- `--font-mono` → **JetBrains Mono** (400/500/600)

```ts
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", weight: ["400","500","600","700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400","500","600"] });
// --font-display pekar på samma som sans:
// sätt style={{ ['--font-display']: 'var(--font-sans)' }} på <html>, eller ge Hanken en andra variable.
```
Effekt: `font-display`-rubrikerna slutar vara serif och blir Hanken Grotesk 700 (tight `tracking`).
All `font-mono` (Trend Score, metrik, etiketter) blir JetBrains Mono.

---

## STEG 3 — Komponentändringar

### 3a. `video-card.tsx` (kärnan — se `OrbitCardN.dc.html`)
Behåll 9:16-postern, plattforms-pill (uppe vänster) och spara-hjärtat (uppe höger). Ändra:

1. **Trend Score-chip** — flytta från uppe-höger till **nere vänster** på postern och gör den
   ren och ljus istället för det fyllda flam-chippet:
   - vit bakgrund `rgba(255,255,255,.94)`, radie 9px, `box-shadow:0 2px 10px rgba(0,0,0,.14)`
   - innehåll: liten prick (7px, `--signal`) · tal (mono 12px/600, `--ink`) · "TS" (mono 8px, `--ink-faint`)
2. **Signal-rad** i kortkroppen, mellan caption och metrik-griden:
   - vänster: en **sparkline** (inline-SVG `polyline`, stroke `--signal`, 2px, ~50×18) + etikett "tempo" (mono 9px, faint)
   - höger: **outlier-chip** `bg-signal-soft text-signal`, radie 7px, text `▲ {outlier}× snittet` (12px/600)
3. **Metrik-griden** (4 kolumner, hårfin topplinje): byt från ikon+värde till **värde + liten
   versal mono-etikett** ("VISN.", "LIKES", "KOMM.", "DEL.") för ett renare, mer datadrivet uttryck.
   (Behåller du hellre lucide-ikonerna går det — men referensdesignen är ikonlös.)
- Hover: `-translate-y-0.5`, `border-color` → något mörkare hårlinje, `box-shadow:0 16px 38px -20px rgba(40,35,28,.4)`.

### 3b. Ny komponent: `components/trend-brief.tsx` (Virlo-inspirerad "intelligence report")
Renderas överst i sökresultaten (i `search/page.tsx`, ovanför resultat-griden, endast när `items.length > 0`).
Vit panel, hårfin border, radie 16px. Innehåll:
- **Header**: eyebrow (mono versal) "Trendöversikt" + rubrik `Vad som driver «{q}» just nu`;
  till höger en status-pill med grön prick "Uppdaterad nyss".
- **Statremsa** (flex, hårfina avdelare mellan): 5 nyckeltal — *Momentum* (t.ex. "Stigande ▲ +38% v/v",
  delta i `--signal`), *Snitt Trend Score* (`8.4 / 10`), *Breakouts* ("3 nya"), *Topplattform*
  ("TikTok · 62%"), *Bästa tid* ("07–09"). Varje tile: mono-versal etikett + värde (21px/700).
- **Hooks-rad** (botten, ljus bg `#FBFAF8`): etikett "Hooks som funkar" + 2–4 chips
  (`"POV: du …" 43%`, `"3 saker ingen säger om …" +340%`), siffran i `--signal`.

### 3c. Ny sida: kreatörsanalys — `app/(app)/kreatorer/[handle]/page.tsx`
Virlos "profile analyzer", nordiskt. Layout (max-w-6xl, samma som övriga sidor):
- **Profilheader**: avatar (rund, gradient), namn (24px/700) + handle (mono), nisch/ort;
  till höger följarantal + delta (`▲ +12,4K (30 d)` i `--signal`); knappar
  "♥ Spara kreatör" (primary, `bg-primary`) + "Följ" (outline).
- **Statremsa**: 5 tiles — Eng. rate, Snittvisningar, Bästa tid, Inlägg/v, Snitt Trend Score
  (samma stil som trend-brief-remsan).
- **Räckviddsgraf** (30 dagar): area + linje (inline-SVG, stroke `--signal`, fill `--signal` @ 0.07),
  slut-prick; rubrik + delta "▲ +64%".
- **"Hooks som funkar för henne"**: lista med 3 rader (text + stat i `--signal`).
- **Toppvideor**: samma `VideoCard`-grid (4 kол).
- Lägg till nav-länk **"Kreatörer"** i `site-header.tsx` (mellan Sök och Favoriter, lucide `Users`-ikon).

### 3d. `search-collecting.tsx`
Fungerar redan via tokens (spinnern använder `border-signal`). Justering: cold-panelen får ljus
bakgrund `radial-gradient(120% 100% at 50% 0%, #FBF2EB, #FCFAF7 70%)`, radie 16px; rubrik i
`font-display`/Hanken 700 (22px). Slim-pillen: `bg-signal-soft`, border `--line`, mono-spinnern intakt.

### 3e. Auth (`login/page.tsx`, `register/page.tsx`, `auth-form.tsx`)
Reskinnas av token-bytet. Detaljer: kort-radie 16px, inputs radie 10px med
`focus:border-signal focus:ring-4 focus:ring-signal-soft`; wordmark "Orbit" med liten `--signal`-prick
efter ordet. Felruta: `bg-destructive/10 text-destructive` (redan så). Behåll all copy och länkar.

### 3f. `search-filters.tsx` → sökvänlig dropdown (valfritt men rekommenderat)
Ersätt de fyra segmented-kontrollerna med **en** "Filter"-knapp (lucide `SlidersHorizontal` + antal-badge)
som öppnar en command-style dropdown: ett sökfält överst, grupperade rader (Sortering / Plattform /
Period / Språk) med bock (`--signal`) på valt alternativ, samt aktiva filter som chips bredvid knappen.
Använd gärna shadcn `Popover` + `Command` om de läggs till, annars en enkel egen dropdown.

---

## Interactions & Behavior
- **Sök**: `/search?q=…` (oförändrat). Sortering/filter via query-params (befintligt mönster).
- **Spara**: hjärtat togglar via befintlig `save-button` server action.
- **Filter-dropdown**: öppnar/stänger lokalt; val navigerar med `buildSearchHref`.
- **Collecting**: pollar var 4:e sekund (befintlig logik), max 3 min.
- **Hover på kort**: lyft + skugga (200ms ease). **Reduced motion**: behåll befintlig `prefers-reduced-motion`-respekt.
- Inga nya tunga animationer — håll det lugnt.

## State Management & Data
Nya datafält som UI:t förväntar sig (måste stödjas av `lib/videos` / engine — annars dölj graciöst):
- **`outlier`** per video = `round(views / creatorMedianViews)` → visas som "8× snittet".
  Kräver kreatörens median-/snittvisningar. Saknas det: dölj outlier-chippet.
- **Sparkline-serie** per video = senaste ~6 dagliga view-snapshots, normaliserade till `polyline`-punkter.
  Saknas serie: dölj sparklinen (kortet funkar ändå).
- **Trend brief-aggregat** (ny `lib`-funktion, t.ex. `summarizeSearch(items)`): snitt trend score,
  breakout-antal, plattformsfördelning, härledd "bästa tid", momentum v/v. Hooks kan i v1 vara
  härledda från caption-prefix eller hårdkodade tills NLP finns.
- **Kreatörsdata** (`lib/creators`): följare + delta, eng. rate, snittvisningar, bästa tid, inlägg/v,
  30-dagars räckviddsserie, topphooks, toppvideor. Ny route + datakälla.

> Notera: i mockuperna är siffror/serier **illustrativa**. Markera tydligt vad som är riktiga
> mätvärden vs. platshållare när du kopplar på backend.

## Design Tokens (sammanfattning)
- Färger: se STEG 1. Accent `--signal #C2541E`, soft `#F6ECE3`. Ink-skala `#17171A / #6E6B64 / #A5A29B`.
  Linje `#EAEAE6`, yta `#F4F2EE`, bakgrund `#FAFAF8`, kort `#FFFFFF`.
- Radie: kort 14–16px, knappar/inputs 10px, chips 7–10px, pills 999px. (`--radius: 0.875rem`.)
- Typografi: Hanken Grotesk (rubriker 700, tight `letter-spacing -.02em`; brödtext 400/500);
  JetBrains Mono för Trend Score, metrik, etiketter (versal `letter-spacing .1–.12em`).
- Skala (1080-bredd-mock): rubrik 52px hero / 24–30px sidrubrik; brödtext 14–18px; metrik 12px;
  mono-etikett 8–11px. Minsta text 10px (mono-etiketter).
- Skuggor: kort vila ingen/halvtransparent; hover `0 16px 38px -20px rgba(40,35,28,.4)`;
  popover `0 24px 54px -22px rgba(60,45,30,.35)`.
- Sparkline: stroke `--signal` 2px, `stroke-linecap/linejoin: round`.

## Copy (exakt, svenska)
- Hero H1: "Hitta nästa idé — **innan den toppar.**" Eyebrow: "Inspirationssök för kreatörer".
- Sub: "Sök ett ämne och få de starkaste TikTok- och Reels-videorna — rankade efter Trend Score och
  hur långt de slår sina kreatörers snitt."
- Trend brief-rubrik: "Vad som driver «{q}» just nu" · status "Uppdaterad nyss".
- Outlier-förklaring: "Visar hur många gånger fler visningar en video får än kreatörens egna snitt —
  så att en stark video från ett litet konto inte drunknar bakom de allra största."
- Trend Score-formel: "TS = 0.35·Engagemang + 0.30·Tempo + 0.20·Outlier + 0.15·Färskhet".
- Collecting: "Samlar in färska trender…" / "Uppdaterar med färska trender…".
- Empty: "Inga träffar ännu".
- Behåll all befintlig auth-copy och felöversättningar.

## Files (designreferenser i detta paket)
- `Orbit Redesign v2.dc.html` — **huvudreferensen**: alla skärmar (hero, sökresultat+trendöversikt,
  kreatörsanalys, Trend Score/Outlier-förklaring, filter, favoriter, login, register, fel, collecting, empty).
- `OrbitCardN.dc.html` — videokortets exakta anatomi (outlier-badge, sparkline, TS-chip, metrik).
- `Orbit Redesign.dc.html` + `OrbitCardA.dc.html` + `OrbitCardB.dc.html` — tidigare A/B-utforskning
  (varm-editoriell vs elektrisk). **Inte** målet, men användbar för alternativa accenter/typografi.
- `support.js` — runtime som behövs för att öppna `.dc.html`-filerna lokalt (referens, byggs ej om).

### Så öppnar du referenserna
Öppna valfri `.dc.html` i en webbläsare (de hämtar `support.js` i samma mapp). Designen är i
"canvas-läge" — panorera/zooma för att se alla skärmar bredvid varandra.

## Implementeringsordning (förslag)
1. STEG 1 + 2 (tokens + fonter) → verifiera att hela appen reskinnats. Liten, hög utväxling.
2. `video-card.tsx` (TS-chip + outlier + sparkline + metrik).
3. `trend-brief.tsx` + inkoppling i `search/page.tsx`.
4. Filter-dropdown.
5. Kreatörsanalys-sidan + nav-länk + datakälla.
6. Putsa collecting/empty/auth.
```
