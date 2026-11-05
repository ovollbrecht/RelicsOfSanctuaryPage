/**
 * What a base item reads as once an item's properties sit on it - a port of
 * the tooling's StatCalculator, so a runeword on a base the reader picks shows
 * the same lines the unique export ships precomputed.
 *
 * `base` is an item_bases.json row, `properties` the flat {Prop, Min, Max}
 * list; group rolls and anything else without a Prop are ignored, as the
 * exporter ignores them.
 */
const num = (v) => (v == null || v === '' ? 0 : Number(v));
const mult = (v) => (v == null ? 0 : num(v) / 100);
// per-level values, read at level 99
const multLvl = (v) => (v == null ? 0 : num(v) * 0.99);
const add = (v) => (v == null ? 0 : Math.trunc(num(v)));
const addLvl = (v) => (v == null ? 0 : Math.trunc(num(v) * 99));
const span = (a, b) => (a === b ? String(a) : `${a} - ${b}`);
const bracket = (a, b) => (a === b ? String(a) : `[${a} - ${b}]`);

export const speedLabel = (s) => `${s <= -20 ? 'Very Fast' : s < 0 ? 'Fast' : s === 0 ? 'Normal' : s < 20 ? 'Slow' : 'Very Slow'} (${s > 0 ? '+' : ''}${s})`;

export function calcStats(base, properties, { ethereal = false, levelReq = 0 } = {}) {
  const props = properties.filter((p) => p?.Prop);
  const find = (name) => props.find((p) => p.Prop === name);
  const eth = ethereal || props.some((p) => p.Prop === 'ethereal' || p.Prop === 'eth-indestruct');
  const ethMult = eth ? 1.5 : 1;
  const out = {};

  const [defMin, defMax] = base.Defense ?? [0, 0];
  if (defMax) {
    const pct = find('ac%'); const pctLvl = find('ac%/lvl'); const flat = find('ac'); const flatLvl = find('ac/lvl');
    const from = pct || pctLvl ? defMax : defMin;
    out.Defense = span(
      Math.trunc(from * (1 + mult(pct?.Min) + multLvl(pctLvl?.Min)) * ethMult + add(flat?.Min) + addLvl(flatLvl?.Min)),
      Math.trunc(defMax * (1 + mult(pct?.Max) + multLvl(pctLvl?.Max)) * ethMult + add(flat?.Max) + addLvl(flatLvl?.Max)),
    );
  }

  const [dmgMin, dmgMax] = base.Damage ?? [0, 0];
  if (dmgMax) {
    const pct = find('dmg%'); const pctLvl = find('dmg%/lvl'); const minAdd = find('dmg-min'); const maxAdd = find('dmg-max');
    const maxLvl = find('dmg/lvl'); const norm = find('dmg-norm');
    const mMin = (1 + mult(pct?.Min)) * ethMult;
    const mMax = (1 + mult(pct?.Max) + multLvl(pctLvl?.Max)) * ethMult;
    const minFrom = Math.trunc(dmgMin * mMin + add(norm?.Min) + add(minAdd?.Min));
    const minTo = Math.trunc(dmgMin * mMax + add(norm?.Max) + add(minAdd?.Max));
    const maxFrom = Math.max(minFrom, Math.trunc(dmgMax * mMin + add(norm?.Min) + add(maxAdd?.Min) + addLvl(maxLvl?.Min)));
    const maxTo = Math.max(minTo, Math.trunc(dmgMax * mMax + add(norm?.Max) + add(maxAdd?.Max) + addLvl(maxLvl?.Max)));
    out.Damage = `${bracket(minFrom, minTo)} to ${bracket(maxFrom, maxTo)}`;
  }

  if (base.Durability) {
    const dur = find('dur');
    let min = base.Durability; let max = base.Durability;
    if (eth && !dur) { min = Math.trunc(min / 2 + 1); max = Math.trunc(max / 2 + 1); }
    out.Durability = span(min + add(dur?.Min), max + add(dur?.Max));
  }

  if (base.Block) {
    const block = find('block');
    out['Block Chance'] = span(base.Block + add(block?.Min), base.Block + add(block?.Max));
  }

  const str = base.StrReq ?? 0; const dex = base.DexReq ?? 0;
  if (str || dex) {
    const ease = find('ease');
    const req = (v, bonus) => Math.max(Math.trunc(v * (100 + add(bonus)) / 100 - (eth ? 10 : 0)), 0);
    out['Required Strength'] = span(req(str, ease?.Min), req(str, ease?.Max));
    out['Required Dexterity'] = span(req(dex, ease?.Min), req(dex, ease?.Max));
  }

  out['Required Level'] = String(Math.max(levelReq, base.LevelReq ?? 0));

  if (dmgMax && base.Speed != null) {
    const ias = find('swing1') ?? find('swing2') ?? find('swing3');
    const from = base.Speed - add(ias?.Max); const to = base.Speed - add(ias?.Min);
    out['Attack Speed'] = from === to ? speedLabel(from) : `${speedLabel(from)} - ${speedLabel(to)}`;
  }

  return out;
}

export const nonZeroStats = (stats) => Object.entries(stats).filter(([, v]) => v != null && v !== '0' && v !== '0 to 0');
