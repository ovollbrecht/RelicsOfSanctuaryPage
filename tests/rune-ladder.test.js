import { describe, it, expect } from 'vitest';
import cube from '@/assets/cube.json';
import { readLadder, planBuild } from '@/composables/useRuneLadder.js';

const ladder = readLadder(cube);
const stock = new Map([['r22', 2], ['r23', 1], ['r24', 3], ['r25', 1], ['r26', 2], ['r30', 1], ['r08', 5]]);

describe('the rune ladder', () => {
  it('reads one step per rune above El, three low runes or two high ones', () => {
    expect(ladder.size).toBe(32);
    expect(ladder.get('r10')).toEqual({ from: 'r09', qty: 3 });
    expect(ladder.get('r25')).toEqual({ from: 'r24', qty: 2 });
  });
  it('builds from what lies there', () => {
    expect(planBuild(['r24', 'r24'], stock, ladder).state).toBe('now');
  });
  it('makes a missing rune out of the ones below it, highest first', () => {
    const plan = planBuild(['r26', 'r26', 'r26'], stock, ladder);
    expect(plan.state).toBe('upgrade');
    expect(plan.upgrades.map((u) => `${u.n}x${u.code}`)).toEqual(['1xr25', '1xr26']);
  });
  it('reports the rune still short when the ladder cannot reach it', () => {
    expect(planBuild(['r33', 'r22'], stock, ladder)).toMatchObject({ state: null, missing: ['r33'] });
    expect(planBuild(['r26', 'r26', 'r26'], stock, ladder, { upgrades: false })).toEqual({ state: null, missing: ['r26'], upgrades: [] });
  });
  it('counts copies - two Ist wanted, one held, is short one Ist', () => {
    expect(planBuild(['r24', 'r24'], new Map([['r24', 1]]), ladder, { upgrades: false }).missing).toEqual(['r24']);
  });
});
