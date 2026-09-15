<script setup>
import { computed } from 'vue';
import { t, dateLocale } from '@/i18n';

/**
 * The Grail at a glance: how far along it is, when the finds happened, who
 * dropped them, and where the gaps are. Everything here is derived from the
 * checklist entries the page already has - each carries its record, if any.
 */
const props = defineProps({
  entries: { type: Array, required: true },     // [{ kind, tabId, name, slot, tier, record }]
  tabs: { type: Array, required: true },        // [{ id, label }]
  sources: { type: Object, default: () => ({}) },
  owned: { type: Object, default: () => ({}) }, // key -> copies held
  keyOf: { type: Function, required: true },
});
const emit = defineEmits(['pick-slot', 'pick-tab', 'pick-show', 'pick-day']);

const TIER = ['Normal', 'Exceptional', 'Elite'];
const found = computed(() => props.entries.filter((e) => e.record));
const total = computed(() => props.entries.length);
const pct = computed(() => (total.value ? (found.value.length / total.value) * 100 : 0));

// ring geometry
const R = 52;
const CIRC = 2 * Math.PI * R;
const dash = computed(() => `${(pct.value / 100) * CIRC} ${CIRC}`);

const perTab = computed(() => props.tabs.map((t) => {
  const list = props.entries.filter((e) => e.tabId === t.id);
  const f = list.filter((e) => e.record).length;
  const tiers = [0, 1, 2].map((tier) => {
    const tl = list.filter((e) => e.tier === tier);
    return { tier, label: TIER[tier], found: tl.filter((e) => e.record).length, total: tl.length };
  }).filter((x) => x.total);
  return { ...t, found: f, total: list.length, pct: list.length ? (f / list.length) * 100 : 0, tiers };
}));

// the next round number, and the category closest to its next ten percent
const milestone = computed(() => {
  const f = found.value.length;
  const step = f < 100 ? 25 : f < 500 ? 50 : 100;
  const next = Math.min(total.value, Math.ceil((f + 1) / step) * step);
  const closest = perTab.value
    .filter((t) => t.found < t.total)
    .map((t) => {
      const nextPct = Math.min(100, Math.floor(t.pct / 10) * 10 + 10);
      const need = Math.ceil((nextPct / 100) * t.total) - t.found;
      return { ...t, nextPct, need };
    })
    .sort((a, b) => a.need - b.need)[0];
  return { next, toGo: next - f, closest };
});

// ---- when: dated finds (the Chronicle gives the minute) ----
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dated = computed(() => found.value.filter((e) => e.record.when).map((e) => ({ ...e, at: new Date(e.record.when) })).sort((a, b) => b.at - a.at));
const byDay = computed(() => {
  const m = new Map();
  for (const e of dated.value) { const k = dayKey(e.at); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
});
const WEEKS = 26;
const heatmap = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // end the grid on the current week's Sunday so columns are whole weeks
  const end = new Date(today); end.setDate(end.getDate() + (7 - end.getDay()) % 7);
  const start = new Date(end); start.setDate(start.getDate() - WEEKS * 7 + 1);
  const cells = []; const months = [];
  let lastMonth = -1;
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dayKey(d);
    const n = byDay.value.get(k) ?? 0;
    if (i % 7 === 0 && d.getMonth() !== lastMonth) { months.push({ col: i / 7, label: d.toLocaleDateString(dateLocale(), { month: 'short' }) }); lastMonth = d.getMonth(); }
    cells.push({ key: k, n, future: d > today, title: `${d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}: ${n === 1 ? t('1 find') : t('{n} finds', { n })}` });
  }
  const max = Math.max(1, ...cells.map((c) => c.n));
  return { cells: cells.map((c) => ({ ...c, level: c.n === 0 ? 0 : Math.min(4, Math.ceil((c.n / max) * 4)) })), months };
});
const dayStats = computed(() => {
  const now = Date.now();
  const within = (days) => dated.value.filter((e) => now - e.at < days * 86400000).length;
  let best = null;
  for (const [k, n] of byDay.value) if (!best || n > best.n) best = { day: k, n };
  const first = dated.value.at(-1)?.at ?? null;
  const activeDays = byDay.value.size;
  const span = first ? Math.max(1, Math.round((now - first) / 86400000)) : 0;
  return { last7: within(7), last30: within(30), best, first, activeDays, span, perActiveDay: activeDays ? dated.value.length / activeDays : 0 };
});
const fmtDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtDate = (d) => d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

