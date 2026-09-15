import { resolveSource, traverseTc, qualityChances, uniquePool, setPool } from './useDropSimulation.js';
import { monsterBlockedFor } from './useImmunities.js';
import { t } from '@/i18n';

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
 * the misses multiply again across kills. Packs go in as the average over the
 * area's random roll - the spawn list weighted by monstats Rarity: the game
 * picks NumMon types per game, and the weighted mean is what a player meets
 * over many games. Monsters the fixed map places (the Trapped Souls, the
 * council in Travincal) are never rolled, so they do not thin that average;
 * they are met as ordinary kills on the way through.
 */

export const DEFAULT_PROFILE = {
  packs: 4,          // unique packs cleared per run
  minionsPerPack: 3,
  champPacks: 2,     // champion packs per run
  champsPerPack: 3,
  trash: 30,         // ordinary kills per run
  minutes: 4,        // how long a run takes - the denominator behind "worth"
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
 * Named ways to run a spot, where the numbers alone do not say it. Mephisto
 * is farmed alone or with the three council members beside him; Travincal is
 * farmed for its council - the three named ones and the ordinary council
 * members with them, some of which come up unique - and not for the zealots
 * around them. A preset sets the profile and may narrow the monsters counted.
 */
const council = (m) => /^councilmember\d$/.test(m.Id);
export const SPOT_PRESETS = {
  102: [ // Durance of Hate Level 3
    { id: 'meph', label: 'Mephisto only', profile: { packs: 0, champPacks: 0, trash: 0, heralds: 0, superUniques: false, boss: true, minutes: 1.5 } },
    { id: 'meph-council', label: 'Mephisto + council', profile: { packs: 0, champPacks: 0, trash: 0, heralds: 0, superUniques: true, boss: true, minutes: 2.5 } },
  ],
  83: [ // Travincal
    { id: 'council', label: 'Council only', monsters: council,
      profile: { packs: 2, minionsPerPack: 3, champPacks: 1, champsPerPack: 3, trash: 6, heralds: 0, superUniques: true, boss: false, minutes: 3 } },
  ],
};
export const presetsFor = (areaId) => (SPOT_PRESETS[areaId] ?? []).map((p) => ({ ...p, label: t(p.label) }));

/// A spot's pack count from the zone data: the zone's span, spread over its areas.
export const zonePacksFor = (tz, areaId) => {
  const zone = tz.zones.find((z) => z.areas.includes(areaId));
  if (!zone?.bossPacks) return null;
  return Math.max(1, Math.round((zone.bossPacks[0] + zone.bossPacks[1]) / 2 / zone.areas.length));
};

/**
 * How a spot is run: the global profile, the zone's pack count where the
 * profile asks for it, then a chosen preset (Mephisto only, council only),
 * then the spot's own numbers on top. Overrides are keyed by area id and
 * carry an optional preset id beside the numbers.
 */
export function spotRun(areaId, profile, overrides, tz) {
  const base = { ...profile };
  if (base.packsFromZone) {
    const fromZone = zonePacksFor(tz, areaId);
    if (fromZone != null) base.packs = fromZone;
  }
  const { preset: presetId, ...numbers } = overrides?.[areaId] ?? {};
  const preset = presetId ? presetsFor(areaId).find((p) => p.id === presetId) ?? null : null;
  return { profile: { ...base, ...(preset?.profile ?? {}), ...numbers }, preset };
}
export const applyPreset = (data, spot, preset) => (preset?.monsters
  ? { ...spot, monsters: spot.monsters.filter((i) => preset.monsters(data.Monsters[i])), placed: (spot.placed ?? []).filter((i) => preset.monsters(data.Monsters[i])) }
  : spot);

/**
 * What the character's element leaves alive. Monsters immune to every chosen
 * element stay on the spawn list but yield nothing - the run still meets
 * them, they just do not die - and a superunique or boss that is immune is
 * dropped. The spot reports how much of it went dead.
 */
export function applyElements(data, spot, difficulty, elements) {
  if (!elements || elements.length === 0) return { ...spot, dead: null, immune: null };
  const placed = spot.placed ?? [];
  const dead = new Set([...spot.monsters, ...placed].filter((i) => monsterBlockedFor(data, i, difficulty, elements)));
  const superUniques = spot.superUniques.filter((i) => !monsterBlockedFor(data, data.SuperUniques[i].Monster, difficulty, elements));
  const boss = spot.boss >= 0 && monsterBlockedFor(data, spot.boss, difficulty, elements) ? -1 : spot.boss;
  const total = spot.monsters.length + placed.length + spot.superUniques.length + (spot.boss >= 0 ? 1 : 0);
  const gone = dead.size + (spot.superUniques.length - superUniques.length) + (spot.boss >= 0 && boss < 0 ? 1 : 0);
  return { ...spot, superUniques, boss, dead, immune: { gone, total, all: total > 0 && gone === total } };
}

/**
 * 'u:<Name>' / 's:<Name>' tokens -> targets. A name covers every spawnable row
 * that carries it: the eight Rainbow Facets are one wish, not eight, and a
 * source's chance for the wish is the sum over its rows. Old links named the
 * row's index instead - those still resolve.
 */
export function resolveTargets(data, tokens) {
  const out = [];
  for (const token of tokens) {
    const [prefix, ...rest] = token.split(':');
    const name = rest.join(':');
    if (!/^[us]x?$/.test(prefix)) continue;
    const kind = prefix[0] === 'u' ? 'unique' : 'set';
    const list = kind === 'unique' ? data.Uniques : data.Sets;
    // 'ux:' / 'sx:' ask for the Exalted or Mythic roll of the item by its own name
    const variant = prefix.length === 2 ? (kind === 'unique' ? 'exalted' : 'mythic') : null;
    const variantField = kind === 'unique' ? 'ExaltedName' : 'MythicName';
    let rows = list.map((e, i) => (e.Spawnable !== false && (variant ? e[variantField] === name : e.Name === name) ? i : -1)).filter((i) => i >= 0);
    if (rows.length === 0 && !variant) {
      const byIndex = list.findIndex((e) => e.Index === name);
      if (byIndex >= 0) rows = [byIndex];
    }
    if (rows.length === 0) continue;
    out.push({
      kind,
      name: variant ? name : list[rows[0]].Name,
      key: variant ? name : list[rows[0]].Name,
      variant,
      rows: rows.map((index) => ({ index, baseIndex: list[index].Base })),
    });
  }
  return out;
}

/**
 * Everything the Grail still lacks, as targets: one per missing catalog row.
 * A missing plain item wants the ordinary roll, a missing Exalted or Mythic
 * one the variant roll - so a spot is not credited with a Shako it would
 * only turn up in the form already found.
 */
export function grailTargets(data, catalog, found) {
  const out = [];
  const index = (list) => { const m = new Map(); list.forEach((e, i) => { if (e.Spawnable !== false) m.set(e.Index, i); }); return m; };
  const uniques = index(data.Uniques);
  const sets = index(data.Sets);
  for (const u of catalog.uniques) {
    if (!u.spawnable || found[`u:${u.id}`]) continue;
    const i = uniques.get(u.exalted ? u.key.replace(/^E /, '') : u.key);
    if (i == null) continue;
    out.push({ kind: 'unique', name: u.name, key: u.name, variant: u.exalted ? 'exalted' : 'base', rows: [{ index: i, baseIndex: data.Uniques[i].Base }] });
  }
  for (const s of catalog.sets) {
    if (!s.spawnable || found[`s:${s.id}`]) continue;
    const i = sets.get(s.mythic ? s.key.replace(/^M /, '') : s.key);
    if (i == null) continue;
    out.push({ kind: 'set', name: s.name, key: s.name, variant: s.mythic ? 'mythic' : 'base', rows: [{ index: i, baseIndex: data.Sets[i].Base }] });
  }
  return out;
}

export const targetToken = (t) => `${t.kind === 'unique' ? 'u' : 's'}${t.variant === 'exalted' || t.variant === 'mythic' ? 'x' : ''}:${t.key}`;

const runeNumber = (code) => {
  const m = /^r(\d+)$/.exec(code ?? '');
  return m ? Number(m[1]) : 0;
};

// a target's slice of the pool's share: the variant roll, the plain roll, or both
const shareOf = (entry, variantShare, variant) => (variant === 'exalted' || variant === 'mythic' ? variantShare : variant === 'base' ? entry.share - variantShare : entry.share);

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
        if (entry) perTarget[k] += p * quality.unique * shareOf(entry, entry.exaltedShare, targets[k].variant);
      } else {
        const entry = sets.find((s) => s.entry === ctx.sets[row.index]);
        if (entry) perTarget[k] += p * quality.set * shareOf(entry, entry.mythicShare, targets[k].variant);
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

const NOTHING = { any: 0, runes: { any: 0, high: 0, max: 0 } };
const average = (list, pick) => (list.length ? list.reduce((s, x) => s + pick(x), 0) / list.length : 0);

/**
 * All farm spots for a difficulty, with the monsters, superuniques and boss
 * each holds. `monsters` are the area's random roll, weighted by Rarity;
 * `placed` are met there but never rolled - put down by the map, or listed
 * with Rarity 0 like Hephasto. Areas nothing spawns in (towns, the odd empty
 * level) are left out.
 */
export function buildSpots(data, difficulty) {
  const spots = new Map();
  const spot = (areaId) => {
    let s = spots.get(areaId);
    if (!s) {
      const area = data.Areas.find((a) => a.Id === areaId);
      s = { areaId, name: area?.Name ?? t('Area {id}', { id: areaId }), act: area?.Act ?? 0, numMon: area?.NumMon ?? 0, monsters: [], weights: new Map(), placed: [], superUniques: [], boss: -1 };
      spots.set(areaId, s);
    }
    return s;
  };
  data.Monsters.forEach((m, i) => {
    if (m.Boss) return;
    const rarity = m.Rarity ?? 1;
    const rolled = new Set(rarity > 0 ? (m.SpawnAreas?.[difficulty] ?? m.Areas[difficulty]) : []);
    m.Areas[difficulty].forEach((areaId) => {
      const s = spot(areaId);
      if (rolled.has(areaId)) { s.monsters.push(i); s.weights.set(i, rarity); } else s.placed.push(i);
    });
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
  return [...spots.values()].filter((s) => s.monsters.length || s.placed.length || s.superUniques.length || s.boss >= 0)
    .sort((a, b) => a.act - b.act || a.areaId - b.areaId);
}

/**
 * Scores one spot for one context (terror on or off). Returns per-run
 * probabilities for the target list, the rune picture and what carried the
 * result; with `detail` also the per-monster numbers behind it.
 *
 * Packs - unique, minion, champion - average over the random roll, weighted
 * by rarity; when a preset leaves no rolled monster (Travincal's council),
 * the placed ones stand in. Trash averages over everything met: the roll and
 * the placed monsters alike, a placed one weighing like a rarity of 1.
 */
export function scoreSpot(ctx, spot, targets, profile, difficulty, { highRune = 21, detail = false } = {}) {
  const types = ['normal', 'champion', 'unique', 'minion'];
  const placed = spot.placed ?? [];
  const weightOf = (i) => spot.weights?.get(i) ?? 1;
  const evaluated = new Map(); // `${i}:${type}` -> result | null
  const evalFor = (monsterIndex, type) => {
    const key = `${monsterIndex}:${type}`;
    if (!evaluated.has(key)) {
      // an immune monster is met and left standing: a kill that yields nothing
      evaluated.set(key, spot.dead?.has(monsterIndex) ? NOTHING : evaluateSource(ctx, { kind: 'monster', monsterIndex, sourceType: type, difficulty, areaId: spot.areaId }, targets, highRune));
    }
    return evaluated.get(key);
  };
  // with detail, each target's own chance is carried through as well
  const T = detail ? targets.length : 0;
  const weighted = (pool, type, placedWeight) => {
    let w = 0; let any = 0; let runesAny = 0; let runesHigh = 0; let runesMax = 0;
    const per = T ? new Array(T).fill(0) : null;
    for (const { i, placed: isPlaced } of pool) {
      const r = evalFor(i, type);
      if (!r) continue;
      const wi = isPlaced ? placedWeight : weightOf(i);
      w += wi; any += wi * r.any; runesAny += wi * r.runes.any; runesHigh += wi * r.runes.high; runesMax = Math.max(runesMax, r.runes.max);
      if (per) for (let k = 0; k < T; k++) per[k] += wi * (r.perTarget?.[k] ?? 0);
    }
    return w > 0 ? { any: any / w, runesAny: runesAny / w, runesHigh: runesHigh / w, runesMax, per: per?.map((x) => x / w) ?? null } : { any: 0, runesAny: 0, runesHigh: 0, runesMax: 0, per: null };
  };
  const rolled = spot.monsters.map((i) => ({ i, placed: false }));
  const standIns = placed.map((i) => ({ i, placed: true }));
  const packPool = rolled.length ? rolled : standIns;
  const trashPool = [...rolled, ...standIns];
  const byType = {};
  for (const type of types) byType[type] = weighted(type === 'normal' ? trashPool : packPool, type, 1);
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
  const missT = T ? new Array(T).fill(1) : null;
  const take = (label, p, n, runes, per = null) => {
    if (n <= 0) return;
    const hit = 1 - Math.pow(1 - Math.min(p, 1), n);
    miss *= 1 - hit;
    if (missT && per) for (let k = 0; k < T; k++) missT[k] *= Math.pow(1 - Math.min(per[k] ?? 0, 1), n);
    if (runes) {
      runesExpected += n * runes.any;
      highExpected += n * runes.high;
      highMiss *= Math.pow(1 - Math.min(runes.high, 1), n);
      runesMax = Math.max(runesMax, runes.max);
      if (runes.high > 0) runeParts.push({ label, expected: n * runes.high });
    }
    if (hit > 0) parts.push({ label, hit });
  };
  take(t('Trash'), byType.normal.any, counts.normal, { any: byType.normal.runesAny, high: byType.normal.runesHigh, max: byType.normal.runesMax }, byType.normal.per);
  take(t('Champions'), byType.champion.any, counts.champion, { any: byType.champion.runesAny, high: byType.champion.runesHigh, max: byType.champion.runesMax }, byType.champion.per);
  take(t('Unique packs'), byType.unique.any, counts.unique, { any: byType.unique.runesAny, high: byType.unique.runesHigh, max: byType.unique.runesMax }, byType.unique.per);
  take(t('Minions'), byType.minion.any, counts.minion, { any: byType.minion.runesAny, high: byType.minion.runesHigh, max: byType.minion.runesMax }, byType.minion.per);

  if (profile.superUniques) {
    for (const superUniqueIndex of spot.superUniques) {
      const su = ctx.superUniques[superUniqueIndex];
      const r = evaluateSource(ctx, { kind: 'superunique', superUniqueIndex, difficulty }, targets, highRune);
      if (r) take(su.Name, r.any, 1, r.runes, r.perTarget);
      // its pack dies with it: Pindleskin's six, the council's two - minions
      // of the base class, at the minion's level bonus
      const pack = su.Minions ? Math.round((su.Minions[0] + su.Minions[1]) / 2) : 0;
      if (pack > 0 && su.Monster >= 0) {
        const m = evaluateSource(ctx, { kind: 'monster', monsterIndex: su.Monster, sourceType: 'minion', difficulty, areaId: spot.areaId }, targets, highRune);
        if (m) take(t("{name}'s pack", { name: su.Name }), m.any, pack, m.runes, m.perTarget);
      }
    }
  }
  if (profile.boss && spot.boss >= 0) {
    const r = evaluateSource(ctx, { kind: 'monster', monsterIndex: spot.boss, sourceType: 'boss', difficulty, areaId: spot.areaId }, targets, highRune);
    if (r) take(ctx.monsters[spot.boss].Name, r.any, 1, r.runes, r.perTarget);
  }
  // Heralds are a terror zone's own elite; there are none in an ordinary run.
  if (ctx.options.terror?.enabled && (profile.heralds | 0) > 0) {
    const r = evaluateSource(ctx, { kind: 'herald', difficulty }, targets, highRune);
    if (r) take(t('Heralds'), r.any, profile.heralds | 0, r.runes, r.perTarget);
  }

  parts.sort((a, b) => b.hit - a.hit);
  runeParts.sort((a, b) => b.expected - a.expected);
  const carrier = runeParts.length && highExpected > 0
    ? { label: runeParts[0].label, share: runeParts[0].expected / highExpected }
    : null;
  const result = {
    perRun: 1 - miss,
    parts,
    runes: { expected: runesExpected, highExpected, highPerRun: 1 - highMiss, max: runesMax, carrier },
  };
  if (detail) {
    const row = (i, isPlaced) => {
      const per = {};
      for (const type of types) { const r = evalFor(i, type); per[type] = r ? { any: r.any, high: r.runes.high, mlvl: r.mlvl } : null; }
      return { monsterIndex: i, name: ctx.monsters[i].Name, placed: isPlaced, weight: isPlaced ? 0 : weightOf(i), dead: !!spot.dead?.has(i), per };
    };
    result.detail = {
      monsters: [...rolled.map(({ i }) => row(i, false)), ...standIns.map(({ i }) => row(i, true))],
      counts, numMon: spot.numMon ?? 0, packsFromPlaced: rolled.length === 0 && standIns.length > 0,
      rollTypes: rolled.length, rollSize: rolled.reduce((sum, { i }) => sum + weightOf(i), 0),
      // each target's chance per run, best first
      targets: missT.map((m, k) => ({ k, hit: 1 - m })).filter((t) => t.hit > 0).sort((a, b) => b.hit - a.hit),
    };
  }
  return result;
}
