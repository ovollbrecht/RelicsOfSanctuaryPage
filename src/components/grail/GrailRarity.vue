<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { farmToken, farmPlannerEnabled } from '@/composables/useFarmList.js';

/**
 * How rare each thing is, by the best spot for it: the chance one run there
 * turns it up, with the run as Where to Farm defines it - Hell, one player,
 * a full clear - at the magic find the reader types in (remembered locally). From that: the rarest thing found, the rarest
 * still ahead, and the missing ones closest to hand.
 *
 * Every spot is scored against every item once; that takes about a second, so
 * it starts after the page has painted and the result is kept for the visit.
 */
const props = defineProps({
  entries: { type: Array, required: true }, // checklist entries with .record
  catalog: { type: Object, required: true },
});

const rarity = ref(null); // `${kind}:${name}` -> { hit, spot }
// Exalted and Mythic are a five-percent roll on top, so they would own every
// list; off by default, one switch turns them in
const withVariants = ref(false);
// the reader's magic find, kept in the browser; 0 is the planner's own default
const MF_KEY = 'grail_mf';
const mf = ref((() => { try { const n = parseInt(localStorage.getItem(MF_KEY) ?? '0', 10); return Number.isFinite(n) ? Math.min(9999, Math.max(0, n)) : 0; } catch { return 0; } })());
const busy = ref(false);
const error = ref(null);
const compute = async () => {
  busy.value = true;
  try {
    const [{ default: data }, sim, plan] = await Promise.all([
      import('@/assets/dropcalc.json'), import('@/composables/useDropSimulation.js'), import('@/composables/useFarmPlanner.js'),
    ]);
    const targets = plan.grailTargets(data, props.catalog, {});
    const ctx = sim.buildContext(data, { dataMode: 'mod', players: 1, partyNearby: 1, mf: mf.value, terror: { enabled: false, charLevel: 99 }, exalted: { enabled: true, percent: 5 }, mythic: { enabled: true, percent: 5 }, heraldTier: 1 });
    const best = new Array(targets.length).fill(null);
    for (const spot of plan.buildSpots(data, 2)) {
      const run = plan.applyPreset(data, spot, null);
      const score = plan.scoreSpot(ctx, run, targets, plan.DEFAULT_PROFILE, 2, { highRune: 25, detail: true });
      for (const { k, hit } of score.detail.targets) if (!best[k] || hit > best[k].hit) best[k] = { hit, spot: spot.name };
    }
    const map = new Map();
    targets.forEach((tg, k) => { if (best[k]) map.set(`${tg.kind}:${tg.name}`, { ...best[k], token: farmToken(tg.kind, tg.name, tg.variant === 'exalted' || tg.variant === 'mythic') }); });
    rarity.value = map;
  } catch (e) {
    error.value = String(e?.message ?? e);
  } finally {
    busy.value = false;
  }
};
onMounted(() => { setTimeout(compute, 300); });
// a new magic find scores everything again, after the typing has settled
let mfTimer = null;
watch(mf, (v) => {
  try { localStorage.setItem(MF_KEY, String(v)); } catch { /* fine */ }
  clearTimeout(mfTimer); mfTimer = setTimeout(compute, 500);
});

const withRarity = computed(() => {
  if (!rarity.value) return [];
  return props.entries.filter((e) => e.kind !== 'runeword').map((e) => ({ ...e, r: rarity.value.get(`${e.kind}:${e.name}`) ?? null })).filter((e) => e.r);
});
const pool = computed(() => (withVariants.value ? withRarity.value : withRarity.value.filter((e) => !e.exalted && !e.mythic)));
const rarestFound = computed(() => pool.value.filter((e) => e.record).sort((a, b) => a.r.hit - b.r.hit).slice(0, 6));
const rarestMissing = computed(() => pool.value.filter((e) => !e.record).sort((a, b) => a.r.hit - b.r.hit).slice(0, 4));
const nearest = computed(() => pool.value.filter((e) => !e.record).sort((a, b) => b.r.hit - a.r.hit).slice(0, 8));
const unreachable = computed(() => (rarity.value ? props.entries.filter((e) => e.kind !== 'runeword' && !e.record && !rarity.value.has(`${e.kind}:${e.name}`)).length : 0));

