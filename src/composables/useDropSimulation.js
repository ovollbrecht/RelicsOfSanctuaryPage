// Drop-chance engine for the drop calculator. Pure functions, no Vue.
//
// Data model: src/assets/dropcalc.json (DropJsonExporter) - index-based,
// treasure classes pre-sorted by (group, level) so the TC upgrade walk is a
// simple index increment. All algorithms mirror the game mechanics as
// documented in the official dataguide (docs/itemratio-calc.html,
// treasureclassex fields) and the classic community drop calculators:
//  - player-count NoDrop recomputation per TC node
//  - picks (independent rolls) vs negative "sorted picks" (guaranteed counts)
//  - quality ladder Unique > Set > Rare > Magic > HiQuality > Normal > Low
//    with MF diminishing returns (250/500/600) and TC quality modifiers
//  - unique/set pick weighted by rarity among candidates of the same base
//
// Deliberately kept quirks of the classic calculators (for comparability):
// per-path drop chances are accumulated additively, and the TC quality
// modifiers use the maximum over the whole traversal. The picks==7 -> 6
// approximation applies with more than one player (drop cap of 6 items).

export const DIFFICULTIES = ['Normal', 'Nightmare', 'Hell'];

export function playerBonus(players, partyNearby) {
  const all = Math.max(1, Math.min(8, players | 0));
  const party = Math.max(1, Math.min(all, partyNearby | 0));
  return Math.floor(party + (all - party) / 2);
}

/**
 * Prepares mode-adjusted data + caches. options:
 * { dataMode: 'mod'|'vanilla', players, partyNearby, mf,
 *   terror: { enabled, charLevel }, exalted: { enabled, percent },
 *   mythic: { enabled, percent }, heraldTier }
 */
export function buildContext(data, options) {
  const vanillaMode = options.dataMode === 'vanilla';
  const vanilla = data.Vanilla ?? {};

  // Treasure classes: vanilla mode swaps row contents by name.
  let tcs = data.TreasureClasses;
  if (vanillaMode && vanilla.TreasureClasses) {
    tcs = data.TreasureClasses.map(tc => vanilla.TreasureClasses[tc.Name] ?? tc);
  }

  // Uniques/sets: vanilla mode applies overrides and drops mod-only entries
  // and variant names.
  const modOnlyUniques = new Set(vanillaMode ? vanilla.ModOnlyUniques ?? [] : []);
  const uniques = data.Uniques.map((u, i) => {
    if (!vanillaMode) return u;
    const over = vanilla.UniqueOverrides?.[i];
    return {
      ...u,
      Lvl: over?.Lvl ?? u.Lvl,
      Rarity: over?.Rarity ?? u.Rarity,
      Spawnable: modOnlyUniques.has(i) ? false : (over?.Spawnable ?? u.Spawnable),
      ExaltedName: null,
    };
  });
  const modOnlySets = new Set(vanillaMode ? vanilla.ModOnlySets ?? [] : []);
  const sets = data.Sets.map((s, i) => {
    if (!vanillaMode) return s;
    const over = vanilla.SetOverrides?.[i];
    return {
      ...s,
      Lvl: over?.Lvl ?? s.Lvl,
      Rarity: over?.Rarity ?? s.Rarity,
      Spawnable: modOnlySets.has(i) ? false : (over?.Spawnable ?? s.Spawnable),
      MythicName: null,
    };
  });

  // spawnable unique/set candidates grouped by base item index
  const uniquesByBase = new Map();
  uniques.forEach((u, i) => {
    if (!u.Spawnable || u.Base < 0 || u.DropCondition) return;
    (uniquesByBase.get(u.Base) ?? uniquesByBase.set(u.Base, []).get(u.Base)).push(i);
  });
  const setsByBase = new Map();
  sets.forEach((s, i) => {
    if (!s.Spawnable || s.Base < 0) return;
    (setsByBase.get(s.Base) ?? setsByBase.set(s.Base, []).get(s.Base)).push(i);
  });

  const areasById = new Map(data.Areas.map(a => [a.Id, a]));

  return {
    data,
    options,
    vanillaMode,
    tcs,
    uniques,
    sets,
    baseItems: data.BaseItems,
    ratios: data.ItemRatios,
    monsters: data.Monsters,
    superUniques: data.SuperUniques,
    areasById,
    uniquesByBase,
    setsByBase,
    bonus: playerBonus(options.players, options.partyNearby),
    heraldTier: options.heraldTier ?? 5,
    heraldTcIndex: data.Meta?.HeraldTcIndex ?? -1,
    traversalCache: new Map(),
  };
}

