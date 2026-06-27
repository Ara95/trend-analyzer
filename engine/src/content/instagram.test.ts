import { describe, it, expect } from 'vitest';
import { detectLanguage, flattenReels, isSwedish, normalizeInstagramReels } from './instagram.js';

describe('isSwedish', () => {
  it('accepts captions with multiple Swedish marker words', () => {
    expect(isSwedish('Det här är ett recept som jag älskar att laga')).toBe(true);
  });

  it('accepts a single marker plus å/ä/ö', () => {
    expect(isSwedish('Träning för dig')).toBe(true); // 'för' marker + ä
  });

  it('rejects Danish/Norwegian look-alikes (og/er/jeg/ikke)', () => {
    expect(isSwedish('Jeg elsker denne opskrift og det er nemt')).toBe(false);
  });

  it('rejects other-language false friends on the same keyword', () => {
    expect(isSwedish('Pita sa sirom recept koji koristim')).toBe(false); // Serbian
    expect(isSwedish('Nejsem ten typ co by si navařil')).toBe(false); // Czech
  });

  it('rejects empty / emoji-only captions (precision over recall)', () => {
    expect(isSwedish(undefined)).toBe(false);
    expect(isSwedish('🔥🔥🔥')).toBe(false);
  });
});

describe('detectLanguage', () => {
  it('marks Swedish prose as sv', () => {
    expect(detectLanguage('Det här är ett recept jag älskar')).toBe('sv');
  });

  it('marks foreign prose as xx (dropped)', () => {
    expect(detectLanguage('Pita sa sirom recept koji koristim')).toBe('xx'); // Serbian
  });

  it('marks wordless captions as un (kept, not foreign)', () => {
    expect(detectLanguage(undefined)).toBe('un');
    expect(detectLanguage('🔥🔥🔥')).toBe('un');
    expect(detectLanguage('#fyp #reels #viral')).toBe('un'); // hashtag-only → no signal
    expect(detectLanguage('@someone 💪🏼✨')).toBe('un'); // mention + emoji → no signal
  });

  it('routes a recovered emoji-only Swedish reel to un so the gate keeps it', () => {
    const reel = {
      id: 'r-un',
      caption: { text: '✨🔥 #fitness' },
      ig_play_count: 80000,
      taken_at: 1_700_000_000,
      user: { username: 'creator' },
    };
    const [out] = normalizeInstagramReels([reel]);
    expect(out.textLanguage).toBe('un');
  });

  describe('search-query hint', () => {
    it('recovers a single-content-word Swedish caption when the query word is present (+ å/ä/ö)', () => {
      // No function-word marker, but "träning" is the (Swedish-distinct) query AND is in the caption,
      // plus it carries an ä → 1 hit + åäö = Swedish. Without the query it would be dropped as xx.
      expect(detectLanguage('Träning 💪', 'träning')).toBe('sv');
      expect(detectLanguage('Träning 💪')).toBe('xx'); // same caption, no query → still xx
    });

    it('does NOT credit a query that is absent from the caption (no blind trust of the search)', () => {
      expect(detectLanguage('Full body workout video', 'träning')).toBe('xx');
    });

    it('credits an åäö-bearing query UNCONDITIONALLY when present — even a code-switched caption (accepted tradeoff)', () => {
      // The credited word "träning" supplies the ä, so {hits:1, hasAao:true} → sv regardless of the
      // rest of the caption. This is required to recover "Träning 💪"; safety rests on the query
      // being genuinely Swedish-distinct (env.ts discipline), NOT on the z-rule. See swedishHits.
      expect(detectLanguage('full body workout träning', 'träning')).toBe('sv');
    });

    it('keeps false friends safe: a present query word alone cannot flip a non-Swedish caption', () => {
      // "recept" (a known false friend) appears, but with no å/ä/ö and no 2nd marker the rule holds.
      expect(detectLanguage('Pita sa sirom recept koji koristim', 'recept')).toBe('xx'); // Serbian
      expect(detectLanguage('Recept 🔥', 'recept')).toBe('xx'); // ambiguous single word → not Swedish
    });

    it('reads the __searchQuery tag the collector attaches to each reel', () => {
      const reel = {
        id: 'r-q',
        caption: { text: 'Träning 💪 #gym' },
        ig_play_count: 90000,
        taken_at: 1_700_000_000,
        user: { username: 'creator' },
        __searchQuery: 'träning',
      };
      const [out] = normalizeInstagramReels([reel]);
      expect(out.textLanguage).toBe('sv');
    });
  });
});