// ---- who: the Chronicle's sources ----
const droppers = computed(() => {
  const m = new Map();
  for (const e of found.value) if (e.record.by) m.set(e.record.by, (m.get(e.record.by) ?? 0) + 1);
  const list = [...m].map(([id, n]) => ({ id, name: props.sources[id] ?? `#${id}`, n })).sort((a, b) => b.n - a.n);
  const max = list[0]?.n ?? 1;
  const known = list.reduce((s, x) => s + x.n, 0);
  return { top: list.slice(0, 10).map((x) => ({ ...x, w: (x.n / max) * 100, share: known ? (x.n / known) * 100 : 0 })), distinct: list.length, known };
});

const recent = computed(() => dated.value.slice(0, 8));

// ---- where the gaps are: by slot ----
const SLOT_ORDER = ['Weapon', 'Helm', 'Body Armor', 'Shield', 'Gloves', 'Boots', 'Belt', 'Ring', 'Amulet', 'Charm', 'Jewel', 'Other'];
const bySlot = computed(() => {
  const m = new Map();
  for (const e of props.entries) {
    if (e.kind === 'runeword' || !e.slot) continue;
    const s = m.get(e.slot) ?? { slot: e.slot, found: 0, total: 0 };
    s.total++; if (e.record) s.found++;
    m.set(e.slot, s);
  }
  return [...m.values()].map((s) => ({ ...s, pct: (s.found / s.total) * 100 })).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
});

// ---- spares: more than one copy in the files ----
const spares = computed(() => {
  let items = 0; let copies = 0;
  for (const e of props.entries) { const n = props.owned[props.keyOf(e)] ?? 0; if (n > 1) { items++; copies += n - 1; } }
  return { items, copies };
});
const kindClass = (e) => (e.kind === 'runeword' ? 'runeword' : e.kind);
</script>

