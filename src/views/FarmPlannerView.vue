<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dropData from '@/assets/dropcalc.json';
import tz from '@/assets/terror_zones.json';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { buildContext } from '@/composables/useDropSimulation.js';
import { DEFAULT_PROFILE, RUNE_FLOORS, resolveTargets, grailTargets, targetToken, buildSpots, scoreSpot, presetsFor, applyPreset, spotRun, zonePacksFor } from '@/composables/useFarmPlanner.js';
import { useFarmList } from '@/composables/useFarmList.js';
import { useGrail } from '@/composables/useGrail.js';

/**
 * Where to farm: a list of wanted items, and every spot scored by the chance
 * that one run turns up at least one of them - with and without the zone being
 * terrorized. The run profile says what a run kills; the maths is in
 * useFarmPlanner.js.
 */
const route = useRoute();
const router = useRouter();

// ---------- the list (shared with the "+" buttons elsewhere) ----------
const farmList = useFarmList();
const tokens = farmList.tokens;
const listTargets = computed(() => resolveTargets(dropData, tokens.value));
// ...or the Grail's word: everything still missing, each row its own wish.
// The catalog that names the rows is only fetched once the switch is on.
const grail = useGrail();
const grailHas = computed(() => Object.keys(grail.found.value).length > 0);
const grailMode = ref(false);
const catalog = ref(null);
watch(grailMode, async (on) => {
  if (!on || catalog.value) return;
  const m = await import('@/assets/save_constants.json');
  catalog.value = (m.default ?? m).catalog;
}, { immediate: true });
const grailList = computed(() => (grailMode.value && catalog.value ? grailTargets(dropData, catalog.value, grail.found.value) : []));
const grailTally = computed(() => {
  const t = { uniques: 0, exalted: 0, sets: 0, mythic: 0 };
  for (const x of grailList.value) {
    if (x.kind === 'unique') { if (x.variant === 'exalted') t.exalted++; else t.uniques++; } else if (x.variant === 'mythic') t.mythic++; else t.sets++;
  }
  return t;
});
const targets = computed(() => (grailMode.value ? grailList.value : listTargets.value));
const pickKind = ref('unique');
const pickValue = ref(null);
// one option per name: the eight facets and the four attunements are one wish each
const pickOptions = computed(() => {
  const seen = new Map();
  const list = pickKind.value === 'unique' ? dropData.Uniques : dropData.Sets;
  list.forEach((e) => {
    if (e.Spawnable === false) return;
    const base = dropData.BaseItems[e.Base]?.Name ?? '';
    const hint = pickKind.value === 'unique' ? base : `${e.SetName} · ${base}`;
    const prev = seen.get(e.Name);
    if (!prev) seen.set(e.Name, { value: `${pickKind.value === 'unique' ? 'u' : 's'}:${e.Name}`, label: e.Name, hint, count: 1 });
    else { prev.count += 1; if (!prev.hint.includes(base)) prev.hint += `, ${base}`; }
  });
  return [...seen.values()].map((o) => (o.count > 1 ? { ...o, hint: `${o.hint} · ${o.count} variants` } : o));
});
watch(pickValue, (token) => {
  if (!token) return;
  farmList.add(token);
  pickValue.value = null;
});
const removeTarget = (t) => farmList.remove(targetToken(t));
const clearTargets = () => farmList.clear();

