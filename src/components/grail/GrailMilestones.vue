<script setup>
import { computed } from 'vue';
import { t, dateLocale } from '@/i18n';

/**
 * The Grail as a story: the firsts, the round numbers, and where the pace
 * leads. Dates come from the Chronicle; a find without one happened before
 * the Chronicle was kept and counts as "before".
 */
const props = defineProps({
  entries: { type: Array, required: true }, // checklist entries with .record
});

const found = computed(() => props.entries.filter((e) => e.record));
const dated = computed(() => found.value.filter((e) => e.record.when).map((e) => ({ ...e, at: new Date(e.record.when) })).sort((a, b) => a.at - b.at));
const undated = computed(() => found.value.length - dated.value.length);
const total = computed(() => props.entries.length);

const fmt = (d) => d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
const first = (pred) => dated.value.find(pred) ?? null;
const firstOf = (label, pred) => {
  const e = first(pred);
  const before = !e && found.value.some((x) => !x.record.when && pred(x));
  return { label, name: e?.name ?? null, date: e ? fmt(e.at) : before ? t('before the Chronicle') : null, done: !!e || before };
};

// a set is complete when every piece is found; its date is the last piece's
const firstSet = computed(() => {
  const sets = new Map();
  for (const e of props.entries) if (e.kind === 'set') { const s = sets.get(e.set) ?? []; s.push(e); sets.set(e.set, s); }
  let best = null; let before = false;
  for (const [name, items] of sets) {
    if (!items.every((e) => e.record)) continue;
    if (items.some((e) => !e.record.when)) { before = true; continue; }
    const at = new Date(Math.max(...items.map((e) => new Date(e.record.when))));
    if (!best || at < best.at) best = { name, at };
  }
  return { label: t('First complete set'), name: best?.name ?? null, date: best ? fmt(best.at) : before ? t('before the Chronicle') : null, done: !!best || before };
});

const thresholds = computed(() => [25, 50, 75, 100].map((p) => {
  const need = Math.ceil((p / 100) * total.value);
  const idx = need - undated.value - 1; // into the dated list, ascending
  if (found.value.length >= need) {
    const e = idx >= 0 ? dated.value[idx] : null;
    return { label: `${p} %`, name: e?.name ?? null, date: e ? fmt(e.at) : t('before the Chronicle'), done: true };
  }
  return { label: `${p} %`, name: null, date: null, done: false, toGo: need - found.value.length };
}));

const milestones = computed(() => [
  firstOf(t('First find'), () => true),
  firstOf(t('First Exalted'), (e) => e.exalted),
  firstOf(t('First Mythic'), (e) => e.mythic),
  firstOf(t('First runeword'), (e) => e.kind === 'runeword'),
  firstSet.value,
  ...thresholds.value,
]);

// the pace: finds per week over the last 90 days, and where that lands
const pace = computed(() => {
  const now = Date.now();
  const window = 90;
  const recent = dated.value.filter((e) => now - e.at < window * 86400000).length;
  const firstAt = dated.value[0]?.at ?? null;
  const days = firstAt ? Math.min(window, Math.max(7, (now - firstAt) / 86400000)) : window;
  const perDay = recent / days;
  const remaining = total.value - found.value.length;
  const eta = perDay > 0 && remaining > 0 ? new Date(now + (remaining / perDay) * 86400000) : null;
  return { perWeek: perDay * 7, remaining, eta: eta ? eta.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' }) : null, years: eta ? (remaining / perDay) / 365 : 0 };
});
</script>

<template>
  <div class="card card-enhanced">
    <div class="card-header card-header-primary py-2 d-flex flex-wrap justify-content-between align-items-baseline gap-2">
      <span class="h6 m-0">{{ $t('Milestones') }}</span>
      <span v-if="pace.remaining > 0" class="small text-muted">
        <template v-if="pace.perWeek > 0">
          {{ $t('{n} finds a week lately', { n: pace.perWeek.toFixed(1) }) }} ·
          <template v-if="pace.years > 50">{{ $t('at this pace the Grail outlives you') }}</template>
          <template v-else>{{ $t('at this pace complete around {when}', { when: pace.eta }) }}</template>
        </template>
        <template v-else>{{ $t('no dated find in the last 90 days') }}</template>
      </span>
      <span v-else class="small text-muted">{{ $t('Complete. Nothing left to find.') }}</span>
    </div>
    <div class="card-body p-3">
      <div class="stones">
        <div v-for="m in milestones" :key="m.label" class="stone" :class="{ done: m.done }">
          <div class="stone-label">{{ m.label }}</div>
          <div v-if="m.done" class="stone-body">
            <div v-if="m.name" class="stone-name text-truncate" :title="m.name">{{ m.name }}</div>
            <div class="stone-date">{{ m.date }}</div>
          </div>
          <div v-else class="stone-body text-muted">
            <div class="stone-date">{{ m.toGo != null ? (m.toGo === 1 ? $t('1 to go') : $t('{n} to go', { n: m.toGo })) : $t('not yet') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stones { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.5rem; }
.stone { padding: 0.5rem 0.65rem; border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 0.4rem; background: rgba(0, 0, 0, 0.18); min-width: 0; }
.stone.done { border-color: rgba(201, 163, 106, 0.35); box-shadow: inset 3px 0 0 var(--d2r-gold); }
.stone-label { font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--d2r-muted); }
.stone-name { font-family: var(--font-display); color: var(--d2r-gold-bright); font-size: 0.95rem; }
.stone-date { font-size: 0.78rem; color: var(--d2r-muted); }
</style>