// ---------------------------------------------------------------------------
// monster level
// ---------------------------------------------------------------------------

const TZ_BONUS = { normal: 2, champion: 4, unique: 5, minion: 5, boss: 5, superunique: 5 };
// [normal monsters, champions, uniques/bosses/minions] per difficulty
const TZ_CAPS = [[45, 47, 48], [71, 73, 74], [96, 98, 99]];
const TZ_CAP_SLOT = { normal: 0, champion: 1, unique: 2, minion: 2, boss: 2, superunique: 2 };

const SOURCE_MLVL_BONUS = { normal: 0, champion: 2, unique: 3, minion: 3, boss: 3, superunique: 3 };

/**
 * Effective monster level. sel: { monster (entry), sourceType, difficulty,
 * areaId }. sourceType: normal|champion|unique|minion|boss|superunique.
 * Returns { mlvl, baseMlvl, terrorized }.
 */
export function effectiveMlvl(ctx, { monster, sourceType, difficulty, areaId }) {
  const fixedLevel = monster.Boss || monster.NoRatio;
  let mlvl;
  if (sourceType === 'superunique') {
    // superuniques: fixed monstats level in Normal, area level + 3 in NM/Hell
    if (difficulty > 0 && !fixedLevel && areaId != null) {
      mlvl = (ctx.areasById.get(areaId)?.Levels[difficulty] ?? monster.Levels[difficulty]) + 3;
    } else {
      mlvl = monster.Levels[difficulty] + (fixedLevel ? 0 : 3);
    }
  } else if (difficulty > 0 && !fixedLevel && areaId != null) {
    // NM/Hell: area level replaces the monstats level
    const areaLevel = ctx.areasById.get(areaId)?.Levels[difficulty] ?? monster.Levels[difficulty];
    mlvl = areaLevel + SOURCE_MLVL_BONUS[sourceType];
  } else {
    mlvl = monster.Levels[difficulty] + (fixedLevel ? 0 : SOURCE_MLVL_BONUS[sourceType]);
  }

  const baseMlvl = mlvl;
  let terrorized = false;
  if (ctx.options.terror?.enabled) {
    const cap = TZ_CAPS[difficulty][TZ_CAP_SLOT[sourceType]];
    const tz = Math.min(cap, (ctx.options.terror.charLevel | 0) + TZ_BONUS[sourceType]);
    if (tz > mlvl) {
      mlvl = tz;
      terrorized = true;
    }
  }

  return { mlvl, baseMlvl, terrorized };
}

/**
 * Level-based TC upgrade walk: advance to the highest-level TC of the same
 * group whose level does not exceed mlvl. Callers skip this for bosses and
 * superuniques (fixed TCs).
 */
export function upgradeTc(ctx, tcIndex, mlvl) {
  if (tcIndex < 0) return tcIndex;
  let i = tcIndex;
  const group = ctx.tcs[i].Group;
  if (!group) return i;
  while (
    i + 1 < ctx.tcs.length &&
    ctx.tcs[i + 1].Group === group &&
    ctx.tcs[i + 1].Level <= mlvl
  ) {
    i++;
  }
  return i;
}

// ---------------------------------------------------------------------------
// treasure class traversal
// ---------------------------------------------------------------------------

/**
 * Does the entry's ConditionCalc hold for this source? env is the resolved
 * source (difficulty, terrorized), ctx supplies the configured herald tier.
 *
 * The gates come pre-parsed from the exporter (TcGate). Skipping them is not
 * cosmetic: the Worldstone Shard parents list the "outside a terror zone" and
 * "inside one" shard entries back to back and then the normal drop, so a
 * traversal that keeps both spends the table's picks on shards and never
 * reaches the item patch 3.3 added there.
 */