// ---------- settings ----------
const difficulty = ref(2);
const charLevel = ref(99);
const heraldTier = ref(1);
// Same knobs as the drop calculator: player count sets the no-drop odds, the
// party the share of them near you, magic find the unique and set rolls.
const players = ref(1);
const party = ref(1);
const mf = ref(0);
watch(players, (n) => { if (party.value > n) party.value = n; });
// What counts as a high rune. The Countess' own table ends at Ist, so at Vex+
// she drops out of the rune score by herself - the way to keep her from
// deciding it without pretending she drops nothing.
const runeFloor = ref(25);
const runeFloorName = computed(() => RUNE_FLOORS.find((f) => f.number === runeFloor.value)?.name ?? 'Pul');
const sortBy = ref('worth'); // worth | items | runes
// Which zones count as terrorized in the ranking: the one that is up right
// now (what to do this half hour), every zone (what a spot is worth when its
// turn comes), or none (terror left out of the picture).
const terrorMode = ref('now'); // now | all | none
const now = ref(Date.now());
let ticker = null;
onMounted(() => { ticker = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { if (ticker) clearInterval(ticker); });
// Where the hour is best spent: items and high runes per hour, each against
// the best spot, mixed by this weight. 100 = only the list counts, 0 = only runes.
const weightItems = ref(50);
const ROW_LIMIT = 40;
const showAll = ref(false);

const profile = ref({ ...DEFAULT_PROFILE });
try {
  const saved = JSON.parse(localStorage.getItem('farm_profile') ?? 'null');
  if (saved && typeof saved === 'object') profile.value = { ...DEFAULT_PROFILE, ...saved };
} catch { /* defaults */ }
watch(profile, (p) => { try { localStorage.setItem('farm_profile', JSON.stringify(p)); } catch { /* fine */ } }, { deep: true });
const resetProfile = () => { profile.value = { ...DEFAULT_PROFILE }; };
const killsPerRun = computed(() => {
  const p = profile.value;
  return (p.trash | 0) + (p.champPacks | 0) * (p.champsPerPack | 0) + (p.packs | 0) * (1 + (p.minionsPerPack | 0));
});

const makeCtx = (terror) => buildContext(dropData, {
  dataMode: 'mod', players: players.value, partyNearby: party.value, mf: mf.value,
  terror: { enabled: terror, charLevel: charLevel.value },
  exalted: { enabled: true, percent: 5 }, mythic: { enabled: true, percent: 5 }, heraldTier: heraldTier.value,
});

// ---------- per-spot exceptions ----------
// The global profile says what a run is; a spot can say otherwise - Mephisto
// is one kill, the Sewers are a clear. Stored by area id.
const overrides = ref({});
try {
  const saved = JSON.parse(localStorage.getItem('farm_overrides') ?? 'null');
  if (saved && typeof saved === 'object') overrides.value = saved;
} catch { /* none */ }
watch(overrides, (o) => { try { localStorage.setItem('farm_overrides', JSON.stringify(o)); } catch { /* fine */ } }, { deep: true });
const packsFromZone = (areaId) => zonePacksFor(tz, areaId);
// A spot's run: the global profile, the zone's pack count, then a chosen
// preset (Mephisto only, council only), then the spot's own numbers on top.
const presetOf = (areaId) => {
  const id = overrides.value[areaId]?.preset;
  return id ? presetsFor(areaId).find((p) => p.id === id) ?? null : null;
};
const setPreset = (areaId, id) => {
  const next = { ...overrides.value };
  const { preset, ...numbers } = next[areaId] ?? {};
  // switching the way a spot is run drops the numbers typed for the old way
  if (id) next[areaId] = { preset: id }; else if (Object.keys(numbers).length) next[areaId] = numbers; else delete next[areaId];
  overrides.value = next;
  if (editing.value === areaId) editing.value = null;
};
const profileFor = (areaId) => spotRun(areaId, profile.value, overrides.value, tz).profile;
const hasOverride = (areaId) => { const o = overrides.value[areaId]; return !!o && Object.keys(o).some((k) => k !== 'preset'); };
const editing = ref(null); // areaId being edited
const draft = ref(null);
const startEdit = (areaId) => { editing.value = areaId; draft.value = { ...profileFor(areaId) }; };
const saveEdit = () => {
  if (editing.value == null) return;
  const areaId = editing.value;
  const d = draft.value;
  const preset = presetOf(areaId);
  // the numbers a spot would have without its own: profile, zone packs, preset
  const base = { ...profile.value, ...(profile.value.packsFromZone && packsFromZone(areaId) != null ? { packs: packsFromZone(areaId) } : {}), ...(preset?.profile ?? {}) };
  const diff = {};
  for (const key of Object.keys(DEFAULT_PROFILE)) if (key !== 'packsFromZone' && d[key] !== base[key]) diff[key] = d[key];
  const next = { ...overrides.value };
  const entry = { ...(preset ? { preset: preset.id } : {}), ...diff };
  if (Object.keys(entry).length) next[areaId] = entry; else delete next[areaId];
  overrides.value = next;
  editing.value = null;
};
const clearEdit = () => {
  if (editing.value == null) return;
  const areaId = editing.value;
  const next = { ...overrides.value };
  const preset = next[areaId]?.preset;
  if (preset) next[areaId] = { preset }; else delete next[areaId];
  overrides.value = next;
  editing.value = null;
};
const cancelEdit = () => { editing.value = null; };
const overrideCount = computed(() => Object.keys(overrides.value).filter((k) => hasOverride(Number(k))).length);
const clearAllOverrides = () => { overrides.value = {}; editing.value = null; };

// ---------- terror zone lookup ----------
const SLOT_MS = tz.config.slotMinutes * 60 * 1000;
const FIRST = Date.parse(tz.schedule.firstSlotUtc);
const zoneOfArea = new Map();
tz.zones.forEach((z, zi) => z.areas.forEach((a) => zoneOfArea.set(a, zi)));
const nextSlotOfZone = (zoneIndex) => {
  const k0 = Math.max(0, Math.floor((now.value - FIRST) / SLOT_MS));
  for (let k = k0; k < tz.schedule.zoneIndex.length; k++) {
    if (tz.schedule.zoneIndex[k] === zoneIndex) return { start: FIRST + k * SLOT_MS, end: FIRST + (k + 1) * SLOT_MS, now: k === k0 };
  }
  return null;
};
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtWhen = (slot) => {
  if (!slot) return '—';
  if (slot.now) return `now, until ${timeFmt.format(new Date(slot.end))}`;
  const delta = slot.start - now.value;
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 24 * 60) return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
  return `${dayFmt.format(new Date(slot.start))}, ${timeFmt.format(new Date(slot.start))}`;
};

// ---------- the plan ----------
const computing = ref(false);
const ctxs = computed(() => ({ plain: makeCtx(false), terror: makeCtx(true) }));
const rows = computed(() => {
  if (targets.value.length === 0) return [];
  const diff = difficulty.value;
  const spots = buildSpots(dropData, diff);
  const { plain, terror } = ctxs.value;
  const out = [];
  for (const spot of spots) {
    const zoneIndex = zoneOfArea.get(spot.areaId);
    const p = profileFor(spot.areaId);
    const preset = presetOf(spot.areaId);
    const run = applyPreset(dropData, spot, preset);
    const opts = { highRune: runeFloor.value };
    const a = scoreSpot(plain, run, targets.value, p, diff, opts);
    const b = zoneIndex != null ? scoreSpot(terror, run, targets.value, p, diff, opts) : null;
    if (a.perRun <= 0 && (!b || b.perRun <= 0)) continue;
    out.push({
      spot,
      minutes: Math.max(0.5, Number(p.minutes) || DEFAULT_PROFILE.minutes),
      zone: zoneIndex != null ? tz.zones[zoneIndex] : null,
      next: zoneIndex != null ? nextSlotOfZone(zoneIndex) : null,
      plain: a,
      tz: b,
      best: Math.max(a.perRun, b?.perRun ?? 0),
      overridden: hasOverride(spot.areaId),
      preset,
      presets: presetsFor(spot.areaId),
    });
  }
  return out;
});
// ---------- why: the numbers behind one row ----------
const why = ref(null); // areaId
const whyDetail = computed(() => {
  const row = rows.value.find((r) => r.spot.areaId === why.value);
  if (!row) return null;
  const ctx = terrorizedInView(row) ? ctxs.value.terror : ctxs.value.plain;
  const run = applyPreset(dropData, row.spot, row.preset);
  const score = scoreSpot(ctx, run, targets.value, profileFor(row.spot.areaId), difficulty.value, { highRune: runeFloor.value, detail: true });
  return { row, score, terror: terrorizedInView(row) };
});
const toggleWhy = (areaId) => { why.value = why.value === areaId ? null : areaId; };
const sorted = computed(() => {
  const list = [...rows.value];
  if (sortBy.value === 'worth') list.sort((x, y) => worth(y) - worth(x));
  else if (sortBy.value === 'runes') list.sort((x, y) => scoreOf(y).runes.highPerRun - scoreOf(x).runes.highPerRun);
  else list.sort((x, y) => scoreOf(y).perRun - scoreOf(x).perRun);
  return list;
});
const visible = computed(() => (showAll.value ? sorted.value : sorted.value.slice(0, ROW_LIMIT)));

