<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import dropData from '@/assets/dropcalc.json';
import tz from '@/assets/terror_zones.json';
import { buildContext } from '@/composables/useDropSimulation.js';
import { DEFAULT_PROFILE, RUNE_FLOORS, resolveTargets, buildSpots, scoreSpot, applyPreset, applyElements, spotRun } from '@/composables/useFarmPlanner.js';
import { useFarmList } from '@/composables/useFarmList.js';
import { ELEMENTS, ELEMENT_SHORT, elementClass, farmableElements } from '@/composables/useImmunities.js';
import { downloadIcs } from '@/composables/useCalendar.js';

/**
 * Tonight: a window of time instead of "now". The terror zone schedule says
 * which zone is up in each half hour of the window; Where to Farm's scoring
 * says what every spot is worth, terrorized or not. Slot by slot the plan
 * picks the terrorized spot when it beats the best ordinary spot, and the
 * ordinary spot otherwise. Monsters the character's element cannot kill are
 * met but yield nothing, so a spot full of immunes sinks by itself.
 */
const farmList = useFarmList();
const targets = computed(() => resolveTargets(dropData, farmList.tokens.value));

// ---------- clock and schedule ----------
const SLOT_MS = tz.config.slotMinutes * 60 * 1000;
const FIRST = Date.parse(tz.schedule.firstSlotUtc);
const INDEX = tz.schedule.zoneIndex;
const COUNT = INDEX.length;
const slotIndexAt = (ms) => Math.floor((ms - FIRST) / SLOT_MS);
const zoneOfArea = new Map();
tz.zones.forEach((z, zi) => z.areas.forEach((a) => zoneOfArea.set(a, zi)));
const now = ref(Date.now());
let ticker = null;
onMounted(() => { ticker = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { if (ticker) clearInterval(ticker); });

// ---------- settings ----------
const SETTINGS_KEY = 'evening_settings';
const DEFAULTS = { hours: 3, elements: [], difficulty: 2, charLevel: 99, heraldTier: 1, players: 1, party: 1, mf: 0, runeFloor: 25, weightItems: 50, killOnly: true };
const settings = ref({ ...DEFAULTS });
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
  if (saved && typeof saved === 'object') settings.value = { ...DEFAULTS, ...saved };
} catch { /* defaults */ }
watch(settings, (s) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* fine */ } }, { deep: true });
watch(() => settings.value.players, (n) => { if (settings.value.party > n) settings.value.party = n; });
const toggleElement = (e) => {
  const list = settings.value.elements;
  settings.value.elements = list.includes(e) ? list.filter((x) => x !== e) : [...list, e];
};
const runeFloorName = computed(() => RUNE_FLOORS.find((f) => f.number === settings.value.runeFloor)?.name ?? 'Pul');