function gateAllows(ctx, tc, env) {
  if (tc.HeraldTierMin != null && ctx.heraldTier < tc.HeraldTierMin) return false;
  if (tc.HeraldTierMax != null && ctx.heraldTier > tc.HeraldTierMax) return false;
  if (tc.RequiresDifficulty != null && tc.RequiresDifficulty !== env.difficulty) return false;
  // the files say "Desecrated" where the rest of this module says "terrorized"
  if (tc.RequiresDesecrated != null && tc.RequiresDesecrated !== env.terrorized) return false;
  // RequiresHerald needs no check: those TCs are only reachable from a herald's
  // own tables, so the condition is redundant wherever we can arrive at it.
  return true;
}

/**
 * Walks the TC tree. Returns { drops, uniqueDrops, setDrops, cm } where
 * drops: Map<baseItemIndex, P(at least one)>, uniqueDrops/setDrops are for
 * TC entries referencing a specific unique/set item directly, and cm is the
 * max quality modifier seen. env is the resolved source ({ difficulty,
 * terrorized }) - conditions depend on it, so it belongs in the cache key
 * alongside the player bonus.
 */
export function traverseTc(ctx, tcIndex, bonus, env = { difficulty: 2, terrorized: false }) {
  const cacheKey = `${tcIndex}|${bonus}|${env.difficulty}|${env.terrorized ? 1 : 0}`;
  const cached = ctx.traversalCache.get(cacheKey);
  if (cached) return cached;

  const drops = new Map();
  const uniqueDrops = new Map();
  const setDrops = new Map();
  const cm = { unique: 0, set: 0, rare: 0, magic: 0 };
  const targets = [drops, drops, uniqueDrops, setDrops]; // by entry kind (kind 1..3; 0 recurses)

  const add = (map, key, p) => map.set(key, (map.get(key) ?? 0) + p);

  const rec = (idx, chance, totalPicks) => {
    const tc = ctx.tcs[idx];
    cm.unique = Math.max(cm.unique, tc.Unique);
    cm.set = Math.max(cm.set, tc.Set);
    cm.rare = Math.max(cm.rare, tc.Rare);
    cm.magic = Math.max(cm.magic, tc.Magic);

    // sub-TCs whose ConditionCalc fails are removed from the roll entirely
    // (dataguide) - they do not just roll to nothing, they never take a pick
    const items = tc.Items.filter(([kind, target]) =>
      kind !== 0 || gateAllows(ctx, ctx.tcs[target], env));

    const itemSum = items.reduce((sum, e) => sum + e[2], 0);
    if (itemSum === 0) return;
    let noDrop = tc.NoDrop;
    let picks = Math.abs(tc.Picks || 1);
    const sorted = tc.Picks < 0;
    // the game caps a single drop event at 6 items; with a party the reduced
    // NoDrop would otherwise overshoot on 7-pick TCs
    if (picks === 7 && bonus > 1) picks = 6;

    // the herald-tier-gated special TC (sunder charms) rolls independently of
    // the player count (confirmed for patch 3.2 herald drops)
    const playerScaled = tc.HeraldTierMin == null;
    if (playerScaled && bonus > 1 && noDrop > 0) {
      const sum = itemSum + noDrop;
      const fraction = Math.pow(noDrop / sum, bonus);
      noDrop = Math.floor((sum - noDrop) * fraction / (1 - fraction));
    }
    const total = itemSum + noDrop;

    if (!sorted) {
      const picksHere = totalPicks * picks;
      for (const [kind, target, prob] of items) {
        const p = (prob / total) * chance;
        if (kind === 0) rec(target, p, picksHere);
        else add(targets[kind], target, 1 - Math.pow(1 - p, picksHere));
      }
    } else {
      let remaining = picks;
      for (const [kind, target, prob] of items) {
        if (remaining <= 0) break;
        const picked = Math.min(prob, remaining);
        remaining -= picked;
        if (kind === 0) rec(target, chance, picked * totalPicks);
        else add(targets[kind], target, 1 - Math.pow(1 - chance, picked * totalPicks));
      }
    }
  };

  rec(tcIndex, 1, 1);
  const result = { drops, uniqueDrops, setDrops, cm };
  ctx.traversalCache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// quality ladder (itemratio)
// ---------------------------------------------------------------------------

function ratioRowFor(ctx, baseItem) {
  const uber = baseItem.Tier > 0 ? 1 : 0;
  const cs = baseItem.ClassSpecific ? 1 : 0;
  return (
    ctx.ratios.find(r => r.Uber === uber && r.ClassSpecific === cs) ??
    ctx.ratios[0]
  );
}

function diminishedMf(mf, dim) {
  if (mf <= 10) return mf;
  return Math.floor((dim * mf) / (mf + dim));
}

/**
 * Quality distribution for one dropped base item.
 * Returns { unique, set, rare, magic, hiq, normal, low } summing to 1.
 * opts: { hasUniques, hasSets } - whether eligible candidates exist; a failed
 * unique roll falls through to rare, a failed set roll to magic (the game
 * would produce a triple-durability rare / double-durability magic item).
 */
export function qualityChances(ctx, baseItem, mlvl, cm, opts = {}) {
  const result = { unique: 0, set: 0, rare: 0, magic: 0, hiq: 0, normal: 0, low: 0 };
  if (baseItem.NormalOnly) {
    result.normal = 1;
    return result;
  }

  const ratio = ratioRowFor(ctx, baseItem);
  const mf = Math.max(0, ctx.options.mf | 0);
  const qlvl = baseItem.Qlvl;
  let chanceLeft = 1;

  const roll = ([rarity, divisor, min], effMf, cmQ) => {
    let chance = 128 * (rarity - Math.floor((mlvl - qlvl) / divisor));
    chance = Math.floor((chance * 100) / (100 + effMf));
    if (min != null && chance < min) chance = min;
    chance -= Math.floor((chance * cmQ) / 1024);
    if (chance <= 128) {
      const p = chanceLeft;
      chanceLeft = 0;
      return p;
    }
    const p = (128 / chance) * chanceLeft;
    chanceLeft -= p;
    return p;
  };

  result.unique = roll(ratio.Unique, diminishedMf(mf, 250), cm.unique);
  if (chanceLeft > 0) result.set = roll(ratio.Set, diminishedMf(mf, 500), cm.set);
  if (chanceLeft > 0) result.rare = roll(ratio.Rare, diminishedMf(mf, 600), cm.rare);
  if (chanceLeft > 0) result.magic = roll(ratio.Magic, mf, cm.magic);
  if (chanceLeft > 0) result.hiq = roll([ratio.HiQuality[0], ratio.HiQuality[1], null], 0, 0);
  if (chanceLeft > 0) result.normal = roll([ratio.Normal[0], ratio.Normal[1], null], 0, 0);
  result.low = chanceLeft;
  chanceLeft = 0;

  // pool fallbacks and item-type restrictions
  if (opts.hasUniques === false) {
    result.rare += result.unique;
    result.unique = 0;
  }
  if (opts.hasSets === false) {
    result.magic += result.set;
    result.set = 0;
  }
  if (baseItem.MagicOnly) {
    result.magic += result.hiq + result.normal + result.low;
    result.hiq = result.normal = result.low = 0;
  }
  if (!baseItem.RareOk) {
    result.magic += result.rare;
    result.rare = 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// unique / set pools
// ---------------------------------------------------------------------------

/**
 * Eligible uniques for a base item at the given ilvl (= mlvl of the drop).
 * Returns [{ index, entry, share, exaltedShare }]. Empty array = failed
 * unique rolls become rare items.
 */
export function uniquePool(ctx, baseIndex, ilvl) {
  const candidates = (ctx.uniquesByBase.get(baseIndex) ?? [])
    .map(i => ctx.uniques[i])
    .filter(u => u.Lvl <= ilvl);
  const totalRarity = candidates.reduce((sum, u) => sum + u.Rarity, 0);
  if (totalRarity === 0) return [];
  const exaltedPct = ctx.options.exalted?.enabled ? (ctx.options.exalted.percent ?? 5) / 100 : 0;
  return candidates.map(u => ({
    entry: u,
    share: u.Rarity / totalRarity,
    exaltedShare: u.ExaltedName ? (u.Rarity / totalRarity) * exaltedPct : 0,
  }));
}

export function setPool(ctx, baseIndex, ilvl) {
  const candidates = (ctx.setsByBase.get(baseIndex) ?? [])
    .map(i => ctx.sets[i])
    .filter(s => s.Lvl <= ilvl);
  const totalRarity = candidates.reduce((sum, s) => sum + s.Rarity, 0);
  if (totalRarity === 0) return [];
  const mythicPct = ctx.options.mythic?.enabled ? (ctx.options.mythic.percent ?? 5) / 100 : 0;
  return candidates.map(s => ({
    entry: s,
    share: s.Rarity / totalRarity,
    mythicShare: s.MythicName ? (s.Rarity / totalRarity) * mythicPct : 0,
  }));
}

// ---------------------------------------------------------------------------
// top-level computations
// ---------------------------------------------------------------------------

/**
 * Resolves the TC for a source selection.
 * sel: { kind: 'monster'|'superunique'|'chest'|'rawTc', monsterIndex,
 *        superUniqueIndex, sourceType, difficulty, areaId, tcIndex }
 * Returns { difficulty, tcIndex, upgradedTcIndex, mlvl, baseMlvl, terrorized,
 * monster }. difficulty and terrorized together are what the ConditionCalc
 * gates are evaluated against, so the source doubles as traverseTc's env.
 */
export function resolveSource(ctx, sel) {
  return { difficulty: sel.difficulty ?? 0, ...resolveSourceTc(ctx, sel) };
}

function resolveSourceTc(ctx, sel) {
  const difficulty = sel.difficulty ?? 0;

  if (sel.kind === 'rawTc') {
    return { tcIndex: sel.tcIndex, upgradedTcIndex: sel.tcIndex, mlvl: 99, baseMlvl: 99, terrorized: false, monster: null };
  }

  if (sel.kind === 'chest') {
    const area = ctx.areasById.get(sel.areaId);
    const tcIndex = area?.ChestTcs[difficulty] ?? -1;
    const mlvl = area?.Levels[difficulty] ?? 1;
    return { tcIndex, upgradedTcIndex: tcIndex, mlvl, baseMlvl: mlvl, terrorized: false, monster: null };
  }

  if (sel.kind === 'herald') {
    // Heralds are terror-zone elites; their top TCs form one group ladder
    // whose level walk selects the act/difficulty-appropriate table.
    if (ctx.heraldTcIndex < 0) {
      return { tcIndex: -1, upgradedTcIndex: -1, mlvl: 0, baseMlvl: 0, terrorized: false, monster: null };
    }
    const charLevel = ctx.options.terror?.charLevel ?? 99;
    const cap = TZ_CAPS[difficulty][TZ_CAP_SLOT.unique];
    const mlvl = Math.min(cap, (charLevel | 0) + TZ_BONUS.unique);
    const tcIndex = ctx.heraldTcIndex;
    const upgradedTcIndex = upgradeTc(ctx, tcIndex, mlvl);
    return { tcIndex, upgradedTcIndex, mlvl, baseMlvl: mlvl, terrorized: true, monster: null };
  }

  if (sel.kind === 'superunique') {
    const su = ctx.superUniques[sel.superUniqueIndex];
    const monster = su.Monster >= 0 ? ctx.monsters[su.Monster] : { Levels: [0, 0, 0], Boss: false, NoRatio: false };
    const areaId = su.Areas[0];
    const level = effectiveMlvl(ctx, { monster, sourceType: 'superunique', difficulty, areaId });
    // terrorized superuniques use their desecrated TC when the data has one
    const desecrated = ctx.options.terror?.enabled ? (su.DesecratedTcs?.[difficulty] ?? -1) : -1;
    const tcIndex = desecrated >= 0 ? desecrated : su.Tcs[difficulty];
    return { tcIndex, upgradedTcIndex: tcIndex, ...level, monster, superUnique: su };
  }

  const monster = ctx.monsters[sel.monsterIndex];
  const sourceType = sel.sourceType ?? 'normal';
  const level = effectiveMlvl(ctx, { monster, sourceType, difficulty, areaId: sel.areaId });
  const tcColumn = { normal: 0, minion: 0, champion: 1, unique: 2, boss: 2, quest: 3 }[sourceType] ?? 0;
  // Tcs rows: [normal, champion, unique, quest, desecrated, desecratedChampion,
  // desecratedUnique, herald] (older data files stop after quest)
  const desecratedColumn = { normal: 4, minion: 4, champion: 5, unique: 6, boss: 6 }[sourceType];
  const row = monster.Tcs[difficulty];
  let tcIndex = row[tcColumn];
  if (ctx.options.terror?.enabled && desecratedColumn != null && (row[desecratedColumn] ?? -1) >= 0) {
    tcIndex = row[desecratedColumn];
  }
  // bosses and quest drops use their fixed TC; everything else walks the
  // group ladder with the effective mlvl (a no-op without TZ in Normal)
  const walk = !monster.Boss && sourceType !== 'quest';
  const upgradedTcIndex = walk ? upgradeTc(ctx, tcIndex, level.mlvl) : tcIndex;
  return { tcIndex, upgradedTcIndex, ...level, monster };
}

/**
 * Full drop table for a source. Returns { source, rows } where rows are
 * { kind: 'unique'|'set'|'base', name, baseName, itemChance, chance,
 *   variantChance, baseIndex, quality } sorted by chance descending.
 * For kind 'base' the chance is the chance to drop at all (any quality).
 */
export function computeMonsterDrops(ctx, sel) {
  const source = resolveSource(ctx, sel);
  if (source.tcIndex == null || source.tcIndex < 0) {
    return { source, rows: [] };
  }

  const { drops, uniqueDrops, setDrops, cm } = traverseTc(ctx, source.upgradedTcIndex, ctx.bonus, source);
  const rows = [];

  for (const [baseIndex, p] of drops) {
    const base = ctx.baseItems[baseIndex];
    const uniques = uniquePool(ctx, baseIndex, source.mlvl);
    const setItems = setPool(ctx, baseIndex, source.mlvl);
    const quality = qualityChances(ctx, base, source.mlvl, cm, {
      hasUniques: uniques.length > 0,
      hasSets: setItems.length > 0,
    });

    rows.push({
      kind: 'base',
      name: base.Name,
      baseIndex,
      chance: p,
      quality,
      isRune: base.IsRune,
      isGem: base.IsGem,
    });

    for (const u of uniques) {
      rows.push({
        kind: 'unique',
        name: u.entry.Name,
        variantName: u.entry.ExaltedName,
        baseName: base.Name,
        baseIndex,
        chance: p * quality.unique * u.share,
        variantChance: u.exaltedShare > 0 ? p * quality.unique * u.exaltedShare : null,
      });
    }
    for (const s of setItems) {
      rows.push({
        kind: 'set',
        name: s.entry.Name,
        variantName: s.entry.MythicName,
        setName: s.entry.SetName,
        baseName: base.Name,
        baseIndex,
        chance: p * quality.set * s.share,
        variantChance: s.mythicShare > 0 ? p * quality.set * s.mythicShare : null,
      });
    }
  }

  // direct unique/set references (Annihilus, sunder charms, quest TCs)
  const exaltedPct = ctx.options.exalted?.enabled ? (ctx.options.exalted.percent ?? 5) / 100 : 0;
  for (const [uniqueIndex, p] of uniqueDrops) {
    const u = ctx.uniques[uniqueIndex];
    rows.push({
      kind: 'unique',
      name: u.Name,
      variantName: u.ExaltedName,
      baseName: u.Base >= 0 ? ctx.baseItems[u.Base].Name : '',
      baseIndex: u.Base,
      chance: p,
      variantChance: u.ExaltedName ? p * exaltedPct : null,
      direct: true,
    });
  }
  const mythicPct = ctx.options.mythic?.enabled ? (ctx.options.mythic.percent ?? 5) / 100 : 0;
  for (const [setIndex, p] of setDrops) {
    const s = ctx.sets[setIndex];
    rows.push({
      kind: 'set',
      name: s.Name,
      variantName: s.MythicName,
      setName: s.SetName,
      baseName: s.Base >= 0 ? ctx.baseItems[s.Base].Name : '',
      baseIndex: s.Base,
      chance: p,
      variantChance: s.MythicName ? p * mythicPct : null,
      direct: true,
    });
  }

  rows.sort((a, b) => b.chance - a.chance);
  return { source, rows };
}

/**
 * Detailed color table for one base item from one source (the classic
 * per-item view): every eligible unique/set item with chances plus the
 * rare/magic/superior/normal/low rows.
 */
export function computeItemDetail(ctx, sel, baseIndex) {
  const source = resolveSource(ctx, sel);
  if (source.tcIndex == null || source.tcIndex < 0) return { source, found: false };
  const { drops, cm } = traverseTc(ctx, source.upgradedTcIndex, ctx.bonus, source);
  const p = drops.get(baseIndex) ?? 0;
  if (p === 0) return { source, found: false };

  const base = ctx.baseItems[baseIndex];
  const uniques = uniquePool(ctx, baseIndex, source.mlvl);
  const setItems = setPool(ctx, baseIndex, source.mlvl);
  const quality = qualityChances(ctx, base, source.mlvl, cm, {
    hasUniques: uniques.length > 0,
    hasSets: setItems.length > 0,
  });

  return {
    source,
    found: true,
    base,
    baseChance: p,
    quality,
    uniqueRows: uniques.map(u => ({
      name: u.entry.Name,
      variantName: u.entry.ExaltedName,
      relative: quality.unique * u.share,
      chance: p * quality.unique * u.share,
      variantChance: u.exaltedShare > 0 ? p * quality.unique * u.exaltedShare : null,
    })),
    setRows: setItems.map(s => ({
      name: s.entry.Name,
      variantName: s.entry.MythicName,
      setName: s.entry.SetName,
      relative: quality.set * s.share,
      chance: p * quality.set * s.share,
      variantChance: s.mythicShare > 0 ? p * quality.set * s.mythicShare : null,
    })),
  };
}

/**
 * Which sources drop a given item, across all monsters/superuniques.
 * sel: { itemKind: 'unique'|'set'|'base', itemIndex, difficulty: 0-2|null
 *        (null = all difficulties) }
 * Returns rows [{ monsterName, sourceType, difficulty, areaId, areaName,
 * mlvl, terrorized, chance, variantChance }] sorted by chance descending.
 */
export function computeItemSources(ctx, { itemKind, itemIndex, difficulty = null }) {
  const target = itemKind === 'unique' ? ctx.uniques[itemIndex]
    : itemKind === 'set' ? ctx.sets[itemIndex]
    : null;
  const baseIndex = itemKind === 'base' ? itemIndex : target?.Base ?? -1;
  const difficulties = difficulty == null ? [0, 1, 2] : [difficulty];
  const rows = [];

  const chanceFor = (source) => {
    if (source.tcIndex == null || source.tcIndex < 0) return null;
    const { drops, uniqueDrops, setDrops, cm } = traverseTc(ctx, source.upgradedTcIndex, ctx.bonus, source);

    let chance = 0;
    let variantChance = null;
    const p = baseIndex >= 0 ? drops.get(baseIndex) ?? 0 : 0;
    if (p > 0) {
      if (itemKind === 'base') {
        chance = p;
      } else {
        const uniques = uniquePool(ctx, baseIndex, source.mlvl);
        const setItems = setPool(ctx, baseIndex, source.mlvl);
        const quality = qualityChances(ctx, ctx.baseItems[baseIndex], source.mlvl, cm, {
          hasUniques: uniques.length > 0,
          hasSets: setItems.length > 0,
        });
        if (itemKind === 'unique') {
          const entry = uniques.find(u => u.entry === ctx.uniques[itemIndex]);
          if (entry) {
            chance = p * quality.unique * entry.share;
            if (entry.exaltedShare > 0) variantChance = p * quality.unique * entry.exaltedShare;
          }
        } else {
          const entry = setItems.find(s => s.entry === ctx.sets[itemIndex]);
          if (entry) {
            chance = p * quality.set * entry.share;
            if (entry.mythicShare > 0) variantChance = p * quality.set * entry.mythicShare;
          }
        }
      }
    }

    // direct TC references (Annihilus, sunder charms, quest TCs)
    if (itemKind === 'unique' && uniqueDrops.has(itemIndex)) {
      const direct = uniqueDrops.get(itemIndex);
      chance += direct;
      if (ctx.uniques[itemIndex].ExaltedName && ctx.options.exalted?.enabled) {
        variantChance = (variantChance ?? 0) + direct * (ctx.options.exalted.percent ?? 5) / 100;
      }
    }
    if (itemKind === 'set' && setDrops.has(itemIndex)) {
      const direct = setDrops.get(itemIndex);
      chance += direct;
      if (ctx.sets[itemIndex].MythicName && ctx.options.mythic?.enabled) {
        variantChance = (variantChance ?? 0) + direct * (ctx.options.mythic.percent ?? 5) / 100;
      }
    }

    return chance > 0 ? { chance, variantChance } : null;
  };

  for (const diff of difficulties) {
    ctx.monsters.forEach((monster, monsterIndex) => {
      // No spawn list places this row in this difficulty, so it is not a source
      // you can farm. Bosses have no spawn list to begin with.
      if (!monster.Boss && monster.Areas[diff].length === 0) return;
      for (const type of ['normal', 'champion', 'unique']) {
        const areas = monster.Areas[diff].length > 0 ? monster.Areas[diff] : [null];
        for (const areaId of areas) {
          const sourceType = type === 'normal' && monster.Boss ? 'boss' : type;
          const source = resolveSource(ctx, { kind: 'monster', monsterIndex, sourceType, difficulty: diff, areaId });
          const hit = chanceFor(source);
          if (!hit) continue;
          rows.push({
            monsterName: monster.Name,
            monsterIndex,
            sourceType,
            difficulty: diff,
            areaId,
            mlvl: source.mlvl,
            terrorized: source.terrorized,
            ...hit,
          });
          // bosses have identical TCs for all base types - one row is enough
          if (monster.Boss) break;
        }
        if (monster.Boss) break;
      }
    });

    ctx.superUniques.forEach((su, superUniqueIndex) => {
      const source = resolveSource(ctx, { kind: 'superunique', superUniqueIndex, difficulty: diff });
      const hit = chanceFor(source);
      if (!hit) return;
      rows.push({
        monsterName: su.Name,
        superUniqueIndex,
        sourceType: 'superunique',
        difficulty: diff,
        areaId: su.Areas[0] ?? null,
        mlvl: source.mlvl,
        terrorized: source.terrorized,
        ...hit,
      });
    });
  }

  rows.sort((a, b) => b.chance - a.chance);
  return rows;
}

/**
 * Effective magic find per quality after diminishing returns - the values the
 * classic calculators display next to the MF input.
 */
export function effectiveMf(mf) {
  const value = Math.max(0, mf | 0);
  return {
    unique: diminishedMf(value, 250),
    set: diminishedMf(value, 500),
    rare: diminishedMf(value, 600),
    magic: value,
  };
}

/**
 * Chance that a single pick of the TC drops nothing, after the player-count
 * recomputation (the "NoDrop" percentage the classic calculators display).
 */
export function noDropChance(ctx, tcIndex, bonus) {
  if (tcIndex == null || tcIndex < 0) return null;
  const tc = ctx.tcs[tcIndex];
  const itemSum = tc.Items.reduce((sum, e) => sum + e[2], 0);
  let noDrop = tc.NoDrop;
  if (itemSum === 0 || noDrop <= 0) return 0;
  if (bonus > 1) {
    const sum = itemSum + noDrop;
    const fraction = Math.pow(noDrop / sum, bonus);
    noDrop = Math.floor((sum - noDrop) * fraction / (1 - fraction));
  }
  return noDrop / (itemSum + noDrop);
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

// narrow no-break space after the colon for readability
const RATIO_SEP = ':\u202f';

/**
 * Percentages above 1 always get two decimals (62.5 -> 62.50, 1.3786 ->
 * 1.38); smaller values round to two significant fractional digits
 * (0.0000346 -> 0.000035).
 */
function formatPercent(pct) {
  if (pct < 0.0000001) return '< 0.0000001%';
  if (pct > 1) return `${pct.toFixed(2)}%`;
  const fraction = pct - Math.floor(pct);
  let decimals = 0;
  if (fraction > 0) {
    let f = fraction;
    while (f < 1 && decimals < 10) {
      f *= 10;
      decimals++;
    }
    decimals++; // two significant fractional digits
  }
  return `${Number(pct.toFixed(decimals))}%`;
}

export function formatChance(p, mode = 'ratio') {
  if (!p || p <= 0) return mode === 'ratio' ? '-' : '0%';
  if (mode === 'pct') {
    return formatPercent(p * 100);
  }
  if (p >= 0.1) return `1${RATIO_SEP}${Math.round(10 / p) / 10}`;
  return `1${RATIO_SEP}${Math.round(1 / p).toLocaleString('en-US')}`;
}
