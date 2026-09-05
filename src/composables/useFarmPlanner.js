import { resolveSource, traverseTc, qualityChances, uniquePool, setPool } from './useDropSimulation.js';

/**
 * Where to farm for a list of items.
 *
 * The drop calculator answers "what does this monster drop" and "who drops
 * this item". The planner asks the question a player actually has: I want any
 * of these five things - where do I go? A run is not one kill, so each spot is
 * scored per run: the boss once, the superuniques once, and then packs,
 * minions, champions and trash in the numbers the run profile says. The
 * profile is the player's - how many packs one clears in the Sewers is a habit,
 * not a fact in the data.
 *
 * Per kill, the chance of at least one hit is 1 - prod(1 - p_item); per run
 * the misses multiply again across kills. Monsters of an area go in as the
 * average over its spawn list: the game picks a subset per game, and the mean
 * is what a player meets over many games.
 */

export const DEFAULT_PROFILE = {
  packs: 4,          // unique packs cleared per run
  minionsPerPack: 3,
  champPacks: 2,     // champion packs per run
  champsPerPack: 3,
  trash: 30,         // ordinary kills per run
  superUniques: true,
  boss: true,
};

/// Act and quest bosses have no spawn list; this is the level they stand in.
export const BOSS_AREAS = {
  andariel: 37, duriel: 73, radament: 49, mephisto: 102, diablo: 108, summoner: 74,
  izual: 105, bloodraven: 17, griswold: 38, nihlathakboss: 124, baalcrab: 132,
};

const HIGH_RUNE = 21; // Pul

/** 'u:<Index>' / 's:<Index>' tokens -> target descriptors. Unknown tokens are dropped. */
export function resolveTargets(data, tokens) {
  const out = [];
  for (const token of tokens) {
    const [kind, ...rest] = token.split(':');
    const index = rest.join(':');
    if (kind === 'u') {
      const matches = data.Uniques.map((u, i) => (u.Index === index ? i : -1)).filter((i) => i >= 0);
      const i = matches.find((m) => data.Uniques[m].Spawnable !== false) ?? matches[0];
      if (i != null) out.push({ kind: 'unique', index: i, name: data.Uniques[i].Name, key: data.Uniques[i].Index, baseIndex: data.Uniques[i].Base });
    } else if (kind === 's') {
      const matches = data.Sets.map((s, i) => (s.Index === index ? i : -1)).filter((i) => i >= 0);
      const i = matches.find((m) => data.Sets[m].Spawnable !== false) ?? matches[0];
      if (i != null) out.push({ kind: 'set', index: i, name: data.Sets[i].Name, key: data.Sets[i].Index, baseIndex: data.Sets[i].Base });
    }
  }
  return out;
}

export const targetToken = (t) => `${t.kind === 'unique' ? 'u' : 's'}:${t.key}`;

const runeNumber = (code) => {
  const m = /^r(\d+)$/.exec(code ?? '');
  return m ? Number(m[1]) : 0;
};

/**
 * One source, one kill: the chance of each target and the rune picture.
 * Returns null when the source drops nothing.
 */
function evaluateSource(ctx, sel, targets) {
  const source = resolveSource(ctx, sel);
  if (source.tcIndex == null || source.tcIndex < 0) return null;
  const { drops, uniqueDrops, setDrops, cm } = traverseTc(ctx, source.upgradedTcIndex, ctx.bonus, source);

  const perTarget = new Array(targets.length).fill(0);
  const byBase = new Map();
  targets.forEach((t, k) => {
    if (t.baseIndex >= 0) (byBase.get(t.baseIndex) ?? byBase.set(t.baseIndex, []).get(t.baseIndex)).push(k);
  });

  for (const [baseIndex, ks] of byBase) {
    const p = drops.get(baseIndex) ?? 0;
    if (p <= 0) continue;
    const uniques = uniquePool(ctx, baseIndex, source.mlvl);
    const sets = setPool(ctx, baseIndex, source.mlvl);
    const quality = qualityChances(ctx, ctx.baseItems[baseIndex], source.mlvl, cm, { hasUniques: uniques.length > 0, hasSets: sets.length > 0 });
    for (const k of ks) {
      const t = targets[k];
      if (t.kind === 'unique') {
        const entry = uniques.find((u) => u.entry === ctx.uniques[t.index]);
        if (entry) perTarget[k] += p * quality.unique * entry.share;
      } else {
        const entry = sets.find((s) => s.entry === ctx.sets[t.index]);
        if (entry) perTarget[k] += p * quality.set * entry.share;
      }
    }
  }
  // treasure classes that name an item outright (quest drops, the Annihilus line)
  targets.forEach((t, k) => {
    const direct = t.kind === 'unique' ? uniqueDrops.get(t.index) : setDrops.get(t.index);
    if (direct) perTarget[k] += direct;
  });

  let any = 1;
  for (const p of perTarget) any *= 1 - Math.min(p, 1);
  any = 1 - any;

  const runes = { any: 0, high: 0, max: 0 };
  for (const [baseIndex, p] of drops) {
    const base = ctx.baseItems[baseIndex];
    if (!base.IsRune || p <= 0) continue;
    const n = runeNumber(base.Code);
    runes.any += p;
    if (n >= HIGH_RUNE) runes.high += p;
    if (n > runes.max) runes.max = n;
  }
  return { any, perTarget, runes, mlvl: source.mlvl, terrorized: source.terrorized };
}