// the window: a start (defaults to now) and a length
const toLocalInput = (ms) => {
  const d = new Date(ms); d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const startInput = ref(toLocalInput(Date.now()));
const startIsNow = ref(true);
const setNow = () => { startInput.value = toLocalInput(Date.now()); startIsNow.value = true; };
watch(startInput, () => { startIsNow.value = false; });
const HOURS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const windowStart = computed(() => (startIsNow.value ? now.value : (Date.parse(startInput.value) || now.value)));
const windowEnd = computed(() => windowStart.value + settings.value.hours * 3600000);
const coverage = computed(() => {
  const end = FIRST + COUNT * SLOT_MS;
  if (windowEnd.value <= FIRST || windowStart.value >= end) return 'none';
  if (windowEnd.value > end) return 'partial';
  return 'ok';
});

// the half hours in the window, clipped to it
const slots = computed(() => {
  const out = [];
  const k0 = Math.max(0, slotIndexAt(windowStart.value));
  const k1 = Math.min(COUNT - 1, slotIndexAt(windowEnd.value - 1));
  for (let k = k0; k <= k1; k++) {
    const start = FIRST + k * SLOT_MS; const end = start + SLOT_MS;
    const from = Math.max(start, windowStart.value); const to = Math.min(end, windowEnd.value);
    if (to - from < 60000) continue; // a sliver at the window's edge is not a half hour
    out.push({ index: k, start, end, from, to, hours: (to - from) / 3600000, zoneIndex: INDEX[k], zone: tz.zones[INDEX[k]] });
  }
  return out;
});

// ---------- the run profile, shared with Where to Farm ----------
const profile = ref({ ...DEFAULT_PROFILE });
const overrides = ref({});
const loadShared = () => {
  try { const p = JSON.parse(localStorage.getItem('farm_profile') ?? 'null'); if (p && typeof p === 'object') profile.value = { ...DEFAULT_PROFILE, ...p }; } catch { /* defaults */ }
  try { const o = JSON.parse(localStorage.getItem('farm_overrides') ?? 'null'); if (o && typeof o === 'object') overrides.value = o; } catch { /* none */ }
};
loadShared();

// ---------- scoring every spot, terrorized and not ----------
const makeCtx = (terror) => buildContext(dropData, {
  dataMode: 'mod', players: settings.value.players, partyNearby: settings.value.party, mf: settings.value.mf,
  terror: { enabled: terror, charLevel: settings.value.charLevel },
  exalted: { enabled: true, percent: 5 }, mythic: { enabled: true, percent: 5 }, heraldTier: settings.value.heraldTier,
});
const rows = computed(() => {
  const diff = settings.value.difficulty;
  const spots = buildSpots(dropData, diff);
  const plain = makeCtx(false);
  const terror = makeCtx(true);
  const opts = { highRune: settings.value.runeFloor };
  const out = [];
  for (const spot of spots) {
    const zoneIndex = zoneOfArea.get(spot.areaId);
    const { profile: p, preset } = spotRun(spot.areaId, profile.value, overrides.value, tz);
    const run = applyElements(dropData, applyPreset(dropData, spot, preset), diff, settings.value.killOnly ? settings.value.elements : []);
    const a = scoreSpot(plain, run, targets.value, p, diff, opts);
    const b = zoneIndex != null ? scoreSpot(terror, run, targets.value, p, diff, opts) : null;
    const useful = (s) => s && (s.perRun > 0 || s.runes.highExpected > 0);
    if (!useful(a) && !useful(b)) continue;
    out.push({
      spot, zoneIndex, zone: zoneIndex != null ? tz.zones[zoneIndex] : null, preset,
      minutes: Math.max(0.5, Number(p.minutes) || DEFAULT_PROFILE.minutes),
      plain: a, tz: b,
      immune: run.immune,
    });
  }
  return out;
});
const rate = (row, score) => ({ items: score.perRun * 60 / row.minutes, runes: score.runes.highExpected * 60 / row.minutes });
const maxes = computed(() => {
  let items = 0; let runes = 0;
  for (const r of rows.value) {
    for (const s of [r.plain, r.tz]) {
      if (!s) continue;
      const x = rate(r, s); items = Math.max(items, x.items); runes = Math.max(runes, x.runes);
    }
  }
  return { items, runes };
});
// without a list there is nothing but runes to weigh
const weight = computed(() => (targets.value.length ? settings.value.weightItems / 100 : 0));
const worth = (row, score) => {
  const x = rate(row, score);
  const i = maxes.value.items > 0 ? x.items / maxes.value.items : 0;
  const r = maxes.value.runes > 0 ? x.runes / maxes.value.runes : 0;
  return weight.value * i + (1 - weight.value) * r;
};
// the spot to stand in when no terror zone is worth it
const plainRanking = computed(() => rows.value.map((row) => ({ row, w: worth(row, row.plain) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w));
const baseline = computed(() => plainRanking.value[0] ?? null);

// ---------- the plan, slot by slot ----------
const plan = computed(() => {
  const base = baseline.value;
  return slots.value.map((slot) => {
    const inZone = rows.value.filter((r) => r.zoneIndex === slot.zoneIndex && r.tz);
    const options = inZone.map((row) => ({ row, w: worth(row, row.tz) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
    const bestTz = options[0] ?? null;
    const zoneBlocked = inZone.length > 0 && inZone.every((r) => r.immune?.all);
    const takeTz = bestTz && (!base || bestTz.w > base.w);
    const pick = takeTz ? { row: bestTz.row, score: bestTz.row.tz, terror: true, w: bestTz.w } : base ? { row: base.row, score: base.row.plain, terror: false, w: base.w } : null;
    const x = pick ? rate(pick.row, pick.score) : { items: 0, runes: 0 };
    let why = null;
    if (!takeTz) {
      if (zoneBlocked) why = 'everything there is immune to your element';
      else if (!bestTz) why = 'nothing there for this list';
      else if (base) why = `${Math.round((bestTz.w / base.w) * 100)} % of ${base.row.spot.name}`;
    }
    return { slot, bestTz, pick, expected: { items: x.items * slot.hours, runes: x.runes * slot.hours }, zoneBlocked, why, gain: takeTz && base ? bestTz.w / base.w : null };
  });
});
// consecutive slots with the same pick, for the calendar and the copy
const blocks = computed(() => {
  const out = [];
  for (const p of plan.value) {
    const last = out.at(-1);
    if (last && p.pick && last.pick && last.pick.row === p.pick.row && last.pick.terror === p.pick.terror && last.to === p.slot.from) {
      last.to = p.slot.to; last.expected.items += p.expected.items; last.expected.runes += p.expected.runes; last.slots.push(p);
    } else out.push({ from: p.slot.from, to: p.slot.to, pick: p.pick, expected: { ...p.expected }, slots: [p] });
  }
  return out;
});
const totals = computed(() => {
  const t = plan.value.reduce((s, p) => ({ items: s.items + p.expected.items, runes: s.runes + p.expected.runes, hours: s.hours + p.slot.hours }), { items: 0, runes: 0, hours: 0 });
  const b = baseline.value ? rate(baseline.value.row, baseline.value.row.plain) : { items: 0, runes: 0 };
  return { ...t, base: { items: b.items * t.hours, runes: b.runes * t.hours }, tzSlots: plan.value.filter((p) => p.pick?.terror).length };
});
// expected counts are small; the chance of at least one is the honest number
const chance = (expected) => 1 - Math.exp(-expected);
const pct = (p) => (p >= 0.995 ? '> 99 %' : p >= 0.1 ? `${Math.round(p * 100)} %` : p >= 0.01 ? `${(p * 100).toFixed(1)} %` : p > 0 ? `${(p * 100).toFixed(2)} %` : '—');
const immuneNote = (row) => (row.immune && row.immune.gone ? `${row.immune.gone} of ${row.immune.total} monster types immune` : '');

// ---------- formatting ----------
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (ms) => timeFmt.format(new Date(ms));
const fmtRange = (a, b) => `${fmtTime(a)}–${fmtTime(b)}`;
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const windowLabel = computed(() => {
  const s = windowStart.value; const e = windowEnd.value;
  const day = sameDay(s, now.value) ? 'Today' : dayFmt.format(new Date(s));
  return `${day} ${fmtRange(s, e)}${sameDay(s, e) ? '' : ` (${dayFmt.format(new Date(e))})`}`;
});
const num = (x) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));
const pctGain = (a, b) => (b > 0 ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)} %` : a > 0 ? 'new' : '—');
const pickLabel = (pick) => (pick ? `${pick.row.spot.name}${pick.row.preset ? ` · ${pick.row.preset.label}` : ''}` : '—');
const dropCalcLink = (row, terror) => ({ path: '/drop-calc', query: { area: String(row.spot.areaId), diff: String(settings.value.difficulty), ...(terror ? { tz: '1' } : {}) } });
const tzLink = (zone) => ({ path: '/terror-zones', query: { zone: zone.key, diff: String(settings.value.difficulty) } });
const diffName = ['Normal', 'Nightmare', 'Hell'][settings.value.difficulty];

// ---------- take it with you ----------
const copied = ref(false);
const planText = () => {
  const lines = [`Relics of Sanctuary · ${windowLabel.value} · ${['Normal', 'Nightmare', 'Hell'][settings.value.difficulty]}, P${settings.value.players}`];
  for (const b of blocks.value) {
    const tzNote = b.pick?.terror ? ' (TZ)' : '';
    const skipped = b.slots.filter((p) => !p.pick?.terror && p.slot.zone).map((p) => `${p.slot.zone.short}${p.why ? `: ${p.why}` : ''}`);
    lines.push(`${fmtRange(b.from, b.to)}  ${pickLabel(b.pick)}${tzNote}${skipped.length && !b.pick?.terror ? `  – TZ skipped: ${[...new Set(skipped)].join('; ')}` : ''}`);
  }
  lines.push(`Chance tonight: ${targets.value.length ? `${pct(chance(totals.value.items))} for a hit on the list, ` : ''}${pct(chance(totals.value.runes))} for a ${runeFloorName.value}+`);
  lines.push('https://relicsofsanctuary.com/#/tonight');
  return lines.join('\n');
};
const copyPlan = async () => {
  try { await navigator.clipboard.writeText(planText()); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* blocked */ }
};
const exportCalendar = () => {
  const events = blocks.value.filter((b) => b.pick).map((b) => ({
    uid: `plan-${b.from}-${b.pick.row.spot.areaId}@relicsofsanctuary.com`,
    start: b.from, end: b.to,
    summary: `${b.pick.terror ? 'TZ ' : ''}${pickLabel(b.pick)}`,
    description: `Expected: ${num(b.expected.items)} hits on the list, ${num(b.expected.runes)} ${runeFloorName.value}+ runes.${b.pick.terror ? ` Terror zone: ${b.pick.row.zone.name}.` : ''}`,
    url: 'https://relicsofsanctuary.com/#/tonight',
  }));
  downloadIcs(`relics-tonight-${new Date(windowStart.value).toISOString().slice(0, 10)}.ics`, events, { name: 'Relics of Sanctuary · Tonight' });
};
</script>

<template>
  <div class="container py-4 page-content tonight">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h2 mb-1">Tonight</h1>
        <p class="text-muted mb-0">Pick a window and your element - the plan says which terror zones are worth switching for and where to stand in between.</p>
      </div>
      <div class="d-flex gap-2 align-items-center small">
        <button class="btn btn-sm btn-outline-secondary" :disabled="!plan.length" @click="copyPlan">{{ copied ? 'Copied' : 'Copy plan' }}</button>
        <button class="btn btn-sm btn-outline-secondary" :disabled="!blocks.length" title="An .ics file with one event per stretch of the plan" @click="exportCalendar">Add to calendar</button>
      </div>
    </div>

    <!-- settings -->
    <div class="card card-enhanced mb-4 settings-card">
      <div class="card-body p-3">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="section-header mb-1">When</div>
            <div class="d-flex flex-wrap gap-2 align-items-center">
              <input v-model="startInput" type="datetime-local" class="form-control form-control-sm w-auto" />
              <button class="btn btn-sm" :class="startIsNow ? 'btn-primary' : 'btn-outline-secondary'" @click="setNow">Now</button>
              <span class="small text-muted">for</span>
              <select v-model.number="settings.hours" class="form-select form-select-sm w-auto">
                <option v-for="h in HOURS" :key="h" :value="h">{{ h }} h</option>
              </select>
            </div>
            <div class="small text-muted mt-1">{{ windowLabel }} · {{ slots.length }} half hours</div>
          </div>
          <div class="col-md-4">
            <div class="section-header mb-1">Your character kills with</div>
            <div class="d-flex flex-wrap gap-1">
              <button v-for="e in ELEMENTS" :key="e" class="btn btn-sm el-toggle" :class="[elementClass(e), { on: settings.elements.includes(e) }]" @click="toggleElement(e)">{{ ELEMENT_SHORT[e] }}</button>
            </div>
            <div class="form-check form-switch small mt-1 mb-0">
              <input id="kill-only" v-model="settings.killOnly" class="form-check-input" type="checkbox" :disabled="!settings.elements.length" />
              <label class="form-check-label" for="kill-only" title="Monsters immune to every chosen element are met but left standing - they drop nothing, the rest of the spot still counts">Count only what these can kill</label>
            </div>
          </div>
          <div class="col-md-4">
            <div class="section-header mb-1">Game</div>
            <div class="d-flex flex-wrap gap-2 align-items-center small">
              <select v-model.number="settings.difficulty" class="form-select form-select-sm w-auto"><option :value="0">Normal</option><option :value="1">Nightmare</option><option :value="2">Hell</option></select>
              <label class="text-muted">Players <select v-model.number="settings.players" class="form-select form-select-sm w-auto d-inline-block"><option v-for="n in 8" :key="n" :value="n">{{ n }}</option></select></label>
              <label class="text-muted">Party <select v-model.number="settings.party" class="form-select form-select-sm w-auto d-inline-block"><option v-for="n in settings.players" :key="n" :value="n">{{ n }}</option></select></label>
              <label class="text-muted">MF <input v-model.number="settings.mf" type="number" min="0" max="9999" class="form-control form-control-sm d-inline-block mf" /></label>
              <label class="text-muted" title="Terrorized monsters follow the character level">Clvl <input v-model.number="settings.charLevel" type="number" min="1" max="99" class="form-control form-control-sm d-inline-block clvl" /></label>
              <label class="text-muted" title="Herald tier in terror zones">Herald <select v-model.number="settings.heraldTier" class="form-select form-select-sm w-auto d-inline-block"><option v-for="t in 5" :key="t" :value="t">{{ t }}</option></select></label>
              <label class="text-muted" title="What counts as a high rune">Rune <select v-model.number="settings.runeFloor" class="form-select form-select-sm w-auto d-inline-block"><option v-for="f in RUNE_FLOORS" :key="f.number" :value="f.number">{{ f.name }}+</option></select></label>
            </div>
          </div>
        </div>
        <div class="d-flex flex-wrap gap-3 align-items-center mt-3 small">
          <div>
            <span class="text-muted">Your list:</span>
            <template v-if="targets.length">
              <span v-for="t in targets" :key="t.key" class="target-chip ms-1" :class="t.kind">{{ t.name }}</span>
              <router-link to="/where-to-farm" class="ms-2">edit</router-link>
            </template>
            <template v-else><span class="text-warning ms-1">empty</span> <span class="text-muted">- planning for {{ runeFloorName }}+ runes only.</span> <router-link to="/where-to-farm">Add items</router-link></template>
          </div>
          <div v-if="targets.length" class="d-flex align-items-center gap-2 text-muted ms-auto">
            <span>runes</span>
            <input v-model.number="settings.weightItems" type="range" min="0" max="100" step="5" class="form-range weight" title="What the evening is for: only runes on the left, only the list on the right" />
            <span>items</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="coverage === 'none'" class="alert alert-warning small">The schedule on this site does not cover that window. It runs from the import date for a few months - pick a time inside it.</div>
    <div v-else-if="coverage === 'partial'" class="alert alert-warning small py-2">The schedule ends inside this window; the last half hours are missing.</div>

    <!-- verdict -->
    <div v-if="plan.length && (baseline || totals.tzSlots)" class="card card-enhanced verdict mb-4">
      <div class="card-body p-3 d-flex flex-wrap gap-4">
        <div>
          <div class="section-header mb-1">Following the plan</div>
          <div class="big"><span v-if="targets.length">{{ pct(chance(totals.items)) }} <span class="small text-muted">for a hit on the list</span> · </span>{{ pct(chance(totals.runes)) }} <span class="small text-muted">for a {{ runeFloorName }}+</span></div>
          <div class="small text-muted">expected <span v-if="targets.length">{{ num(totals.items) }} hits, </span>{{ num(totals.runes) }} runes over {{ num(totals.hours) }} h · {{ totals.tzSlots }} of {{ plan.length }} half hours in a terror zone</div>
        </div>
        <div v-if="baseline">
          <div class="section-header mb-1">Camping {{ baseline.row.spot.name }}<span v-if="baseline.row.preset" class="text-muted fw-normal"> · {{ baseline.row.preset.label }}</span></div>
          <div class="big"><span v-if="targets.length">{{ pct(chance(totals.base.items)) }} <span class="small text-muted">hit</span> · </span>{{ pct(chance(totals.base.runes)) }} <span class="small text-muted">{{ runeFloorName }}+</span></div>
          <div class="small text-muted">expected <span v-if="targets.length">{{ num(totals.base.items) }} hits, </span>{{ num(totals.base.runes) }} runes · the best spot without terror, all evening</div>
        </div>
        <div v-if="baseline && totals.tzSlots">
          <div class="section-header mb-1">Terror zones add</div>
          <div class="big"><span v-if="targets.length">{{ pctGain(totals.items, totals.base.items) }} <span class="small text-muted">items</span> · </span>{{ pctGain(totals.runes, totals.base.runes) }} <span class="small text-muted">runes</span></div>
          <div class="small text-muted">in expected finds, against camping</div>
        </div>
        <div v-else-if="baseline" class="align-self-center small text-muted">No terror zone in this window beats {{ baseline.row.spot.name }} - stay put.</div>
      </div>
    </div>

    <!-- the plan -->
    <div v-if="plan.length" class="card card-enhanced mb-4">
      <div class="card-header card-header-primary d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h2 class="h5 card-title m-0">The plan<span class="text-muted fw-normal small"> · {{ windowLabel }}</span></h2>
        <span class="small text-muted">Half hour by half hour; a terror zone is taken when it beats the best ordinary spot for what the evening is for.</span>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-dark table-sm table-hover mb-0 align-middle plan-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Terror zone</th>
                <th>Do</th>
                <th class="text-end" :title="`Chance of at least one in this half hour: a hit on the list, a ${runeFloorName}+ rune`">Chance</th>
                <th>The terror zone</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in plan" :key="p.slot.index" :class="{ 'tz-row': p.pick?.terror }">
                <td class="text-nowrap">
                  {{ fmtRange(p.slot.from, p.slot.to) }}
                  <span v-if="p.slot.from <= now && now < p.slot.to" class="badge now-badge ms-1">now</span>
                </td>
                <td>
                  <router-link :to="tzLink(p.slot.zone)" class="zone-link" :class="{ dim: p.zoneBlocked }">{{ p.slot.zone.name }}</router-link>
                  <span v-if="p.slot.zone.boss" class="badge boss-badge ms-1">{{ p.slot.zone.boss }}</span>
                  <span class="el-row ms-1"><span v-for="e in farmableElements(dropData, p.slot.zone, settings.difficulty)" :key="e" class="el-dot" :class="[elementClass(e), { mine: settings.elements.includes(e) }]" :title="`${e}: farmable`">{{ ELEMENT_SHORT[e] }}</span></span>
                </td>
                <td>
                  <template v-if="p.pick">
                    <router-link :to="dropCalcLink(p.pick.row, p.pick.terror)" class="spot-link">{{ p.pick.row.spot.name }}</router-link>
                    <span v-if="p.pick.row.preset" class="text-muted small"> · {{ p.pick.row.preset.label }}</span>
                    <span v-if="p.pick.terror" class="badge tz-badge ms-1" :title="p.gain ? `${Math.round(p.gain * 100)} % of the best ordinary spot` : ''">TZ<template v-if="p.gain && p.gain < 9.99"> ×{{ p.gain.toFixed(1) }}</template></span>
                    <span v-else class="text-muted small"> · not terrorized</span>
                    <div v-if="immuneNote(p.pick.row)" class="small text-muted">{{ immuneNote(p.pick.row) }}</div>
                  </template>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="text-end text-nowrap small">
                  <span v-if="targets.length">{{ pct(chance(p.expected.items)) }} <span class="text-muted">hit</span> · </span>{{ pct(chance(p.expected.runes)) }} <span class="text-muted rune-high">{{ runeFloorName }}+</span>
                </td>
                <td class="small text-muted">
                  <template v-if="p.pick?.terror">taken</template>
                  <template v-else-if="p.zoneBlocked"><span class="text-warning">everything there is immune to your element</span></template>
                  <template v-else-if="p.bestTz">skipped · {{ p.bestTz.row.spot.name }}<span v-if="p.bestTz.row.preset"> ({{ p.bestTz.row.preset.label }})</span> would be {{ p.why }}</template>
                  <template v-else>nothing there for this list</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- fallbacks -->
    <div v-if="plainRanking.length" class="card card-enhanced">
      <div class="card-header card-header-primary"><h2 class="h5 card-title m-0">Between terror zones<span class="text-muted fw-normal small"> · the best ordinary spots for this evening</span></h2></div>
      <div class="card-body p-0">
        <table class="table table-dark table-sm mb-0 align-middle">
          <tbody>
            <tr v-for="(x, i) in plainRanking.slice(0, 5)" :key="x.row.spot.areaId">
              <td class="text-muted text-end rank-col">{{ i + 1 }}</td>
              <td><router-link :to="dropCalcLink(x.row, false)" class="spot-link">{{ x.row.spot.name }}</router-link><span v-if="x.row.preset" class="text-muted small"> · {{ x.row.preset.label }}</span><span v-if="immuneNote(x.row)" class="text-muted small"> · {{ immuneNote(x.row) }}</span></td>
              <td class="small text-muted text-end text-nowrap"><span v-if="targets.length">{{ num(rate(x.row, x.row.plain).items) }} hits/h · </span>{{ num(rate(x.row, x.row.plain).runes) }} {{ runeFloorName }}+/h · {{ x.row.minutes }} min runs</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="small text-muted mt-4 mb-0">
      Spots are scored the way <router-link to="/where-to-farm">Where to Farm</router-link> scores them, with its run profile and per-spot numbers; the half hours come from the
      <router-link to="/terror-zones">Terror Zones</router-link> schedule. Monsters immune to every element you chose are met but left standing - they drop nothing, the rest of the spot still counts. Chances are for at
      least one find in the time given; the expected numbers behind them are averages over many evenings like this one.
    </p>
  </div>
</template>

<style scoped>
.settings-card { overflow: visible; }
.mf { width: 5rem; }
.clvl { width: 4.2rem; }
.weight { width: 9rem; }
.big { font-family: var(--font-display); font-size: 1.35rem; color: var(--d2r-gold-bright); line-height: 1.3; }
.verdict { border-color: rgba(201, 163, 106, 0.45); }
.spot-link, .zone-link { color: var(--d2r-gold-bright); text-decoration: none; }
.spot-link:hover, .zone-link:hover { text-decoration: underline; }
.zone-link.dim { color: var(--d2r-muted); }
.tz-row td { background: rgba(120, 60, 160, 0.10); }
.tz-badge { background: rgba(120, 60, 160, 0.55); color: #e6c8ff; font-size: 0.7rem; vertical-align: middle; }
.now-badge { background: rgba(212, 175, 55, 0.35); color: var(--d2r-gold-bright); font-size: 0.65rem; vertical-align: middle; }
.boss-badge { background: rgba(170, 40, 40, 0.45); color: #ffb3b3; font-weight: 600; font-size: 0.7rem; }
.rune-high { color: #ffb84d; }
.rank-col { width: 2.2rem; }
.target-chip { display: inline-block; padding: 0.05rem 0.5rem; border-radius: 999px; background: rgba(255, 255, 255, 0.06); font-size: 0.8rem; }
.target-chip.unique { color: #c7b377; }
.target-chip.set { color: #7fdc7f; }
.el-toggle { border: 1px solid rgba(255, 255, 255, 0.15); background: transparent; opacity: 0.55; font-weight: 500; }
.el-toggle.on { opacity: 1; border-color: currentColor; background: rgba(255, 255, 255, 0.06); }
.el-row { display: inline-flex; gap: 0.25rem; }
.el-dot { font-size: 0.7rem; opacity: 0.55; }
.el-dot.mine { opacity: 1; font-weight: 600; }
.el-fire { color: #ff9a5c; }
.el-cold { color: #8fd3ff; }
.el-lightning { color: #ffe97a; }
.el-poison { color: #9fe870; }
.el-magic { color: #d7a6ff; }
.el-physical { color: #e0d6c2; }
</style>
