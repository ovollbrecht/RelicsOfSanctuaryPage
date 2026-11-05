import itemBaseData from '@/assets/item_bases.json';

/** The socketable bases and the type family tree above them, from item_bases.json. */
export const itemTypes = itemBaseData.Types;
export const itemBases = itemBaseData.Bases;
export const typeByCode = new Map(itemTypes.map((type) => [type.Code, type]));
export const baseByCode = new Map(itemBases.map((base) => [base.Code, base]));

// A type and everything it belongs to, worked out once per type.
const chainCache = new Map();
export const chainOf = (code) => {
  const cached = chainCache.get(code);
  if (cached) return cached;
  const chain = new Set();
  const walk = (current) => {
    if (!current || chain.has(current)) return;
    chain.add(current);
    (typeByCode.get(current)?.Parents ?? []).forEach(walk);
  };
  walk(code);
  chainCache.set(code, chain);
  return chain;
};

// A base can sit in two families: the mod gives the Cryptic Sword a second
// type so one runeword can name that sword and nothing else.
export const baseChain = (base) => new Set([...chainOf(base.Type), ...(base.Type2 ? chainOf(base.Type2) : [])]);

/** Whether a base's family reaches one of a row's types without touching an excluded one. */
export const rowFits = (row, chain) => !row.excluded.some((t) => chain.has(t)) && row.own.some((t) => chain.has(t));

/**
 * Every base a runeword group can be made in, each with the index of the
 * variant (per-item-kind entry) its stats come from. Sorted by tier, then name.
 */
const TIER_RANK = { normal: 0, exceptional: 1, elite: 2 };
export const basesForGroup = (group) => {
  const out = [];
  for (const base of itemBases) {
    if (base.Sockets < group.sockets) continue;
    const chain = baseChain(base);
    const variant = group.rows.findIndex((row) => rowFits(row, chain));
    if (variant >= 0) out.push({ base, variant });
  }
  return out.sort((a, b) => (TIER_RANK[a.base.Tier] ?? 9) - (TIER_RANK[b.base.Tier] ?? 9) || a.base.Name.localeCompare(b.base.Name));
};
