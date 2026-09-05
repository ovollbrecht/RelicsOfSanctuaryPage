<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dropData from '@/assets/dropcalc.json';
import tz from '@/assets/terror_zones.json';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { buildContext } from '@/composables/useDropSimulation.js';
import { DEFAULT_PROFILE, RUNE_FLOORS, resolveTargets, targetToken, buildSpots, scoreSpot, presetsFor, applyPreset } from '@/composables/useFarmPlanner.js';
import { useFarmList } from '@/composables/useFarmList.js';

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
const targets = computed(() => resolveTargets(dropData, tokens.value));
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
const runeFloor = ref(21);
const runeFloorName = computed(() => RUNE_FLOORS.find((f) => f.number === runeFloor.value)?.name ?? 'Pul');
const sortBy = ref('tz'); // tz | plain | runes
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
/// A spot's pack count from the zone data: the zone's span, spread over its areas.
const packsFromZone = (areaId) => {
  const zi = zoneOfArea.get(areaId);
  const zone = zi != null ? tz.zones[zi] : null;
  if (!zone?.bossPacks) return null;
  return Math.max(1, Math.round((zone.bossPacks[0] + zone.bossPacks[1]) / 2 / zone.areas.length));
};
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
const profileFor = (areaId) => {
  const base = { ...profile.value };
  if (base.packsFromZone) {
    const fromZone = packsFromZone(areaId);
    if (fromZone != null) base.packs = fromZone;
  }
  const { preset, ...numbers } = overrides.value[areaId] ?? {};
  return { ...base, ...(presetOf(areaId)?.profile ?? {}), ...numbers };
};
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
  const k0 = Math.max(0, Math.floor((Date.now() - FIRST) / SLOT_MS));
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
  const delta = slot.start - Date.now();
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 24 * 60) return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
  return `${dayFmt.format(new Date(slot.start))}, ${timeFmt.format(new Date(slot.start))}`;
};

