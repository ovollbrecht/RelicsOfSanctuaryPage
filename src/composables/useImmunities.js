/**
 * What an area can be farmed with. An element is blocked in an area when a
 * monster that spawns there is immune to it on that difficulty - superuniques
 * count through their base monster. A zone is written off for an element
 * only when every one of its areas is.
 */
export const ELEMENTS = ['Fire', 'Cold', 'Lightning', 'Poison', 'Magic', 'Physical'];
export const ELEMENT_SHORT = { Fire: 'Fire', Cold: 'Cold', Lightning: 'Ltng', Poison: 'Pois', Magic: 'Mag', Physical: 'Phys' };
export const elementClass = (e) => `el-${e.toLowerCase()}`;

const cache = new WeakMap(); // data -> Map(diff -> Map(areaId -> Set(element)))

export const areaImmunities = (data, areaId, diff) => {
  let byDiff = cache.get(data);
  if (!byDiff) cache.set(data, byDiff = new Map());
  let byArea = byDiff.get(diff);
  if (!byArea) {
    byArea = new Map();
    const add = (id, list) => {
      if (!list?.length) return;
      let set = byArea.get(id);
      if (!set) byArea.set(id, set = new Set());
      list.forEach((e) => set.add(e));
    };
    data.Monsters.forEach((m) => m.Areas[diff].forEach((id) => add(id, m.Immunities?.[diff])));
    data.SuperUniques.forEach((su) => {
      if (su.Monster < 0) return;
      su.Areas.forEach((id) => add(id, data.Monsters[su.Monster]?.Immunities?.[diff]));
    });
    byDiff.set(diff, byArea);
  }
  return byArea.get(areaId) ?? new Set();
};

/// Elements with at least one area free of immunity to them, in a fixed order.
export const farmableElements = (data, zone, diff) => ELEMENTS.filter((e) => zone.areas.some((id) => !areaImmunities(data, id, diff).has(e)));
export const blockedElements = (data, zone, diff) => ELEMENTS.filter((e) => zone.areas.every((id) => areaImmunities(data, id, diff).has(e)));
/// True when none of the chosen elements gets through in this area.
export const areaBlockedFor = (data, areaId, diff, elements) => {
  if (!elements || elements.length === 0) return false;
  const immune = areaImmunities(data, areaId, diff);
  return elements.every((e) => immune.has(e));
};
/// True when the monster is immune to every element in the list.
export const monsterBlockedFor = (data, monsterIndex, diff, elements) => {
  if (!elements || elements.length === 0 || monsterIndex < 0) return false;
  const immune = data.Monsters[monsterIndex]?.Immunities?.[diff] ?? [];
  return elements.every((e) => immune.includes(e));
};