// ---------- items or runes: the trade-off behind the choice ----------
// A boss pays in uniques and sets and hands out few runes; a clear is the
// other way round. Both scores are put on the same scale - each relative to
// the best spot on the table - so a row shows which side of the trade it is on.
// The runes, the bars, the ranking and the verdict read the run the terror
// mode picks for a spot. In a terror zone at character level 99 every table
// reaches Zod; outside it most do not.
const terrorizedInView = (row) => {
  if (!row.tz) return false;
  if (terrorMode.value === 'all') return true;
  if (terrorMode.value === 'now') return !!row.next?.now;
  return false;
};
const scoreOf = (row) => (terrorizedInView(row) ? row.tz : row.plain);
const terrorView = computed(() => terrorMode.value !== 'none');
const terrorLabel = computed(() => ({ now: 'terror as it is now', all: 'all terrorized', none: 'not terrorized' })[terrorMode.value]);

// per hour: expected hits on the list and expected high runes, runs/h = 60/minutes
const runsPerHour = (row) => 60 / row.minutes;
const itemsPerHour = (row) => scoreOf(row).perRun * runsPerHour(row);
const runesPerHour = (row) => scoreOf(row).runes.highExpected * runsPerHour(row);
const maxItemsHour = computed(() => rows.value.reduce((m, r) => Math.max(m, itemsPerHour(r)), 0));
const maxRunesHour = computed(() => rows.value.reduce((m, r) => Math.max(m, runesPerHour(r)), 0));
const worth = (row) => {
  const w = weightItems.value / 100;
  const i = maxItemsHour.value > 0 ? itemsPerHour(row) / maxItemsHour.value : 0;
  const r = maxRunesHour.value > 0 ? runesPerHour(row) / maxRunesHour.value : 0;
  return w * i + (1 - w) * r;
};
const ranking = computed(() => [...rows.value].sort((x, y) => worth(y) - worth(x)));
const rankOf = (row) => ranking.value.indexOf(row) + 1;
/// "1 in 7 h" - hours per expected hit
const hours = (perHour) => {
  if (!(perHour > 0)) return '—';
  const h = 1 / perHour;
  if (h < 1) return `${Math.round(60 * h)} min`;
  if (h < 10) return `${h.toFixed(1)} h`;
  return `${Math.round(h).toLocaleString()} h`;
};
const maxItems = computed(() => rows.value.reduce((m, r) => Math.max(m, scoreOf(r).perRun), 0));
const maxRunes = computed(() => rows.value.reduce((m, r) => Math.max(m, scoreOf(r).runes.highPerRun), 0));
const itemShare = (row) => (maxItems.value > 0 ? scoreOf(row).perRun / maxItems.value : 0);
const runeShare = (row) => (maxRunes.value > 0 ? scoreOf(row).runes.highPerRun / maxRunes.value : 0);
const leaning = (row) => {
  const i = itemShare(row); const r = runeShare(row);
  if (i >= 0.5 && r >= 0.5) return { label: 'both', cls: 'lean-both' };
  if (i >= 0.5 && r < 0.25) return { label: 'items', cls: 'lean-items' };
  if (r >= 0.5 && i < 0.25) return { label: 'runes', cls: 'lean-runes' };
  return null;
};
const bestFor = computed(() => {
  if (rows.value.length === 0) return null;
  const byItems = [...rows.value].sort((a, b) => scoreOf(b).perRun - scoreOf(a).perRun)[0];
  const byRunes = [...rows.value].sort((a, b) => scoreOf(b).runes.highPerRun - scoreOf(a).runes.highPerRun)[0];
  const both = [...rows.value].sort((a, b) => Math.sqrt(itemShare(b) * runeShare(b)) - Math.sqrt(itemShare(a) * runeShare(a)))[0];
  return { byItems, byRunes, both: both !== byItems && both !== byRunes ? both : null };
});