const average = (list, pick) => (list.length ? list.reduce((s, x) => s + pick(x), 0) / list.length : 0);

/**
 * All farm spots for a difficulty, with the monsters, superuniques and boss
 * each holds. Areas nothing spawns in (towns, the odd empty level) are left
 * out.
 */
export function buildSpots(data, difficulty) {
  const spots = new Map();
  const spot = (areaId) => {
    let s = spots.get(areaId);
    if (!s) {
      const area = data.Areas.find((a) => a.Id === areaId);
      s = { areaId, name: area?.Name ?? `Area ${areaId}`, act: area?.Act ?? 0, monsters: [], superUniques: [], boss: -1 };
      spots.set(areaId, s);
    }
    return s;
  };
  data.Monsters.forEach((m, i) => {
    if (m.Boss) return;
    m.Areas[difficulty].forEach((areaId) => spot(areaId).monsters.push(i));
  });
  data.SuperUniques.forEach((su, i) => { if (su.Areas[0] != null) spot(su.Areas[0]).superUniques.push(i); });
  // The named bosses first; the Defilers of act 5 are flagged as bosses too
  // and share Nihlathak's level, and a spot holds one.
  data.Monsters.forEach((m, i) => { if (m.Boss && BOSS_AREAS[m.Id] != null) spot(BOSS_AREAS[m.Id]).boss = i; });
  data.Monsters.forEach((m, i) => {
    if (!m.Boss || BOSS_AREAS[m.Id] != null) return;
    const areaId = m.Areas[difficulty][0];
    if (areaId != null && spot(areaId).boss < 0) spot(areaId).boss = i;
  });
  return [...spots.values()].filter((s) => s.monsters.length || s.superUniques.length || s.boss >= 0)
    .sort((a, b) => a.act - b.act || a.areaId - b.areaId);
}

/**
 * Scores one spot for one context (terror on or off). Returns per-run
 * probabilities for the target list, the rune picture and what carried the
 * result.
 */
export function scoreSpot(ctx, spot, targets, profile, difficulty) {
  const types = ['normal', 'champion', 'unique', 'minion'];
  const byType = {};
  for (const type of types) {
    const hits = [];
    for (const monsterIndex of spot.monsters) {
      const r = evaluateSource(ctx, { kind: 'monster', monsterIndex, sourceType: type, difficulty, areaId: spot.areaId }, targets);
      if (r) hits.push(r);
    }
    byType[type] = {
      any: average(hits, (h) => h.any),
      runesAny: average(hits, (h) => h.runes.any),
      runesHigh: average(hits, (h) => h.runes.high),
      runesMax: hits.reduce((m, h) => Math.max(m, h.runes.max), 0),
    };
  }
  const counts = {
    normal: Math.max(0, profile.trash | 0),
    champion: Math.max(0, (profile.champPacks | 0) * (profile.champsPerPack | 0)),
    unique: Math.max(0, profile.packs | 0),
    minion: Math.max(0, (profile.packs | 0) * (profile.minionsPerPack | 0)),
  };

  let miss = 1;
  let runesExpected = 0; let highExpected = 0; let highMiss = 1; let runesMax = 0;
  const parts = [];
  const take = (label, p, n, runes) => {
    if (n <= 0) return;
    const hit = 1 - Math.pow(1 - Math.min(p, 1), n);
    miss *= 1 - hit;
    if (runes) {
      runesExpected += n * runes.any;
      highExpected += n * runes.high;
      highMiss *= Math.pow(1 - Math.min(runes.high, 1), n);
      runesMax = Math.max(runesMax, runes.max);
    }
    if (hit > 0) parts.push({ label, hit });
  };
  take('Trash', byType.normal.any, counts.normal, { any: byType.normal.runesAny, high: byType.normal.runesHigh, max: byType.normal.runesMax });
  take('Champions', byType.champion.any, counts.champion, { any: byType.champion.runesAny, high: byType.champion.runesHigh, max: byType.champion.runesMax });
  take('Unique packs', byType.unique.any, counts.unique, { any: byType.unique.runesAny, high: byType.unique.runesHigh, max: byType.unique.runesMax });
  take('Minions', byType.minion.any, counts.minion, { any: byType.minion.runesAny, high: byType.minion.runesHigh, max: byType.minion.runesMax });

  if (profile.superUniques) {
    for (const superUniqueIndex of spot.superUniques) {
      const r = evaluateSource(ctx, { kind: 'superunique', superUniqueIndex, difficulty }, targets);
      if (r) take(ctx.superUniques[superUniqueIndex].Name, r.any, 1, r.runes);
    }
  }
  if (profile.boss && spot.boss >= 0) {
    const r = evaluateSource(ctx, { kind: 'monster', monsterIndex: spot.boss, sourceType: 'boss', difficulty, areaId: spot.areaId }, targets);
    if (r) take(ctx.monsters[spot.boss].Name, r.any, 1, r.runes);
  }

  parts.sort((a, b) => b.hit - a.hit);
  return {
    perRun: 1 - miss,
    parts,
    runes: { expected: runesExpected, highExpected, highPerRun: 1 - highMiss, max: runesMax },
  };
}