<template>
  <div class="overview">
    <div class="row g-3">
      <!-- the ring -->
      <div class="col-md-4 col-xl-3">
        <div class="card card-enhanced h-100">
          <div class="card-body p-3 d-flex flex-column align-items-center text-center">
            <svg class="ring" viewBox="0 0 120 120" role="img" :aria-label="$t('{p} percent of the Grail found', { p: Math.round(pct) })">
              <circle cx="60" cy="60" :r="R" class="ring-track" />
              <circle cx="60" cy="60" :r="R" class="ring-fill" :stroke-dasharray="dash" transform="rotate(-90 60 60)" />
              <text x="60" y="56" class="ring-pct">{{ pct < 10 ? pct.toFixed(1) : Math.round(pct) }}<tspan class="ring-unit">%</tspan></text>
              <text x="60" y="76" class="ring-sub">{{ found.length }} / {{ total }}</text>
            </svg>
            <div class="small mt-2">
              <div><strong>{{ milestone.toGo }}</strong> {{ $t('to go until') }} <strong>{{ milestone.next }}</strong></div>
              <div v-if="milestone.closest" class="text-muted">
                {{ milestone.closest.need === 1 ? $t('{cat} hits {p} % in 1 item', { cat: $t(milestone.closest.label), p: milestone.closest.nextPct }) : $t('{cat} hits {p} % in {n} items', { cat: $t(milestone.closest.label), p: milestone.closest.nextPct, n: milestone.closest.need }) }}
              </div>
            </div>
            <div v-if="spares.items" class="small text-muted mt-2">
              <a href="#" @click.prevent="emit('pick-show', 'spares')">{{ spares.copies === 1 ? $t('1 spare copy') : $t('{n} spare copies', { n: spares.copies }) }}</a> {{ spares.items === 1 ? $t('of 1 item in your files') : $t('of {n} items in your files', { n: spares.items }) }}
            </div>
          </div>
        </div>
      </div>

      <!-- per category, split by tier -->
      <div class="col-md-8 col-xl-4">
        <div class="card card-enhanced h-100">
          <div class="card-header card-header-primary py-2"><span class="h6 m-0">{{ $t('By category') }}</span></div>
          <div class="card-body p-3">
            <div v-for="t in perTab" :key="t.id" class="cat-row" role="button" @click="emit('pick-tab', t.id)">
              <div class="d-flex justify-content-between align-items-baseline">
                <span class="fw-semibold">{{ $t(t.label) }}</span>
                <span class="small text-muted">{{ t.found }} / {{ t.total }} <span class="cat-pct">{{ Math.round(t.pct) }} %</span></span>
              </div>
              <div class="stack">
                <template v-for="tier in t.tiers" :key="tier.tier">
                  <div class="seg" :class="`tier-${tier.tier}`" :style="{ flex: tier.total }" :title="$t('{tier}: {n} of {total}', { tier: $t(tier.label), n: tier.found, total: tier.total })">
                    <div class="seg-fill" :style="{ width: `${(tier.found / tier.total) * 100}%` }"></div>
                  </div>
                </template>
                <div v-if="!t.tiers.length" class="seg" :style="{ flex: 1 }"><div class="seg-fill" :style="{ width: `${t.pct}%` }"></div></div>
              </div>
            </div>
            <div class="legend small text-muted mt-2">
              <span><i class="sw tier-0"></i>{{ $t('Normal') }}</span><span><i class="sw tier-1"></i>{{ $t('Exceptional') }}</span><span><i class="sw tier-2"></i>{{ $t('Elite') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- activity -->
      <div class="col-xl-5">
        <div class="card card-enhanced h-100">
          <div class="card-header card-header-primary py-2 d-flex justify-content-between align-items-baseline">
            <span class="h6 m-0">{{ $t('Activity') }}</span>
            <span class="small text-muted">{{ $t('{n} dated by the Chronicle', { n: dated.length }) }}</span>
          </div>
          <div class="card-body p-3">
            <template v-if="dated.length">
              <div class="heat-wrap">
                <div class="heat-months">
                  <span v-for="m in heatmap.months" :key="m.col" :style="{ gridColumnStart: m.col + 1 }">{{ m.label }}</span>
                </div>
                <div class="heat">
                  <div v-for="c in heatmap.cells" :key="c.key" class="cell" :class="[`l${c.level}`, { future: c.future, pick: c.n > 0 }]" :title="c.title" @click="c.n > 0 && emit('pick-day', c.key)"></div>
                </div>
              </div>
              <div class="row g-2 mt-1 small stats">
                <div class="col-4"><div class="num">{{ dayStats.last7 }}</div><div class="text-muted">{{ $t('last 7 days') }}</div></div>
                <div class="col-4"><div class="num">{{ dayStats.last30 }}</div><div class="text-muted">{{ $t('last 30 days') }}</div></div>
                <div class="col-4"><div class="num">{{ dayStats.perActiveDay.toFixed(1) }}</div><div class="text-muted">{{ $t('per active day') }}</div></div>
                <div class="col-4"><div class="num">{{ dayStats.activeDays }}</div><div class="text-muted">{{ $t('days with a find') }}</div></div>
                <div class="col-4" v-if="dayStats.best"><div class="num">{{ dayStats.best.n }}</div><div class="text-muted" :title="fmtDay(dayStats.best.day)">{{ $t('best day') }} · {{ fmtDay(dayStats.best.day).replace(/ \d{4}$/, '') }}</div></div>
                <div class="col-4" v-if="dayStats.first"><div class="num">{{ dayStats.span }}</div><div class="text-muted">{{ $t('days since the first') }} · {{ fmtDate(dayStats.first) }}</div></div>
              </div>
            </template>
            <div v-else class="small text-muted">{{ $t('No dates yet - the Chronicle in the shared stash carries the minute of every first find. Import the stash to see when things happened.') }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mt-0">
      <!-- who dropped it -->
      <div class="col-md-6 col-xl-4">
        <div class="card card-enhanced h-100">
          <div class="card-header card-header-primary py-2 d-flex justify-content-between align-items-baseline">
            <span class="h6 m-0">{{ $t('Who dropped it') }}</span>
            <span v-if="droppers.known" class="small text-muted">{{ $t('{n} sources', { n: droppers.distinct }) }}</span>
          </div>
          <div class="card-body p-3">
            <template v-if="droppers.top.length">
              <div v-for="d in droppers.top" :key="d.id" class="bar-row">
                <div class="d-flex justify-content-between small"><span>{{ d.name }}</span><span class="text-muted">{{ d.n }} · {{ Math.round(d.share) }} %</span></div>
                <div class="bar"><div class="bar-fill" :style="{ width: `${d.w}%` }"></div></div>
              </div>
            </template>
            <div v-else class="small text-muted">{{ $t('The Chronicle names the monster or chest behind each first find - none imported yet.') }}</div>
          </div>
        </div>
      </div>

      <!-- recent finds -->
      <div class="col-md-6 col-xl-4">
        <div class="card card-enhanced h-100">
          <div class="card-header card-header-primary py-2"><span class="h6 m-0">{{ $t('Latest finds') }}</span></div>
          <div class="card-body p-0">
            <ul v-if="recent.length" class="list-unstyled m-0 recent">
              <li v-for="e in recent" :key="e.kind + e.id" class="d-flex justify-content-between gap-2">
                <span class="text-truncate"><span class="name" :class="kindClass(e)">{{ e.name }}</span><span v-if="e.record.by && sources[e.record.by]" class="text-muted small"> · {{ sources[e.record.by] }}</span></span>
                <span class="small text-muted text-nowrap">{{ fmtDate(e.at).replace(/ \d{4}$/, '') }}</span>
              </li>
            </ul>
            <div v-else class="p-3 small text-muted">{{ $t('Nothing dated yet.') }}</div>
          </div>
        </div>
      </div>

      <!-- by slot -->
      <div class="col-xl-4">
        <div class="card card-enhanced h-100">
          <div class="card-header card-header-primary py-2"><span class="h6 m-0">{{ $t('By slot') }}</span></div>
          <div class="card-body p-3">
            <div v-for="s in bySlot" :key="s.slot" class="bar-row" role="button" :title="$t('Show {slot} in the checklist', { slot: s.slot })" @click="emit('pick-slot', s.slot)">
              <div class="d-flex justify-content-between small"><span>{{ s.slot }}</span><span class="text-muted">{{ s.found }} / {{ s.total }}</span></div>
              <div class="bar"><div class="bar-fill" :style="{ width: `${s.pct}%` }"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ring { width: 150px; height: 150px; }
.ring-track { fill: none; stroke: rgba(255, 255, 255, 0.08); stroke-width: 9; }
.ring-fill { fill: none; stroke: var(--d2r-gold); stroke-width: 9; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; filter: drop-shadow(0 0 6px rgba(201, 163, 106, 0.4)); }
.ring-pct { font-family: var(--font-display); font-size: 26px; fill: var(--d2r-gold-bright); text-anchor: middle; font-weight: 600; }
.ring-unit { font-size: 14px; }
.ring-sub { font-size: 11px; fill: var(--d2r-muted); text-anchor: middle; }

.cat-row { padding: 0.3rem 0; cursor: pointer; }
.cat-row:hover .fw-semibold { color: var(--d2r-gold-bright); }
.cat-pct { display: inline-block; min-width: 3.2rem; text-align: right; color: var(--d2r-gold-bright); font-family: var(--font-display); font-size: 0.8rem; }
.stack { display: flex; gap: 2px; height: 8px; margin-top: 0.25rem; }
.seg { background: rgba(255, 255, 255, 0.06); border-radius: 2px; overflow: hidden; min-width: 3px; }
.seg-fill { height: 100%; background: rgba(201, 163, 106, 0.85); }
.seg.tier-0 .seg-fill { background: #8fb36a; }
.seg.tier-1 .seg-fill { background: #7f9ad8; }
.seg.tier-2 .seg-fill { background: #d9b45a; }
.legend { display: flex; gap: 1rem; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 0.3rem; vertical-align: -1px; }
.sw.tier-0 { background: #8fb36a; } .sw.tier-1 { background: #7f9ad8; } .sw.tier-2 { background: #d9b45a; }

.heat-wrap { overflow-x: auto; }
.heat-months { display: grid; grid-template-columns: repeat(26, 1fr); font-size: 0.7rem; color: var(--d2r-muted); margin-bottom: 2px; min-width: 20rem; }
.heat-months span { white-space: nowrap; }
.heat { display: grid; grid-template-rows: repeat(7, 1fr); grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; min-width: 20rem; }
.cell { aspect-ratio: 1; border-radius: 2px; background: rgba(255, 255, 255, 0.06); }
.cell.future { background: transparent; }
.cell.pick { cursor: pointer; }
.cell.pick:hover { outline: 1px solid var(--d2r-gold-bright); }
.cell.l1 { background: rgba(201, 163, 106, 0.3); }
.cell.l2 { background: rgba(201, 163, 106, 0.5); }
.cell.l3 { background: rgba(212, 175, 55, 0.75); }
.cell.l4 { background: var(--d2r-gold-bright); box-shadow: 0 0 4px rgba(228, 198, 138, 0.6); }
.stats .num { font-family: var(--font-display); font-size: 1.15rem; color: var(--d2r-gold-bright); line-height: 1.2; }

.bar-row { padding: 0.2rem 0; }
.bar-row[role="button"] { cursor: pointer; }
.bar-row[role="button"]:hover span:first-child { color: var(--d2r-gold-bright); }
.bar { height: 6px; background: rgba(255, 255, 255, 0.07); border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--d2r-gold), var(--d2r-gold-bright)); }

.recent li { padding: 0.35rem 0.75rem; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.recent li:first-child { border-top: 0; }
.name.unique { color: #c7b377; } .name.set { color: #7fdc7f; } .name.runeword { color: #ffb84d; }
</style>