describe('normalizeInstagramReels', () => {
  const taken = 1_700_000_000; // unix seconds
  const reel = {
    id: 'r1',
    caption: { text: 'Det här är min favorit träning för veckan' },
    ig_play_count: 50000,
    like_count: 2000,
    comment_count: 150,
    share_count: 300,
    taken_at: taken,
    user: { username: 'SvenssonFit' },
    image_versions2: { candidates: [{ url: 'https://img/cover.jpg' }] },
    clips_metadata: { music_info: { music_asset_info: { audio_cluster_id: 'aud-9' } } },
  };

  it('maps raw IG GraphQL onto the flat shape rankContent reads', () => {
    const [out] = normalizeInstagramReels([reel]);
    expect(out).toMatchObject({
      id: 'r1',
      playCount: 50000,
      diggCount: 2000,
      commentCount: 150,
      shareCount: 300,
      authorMeta: { name: 'svenssonfit' }, // lowercased
      musicMeta: { musicId: 'aud-9' },
      videoMeta: { coverUrl: 'https://img/cover.jpg' },
      textLanguage: 'sv',
    });
  });

  it('harvests inline caption hashtags (Unicode-aware, deduped, lowercased)', () => {
    const tagged = {
      ...reel,
      id: 'r3',
      caption: { text: 'Bästa träningen 💪 #Träning #hälsa #träning #FYP' },
    };
    const [out] = normalizeInstagramReels([tagged]);
    expect(out.hashtags).toEqual(['träning', 'hälsa', 'fyp']);
  });

  it('converts taken_at (unix seconds) to an ISO string rankContent can parse', () => {
    const [out] = normalizeInstagramReels([reel]);
    expect(out.createTimeISO).toBe(new Date(taken * 1000).toISOString());
    expect(Number.isFinite(Date.parse(out.createTimeISO))).toBe(true);
  });

  it('tags non-Swedish reels as "xx" so the sv-gate drops them', () => {
    const foreign = { ...reel, id: 'r2', caption: { text: 'Pita sa sirom recept' } };
    const [out] = normalizeInstagramReels([foreign]);
    expect(out.textLanguage).toBe('xx');
  });

  it('prefers the shortcode (code) over numeric id so permalinks resolve', () => {
    const [out] = normalizeInstagramReels([{ ...reel, id: '999_111', code: 'C8xYzAbc' }]);
    expect(out.id).toBe('C8xYzAbc');
  });

  it('skips reels with no id and falls back to id/pk when code is absent', () => {
    const out = normalizeInstagramReels([
      { caption: { text: 'x' }, taken_at: taken }, // no id at all -> skipped
      { pk: 12345, caption: { text: 'y' }, taken_at: taken },
      { id: '777', caption: { text: 'z' }, taken_at: taken },
    ]);
    expect(out.map((o) => o.id)).toEqual(['12345', '777']);
  });

  it('flattenReels unwraps {posts:[...]} / {reels:[...]} and flat shapes', () => {
    expect(flattenReels([{ reels: [{ id: 'a' }, { id: 'b' }] }])).toHaveLength(2);
    expect(flattenReels([{ posts: [{ id: 'c' }] }])).toHaveLength(1);
    expect(flattenReels([{ id: 'd' }])).toHaveLength(1);
  });
});
