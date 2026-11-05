import { describe, it, expect } from 'vitest';
import uniques from '@/assets/unique_items.json';
import { itemBases } from '@/composables/useItemBases.js';
import { calcStats } from '@/composables/useItemStats.js';

/**
 * The page's stat arithmetic is a port of the tooling's StatCalculator. The
 * unique export carries that calculator's answers, so every unique whose
 * base is in the socketable list is a fixture: same base, same properties,
 * same lines - or the port has drifted.
 */
describe('calcStats', () => {
  it('reads every unique the way the export does', () => {
    const byName = new Map(itemBases.map((b) => [b.Name, b]));
    const drift = [];
    let checked = 0;
    for (const item of uniques) {
      const base = byName.get(item.BaseItemName);
      if (!base || !item.Stats || !item.Properties) continue;
      checked += 1;
      const got = calcStats(base, item.Properties, { levelReq: item.LvlReq ?? 0 });
      for (const [key, want] of Object.entries(item.Stats)) {
        if (want == null) continue;
        const have = got[key] ?? '0';
        if (have !== want && !(want === '0 to 0' && have === '0')) drift.push(`${item.Name} ${key}: ${have} vs ${want}`);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(drift).toEqual([]);
  });
});
