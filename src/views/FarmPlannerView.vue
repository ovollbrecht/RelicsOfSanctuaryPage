<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dropData from '@/assets/dropcalc.json';
import tz from '@/assets/terror_zones.json';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { buildContext } from '@/composables/useDropSimulation.js';
import { DEFAULT_PROFILE, resolveTargets, targetToken, buildSpots, scoreSpot } from '@/composables/useFarmPlanner.js';

/**
 * Where to farm: a list of wanted items, and every spot scored by the chance
 * that one run turns up at least one of them - with and without the zone being
 * terrorized. The run profile says what a run kills; the maths is in
 * useFarmPlanner.js.
 */
const route = useRoute();
const router = useRouter();

// ---------- the list ----------
const tokens = ref([]);
const targets = computed(() => resolveTargets(dropData, tokens.value));
const pickKind = ref('unique');
const pickValue = ref(null);
const pickOptions = computed(() => (pickKind.value === 'unique'
  ? dropData.Uniques.map((u, i) => ({ value: `u:${u.Index}`, label: u.Name, hint: dropData.BaseItems[u.Base]?.Name ?? '', spawnable: u.Spawnable }))
  : dropData.Sets.map((s, i) => ({ value: `s:${s.Index}`, label: s.Name, hint: `${s.SetName} · ${dropData.BaseItems[s.Base]?.Name ?? ''}`, spawnable: s.Spawnable })))
  .filter((o) => o.spawnable !== false));
watch(pickValue, (token) => {
  if (!token) return;
  if (!tokens.value.includes(token)) tokens.value = [...tokens.value, token];
  pickValue.value = null;
});
const removeTarget = (t) => { tokens.value = tokens.value.filter((tok) => tok !== targetToken(t)); };
const clearTargets = () => { tokens.value = []; };

// ---------- settings ----------
const difficulty = ref(2);
const charLevel = ref(99);
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
  dataMode: 'mod', players: 1, partyNearby: 1, mf: 0,
  terror: { enabled: terror, charLevel: charLevel.value },
  exalted: { enabled: true, percent: 5 }, mythic: { enabled: true, percent: 5 }, heraldTier: 1,
});

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
    const a = scoreSpot(plain, spot, targets.value, profile.value, diff);
    const b = zoneIndex != null ? scoreSpot(terror, spot, targets.value, profile.value, diff) : null;
    if (a.perRun <= 0 && (!b || b.perRun <= 0)) continue;
    out.push({
      spot,
      zone: zoneIndex != null ? tz.zones[zoneIndex] : null,
      next: zoneIndex != null ? nextSlotOfZone(zoneIndex) : null,
      plain: a,
      tz: b,
      best: Math.max(a.perRun, b?.perRun ?? 0),
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

// ---------- formatting ----------
const pct = (p) => {
  if (!(p > 0)) return '—';
  if (p >= 0.1) return `${(p * 100).toFixed(0)} %`;
  if (p >= 0.01) return `${(p * 100).toFixed(1)} %`;
  return `${(p * 100).toFixed(2)} %`;
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
  if (q.items) tokens.value = String(q.items).split('|').filter(Boolean);
  difficulty.value = clampInt(q.diff, 0, 2, difficulty.value);
  charLevel.value = clampInt(q.clvl, 1, 99, charLevel.value);
  if (['tz', 'plain', 'runes'].includes(q.sort)) sortBy.value = q.sort;
});
watch([tokens, difficulty, charLevel, sortBy], () => {
  router.replace({
    query: {
      ...(tokens.value.length ? { items: tokens.value.join('|') } : {}),
      ...(difficulty.value !== 2 ? { diff: String(difficulty.value) } : {}),
      ...(charLevel.value !== 99 ? { clvl: String(charLevel.value) } : {}),
      ...(sortBy.value !== 'tz' ? { sort: sortBy.value } : {}),
    },
  });
});
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
                {{ t.name }}
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
              <div class="col-4 small text-muted">{{ killsPerRun }} kills / run</div>
              <div class="col-6"><div class="form-check form-switch mb-0"><input id="p-su" v-model="profile.superUniques" class="form-check-input" type="checkbox" /><label class="form-check-label small" for="p-su">Superuniques</label></div></div>
              <div class="col-6"><div class="form-check form-switch mb-0"><input id="p-boss" v-model="profile.boss" class="form-check-input" type="checkbox" /><label class="form-check-label small" for="p-boss">Act / quest boss</label></div></div>
            </div>
          </div>
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
            <option value="runes">Pul+ rune per run</option>
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
                <th>Next terror</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visible" :key="row.spot.areaId">
                <td>
                  <router-link :to="dropCalcLink(row.spot, false)" class="spot-link">{{ row.spot.name }}</router-link>
                  <span class="badge act-badge ms-1" :class="`act-${row.spot.act}`">A{{ row.spot.act }}</span>
                  <span v-if="row.spot.boss >= 0" class="badge boss-badge ms-1">{{ dropData.Monsters[row.spot.boss].Name }}</span>
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
                  <template v-if="(row.tz ?? row.plain).runes.max">
                    <div>up to <span class="rune-name">{{ runeName((row.tz ?? row.plain).runes.max) }}</span></div>
                    <div class="text-muted">Pul+ {{ pct((row.tz ?? row.plain).runes.highPerRun) }} / run</div>
                  </template>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="small text-nowrap">
                  <router-link v-if="row.zone" :to="tzLink(row.zone)" :class="{ 'text-warning': row.next?.now }">{{ fmtWhen(row.next) }}</router-link>
                  <span v-else class="text-muted">—</span>
                </td>
              </tr>
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
      average over its spawn list. Players 1, no magic find, exalted and mythic rolls counted as their base item. The terrorized column uses the character level
      above; the next terror time comes from the <router-link to="/terror-zones">Terror Zones</router-link> schedule.
    </p>
  </div>
</template>

<style scoped>
.clvl { width: 4.5rem; }
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
</style>
