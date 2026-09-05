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
  heralds: 0,        // heralds met per run - terror zones only
  superUniques: true,
  boss: true,
  packsFromZone: true, // take a spot's pack count from the terror zone data where it has one
};

/// Act and quest bosses have no spawn list; this is the level they stand in.
export const BOSS_AREAS = {
  andariel: 37, duriel: 73, radament: 49, mephisto: 102, diablo: 108, summoner: 74,
  izual: 105, bloodraven: 17, griswold: 38, nihlathakboss: 124, baalcrab: 132,
};

export const RUNE_FLOORS = [{ number: 21, name: 'Pul' }, { number: 25, name: 'Vex' }, { number: 30, name: 'Ber' }];

/**
 * 'u:<Name>' / 's:<Name>' tokens -> targets. A name covers every spawnable row
 * that carries it: the eight Rainbow Facets are one wish, not eight, and a
 * source's chance for the wish is the sum over its rows. Old links named the
 * row's index instead - those still resolve.
 */
export function resolveTargets(data, tokens) {
  const out = [];
  for (const token of tokens) {
    const [kind, ...rest] = token.split(':');
    const name = rest.join(':');
    const list = kind === 'u' ? data.Uniques : kind === 's' ? data.Sets : null;
    if (!list) continue;
    let rows = list.map((e, i) => (e.Name === name && e.Spawnable !== false ? i : -1)).filter((i) => i >= 0);
    if (rows.length === 0) {
      const byIndex = list.findIndex((e) => e.Index === name);
      if (byIndex >= 0) rows = [byIndex];
    }
    if (rows.length === 0) continue;
    out.push({
      kind: kind === 'u' ? 'unique' : 'set',
      name: list[rows[0]].Name,
      key: list[rows[0]].Name,
      rows: rows.map((index) => ({ index, baseIndex: list[index].Base })),
    });
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
function evaluateSource(ctx, sel, targets, highRune) {
  const source = resolveSource(ctx, sel);
  if (source.tcIndex == null || source.tcIndex < 0) return null;
  const { drops, uniqueDrops, setDrops, cm } = traverseTc(ctx, source.upgradedTcIndex, ctx.bonus, source);

  const perTarget = new Array(targets.length).fill(0);
  const byBase = new Map(); // baseIndex -> [{ k, row }]
  targets.forEach((t, k) => t.rows.forEach((row) => {
    if (row.baseIndex < 0) return;
    let list = byBase.get(row.baseIndex);
    if (!list) byBase.set(row.baseIndex, list = []);
    list.push({ k, row });
  }));

  for (const [baseIndex, hits] of byBase) {
    const p = drops.get(baseIndex) ?? 0;
    if (p <= 0) continue;
    const uniques = uniquePool(ctx, baseIndex, source.mlvl);
    const sets = setPool(ctx, baseIndex, source.mlvl);
    const quality = qualityChances(ctx, ctx.baseItems[baseIndex], source.mlvl, cm, { hasUniques: uniques.length > 0, hasSets: sets.length > 0 });
    for (const { k, row } of hits) {
      if (targets[k].kind === 'unique') {
        const entry = uniques.find((u) => u.entry === ctx.uniques[row.index]);
        if (entry) perTarget[k] += p * quality.unique * entry.share;
      } else {
        const entry = sets.find((s) => s.entry === ctx.sets[row.index]);
        if (entry) perTarget[k] += p * quality.set * entry.share;
      }
    }
  }
  // treasure classes that name an item outright (quest drops, the Annihilus line)
  targets.forEach((t, k) => t.rows.forEach((row) => {
    const direct = t.kind === 'unique' ? uniqueDrops.get(row.index) : setDrops.get(row.index);
    if (direct) perTarget[k] += direct;
  }));

  let any = 1;
  for (const p of perTarget) any *= 1 - Math.min(p, 1);
  any = 1 - any;

  const runes = { any: 0, high: 0, max: 0 };
  for (const [baseIndex, p] of drops) {
    const base = ctx.baseItems[baseIndex];
    if (!base.IsRune || p <= 0) continue;
    const n = runeNumber(base.Code);
    runes.any += p;
    if (n >= highRune) runes.high += p;
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
export function scoreSpot(ctx, spot, targets, profile, difficulty, { highRune = 21 } = {}) {
  const types = ['normal', 'champion', 'unique', 'minion'];
  const byType = {};
  for (const type of types) {
    const hits = [];
    for (const monsterIndex of spot.monsters) {
      const r = evaluateSource(ctx, { kind: 'monster', monsterIndex, sourceType: type, difficulty, areaId: spot.areaId }, targets, highRune);
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
  const runeParts = []; // who hands out the high runes - the Countess has a table of her own
  const take = (label, p, n, runes) => {
    if (n <= 0) return;
    const hit = 1 - Math.pow(1 - Math.min(p, 1), n);
    miss *= 1 - hit;
    if (runes) {
      runesExpected += n * runes.any;
      highExpected += n * runes.high;
      highMiss *= Math.pow(1 - Math.min(runes.high, 1), n);
      runesMax = Math.max(runesMax, runes.max);
      if (runes.high > 0) runeParts.push({ label, expected: n * runes.high });
    }
    if (hit > 0) parts.push({ label, hit });
  };
  take('Trash', byType.normal.any, counts.normal, { any: byType.normal.runesAny, high: byType.normal.runesHigh, max: byType.normal.runesMax });
  take('Champions', byType.champion.any, counts.champion, { any: byType.champion.runesAny, high: byType.champion.runesHigh, max: byType.champion.runesMax });
  take('Unique packs', byType.unique.any, counts.unique, { any: byType.unique.runesAny, high: byType.unique.runesHigh, max: byType.unique.runesMax });
  take('Minions', byType.minion.any, counts.minion, { any: byType.minion.runesAny, high: byType.minion.runesHigh, max: byType.minion.runesMax });

  if (profile.superUniques) {
    for (const superUniqueIndex of spot.superUniques) {
      const r = evaluateSource(ctx, { kind: 'superunique', superUniqueIndex, difficulty }, targets, highRune);
      if (r) take(ctx.superUniques[superUniqueIndex].Name, r.any, 1, r.runes);
    }
  }
  if (profile.boss && spot.boss >= 0) {
    const r = evaluateSource(ctx, { kind: 'monster', monsterIndex: spot.boss, sourceType: 'boss', difficulty, areaId: spot.areaId }, targets, highRune);
    if (r) take(ctx.monsters[spot.boss].Name, r.any, 1, r.runes);
  }
  // Heralds are a terror zone's own elite; there are none in an ordinary run.
  if (ctx.options.terror?.enabled && (profile.heralds | 0) > 0) {
    const r = evaluateSource(ctx, { kind: 'herald', difficulty }, targets, highRune);
    if (r) take('Heralds', r.any, profile.heralds | 0, r.runes);
  }

  parts.sort((a, b) => b.hit - a.hit);
  runeParts.sort((a, b) => b.expected - a.expected);
  const carrier = runeParts.length && highExpected > 0
    ? { label: runeParts[0].label, share: runeParts[0].expected / highExpected }
    : null;
  return {
    perRun: 1 - miss,
    parts,
    runes: { expected: runesExpected, highExpected, highPerRun: 1 - highMiss, max: runesMax, carrier },
  };
}
