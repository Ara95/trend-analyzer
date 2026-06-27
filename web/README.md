# Trender — trendanalys

Rent, minimalt dashboard för trenderna som engine:n samlar in. Visar vad som
stiger och faller per **dag / vecka / månad** över kategorierna *beauty,
fashion, food, fitness, tech* — med klickbara förhandsvisningar som länkar till
originalkällan.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **React 19**, ljust/minimalt tema
- **shadcn/ui** på Tailwind v4, Geist som typsnitt
- **HTML-first** där det går: filter är vanliga `<Link>`-ankare drivna av
  URL-parametrar (ingen klient-state), och förhandsvisningen är en native
  `<dialog>` — inga tunga komponentbibliotek.

## Köra

```bash
npm install
npm run dev      # http://localhost:3000
```

Utan konfigurerad Supabase visas **inga trender** (tomt läge) tills riktig data
är inkopplad.

### Koppla data

Kopiera `.env.example` → `.env.local` och fyll i:

```
SUPABASE_URL=http://127.0.0.1:64321          # eller ditt molnprojekt
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

Läses **endast server-side** (`lib/trends.ts`, Server Components) och når aldrig
webbläsaren. Engine:n har ännu inte lagt till RLS/anon-grants, så server-side
service-role är den korrekta bryggan tills dess. Om Supabase är otillgängligt
(t.ex. lokal stack ej igång) visas tomt läge.

## Hur data tolkas

Tabellen `trends` är primär läsyta, filtrerad på `(country, industry, period)`.

| Klass | Källa | Riktning | Rörelse |
|-------|-------|----------|---------|
| A (`trend-feed`, TikTok) | färdiga trendflöden | `direction`-fältet | `rank_movement` |
| B (`raw-content`, Instagram) | `content_snapshots` | tecken på `velocity_score` | `velocity_score` |

Reels (Klass B) kopplas till sitt klipp via `external_id` och länkar ut till en
**stabil Instagram-permalänk** rekonstruerad från shortcode — inte den
utgående `metrics.videoUrl` (som är en tillfällig nedladdnings-URL).

## Känd begränsning — omslagsbilder

Engine:n laddar **inte** ner video eller thumbnails (den analyserar bara
metadata/transkript). Förhandsvisningarna är därför **genererade affischer**,
inte riktiga stillbilder. Klippet spelas på källan via länken. För riktiga
omslag krävs en engine-ändring som sparar `displayUrl`/cover i
`content_snapshots`.