const runs = (hit) => (hit > 0 ? Math.round(1 / hit) : Infinity);
const runsText = (hit) => `1 : ${runs(hit).toLocaleString()}`;
const farmLink = (e) => ({ path: '/where-to-farm', query: { items: e.r.token } });
const kindClass = (e) => e.kind;
</script>

<template>
  <div class="card card-enhanced h-100">
    <div class="card-header card-header-primary py-2 d-flex flex-wrap justify-content-between align-items-baseline gap-2">
      <span class="h6 m-0">{{ $t('Rarity') }}</span>
      <span class="small text-muted d-flex align-items-center gap-1">{{ $t('runs per hit at the best spot · Hell, one player') }} ·
        <label for="rarity-mf" class="m-0">{{ $t('MF') }}</label>
        <input id="rarity-mf" v-model.number="mf" type="number" min="0" max="9999" step="5" class="form-control form-control-sm mf-input" :title="$t('Your magic find; remembered in this browser')" />
      </span>
      <div class="form-check form-switch mb-0 small">
        <input id="rarity-variants" v-model="withVariants" class="form-check-input" type="checkbox" />
        <label class="form-check-label" for="rarity-variants">{{ $t('Exalted and Mythic too') }}</label>
      </div>
    </div>
    <div class="card-body p-3">
      <div v-if="busy" class="small text-muted">{{ $t('Scoring every spot against every item…') }}</div>
      <div v-else-if="error" class="small text-warning">{{ $t('Could not compute:') }} {{ error }}</div>
      <template v-else-if="rarity">
        <div class="row g-3">
          <div class="col-md-6">
            <div class="sect">{{ $t('Your rarest finds') }}</div>
            <ul v-if="rarestFound.length" class="list-unstyled m-0 rl">
              <li v-for="e in rarestFound" :key="e.kind + e.id">
                <span class="name" :class="kindClass(e)">{{ e.name }}</span>
                <span class="odds">{{ runsText(e.r.hit) }}</span>
                <span class="spot text-muted text-truncate">{{ e.r.spot }}</span>
              </li>
            </ul>
            <div v-else class="small text-muted">{{ $t('Nothing found yet.') }}</div>
            <div v-if="rarestMissing.length" class="sect mt-3">{{ $t('The hardest still ahead') }}</div>
            <ul class="list-unstyled m-0 rl">
              <li v-for="e in rarestMissing" :key="e.kind + e.id">
                <span class="name" :class="kindClass(e)">{{ e.name }}</span>
                <span class="odds">{{ runsText(e.r.hit) }}</span>
                <span class="spot text-muted text-truncate">{{ e.r.spot }}</span>
              </li>
            </ul>
          </div>
          <div class="col-md-6">
            <div class="sect">{{ $t('Closest to hand') }}</div>
            <ul v-if="nearest.length" class="list-unstyled m-0 rl">
              <li v-for="e in nearest" :key="e.kind + e.id">
                <router-link v-if="farmPlannerEnabled" :to="farmLink(e)" class="name" :class="kindClass(e)" :title="$t('Where to farm it')">{{ e.name }}</router-link>
                <span v-else class="name" :class="kindClass(e)">{{ e.name }}</span>
                <span class="odds">{{ runsText(e.r.hit) }}</span>
                <span class="spot text-muted text-truncate">{{ e.r.spot }}</span>
              </li>
            </ul>
            <div v-else class="small text-muted">{{ $t('Nothing left to farm for.') }}</div>
            <div v-if="unreachable" class="small text-muted mt-2">{{ unreachable === 1 ? $t('1 missing item drops from no monster the planner knows.') : $t('{n} missing items drop from no monster the planner knows.', { n: unreachable }) }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sect { font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--d2r-muted); margin-bottom: 0.3rem; }
.rl li { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 0.6rem; padding: 0.25rem 0; border-top: 1px solid rgba(255, 255, 255, 0.05); }
.rl li:first-child { border-top: 0; }
.name { grid-column: 1; text-decoration: none; }
.name.unique { color: #c7b377; } .name.set { color: #7fdc7f; }
a.name:hover { text-decoration: underline; }
.odds { grid-column: 2; grid-row: 1 / span 2; align-self: center; font-family: var(--font-display); color: var(--d2r-gold-bright); font-variant-numeric: tabular-nums; white-space: nowrap; }
.spot { grid-column: 1; font-size: 0.75rem; }
.mf-input { width: 5.5rem; display: inline-block; }
</style>