// ---------- formatting ----------
const pct = (p) => {
  if (!(p > 0)) return '—';
  if (p >= 0.1) return `${(p * 100).toFixed(0)} %`;
  if (p >= 0.01) return `${(p * 100).toFixed(1)} %`;
  if (p >= 0.0001) return `${(p * 100).toFixed(2)} %`;
  return `${(p * 100).toFixed(3)} %`;
};
const runs = (p) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()} runs` : '');
const runeName = (n) => (dropData.BaseItems.find((b) => b.Code === `r${String(n).padStart(2, '0')}`)?.Name ?? '').replace(/ Rune$/, '');
const partsText = (score) => score.parts.slice(0, 3).map((p) => `${p.label} ${pct(p.hit)}`).join(' · ');
const dropCalcLink = (spot, terror) => ({ path: '/drop-calc', query: { area: String(spot.areaId), diff: String(difficulty.value), ...(terror ? { tz: '1' } : {}) } });
const tzLink = (zone) => ({ path: '/terror-zones', query: { zone: zone.key, diff: String(difficulty.value) } });

// ---------- URL ----------
const clampInt = (value, min, max, fallback) => {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
// the settings outlive the tab; a link's own values win over the saved ones
const SETTINGS_KEY = 'farm_settings';
const settingRefs = { difficulty, charLevel, heraldTier, players, party, mf, runeFloor, sortBy, terrorMode, weightItems, grailMode };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
  if (saved && typeof saved === 'object') for (const [key, r] of Object.entries(settingRefs)) if (saved[key] !== undefined) r.value = saved[key];
} catch { /* defaults */ }
watch(Object.values(settingRefs), () => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.fromEntries(Object.entries(settingRefs).map(([k, r]) => [k, r.value])))); } catch { /* fine */ }
});
onMounted(() => {
  const q = route.query;
  // a shared link brings its own list and replaces the visitor's
  if (q.items) { farmList.replace(String(q.items).split('|').filter(Boolean)); grailMode.value = false; }
  difficulty.value = clampInt(q.diff, 0, 2, difficulty.value);
  charLevel.value = clampInt(q.clvl, 1, 99, charLevel.value);
  heraldTier.value = clampInt(q.ht, 1, 5, heraldTier.value);
  players.value = clampInt(q.players, 1, 8, players.value);
  party.value = clampInt(q.party, 1, players.value, party.value);
  mf.value = clampInt(q.mf, 0, 9999, mf.value);
  if (RUNE_FLOORS.some((f) => String(f.number) === q.rune)) runeFloor.value = Number(q.rune);
  if (['worth', 'items', 'runes'].includes(q.sort)) sortBy.value = q.sort;
  else if (q.sort === 'tz' || q.sort === 'plain') sortBy.value = 'items'; // older links
  if (['now', 'all', 'none'].includes(q.terror)) terrorMode.value = q.terror;
  weightItems.value = clampInt(q.w, 0, 100, weightItems.value);
});
watch([tokens, difficulty, charLevel, heraldTier, players, party, mf, runeFloor, sortBy, weightItems, terrorMode], () => {
  router.replace({
    query: {
      ...(tokens.value.length ? { items: tokens.value.join('|') } : {}),
      ...(difficulty.value !== 2 ? { diff: String(difficulty.value) } : {}),
      ...(charLevel.value !== 99 ? { clvl: String(charLevel.value) } : {}),
      ...(heraldTier.value !== 1 ? { ht: String(heraldTier.value) } : {}),
      ...(players.value !== 1 ? { players: String(players.value) } : {}),
      ...(party.value !== 1 ? { party: String(party.value) } : {}),
      ...(mf.value !== 0 ? { mf: String(mf.value) } : {}),
      ...(runeFloor.value !== 25 ? { rune: String(runeFloor.value) } : {}),
      ...(sortBy.value !== 'worth' ? { sort: sortBy.value } : {}),
      ...(terrorMode.value !== 'now' ? { terror: terrorMode.value } : {}),
      ...(weightItems.value !== 50 ? { w: String(weightItems.value) } : {}),
    },
  });
}, { deep: true });
</script>

<template>
  <div class="container py-4 page-content">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h2 mb-1">Where to Farm</h1>
        <p class="text-muted mb-0">Put the items you are after on the list - every spot is scored by the chance that one run turns up at least one of them.</p>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <label class="small text-muted">Difficulty</label>
        <select v-model.number="difficulty" class="form-select form-select-sm w-auto">
          <option :value="0">Normal</option>
          <option :value="1">Nightmare</option>
          <option :value="2">Hell</option>
        </select>
        <label class="small text-muted" title="Which zones count as terrorized in the ranking">Terror zones</label>
        <select v-model="terrorMode" class="form-select form-select-sm w-auto">
          <option value="now">only the one up right now</option>
          <option value="all">every zone, when its turn comes</option>
          <option value="none">leave terror out</option>
        </select>
        <label class="small text-muted" title="For the terrorized numbers: terrorized monsters follow the character level">Char level</label>
        <input v-model.number="charLevel" type="number" min="1" max="99" class="form-control form-control-sm clvl" />
        <label class="small text-muted" title="Herald tier for the terrorized column; sunder charms need tier 4+">Herald tier</label>
        <select v-model.number="heraldTier" class="form-select form-select-sm w-auto">
          <option v-for="tier in 5" :key="tier" :value="tier">{{ tier }}</option>
        </select>
        <label class="small text-muted" title="Players in the game - fewer empty drops with more">Players</label>
        <select v-model.number="players" class="form-select form-select-sm w-auto">
          <option v-for="n in 8" :key="n" :value="n">{{ n }}</option>
        </select>
        <label class="small text-muted" title="Of those, how many are in your party and near you">Party</label>
        <select v-model.number="party" class="form-select form-select-sm w-auto">
          <option v-for="n in players" :key="n" :value="n">{{ n }}</option>
        </select>
        <label class="small text-muted" title="Magic find - lifts the unique and set rolls, never the runes">MF</label>
        <input v-model.number="mf" type="number" min="0" max="9999" class="form-control form-control-sm mf" />
        <label class="small text-muted" title="What counts as a high rune in the rune score. The Countess' own table ends at Ist - at Vex+ she no longer decides it">High rune</label>
        <select v-model.number="runeFloor" class="form-select form-select-sm w-auto">
          <option v-for="f in RUNE_FLOORS" :key="f.number" :value="f.number">{{ f.name }}+</option>
        </select>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-7">
        <div class="card card-enhanced list-card">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center">
            <h2 class="h5 card-title m-0">{{ grailMode ? 'Your Grail' : 'Your list' }}<span v-if="targets.length" class="text-muted fw-normal small"> · {{ targets.length }}</span></h2>
            <div class="d-flex align-items-center gap-3">
              <div v-if="grailHas" class="form-check form-switch mb-0 small" title="Score every spot against everything your Grail still lacks, instead of the list">
                <input id="farm-grail" v-model="grailMode" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="farm-grail">Everything my Grail is missing</label>
              </div>
              <button v-if="targets.length && !grailMode" class="btn btn-sm btn-outline-secondary" @click="clearTargets">Clear</button>
            </div>
          </div>
          <div v-if="grailMode" class="card-body p-3 small">
            <template v-if="!catalog">Reading the Grail…</template>
            <template v-else-if="grailList.length">
              <strong>{{ grailList.length }}</strong> items your Grail still lacks:
              {{ grailTally.uniques }} uniques and {{ grailTally.exalted }} Exalted, {{ grailTally.sets }} set items and {{ grailTally.mythic }} Mythic.
              A missing plain item counts its ordinary roll, a missing Exalted or Mythic only the variant roll. Open a row's <strong>?</strong> to see which of them a run there can turn up.
              <router-link to="/grail">Manage in the Grail</router-link>.
            </template>
            <template v-else>Your Grail is complete - nothing left to farm for. <router-link to="/grail">Look at it</router-link>.</template>
          </div>
          <div v-else class="card-body p-3">
            <div class="d-flex gap-2 mb-2">
              <select v-model="pickKind" class="form-select form-select-sm w-auto">
                <option value="unique">Unique</option>
                <option value="set">Set</option>
              </select>
              <div class="flex-grow-1">
                <SearchableSelect v-model="pickValue" :options="pickOptions" placeholder="Add an item…" />
              </div>
            </div>
            <div v-if="targets.length" class="d-flex flex-wrap gap-1">
              <span v-for="t in targets" :key="targetToken(t)" class="target-chip" :class="t.kind">
                {{ t.name }}<span v-if="t.rows.length > 1" class="text-muted"> ×{{ t.rows.length }}</span>
                <button class="chip-x" :title="`Remove ${t.name}`" @click="removeTarget(t)">×</button>
              </span>
            </div>
            <p v-else class="text-muted small mb-0">Nothing on the list yet. Add a few uniques or set items - the table appears as soon as there is one.</p>
          </div>
        </div>
      </div>

      <div class="col-lg-5">
        <div class="card card-enhanced profile-card h-100">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center">
            <h2 class="h5 card-title m-0">Run profile</h2>
            <button class="btn btn-sm btn-outline-secondary" @click="resetProfile">Defaults</button>
          </div>
          <div class="card-body p-3">
            <p class="small text-muted mb-2">What one run kills in an area. Bosses and superuniques count once; the rest is up to you - clearing the Sewers is not killing Mephisto.</p>
            <div class="row g-2 align-items-end profile-grid">
              <div class="col-4"><label class="form-label small mb-0">Unique packs</label><input v-model.number="profile.packs" type="number" min="0" max="99" class="form-control form-control-sm" /></div>
              <div class="col-4"><label class="form-label small mb-0">Minions / pack</label><input v-model.number="profile.minionsPerPack" type="number" min="0" max="20" class="form-control form-control-sm" /></div>
              <div class="col-4"><label class="form-label small mb-0">Trash kills</label><input v-model.number="profile.trash" type="number" min="0" max="999" class="form-control form-control-sm" /></div>
              <div class="col-4"><label class="form-label small mb-0">Champion packs</label><input v-model.number="profile.champPacks" type="number" min="0" max="99" class="form-control form-control-sm" /></div>
              <div class="col-4"><label class="form-label small mb-0">Champs / pack</label><input v-model.number="profile.champsPerPack" type="number" min="0" max="20" class="form-control form-control-sm" /></div>
              <div class="col-4"><label class="form-label small mb-0" title="Only in the terrorized column">Heralds (TZ)</label><input v-model.number="profile.heralds" type="number" min="0" max="10" class="form-control form-control-sm" /></div>
              <div class="col-4"><label class="form-label small mb-0" title="How long one run takes, town to town - the denominator behind the per-hour ranking">Minutes / run</label><input v-model.number="profile.minutes" type="number" min="0.5" max="60" step="0.5" class="form-control form-control-sm" /></div>
              <div class="col-12 small text-muted">{{ killsPerRun }} kills / run<template v-if="overrideCount"> · {{ overrideCount }} spot{{ overrideCount === 1 ? '' : 's' }} with own numbers (<a href="#" @click.prevent="clearAllOverrides">reset</a>)</template></div>
              <div class="col-6"><div class="form-check form-switch mb-0"><input id="p-su" v-model="profile.superUniques" class="form-check-input" type="checkbox" /><label class="form-check-label small" for="p-su">Superuniques</label></div></div>
              <div class="col-6"><div class="form-check form-switch mb-0"><input id="p-boss" v-model="profile.boss" class="form-check-input" type="checkbox" /><label class="form-check-label small" for="p-boss">Act / quest boss</label></div></div>
              <div class="col-12"><div class="form-check form-switch mb-0"><input id="p-zone" v-model="profile.packsFromZone" class="form-check-input" type="checkbox" /><label class="form-check-label small" for="p-zone" title="The terror zone data carries a pack span per zone; spread over the zone's areas it replaces the number above wherever it exists">Unique packs from the zone data where known</label></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="bestFor" class="card card-enhanced mt-4 verdict">
      <div class="card-body p-3 d-flex flex-wrap gap-4">
        <div class="ranking">
          <div class="section-header mb-1">Most worth your time</div>
          <ol class="mb-1 ps-3">
            <li v-for="row in ranking.slice(0, 3)" :key="row.spot.areaId">
              <span class="spot-strong">{{ row.spot.name }}</span><span v-if="row.preset" class="text-muted small"> ({{ row.preset.label }})</span><span v-if="terrorizedInView(row)" class="badge tz-now ms-1">TZ</span>
              <span class="text-muted small"> · a hit every {{ hours(itemsPerHour(row)) }} · a {{ runeFloorName }}+ every {{ hours(runesPerHour(row)) }} · {{ row.minutes }} min runs</span>
            </li>
          </ol>
          <div class="d-flex align-items-center gap-2 small text-muted">
            <span>runes</span>
            <input v-model.number="weightItems" type="range" min="0" max="100" step="5" class="form-range weight" title="What the hour is for: only runes on the left, only the list on the right" />
            <span>items</span>
          </div>
        </div>
        <div>
          <div class="section-header mb-1">Best for your list</div>
          <div><span class="spot-strong">{{ bestFor.byItems.spot.name }}</span><span v-if="bestFor.byItems.preset" class="text-muted small"> ({{ bestFor.byItems.preset.label }})</span> <span class="text-muted small">{{ pct(scoreOf(bestFor.byItems).perRun) }} per run · {{ runeFloorName }}+ {{ pct(scoreOf(bestFor.byItems).runes.highPerRun) }}</span></div>
        </div>
        <div>
          <div class="section-header mb-1">Best for high runes</div>
          <div><span class="spot-strong">{{ bestFor.byRunes.spot.name }}</span><span v-if="bestFor.byRunes.preset" class="text-muted small"> ({{ bestFor.byRunes.preset.label }})</span> <span class="text-muted small">{{ runeFloorName }}+ {{ pct(scoreOf(bestFor.byRunes).runes.highPerRun) }} per run · list {{ pct(scoreOf(bestFor.byRunes).perRun) }}<template v-if="scoreOf(bestFor.byRunes).runes.carrier && scoreOf(bestFor.byRunes).runes.carrier.share >= 0.5 && !['Trash', 'Minions', 'Champions', 'Unique packs'].includes(scoreOf(bestFor.byRunes).runes.carrier.label)"> · mostly {{ scoreOf(bestFor.byRunes).runes.carrier.label }}</template></span></div>
        </div>
        <div v-if="bestFor.both">
          <div class="section-header mb-1">Best of both</div>
          <div><span class="spot-strong">{{ bestFor.both.spot.name }}</span><span v-if="bestFor.both.preset" class="text-muted small"> ({{ bestFor.both.preset.label }})</span> <span class="text-muted small">{{ pct(scoreOf(bestFor.both).perRun) }} per run · {{ runeFloorName }}+ {{ pct(scoreOf(bestFor.both).runes.highPerRun) }}</span></div>
        </div>
        <div class="small text-muted align-self-center ms-auto verdict-note">
          Bosses pay in uniques and sets and hand out few runes; a clear is the other way round. The bars in the table put both on one scale, each against the best spot.
        </div>
      </div>
    </div>

    <div v-if="targets.length" class="card card-enhanced mt-4">
      <div class="card-header card-header-primary d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h2 class="h5 card-title m-0">Spots<span class="text-muted fw-normal small"> · {{ sorted.length }} with a chance</span></h2>
        <div class="d-flex gap-2 align-items-center">
          <label class="small text-muted">Sort by</label>
          <select v-model="sortBy" class="form-select form-select-sm w-auto">
            <option value="worth">worth per hour</option>
            <option value="items">chance on the list per run</option>
            <option value="runes">{{ runeFloorName }}+ rune per run</option>
          </select>
        </div>
      </div>
      <div class="card-body p-0">
        <div v-if="sorted.length === 0" class="p-3 text-muted small">No spot drops anything on the list on this difficulty.</div>
        <div v-else class="table-responsive">
          <table class="table table-dark table-sm table-hover mb-0 align-middle plan-table">
            <thead>
              <tr>
                <th class="text-end rank-col">#</th>
                <th>Spot</th>
                <th class="text-end" :title="`Expected hits on the list and high runes per hour at this spot's run time - ${terrorLabel}`">Per hour</th>
                <th class="text-end">Not terrorized</th>
                <th class="text-end">Terrorized</th>
                <th>Carried by</th>
                <th>Runes <span class="fw-normal text-muted">({{ terrorLabel }})</span></th>
                <th :title="`Chance for the list and for a ${runeFloorName}+ rune, each relative to the best spot on the table`">Items · runes</th>
                <th>Next terror</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in visible" :key="row.spot.areaId">
              <tr :class="{ 'row-edited': row.overridden }">
                <td class="text-end rank-col text-muted">{{ rankOf(row) }}</td>
                <td>
                  <router-link :to="dropCalcLink(row.spot, false)" class="spot-link">{{ row.spot.name }}</router-link>
                  <span class="badge act-badge ms-1" :class="`act-${row.spot.act}`">A{{ row.spot.act }}</span>
                  <span v-if="row.spot.boss >= 0" class="badge boss-badge ms-1">{{ dropData.Monsters[row.spot.boss].Name }}</span>
                  <select v-if="row.presets.length" class="form-select form-select-sm preset-select ms-1" :value="row.preset?.id ?? ''" :title="'How this spot is run'" @change="setPreset(row.spot.areaId, $event.target.value)">
                    <option value="">Full clear</option>
                    <option v-for="pr in row.presets" :key="pr.id" :value="pr.id">{{ pr.label }}</option>
                  </select>
                  <button class="btn btn-sm edit-btn ms-1" :class="{ on: row.overridden }" :title="row.overridden ? 'This spot has its own run numbers' : 'Own run numbers for this spot'" @click="editing === row.spot.areaId ? cancelEdit() : startEdit(row.spot.areaId)">✎</button>
                  <button class="btn btn-sm edit-btn" :class="{ on: why === row.spot.areaId }" title="Why this number - the monsters and kills behind it" @click="toggleWhy(row.spot.areaId)">?</button>
                </td>
                <td class="text-end text-nowrap small">
                  <div>hit every <strong>{{ hours(itemsPerHour(row)) }}</strong></div>
                  <div><span class="rune-high">{{ runeFloorName }}+</span> every <strong>{{ hours(runesPerHour(row)) }}</strong></div>
                  <div class="text-muted">{{ row.minutes }} min / run</div>
                </td>
                <td class="text-end text-nowrap" :class="{ 'in-view': !terrorizedInView(row) }">
                  <div>{{ pct(row.plain.perRun) }}</div>
                  <div class="small text-muted">{{ runs(row.plain.perRun) }}</div>
                </td>
                <td class="text-end text-nowrap" :class="{ 'in-view': terrorizedInView(row) }">
                  <template v-if="row.tz">
                    <div>{{ pct(row.tz.perRun) }}<span v-if="row.next?.now" class="badge tz-now ms-1" title="Terrorized right now">TZ</span></div>
                    <div class="small text-muted">{{ runs(row.tz.perRun) }}</div>
                  </template>
                  <span v-else class="text-muted small">no terror zone</span>
                </td>
                <td class="small text-muted">{{ partsText(row.tz ?? row.plain) }}</td>
                <td class="small text-nowrap">
                  <template v-if="scoreOf(row).runes.max">
                    <div>
                      up to <span class="rune-name">{{ runeName(scoreOf(row).runes.max) }}</span>
                      <span v-if="row.tz && row.tz.runes.max !== row.plain.runes.max" class="text-muted">
                        · {{ terrorizedInView(row) ? 'not terrorized' : 'terrorized' }} up to {{ runeName(terrorizedInView(row) ? row.plain.runes.max : row.tz.runes.max) }}
                      </span>
                    </div>
                    <div><span class="rune-high">{{ runeFloorName }}+</span> {{ pct(scoreOf(row).runes.highPerRun) }} / run<span class="text-muted"> · {{ runs(scoreOf(row).runes.highPerRun) }}</span></div>
                    <div class="text-muted">~{{ scoreOf(row).runes.expected.toFixed(1) }} runes / run</div>
                    <div v-if="scoreOf(row).runes.carrier && scoreOf(row).runes.carrier.share >= 0.5 && !['Trash', 'Minions', 'Champions', 'Unique packs'].includes(scoreOf(row).runes.carrier.label)" class="carrier">
                      mostly {{ scoreOf(row).runes.carrier.label }} ({{ Math.round(scoreOf(row).runes.carrier.share * 100) }} %)
                    </div>
                  </template>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="lean-cell">
                  <div class="lean-bar"><span class="lean-fill items" :style="{ width: `${Math.round(itemShare(row) * 100)}%` }"></span></div>
                  <div class="lean-bar"><span class="lean-fill runes" :style="{ width: `${Math.round(runeShare(row) * 100)}%` }"></span></div>
                  <span v-if="leaning(row)" class="lean-label" :class="leaning(row).cls">{{ leaning(row).label }}</span>
                </td>
                <td class="small text-nowrap">
                  <router-link v-if="row.zone" :to="tzLink(row.zone)" :class="{ 'text-warning': row.next?.now }">{{ fmtWhen(row.next) }}</router-link>
                  <span v-else class="text-muted">—</span>
                </td>
              </tr>
              <tr v-if="editing === row.spot.areaId && draft" class="edit-row">
                <td colspan="9">
                  <div class="d-flex flex-wrap gap-2 align-items-end">
                    <span class="small text-muted me-1">A run in {{ row.spot.name }}:</span>
                    <label class="small">packs <input v-model.number="draft.packs" type="number" min="0" max="99" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">minions/pack <input v-model.number="draft.minionsPerPack" type="number" min="0" max="20" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">champ packs <input v-model.number="draft.champPacks" type="number" min="0" max="99" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">champs/pack <input v-model.number="draft.champsPerPack" type="number" min="0" max="20" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">trash <input v-model.number="draft.trash" type="number" min="0" max="999" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">heralds <input v-model.number="draft.heralds" type="number" min="0" max="10" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">minutes <input v-model.number="draft.minutes" type="number" min="0.5" max="60" step="0.5" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small form-check mb-0 ms-1"><input v-model="draft.superUniques" class="form-check-input" type="checkbox" /> superuniques</label>
                    <label class="small form-check mb-0"><input v-model="draft.boss" class="form-check-input" type="checkbox" /> boss</label>
                    <span class="ms-auto d-flex gap-1">
                      <button class="btn btn-sm btn-outline-secondary" @click="cancelEdit">Cancel</button>
                      <button v-if="row.overridden" class="btn btn-sm btn-outline-secondary" @click="clearEdit">Use defaults</button>
                      <button class="btn btn-sm btn-primary" @click="saveEdit">Save</button>
                    </span>
                  </div>
                </td>
              </tr>
              <tr v-if="why === row.spot.areaId && whyDetail" class="why-row">
                <td colspan="9">
                  <div class="small mb-2">
                    <strong>A run in {{ row.spot.name }}</strong><span v-if="row.preset"> ({{ row.preset.label }})</span>, {{ whyDetail.terror ? 'terrorized' : 'not terrorized' }}:
                    {{ whyDetail.score.detail.counts.unique }} unique packs with {{ whyDetail.score.detail.counts.minion }} minions, {{ whyDetail.score.detail.counts.champion }} champions, {{ whyDetail.score.detail.counts.normal }} trash kills<template v-if="profileFor(row.spot.areaId).superUniques && row.spot.superUniques.length">, the superuniques</template><template v-if="profileFor(row.spot.areaId).boss && row.spot.boss >= 0">, {{ dropData.Monsters[row.spot.boss].Name }}</template>.
                    <span class="text-muted">
                      <template v-if="whyDetail.score.detail.packsFromPlaced">No rolled monster is left for the packs, so the placed ones stand in.</template>
                      <template v-else-if="whyDetail.score.detail.rollSize">Packs average over the roll - {{ whyDetail.score.detail.rollTypes }} types<template v-if="whyDetail.score.detail.numMon">, the game picks {{ whyDetail.score.detail.numMon }} per game</template> - weighted by rarity; placed monsters are met as trash only.</template>
                    </span>
                  </div>
                  <table class="table table-dark table-sm mb-2 why-table">
                    <thead>
                      <tr>
                        <th>Monster</th>
                        <th>In the roll</th>
                        <th class="text-end" title="Monster level of a unique pack here">mlvl</th>
                        <th class="text-end" title="Chance of a listed item from one ordinary kill">Trash</th>
                        <th class="text-end">Champion</th>
                        <th class="text-end">Unique</th>
                        <th class="text-end">Minion</th>
                        <th class="text-end" :title="`Expected ${runeFloorName}+ runes from one unique kill`">{{ runeFloorName }}+ / unique</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="m in whyDetail.score.detail.monsters" :key="m.monsterIndex" :class="{ 'text-muted': m.placed || m.dead }">
                        <td>{{ m.name }}<span v-if="m.dead" class="text-warning"> · immune</span></td>
                        <td>{{ m.placed ? 'placed by the map' : `weight ${m.weight}` }}</td>
                        <td class="text-end">{{ m.per.unique?.mlvl ?? m.per.normal?.mlvl ?? '—' }}</td>
                        <td class="text-end">{{ m.per.normal ? pct(m.per.normal.any) : '—' }}</td>
                        <td class="text-end">{{ m.per.champion ? pct(m.per.champion.any) : '—' }}</td>
                        <td class="text-end">{{ m.per.unique ? pct(m.per.unique.any) : '—' }}</td>
                        <td class="text-end">{{ m.per.minion ? pct(m.per.minion.any) : '—' }}</td>
                        <td class="text-end">{{ m.per.unique && m.per.unique.high > 0 ? pct(m.per.unique.high) : '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div class="small">
                    <span class="text-muted">Per run, what carries it:</span>
                    <span v-for="part in whyDetail.score.parts" :key="part.label" class="ms-2">{{ part.label }} <strong>{{ pct(part.hit) }}</strong></span>
                    <span class="ms-2">→ <strong>{{ pct(whyDetail.score.perRun) }}</strong> for the list</span>
                  </div>
                  <div v-if="whyDetail.score.detail.targets?.length" class="small mt-1">
                    <span class="text-muted">{{ grailMode ? 'Missing Grail items a run here can turn up:' : 'Which of the list:' }}</span>
                    <span v-for="t in whyDetail.score.detail.targets.slice(0, 15)" :key="t.k" class="ms-2 text-nowrap">{{ targets[t.k].name }} <strong>{{ pct(t.hit) }}</strong></span>
                    <span v-if="whyDetail.score.detail.targets.length > 15" class="ms-2 text-muted">+{{ whyDetail.score.detail.targets.length - 15 }} more</span>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-if="sorted.length > ROW_LIMIT" class="p-2 small">
          <a href="#" @click.prevent="showAll = !showAll">{{ showAll ? 'Show the top ' + ROW_LIMIT : `Show all ${sorted.length} spots` }}</a>
        </div>
      </div>
    </div>

    <p class="small text-muted mt-4 mb-0">
      Per kill, the chance of at least one listed item is 1 − Π(1 − p); per run the misses multiply across the kills in the profile. Packs go in as the average over
      the area's random roll, weighted by monster rarity; monsters the map places rather than rolls - the Trapped Souls, Travincal's council - are met as trash and do
      not thin that average. The <strong>?</strong> on a row shows the numbers behind it. Player count, party and magic find as set above; exalted and mythic rolls count as their base item. The terrorized column uses the character level
      above; the next terror time comes from the <router-link to="/terror-zones">Terror Zones</router-link> schedule.
    </p>
  </div>
</template>

<style scoped>
.clvl { width: 4.5rem; }
.mf { width: 5rem; }
.rune-high { color: #ffb84d; font-weight: 600; }
.spot-link { color: var(--d2r-gold-bright); text-decoration: none; }
.spot-link:hover { text-decoration: underline; }
.act-badge { background: rgba(255, 255, 255, 0.08); color: var(--d2r-text); font-weight: 600; }
.act-1 { background: rgba(120, 160, 90, 0.35); }
.act-2 { background: rgba(200, 160, 70, 0.35); }
.act-3 { background: rgba(70, 150, 120, 0.35); }
.act-4 { background: rgba(190, 80, 60, 0.35); }
.act-5 { background: rgba(110, 140, 200, 0.35); }
.boss-badge { background: rgba(170, 40, 40, 0.45); color: #ffb3b3; font-weight: 600; }
.rune-name { color: #ffb84d; }
.list-card, .profile-card { overflow: visible; }
.target-chip {
  display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.3rem 0.15rem 0.6rem;
  border-radius: 999px; background: rgba(255, 255, 255, 0.06); font-size: 0.85rem;
}
.target-chip.unique { color: #c7b377; }
.target-chip.set { color: #7fdc7f; }
.chip-x { border: 0; background: none; color: var(--d2r-muted); line-height: 1; padding: 0 0.25rem; cursor: pointer; }
.chip-x:hover { color: var(--d2r-gold-bright); }
.profile-grid input { max-width: 6rem; }
.plan-table td { vertical-align: middle; }
.edit-btn { border: 0; background: none; color: var(--d2r-muted); padding: 0 0.25rem; line-height: 1; }
.preset-select { display: inline-block; width: auto; padding: 0 1.6rem 0 0.4rem; font-size: 0.75rem; height: 1.5rem; vertical-align: middle; }
.edit-btn:hover, .edit-btn.on { color: var(--d2r-gold-bright); }
.row-edited .spot-link::after { content: ' •'; color: var(--d2r-gold); }
.edit-row td { background: rgba(212, 175, 55, 0.06); }
.why-row td { background: rgba(255, 255, 255, 0.03); }
.why-table { font-size: 0.8rem; }
.why-table td, .why-table th { padding: 0.15rem 0.5rem; }
.mini { width: 4.2rem; margin-left: 0.25rem; }
.verdict { border-color: rgba(201, 163, 106, 0.45); }
.ranking { min-width: 20rem; }
.ranking ol li { margin-bottom: 0.15rem; }
.weight { width: 9rem; }
.rank-col { width: 2.2rem; }
.in-view { box-shadow: inset 0 -2px 0 rgba(212, 175, 55, 0.5); }
.tz-now { background: rgba(120, 60, 160, 0.5); color: #e6c8ff; font-size: 0.65rem; vertical-align: middle; }
.verdict-note { max-width: 22rem; }
.spot-strong { color: var(--d2r-gold-bright); font-weight: 600; }
.lean-cell { min-width: 7.5rem; }
.lean-bar { height: 5px; background: rgba(255, 255, 255, 0.07); border-radius: 3px; margin: 3px 0; overflow: hidden; }
.lean-fill { display: block; height: 100%; }
.lean-fill.items { background: #c7b377; }
.lean-fill.runes { background: #ffb84d; }
.lean-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
.lean-items { color: #c7b377; }
.lean-runes { color: #ffb84d; }
.lean-both { color: #9fe870; }
.carrier { color: #ffb84d; font-size: 0.78rem; }
</style>
