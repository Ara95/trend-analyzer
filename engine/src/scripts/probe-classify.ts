import '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createOpenAIContentClassifier } from '../providers/openai.js';
import { REAL_INDUSTRIES } from '../config/industries.js';

// Throwaway validation: does the content-first prompt flip the real mislabels found in the DB?
// Text-only (no image) so it needs no fetchable cover URL. Captions are representative of each
// handle's content. Run: npx tsx src/scripts/probe-classify.ts
const cfg = loadEnv();
const cc = createOpenAIContentClassifier(cfg.openaiApiKey!, cfg.openaiVisionModel);

const cases = [
  { handle: 'svtsport', was: 'fitness', expect: 'sports', caption: 'Klart: här är truppen till fotbolls-EM 🇸🇪', hashtags: ['fotboll', 'landslaget', 'fotbollsem'] },
  { handle: 'sportbladet', was: 'fitness', expect: 'sports', caption: 'MÅL! Se Isaks drömträff i sista minuten mot Arsenal', hashtags: ['premierleague', 'fotboll'] },
  { handle: 'aftonbladet', was: 'sports/tech', expect: 'news', caption: 'Polisen larmar om ökat antal inbrott i Stockholm – så skyddar du ditt hem', hashtags: ['nyheter', 'stockholm'] },
  { handle: 'rapnyheter.se', was: 'tech', expect: 'music/entertainment', caption: 'Ny diss-låt släppt inatt – fansen rasar 🎤', hashtags: ['hiphop', 'rap', 'musik'] },
  { handle: '(fitness reverse-check)', was: '—', expect: 'fitness', caption: '3 övningar för starkare core 💪 testa detta pass hemma', hashtags: ['träning', 'gym', 'fitness'] },
];

for (const c of cases) {
  const labels = await cc({ caption: c.caption, hashtags: c.hashtags, industries: REAL_INDUSTRIES });
  const top = labels[0];
  const ok = top && c.expect.includes(top.industry) ? '✅' : '❌';
  console.log(`${ok} ${c.handle.padEnd(24)} was=${c.was.padEnd(12)} -> ${top ? `${top.industry} (${top.confidence.toFixed(2)})` : 'UNKNOWN'}  [expect ${c.expect}]`);
}