// ---------- the plan ----------
const computing = ref(false);
const rows = computed(() => {
  if (targets.value.length === 0) return [];
  const diff = difficulty.value;
  const spots = buildSpots(dropData, diff);
  const plain = makeCtx(false);
  const terror = makeCtx(true);
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
const sorted = computed(() => {
  const list = [...rows.value];
  if (sortBy.value === 'plain') list.sort((x, y) => y.plain.perRun - x.plain.perRun);
  else if (sortBy.value === 'runes') list.sort((x, y) => (y.tz ?? y.plain).runes.highPerRun - (x.tz ?? x.plain).runes.highPerRun);
  else list.sort((x, y) => (y.tz?.perRun ?? 0) - (x.tz?.perRun ?? 0) || y.plain.perRun - x.plain.perRun);
  return list;
});
const visible = computed(() => (showAll.value ? sorted.value : sorted.value.slice(0, ROW_LIMIT)));

// ---------- items or runes: the trade-off behind the choice ----------
// A boss pays in uniques and sets and hands out few runes; a clear is the
// other way round. Both scores are put on the same scale - each relative to
// the best spot on the table - so a row shows which side of the trade it is on.
const scoreOf = (row) => row.tz ?? row.plain;
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
onMounted(() => {
  const q = route.query;
  // a shared link brings its own list and replaces the visitor's
  if (q.items) farmList.replace(String(q.items).split('|').filter(Boolean));
  difficulty.value = clampInt(q.diff, 0, 2, difficulty.value);
  charLevel.value = clampInt(q.clvl, 1, 99, charLevel.value);
  heraldTier.value = clampInt(q.ht, 1, 5, heraldTier.value);
  players.value = clampInt(q.players, 1, 8, players.value);
  party.value = clampInt(q.party, 1, players.value, party.value);
  mf.value = clampInt(q.mf, 0, 9999, mf.value);
  if (RUNE_FLOORS.some((f) => String(f.number) === q.rune)) runeFloor.value = Number(q.rune);
  if (['tz', 'plain', 'runes'].includes(q.sort)) sortBy.value = q.sort;
});
watch([tokens, difficulty, charLevel, heraldTier, players, party, mf, runeFloor, sortBy], () => {
  router.replace({
    query: {
      ...(tokens.value.length ? { items: tokens.value.join('|') } : {}),
      ...(difficulty.value !== 2 ? { diff: String(difficulty.value) } : {}),
      ...(charLevel.value !== 99 ? { clvl: String(charLevel.value) } : {}),
      ...(heraldTier.value !== 1 ? { ht: String(heraldTier.value) } : {}),
      ...(players.value !== 1 ? { players: String(players.value) } : {}),
      ...(party.value !== 1 ? { party: String(party.value) } : {}),
      ...(mf.value !== 0 ? { mf: String(mf.value) } : {}),
      ...(runeFloor.value !== 21 ? { rune: String(runeFloor.value) } : {}),
      ...(sortBy.value !== 'tz' ? { sort: sortBy.value } : {}),
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
        <label class="small text-muted" title="For the terrorized column: terrorized monsters follow the character level">Char level</label>
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
            <h2 class="h5 card-title m-0">Your list<span v-if="targets.length" class="text-muted fw-normal small"> · {{ targets.length }}</span></h2>
            <button v-if="targets.length" class="btn btn-sm btn-outline-secondary" @click="clearTargets">Clear</button>
          </div>
          <div class="card-body p-3">
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
            <option value="tz">chance, terrorized</option>
            <option value="plain">chance, not terrorized</option>
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
                <th>Spot</th>
                <th class="text-end">Not terrorized</th>
                <th class="text-end">Terrorized</th>
                <th>Carried by</th>
                <th>Runes</th>
                <th :title="`Chance for the list and for a ${runeFloorName}+ rune, each relative to the best spot on the table`">Items · runes</th>
                <th>Next terror</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in visible" :key="row.spot.areaId">
              <tr :class="{ 'row-edited': row.overridden }">
                <td>
                  <router-link :to="dropCalcLink(row.spot, false)" class="spot-link">{{ row.spot.name }}</router-link>
                  <span class="badge act-badge ms-1" :class="`act-${row.spot.act}`">A{{ row.spot.act }}</span>
                  <span v-if="row.spot.boss >= 0" class="badge boss-badge ms-1">{{ dropData.Monsters[row.spot.boss].Name }}</span>
                  <select v-if="row.presets.length" class="form-select form-select-sm preset-select ms-1" :value="row.preset?.id ?? ''" :title="'How this spot is run'" @change="setPreset(row.spot.areaId, $event.target.value)">
                    <option value="">Full clear</option>
                    <option v-for="pr in row.presets" :key="pr.id" :value="pr.id">{{ pr.label }}</option>
                  </select>
                  <button class="btn btn-sm edit-btn ms-1" :class="{ on: row.overridden }" :title="row.overridden ? 'This spot has its own run numbers' : 'Own run numbers for this spot'" @click="editing === row.spot.areaId ? cancelEdit() : startEdit(row.spot.areaId)">✎</button>
                </td>
                <td class="text-end text-nowrap">
                  <div>{{ pct(row.plain.perRun) }}</div>
                  <div class="small text-muted">{{ runs(row.plain.perRun) }}</div>
                </td>
                <td class="text-end text-nowrap">
                  <template v-if="row.tz">
                    <div>{{ pct(row.tz.perRun) }}</div>
                    <div class="small text-muted">{{ runs(row.tz.perRun) }}</div>
                  </template>
                  <span v-else class="text-muted small">no terror zone</span>
                </td>
                <td class="small text-muted">{{ partsText(row.tz ?? row.plain) }}</td>
                <td class="small text-nowrap">
                  <template v-if="scoreOf(row).runes.max">
                    <div>up to <span class="rune-name">{{ runeName(scoreOf(row).runes.max) }}</span></div>
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
                <td colspan="7">
                  <div class="d-flex flex-wrap gap-2 align-items-end">
                    <span class="small text-muted me-1">A run in {{ row.spot.name }}:</span>
                    <label class="small">packs <input v-model.number="draft.packs" type="number" min="0" max="99" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">minions/pack <input v-model.number="draft.minionsPerPack" type="number" min="0" max="20" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">champ packs <input v-model.number="draft.champPacks" type="number" min="0" max="99" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">champs/pack <input v-model.number="draft.champsPerPack" type="number" min="0" max="20" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">trash <input v-model.number="draft.trash" type="number" min="0" max="999" class="form-control form-control-sm d-inline-block mini" /></label>
                    <label class="small">heralds <input v-model.number="draft.heralds" type="number" min="0" max="10" class="form-control form-control-sm d-inline-block mini" /></label>
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
      Per kill, the chance of at least one listed item is 1 − Π(1 − p); per run the misses multiply across the kills in the profile. An area's monsters go in as the
      average over its spawn list. Player count, party and magic find as set above; exalted and mythic rolls count as their base item. The terrorized column uses the character level
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
.mini { width: 4.2rem; margin-left: 0.25rem; }
.verdict { border-color: rgba(201, 163, 106, 0.45); }
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
