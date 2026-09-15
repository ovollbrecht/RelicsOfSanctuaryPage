/**
 * The cube's rune ladder, and whether a stock of runes can build a runeword.
 *
 * The picker on the runewords page says which runes you have; the Grail's
 * files say how many. With counts, a runeword asking for two Ist is judged
 * honestly, and the cube comes into it: three Ist are a Gul whether you like
 * it or not. The ladder is read from the cube page's own data - the Relics
 * recipes need no gem, so the vanilla ones are taken at their rune cost alone.
 */
export const runeNumber = (code) => Number.parseInt(String(code).slice(1), 10) || 0;

/** code -> { from, qty }: what one rune is made of. */
export function readLadder(cubeData) {
  const steps = new Map();
  for (const r of cubeData.Recipes ?? []) {
    if (r.Output?.Kind !== 'rune') continue;
    const runes = (r.Inputs ?? []).filter((i) => i.Kind === 'rune');
    if (runes.length !== 1) continue;
    if (!steps.has(r.Output.Code) || r.Origin === 'mod') steps.set(r.Output.Code, { from: runes[0].Code, qty: runes[0].Qty ?? 1 });
  }
  return steps;
}

/**
 * Can these runes be made from the stock? First what lies there as it is,
 * then - with upgrades on - the missing runes made out of the ones below
 * them, highest first. Returns the state ('now', 'upgrade' or null), the
 * runes still short, and what the cube would have to make.
 */
export function planBuild(runes, stockIn, ladder, { upgrades = true } = {}) {
  const need = new Map();
  for (const code of runes ?? []) need.set(code, (need.get(code) ?? 0) + 1);
  const stock = new Map(stockIn);
  const takeFrom = (code, n) => { const have = stock.get(code) ?? 0; const t = Math.min(have, n); if (t) stock.set(code, have - t); return n - t; };
  const short = new Map();
  for (const [code, n] of need) { const s = takeFrom(code, n); if (s) short.set(code, s); }
  if (short.size === 0) return { state: 'now', missing: [], upgrades: [] };
  const listShort = () => [...short].flatMap(([c, n]) => Array(n).fill(c));
  if (!upgrades) return { state: null, missing: listShort(), upgrades: [] };
  const made = new Map();
  const make = (code, n) => {
    const step = ladder.get(code);
    if (!step) return n;
    let left = n;
    while (left > 0) {
      const s = takeFrom(step.from, step.qty);
      if (s && make(step.from, s)) break;
      left--; made.set(code, (made.get(code) ?? 0) + 1);
    }
    return left;
  };
  const missing = [];
  for (const [code, n] of [...short].sort((a, b) => runeNumber(b[0]) - runeNumber(a[0]))) {
    const left = make(code, n);
    for (let i = 0; i < left; i++) missing.push(code);
  }
  return {
    state: missing.length ? null : 'upgrade',
    missing,
    upgrades: [...made].sort((a, b) => runeNumber(a[0]) - runeNumber(b[0])).map(([code, n]) => ({ code, n, ...ladder.get(code) })),
  };
}
