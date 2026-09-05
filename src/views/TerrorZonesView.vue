<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import tz from '@/assets/terror_zones.json';
import dropData from '@/assets/dropcalc.json';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { buildContext, computeMonsterDrops, computeItemSources, formatChance } from '@/composables/useDropSimulation.js';

/**
 * The single-player terror zone schedule, read against the clock.
 *
 * Offline, the game picks the terrorized zone from a seeded schedule - the
 * same one for everybody, thirty minutes a slot - so the page can say what is
 * up now, what comes next, and when a particular zone or item is due. The
 * schedule itself is an import (see scripts/import-terror-zones.mjs): the
 * generator behind the seed is not public, so the page knows nothing but a
 * first slot and a list of zone indices, and says on which day the list ends.
 *
 * Everything else comes from this site's own data: the areas of a zone, the
 * superuniques in them, and - through the drop calculator's engine in terror
 * mode - what can actually drop there. With the mod's exalted/mythic
 * "desecrated only" options on, that last part is the whole point.
 */
const route = useRoute();
const router = useRouter();

const SLOT_MS = tz.config.slotMinutes * 60 * 1000;
const FIRST = Date.parse(tz.schedule.firstSlotUtc);
const INDEX = tz.schedule.zoneIndex;
const COUNT = INDEX.length;
const zones = tz.zones;
const zoneByKey = new Map(zones.map((z, i) => [z.key, i]));

// ---------- clock ----------
const now = ref(Date.now());
let ticker = null;
onMounted(() => { ticker = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { if (ticker) clearInterval(ticker); });

const slotIndexAt = (ms) => Math.floor((ms - FIRST) / SLOT_MS);
const slotAt = (k) => (k < 0 || k >= COUNT) ? null : {
  index: k,
  start: FIRST + k * SLOT_MS,
  end: FIRST + (k + 1) * SLOT_MS,
  zoneIndex: INDEX[k],
  zone: zones[INDEX[k]],
};

const currentIndex = computed(() => slotIndexAt(now.value));
const current = computed(() => slotAt(currentIndex.value));
const coverage = computed(() => {
  if (now.value < FIRST) return 'before';
  if (currentIndex.value >= COUNT) return 'after';
  return 'ok';
});
const remainingMs = computed(() => (current.value ? current.value.end - now.value : 0));
const progress = computed(() => (current.value ? ((now.value - current.value.start) / SLOT_MS) * 100 : 0));
const scheduleEnd = FIRST + COUNT * SLOT_MS;
const daysLeft = computed(() => Math.floor((scheduleEnd - now.value) / 86400000));

// ---------- formatting, in the visitor's own zone ----------
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (ms) => timeFmt.format(new Date(ms));
const fmtDay = (ms) => dayFmt.format(new Date(ms));
const fmtShortDay = (ms) => shortDayFmt.format(new Date(ms));
const fmtCountdown = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
/// "in 2 h 30 min" for a slot start; today's times read as a clock, later ones carry the day.
const fmtWhen = (ms) => {
  const delta = ms - now.value;
  if (delta <= 0) return 'now';
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
  return `${fmtShortDay(ms)}, ${fmtTime(ms)}`;
};
const sameLocalDay = (a, b) => {
  const x = new Date(a); const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

// ---------- settings ----------
const difficulty = ref(2);
const charLevel = ref(99);
// Heralds carry the sunder charms from tier 4 up - the tier decides whether
// an item search finds a Herald source at all.
const heraldTier = ref(1);
const actFilter = ref(0);
const onlyFavorites = ref(false);

const favorites = ref(new Set());
const notify = ref(false);
try {
  const saved = JSON.parse(localStorage.getItem('tz_favorites') ?? '[]');
  favorites.value = new Set(saved.filter((k) => zoneByKey.has(k)));
  notify.value = localStorage.getItem('tz_notify') === '1';
} catch { /* a browser without storage still gets the page */ }
const isFavorite = (zone) => favorites.value.has(zone.key);
const toggleFavorite = (zone) => {
  const next = new Set(favorites.value);
  if (next.has(zone.key)) next.delete(zone.key); else next.add(zone.key);
  favorites.value = next;
  try { localStorage.setItem('tz_favorites', JSON.stringify([...next])); } catch { /* see above */ }
};

const notifyAvailable = typeof Notification !== 'undefined';
const toggleNotify = async () => {
  if (!notifyAvailable) return;
  if (!notify.value) {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return;
  }
  notify.value = !notify.value;
  try { localStorage.setItem('tz_notify', notify.value ? '1' : '0'); } catch { /* see above */ }
};
// A favorite coming up while the tab is open - that is the whole feature; the
// page cannot ring when it is closed.
watch(currentIndex, (k, previous) => {
  if (!notify.value || previous == null || k === previous) return;
  const slot = slotAt(k);
  if (!slot || !favorites.value.has(slot.zone.key) || Notification.permission !== 'granted') return;
  try { new Notification(`Terror Zone: ${slot.zone.name}`, { body: `Terrorized until ${fmtTime(slot.end)}` }); } catch { /* blocked */ }
});

// ---------- the drop engine, in terror mode ----------
const ctx = computed(() => buildContext(dropData, {
  dataMode: 'mod',
  players: 1,
  partyNearby: 1,
  mf: 0,
  terror: { enabled: true, charLevel: charLevel.value },
  exalted: { enabled: true, percent: 5 },
  mythic: { enabled: true, percent: 5 },
  heraldTier: heraldTier.value,
}));

const areaName = (id) => dropData.Areas.find((a) => a.Id === id)?.Name ?? `Area ${id}`;
const areaLevel = (id, diff) => dropData.Areas.find((a) => a.Id === id)?.Levels[diff] ?? 0;
const superUniquesOf = (zone) => {
  const areaSet = new Set(zone.areas);
  return dropData.SuperUniques.filter((su) => su.Areas.some((a) => areaSet.has(a)));
};
const zonesContaining = (areaId) => zones.map((z, i) => (z.areas.includes(areaId) ? i : -1)).filter((i) => i >= 0);

/// Where an item-source row can be met, as zone indices. Heralds spawn in every terror zone.
const zonesForSource = (row) => {
  if (row.sourceType === 'herald') return zones.map((_, i) => i);
  if (row.superUniqueIndex != null) {
    return dropData.SuperUniques[row.superUniqueIndex].Areas.flatMap(zonesContaining);
  }
  if (row.areaId != null) return zonesContaining(row.areaId);
  // bosses have no spawn list; the exporter's curated map places them
  if (row.monsterIndex != null) return dropData.Monsters[row.monsterIndex].Areas[row.difficulty].flatMap(zonesContaining);
  return [];
};

/**
 * What a zone can drop, best chance per kill across its monsters (as unique
 * monsters, the strongest ordinary source) and superuniques. Computed once per
 * zone and setting and kept.
 */
const dropCache = new Map();
const zoneDrops = (zone) => {
  const key = `${zone.key}|${difficulty.value}|${charLevel.value}|${heraldTier.value}`;
  if (dropCache.has(key)) return dropCache.get(key);
  const diff = difficulty.value;
  const areaSet = new Set(zone.areas);
  const best = new Map();
  const consider = (row, source) => {
    if (row.kind !== 'unique' && row.kind !== 'set') return;
    const id = `${row.kind}:${row.name}`;
    const prev = best.get(id);
    if (!prev || row.chance > prev.chance) best.set(id, { ...row, source });
  };
  dropData.Monsters.forEach((monster, monsterIndex) => {
    if (monster.Boss) return;
    const areas = monster.Areas[diff].filter((a) => areaSet.has(a));
    if (areas.length === 0) return;
    const areaId = areas.reduce((top, a) => (areaLevel(a, diff) > areaLevel(top, diff) ? a : top), areas[0]);
    const { rows } = computeMonsterDrops(ctx.value, { kind: 'monster', monsterIndex, sourceType: 'unique', difficulty: diff, areaId });
    rows.forEach((row) => consider(row, { label: monster.Name, query: { monster: monster.Id, area: String(areaId), type: 'unique' } }));
  });
  dropData.SuperUniques.forEach((su, superUniqueIndex) => {
    if (!su.Areas.some((a) => areaSet.has(a))) return;
    const { rows } = computeMonsterDrops(ctx.value, { kind: 'superunique', superUniqueIndex, difficulty: diff });
    rows.forEach((row) => consider(row, { label: su.Name, query: { su: su.Id } }));
  });
  const result = [...best.values()].sort((a, b) => b.chance - a.chance);
  dropCache.set(key, result);
  return result;
};
watch([difficulty, charLevel, heraldTier], () => dropCache.clear());

// ---------- zone panel ----------
const selectedZoneKey = ref(null);
const selectedZone = computed(() => (selectedZoneKey.value != null && zoneByKey.has(selectedZoneKey.value)
  ? zones[zoneByKey.get(selectedZoneKey.value)] : null));
const selectZone = (zone) => { selectedZoneKey.value = zone ? zone.key : null; };

const dropKind = ref('all'); // all | uniques | sets | exalted
const dropQuery = ref('');
const DROP_ROW_LIMIT = 60;
const selectedZoneDrops = computed(() => {
  if (!selectedZone.value) return [];
  const q = dropQuery.value.trim().toLowerCase();
  return zoneDrops(selectedZone.value).filter((row) => {
    if (dropKind.value === 'uniques' && row.kind !== 'unique') return false;
    if (dropKind.value === 'sets' && row.kind !== 'set') return false;
    if (dropKind.value === 'exalted' && !row.variantName) return false;
    if (q && !row.name.toLowerCase().includes(q) && !row.baseName.toLowerCase().includes(q)) return false;
    return true;
  });
});

/// The next few slots a zone is up, scanning forward from the current one.
const nextOccurrences = (zoneIndex, limit = 5, includeCurrent = true) => {
  const out = [];
  const from = Math.max(0, currentIndex.value + (includeCurrent ? 0 : 1));
  for (let k = from; k < COUNT && out.length < limit; k++) {
    if (INDEX[k] === zoneIndex) out.push(slotAt(k));
  }
  return out;
};

// ---------- item search: when can I farm this? ----------
const itemKind = ref('unique');
const selectedItem = ref(null);
const itemOptions = computed(() => (itemKind.value === 'unique'
  ? dropData.Uniques.map((u, i) => ({ value: i, label: u.Name, hint: dropData.BaseItems[u.Base]?.Name ?? '', spawnable: u.Spawnable }))
  : dropData.Sets.map((s, i) => ({ value: i, label: s.Name, hint: `${s.SetName} · ${dropData.BaseItems[s.Base]?.Name ?? ''}`, spawnable: s.Spawnable })))
  .filter((o) => o.spawnable !== false));
watch(itemKind, () => { selectedItem.value = null; });

const itemName = computed(() => (selectedItem.value == null ? null
  : (itemKind.value === 'unique' ? dropData.Uniques : dropData.Sets)[selectedItem.value]?.Name ?? null));

/**
 * Where the chosen item drops, zone by zone, with the zone's next slot.
 *
 * Heralds spawn in every terror zone, so a herald source says nothing about
 * where to go; it is kept apart as a floor ("any zone: 1 in x") and the zone
 * list holds the monsters and superuniques that make one zone better than
 * another. An item only heralds carry - a sunder charm - has no such zone,
 * and then every zone is as good as the next.
 */
const itemSearch = computed(() => {
  if (selectedItem.value == null) return { zones: [], herald: null, heraldOnly: false };
  const rows = computeItemSources(ctx.value, { itemKind: itemKind.value, itemIndex: selectedItem.value, difficulty: difficulty.value });
  const herald = rows.find((row) => row.sourceType === 'herald') ?? null;
  const byZone = new Map();
  for (const row of rows) {
    if (row.sourceType === 'herald') continue;
    for (const zi of zonesForSource(row)) {
      const prev = byZone.get(zi);
      if (!prev || row.chance > prev.chance) byZone.set(zi, row);
    }
  }
  const list = [...byZone.entries()].map(([zi, row]) => {
    const next = nextOccurrences(zi, 1)[0] ?? null;
    return { zoneIndex: zi, zone: zones[zi], row, next };
  }).sort((a, b) => {
    if (!a.next && !b.next) return b.row.chance - a.row.chance;
    if (!a.next) return 1;
    if (!b.next) return -1;
    return a.next.start - b.next.start;
  });
  return { zones: list, herald, heraldOnly: list.length === 0 && herald != null };
});
const itemZones = computed(() => itemSearch.value.zones);
// The lists keep the zones with a source of their own; with heralds as the
// only source there is nothing to narrow down.
const itemZoneSet = computed(() => (itemSearch.value.heraldOnly ? null : new Set(itemZones.value.map((e) => e.zoneIndex))));

// ---------- lists ----------
const passesFilters = (zone, zoneIndex) => {
  if (actFilter.value && zone.act !== actFilter.value) return false;
  if (onlyFavorites.value && !favorites.value.has(zone.key)) return false;
  if (selectedItem.value != null && itemZoneSet.value && !itemZoneSet.value.has(zoneIndex)) return false;
  return true;
};
const filtersActive = computed(() => actFilter.value !== 0 || onlyFavorites.value || selectedItem.value != null);

const UPCOMING = 12;
const upcoming = computed(() => {
  const out = [];
  for (let k = currentIndex.value + 1; k < COUNT && out.length < UPCOMING; k++) {
    const slot = slotAt(k);
    if (passesFilters(slot.zone, slot.zoneIndex)) out.push(slot);
  }
  return out;
});

// day view - a local calendar day, whatever the visitor's zone
const toDayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayStart = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const dayKey = ref(toDayKey(Date.now()));
const dayLabel = computed(() => fmtDay(dayStart(dayKey.value)));
const daySlots = computed(() => {
  const start = dayStart(dayKey.value);
  const end = new Date(start).setDate(new Date(start).getDate() + 1);
  const out = [];
  for (let k = Math.max(0, slotIndexAt(start)); k < COUNT; k++) {
    const slot = slotAt(k);
    if (slot.start >= end) break;
    if (slot.start >= start) out.push(slot);
  }
  return out;
});
const shiftDay = (days) => {
  const d = new Date(dayStart(dayKey.value));
  d.setDate(d.getDate() + days);
  dayKey.value = toDayKey(d.getTime());
};
const isToday = computed(() => dayKey.value === toDayKey(now.value));
const dayMin = toDayKey(FIRST);
const dayMax = toDayKey(scheduleEnd - 1);

// ---------- links ----------
const dropCalcLink = (query) => ({ path: '/drop-calc', query: { tz: '1', diff: String(difficulty.value), ...(charLevel.value !== 99 ? { clvl: String(charLevel.value) } : {}), ...(heraldTier.value !== 1 ? { ht: String(heraldTier.value) } : {}), ...query } });
const itemLink = computed(() => (selectedItem.value == null ? null : {
  path: '/drop-calc',
  query: { mode: 'item', itemkind: itemKind.value, item: (itemKind.value === 'unique' ? dropData.Uniques : dropData.Sets)[selectedItem.value].Index, tz: '1', diff: String(difficulty.value) },
}));

const immunityClass = (name) => `imm-${name.toLowerCase()}`;
const fmt = (p) => formatChance(p, 'ratio');

// ---------- URL state ----------
const clampInt = (value, min, max, fallback) => {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
onMounted(() => {
  const q = route.query;
  if (q.zone && zoneByKey.has(q.zone)) selectedZoneKey.value = q.zone;
  if (q.day && /^\d{4}-\d{2}-\d{2}$/.test(q.day)) dayKey.value = q.day;
  difficulty.value = clampInt(q.diff, 0, 2, difficulty.value);
  charLevel.value = clampInt(q.clvl, 1, 99, charLevel.value);
  heraldTier.value = clampInt(q.ht, 1, 5, heraldTier.value);
  actFilter.value = clampInt(q.act, 0, 5, 0);
  if (q.fav === '1') onlyFavorites.value = true;
  if (q.kind === 'set') itemKind.value = 'set';
  if (q.item) {
    // The file carries a second, non-spawnable copy of some rows (the sunder
    // charms among them); the one the picker offers is the spawnable one.
    const list = itemKind.value === 'unique' ? dropData.Uniques : dropData.Sets;
    const matches = list.map((e, i) => (e.Index === q.item ? i : -1)).filter((i) => i >= 0);
    const idx = matches.find((i) => list[i].Spawnable !== false) ?? matches[0];
    if (idx != null) selectedItem.value = idx;
  }
});
watch([selectedZoneKey, dayKey, difficulty, charLevel, heraldTier, actFilter, onlyFavorites, itemKind, selectedItem], () => {
  const list = itemKind.value === 'unique' ? dropData.Uniques : dropData.Sets;
  router.replace({
    query: {
      ...(selectedZoneKey.value ? { zone: selectedZoneKey.value } : {}),
      ...(dayKey.value !== toDayKey(now.value) ? { day: dayKey.value } : {}),
      ...(difficulty.value !== 2 ? { diff: String(difficulty.value) } : {}),
      ...(charLevel.value !== 99 ? { clvl: String(charLevel.value) } : {}),
      ...(heraldTier.value !== 1 ? { ht: String(heraldTier.value) } : {}),
      ...(actFilter.value ? { act: String(actFilter.value) } : {}),
      ...(onlyFavorites.value ? { fav: '1' } : {}),
      ...(itemKind.value !== 'unique' ? { kind: itemKind.value } : {}),
      ...(selectedItem.value != null ? { item: list[selectedItem.value].Index } : {}),
    },
  });
});
</script>

<template>
  <div class="container py-4 page-content tz-page">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h2 mb-1">Terror Zones</h1>
        <p class="text-muted mb-0">
          Single player and offline, {{ tz.config.slotMinutes }} minutes a zone. Times in your zone ({{ timeZone }}).
        </p>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <label class="small text-muted">Difficulty</label>
        <select v-model.number="difficulty" class="form-select form-select-sm w-auto">
          <option :value="0">Normal</option>
          <option :value="1">Nightmare</option>
          <option :value="2">Hell</option>
        </select>
        <label class="small text-muted" title="Terrorized monsters follow the character level of the player who made the game">Char level</label>
        <input v-model.number="charLevel" type="number" min="1" max="99" class="form-control form-control-sm clvl" />
        <label class="small text-muted" title="Sunder charms need a tier 4+ Herald">Herald tier</label>
        <select v-model.number="heraldTier" class="form-select form-select-sm w-auto">
          <option v-for="tier in 5" :key="tier" :value="tier">{{ tier }}</option>
        </select>
      </div>
    </div>

    <!-- Schedule outside the imported range: say so instead of showing an empty clock -->
    <div v-if="coverage !== 'ok'" class="alert alert-warning">
      <template v-if="coverage === 'before'">The imported schedule starts on {{ fmtDay(FIRST) }}.</template>
      <template v-else>The imported schedule ended on {{ fmtDay(scheduleEnd) }} - the page needs a fresh import.</template>
    </div>

    <!-- Now -->
    <div v-if="current" class="card card-enhanced now-card mb-4">
      <div class="card-body p-4">
        <div class="row g-4 align-items-center">
          <div class="col-lg-7">
            <div class="section-header mb-1">Terrorized now</div>
            <div class="d-flex align-items-start gap-2">
              <button class="star" :class="{ on: isFavorite(current.zone) }" :title="isFavorite(current.zone) ? 'Remove favorite' : 'Mark as favorite'" @click="toggleFavorite(current.zone)">★</button>
              <div>
                <h2 class="now-name mb-1">
                  <a href="#" class="zone-link" @click.prevent="selectZone(current.zone)">{{ current.zone.name }}</a>
                </h2>
                <div class="d-flex flex-wrap gap-2 align-items-center small">
                  <span class="badge act-badge" :class="`act-${current.zone.act}`">Act {{ current.zone.act }}</span>
                  <span v-for="imm in current.zone.immunities" :key="imm" class="badge imm" :class="immunityClass(imm)">{{ imm }} immune</span>
                  <span v-if="current.zone.bossPacks" class="text-muted">{{ current.zone.bossPacks[0] }}–{{ current.zone.bossPacks[1] }} boss packs</span>
                </div>
              </div>
            </div>
            <div class="mt-3 small">
              <span class="text-muted">Superuniques:</span>
              <template v-if="superUniquesOf(current.zone).length">
                <router-link v-for="su in superUniquesOf(current.zone)" :key="su.Id" :to="dropCalcLink({ su: su.Id })" class="chip">{{ su.Name }}</router-link>
              </template>
              <span v-else class="text-muted">none</span>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="countdown-box">
              <div class="small text-muted">Ends {{ fmtTime(current.end) }} · remaining</div>
              <div class="countdown">{{ fmtCountdown(remainingMs) }}</div>
              <div class="progress tz-progress" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
              </div>
              <div v-if="upcoming.length && !filtersActive" class="small mt-2">
                <span class="text-muted">Next:</span>
                <a href="#" class="zone-link" @click.prevent="selectZone(upcoming[0].zone)">{{ upcoming[0].zone.name }}</a>
                <span class="text-muted"> at {{ fmtTime(upcoming[0].start) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <!-- Left: upcoming + day -->
      <div class="col-lg-7">
        <!-- Filters -->
        <div class="card card-enhanced filters-card mb-4">
          <div class="card-body p-3">
            <div class="row g-3 align-items-end">
              <div class="col-sm-4">
                <label class="form-label small text-muted mb-1">Show</label>
                <select v-model.number="actFilter" class="form-select form-select-sm">
                  <option :value="0">All acts</option>
                  <option v-for="act in 5" :key="act" :value="act">Act {{ act }} only</option>
                </select>
              </div>
              <div class="col-sm-8">
                <label class="form-label small text-muted mb-1">When can I farm…</label>
                <div class="d-flex gap-2">
                  <select v-model="itemKind" class="form-select form-select-sm w-auto">
                    <option value="unique">Unique</option>
                    <option value="set">Set</option>
                  </select>
                  <div class="flex-grow-1">
                    <SearchableSelect v-model="selectedItem" :options="itemOptions" placeholder="Pick an item - the lists keep only zones where it can drop" />
                  </div>
                  <button v-if="selectedItem != null" class="btn btn-sm btn-outline-secondary" title="Clear" @click="selectedItem = null">×</button>
                </div>
              </div>
              <div class="col-12 d-flex flex-wrap gap-3 align-items-center">
                <div class="form-check form-switch mb-0">
                  <input id="fav-only" v-model="onlyFavorites" class="form-check-input" type="checkbox" />
                  <label class="form-check-label small" for="fav-only">Favorites only <span class="text-muted">({{ favorites.size }})</span></label>
                </div>
                <div v-if="notifyAvailable" class="form-check form-switch mb-0">
                  <input id="notify" class="form-check-input" type="checkbox" :checked="notify" @change="toggleNotify" />
                  <label class="form-check-label small" for="notify" title="A browser notification when a favorite starts - only while this tab is open">Notify me when a favorite starts</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Item result -->
        <div v-if="selectedItem != null" class="card card-enhanced mb-4">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center">
            <h2 class="h5 card-title m-0">{{ itemName }} - where and when</h2>
            <router-link v-if="itemLink" :to="itemLink" class="small">all sources ›</router-link>
          </div>
          <div class="card-body p-0">
            <div v-if="itemZones.length === 0 && !itemSearch.herald" class="p-3 text-muted small">No terror zone drops this item on this difficulty.</div>
            <div v-if="itemSearch.herald" class="p-3 pb-2 small">
              <span class="text-muted">Any terror zone, from a Herald:</span> {{ fmt(itemSearch.herald.chance) }}
              <span v-if="itemSearch.herald.variantChance" class="text-muted">· variant {{ fmt(itemSearch.herald.variantChance) }}</span>
              <span v-if="itemSearch.heraldOnly" class="text-muted d-block">Only heralds carry it, so no zone beats another.</span>
            </div>
            <div v-if="itemZones.length" class="table-responsive">
              <table class="table table-sm table-hover mb-0 align-middle">
                <thead>
                  <tr><th>Zone</th><th>Next</th><th class="text-end">Best chance / kill</th><th>From</th></tr>
                </thead>
                <tbody>
                  <tr v-for="entry in itemZones" :key="entry.zoneIndex" :class="{ 'row-now': entry.next && entry.next.index === currentIndex }">
                    <td>
                      <a href="#" class="zone-link" @click.prevent="selectZone(entry.zone)">{{ entry.zone.short }}</a>
                      <span class="badge act-badge ms-1" :class="`act-${entry.zone.act}`">A{{ entry.zone.act }}</span>
                    </td>
                    <td class="text-nowrap">
                      <template v-if="entry.next">{{ entry.next.index === currentIndex ? 'now' : fmtWhen(entry.next.start) }}</template>
                      <span v-else class="text-muted">not in the imported range</span>
                    </td>
                    <td class="text-end text-nowrap">
                      {{ fmt(entry.row.chance) }}
                      <span v-if="entry.row.variantChance" class="text-muted small d-block">variant {{ fmt(entry.row.variantChance) }}</span>
                    </td>
                    <td class="small text-muted">{{ entry.row.monsterName }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Upcoming -->
        <div class="card card-enhanced mb-4">
          <div class="card-header card-header-primary">
            <h2 class="h5 card-title m-0">Coming up<span v-if="filtersActive" class="text-muted fw-normal small"> · filtered</span></h2>
          </div>
          <div class="card-body p-0">
            <div v-if="upcoming.length === 0" class="p-3 text-muted small">Nothing matches in the imported range.</div>
            <ul v-else class="list-unstyled mb-0 slot-list">
              <li v-for="slot in upcoming" :key="slot.index" class="slot-row">
                <button class="star" :class="{ on: isFavorite(slot.zone) }" @click="toggleFavorite(slot.zone)">★</button>
                <span class="slot-time">{{ sameLocalDay(slot.start, now) ? fmtTime(slot.start) : `${fmtShortDay(slot.start)} ${fmtTime(slot.start)}` }}</span>
                <a href="#" class="zone-link flex-grow-1" @click.prevent="selectZone(slot.zone)">{{ slot.zone.name }}</a>
                <span class="badge act-badge" :class="`act-${slot.zone.act}`">A{{ slot.zone.act }}</span>
                <span class="slot-when text-muted small">{{ fmtWhen(slot.start) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Day view -->
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h2 class="h5 card-title m-0">{{ dayLabel }}<span v-if="isToday" class="text-muted fw-normal small"> · today</span></h2>
            <div class="d-flex gap-1 align-items-center">
              <button class="btn btn-sm btn-outline-secondary" :disabled="dayKey <= dayMin" @click="shiftDay(-1)">‹</button>
              <input v-model="dayKey" type="date" class="form-control form-control-sm w-auto" :min="dayMin" :max="dayMax" />
              <button class="btn btn-sm btn-outline-secondary" :disabled="dayKey >= dayMax" @click="shiftDay(1)">›</button>
              <button v-if="!isToday" class="btn btn-sm btn-outline-secondary" @click="dayKey = toDayKey(now)">Today</button>
            </div>
          </div>
          <div class="card-body p-0">
            <div v-if="daySlots.length === 0" class="p-3 text-muted small">No schedule for this day.</div>
            <ul v-else class="list-unstyled mb-0 slot-list">
              <li v-for="slot in daySlots" :key="slot.index" class="slot-row"
                  :class="{ 'row-now': slot.index === currentIndex, 'row-past': slot.end <= now, 'row-dim': !passesFilters(slot.zone, slot.zoneIndex) }">
                <button class="star" :class="{ on: isFavorite(slot.zone) }" @click="toggleFavorite(slot.zone)">★</button>
                <span class="slot-time">{{ fmtTime(slot.start) }}</span>
                <a href="#" class="zone-link flex-grow-1" @click.prevent="selectZone(slot.zone)">{{ slot.zone.name }}</a>
                <span class="badge act-badge" :class="`act-${slot.zone.act}`">A{{ slot.zone.act }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Right: zone panel -->
      <div class="col-lg-5">
        <div class="card card-enhanced zone-panel">
          <template v-if="selectedZone">
            <div class="card-header card-header-primary d-flex justify-content-between align-items-start gap-2">
              <div>
                <h2 class="h5 card-title m-0">{{ selectedZone.name }}</h2>
                <div class="d-flex flex-wrap gap-2 mt-1 small">
                  <span class="badge act-badge" :class="`act-${selectedZone.act}`">Act {{ selectedZone.act }}</span>
                  <span v-for="imm in selectedZone.immunities" :key="imm" class="badge imm" :class="immunityClass(imm)">{{ imm }}</span>
                  <span v-if="selectedZone.bossPacks" class="text-muted">{{ selectedZone.bossPacks[0] }}–{{ selectedZone.bossPacks[1] }} boss packs</span>
                </div>
              </div>
              <div class="d-flex gap-1">
                <button class="star" :class="{ on: isFavorite(selectedZone) }" @click="toggleFavorite(selectedZone)">★</button>
                <button class="btn btn-sm btn-outline-secondary" title="Close" @click="selectZone(null)">×</button>
              </div>
            </div>
            <div class="card-body p-3">
              <div class="section-header mb-1">Next up</div>
              <ul class="list-unstyled mb-3 small">
                <li v-for="slot in nextOccurrences(zoneByKey.get(selectedZone.key))" :key="slot.index" :class="{ 'fw-semibold': slot.index === currentIndex }">
                  {{ slot.index === currentIndex ? 'Now, until ' + fmtTime(slot.end) : `${fmtShortDay(slot.start)} ${fmtTime(slot.start)} · ${fmtWhen(slot.start)}` }}
                </li>
                <li v-if="nextOccurrences(zoneByKey.get(selectedZone.key)).length === 0" class="text-muted">Not within the imported range.</li>
              </ul>

              <div class="section-header mb-1">Areas</div>
              <div class="d-flex flex-wrap gap-1 mb-3">
                <router-link v-for="areaId in selectedZone.areas" :key="areaId" :to="dropCalcLink({ area: String(areaId) })" class="chip"
                             :title="`Area level ${areaLevel(areaId, difficulty)} - open in the drop calculator`">{{ areaName(areaId) }}</router-link>
              </div>

              <div class="section-header mb-1">Superuniques</div>
              <div class="d-flex flex-wrap gap-1 mb-3">
                <router-link v-for="su in superUniquesOf(selectedZone)" :key="su.Id" :to="dropCalcLink({ su: su.Id })" class="chip">{{ su.Name }}</router-link>
                <span v-if="superUniquesOf(selectedZone).length === 0" class="text-muted small">none</span>
              </div>

              <div class="section-header mb-1">What can drop here</div>
              <p class="small text-muted mb-2">
                Best chance per kill on {{ ['Normal', 'Nightmare', 'Hell'][difficulty] }} at character level {{ charLevel }}, from unique monsters and
                superuniques, players 1, no magic find. The "variant" line is the exalted or mythic roll.
              </p>
              <div class="d-flex gap-2 mb-2">
                <select v-model="dropKind" class="form-select form-select-sm w-auto">
                  <option value="all">Uniques + sets</option>
                  <option value="uniques">Uniques</option>
                  <option value="sets">Sets</option>
                  <option value="exalted">With exalted / mythic roll</option>
                </select>
                <input v-model="dropQuery" class="form-control form-control-sm" placeholder="Filter by name or base" />
              </div>
              <div class="table-responsive drop-table">
                <table class="table table-sm table-hover mb-0 align-middle">
                  <thead><tr><th>Item</th><th class="text-end">Chance</th><th>Best from</th></tr></thead>
                  <tbody>
                    <tr v-for="row in selectedZoneDrops.slice(0, DROP_ROW_LIMIT)" :key="row.kind + row.name">
                      <td>
                        <span :class="row.kind === 'set' ? 'set-name' : 'unique-name'">{{ row.name }}</span>
                        <span v-if="row.mod" class="flag" :title="row.mod === 'added' ? 'Added by the mod' : 'Changed by the mod'"></span>
                        <div class="small text-muted">{{ row.baseName }}<span v-if="row.setName"> · {{ row.setName }}</span></div>
                      </td>
                      <td class="text-end text-nowrap">
                        {{ fmt(row.chance) }}
                        <div v-if="row.variantChance" class="small text-muted">variant {{ fmt(row.variantChance) }}</div>
                      </td>
                      <td class="small"><router-link :to="dropCalcLink(row.source.query)" class="text-muted">{{ row.source.label }}</router-link></td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="selectedZoneDrops.length > DROP_ROW_LIMIT" class="small text-muted p-2">
                  {{ selectedZoneDrops.length - DROP_ROW_LIMIT }} more - narrow it down with the filter, or open an area in the drop calculator.
                </div>
                <div v-if="selectedZoneDrops.length === 0" class="small text-muted p-2">Nothing matches.</div>
              </div>
            </div>
          </template>
          <div v-else class="card-body p-4 text-muted">
            <div class="section-header mb-2">Zone details</div>
            <p class="mb-2">Pick a zone from the lists - or from this overview - to see its next slots, its areas and superuniques with links into the drop calculator, and what it can drop in terror mode.</p>
            <div class="zone-grid">
              <button v-for="(zone, zi) in zones" :key="zone.key" class="zone-tile" :class="{ dim: !passesFilters(zone, zi), fav: isFavorite(zone) }" @click="selectZone(zone)">
                <span class="badge act-badge" :class="`act-${zone.act}`">A{{ zone.act }}</span>
                <span class="tile-name">{{ zone.short }}</span>
                <span class="tile-next">{{ nextOccurrences(zi, 1)[0] ? (nextOccurrences(zi, 1)[0].index === currentIndex ? 'now' : fmtWhen(nextOccurrences(zi, 1)[0].start)) : '—' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="small text-muted mt-4 mb-0 source-note">
      Zones and levels from the game's <code>desecratedzones.json</code>; areas, superuniques and drop odds from this site's data.
      The slot sequence is imported from <a :href="tz.source.page" target="_blank" rel="noopener">{{ tz.source.name }}</a>
      (imported {{ new Date(tz.generatedAt).toLocaleDateString() }}, covers until {{ fmtDay(scheduleEnd) }}<template v-if="daysLeft >= 0">, {{ daysLeft }} days</template>).
      Blizzard's generator behind the seed is not public; when it is, the import goes away.
    </p>
  </div>
</template>

<style scoped>
.clvl { width: 4.5rem; }

/* the theme's .card clips overflow (rounded corners) - the item picker's
   dropdown has to escape the card, as it does on the drop calculator */
.filters-card { overflow: visible; }

.now-card { border-color: var(--d2r-gold); }
.now-name { font-family: var(--font-display); font-size: 1.6rem; line-height: 1.2; }
.zone-link { color: var(--d2r-gold-bright); text-decoration: none; }
.zone-link:hover { text-decoration: underline; }

.countdown-box { text-align: center; }
.countdown { font-family: var(--font-display); font-size: 2.6rem; line-height: 1.1; color: var(--d2r-gold-bright); }
.tz-progress { height: 6px; background: rgba(255, 255, 255, 0.08); }
.tz-progress .progress-bar { background: var(--d2r-gold); transition: width 1s linear; }

.act-badge { background: rgba(255, 255, 255, 0.08); color: var(--d2r-text); font-weight: 600; }
.act-1 { background: rgba(120, 160, 90, 0.35); }
.act-2 { background: rgba(200, 160, 70, 0.35); }
.act-3 { background: rgba(70, 150, 120, 0.35); }
.act-4 { background: rgba(190, 80, 60, 0.35); }
.act-5 { background: rgba(110, 140, 200, 0.35); }

.imm { background: rgba(255, 255, 255, 0.06); color: var(--d2r-text); font-weight: 500; }
.imm-cold { color: #8fd3ff; }
.imm-fire { color: #ff9a5c; }
.imm-lightning { color: #ffe97a; }
.imm-poison { color: #9fe870; }
.imm-physical { color: #e0d6c2; }
.imm-magic { color: #d7a6ff; }

.star {
  background: none; border: 0; padding: 0 0.25rem; line-height: 1;
  color: var(--d2r-muted); font-size: 1.1rem; cursor: pointer;
}
.star.on { color: var(--d2r-gold-bright); }
.star:hover { color: var(--d2r-gold); }

.chip {
  display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px;
  background: rgba(255, 255, 255, 0.06); color: var(--d2r-text); font-size: 0.82rem; text-decoration: none;
  margin: 0 0.15rem 0.15rem 0;
}
.chip:hover { background: rgba(255, 255, 255, 0.12); color: var(--d2r-gold-bright); }

.slot-list .slot-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.35rem 0.75rem; border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.slot-list .slot-row:first-child { border-top: 0; }
.slot-time { font-variant-numeric: tabular-nums; min-width: 3.4rem; color: var(--d2r-muted); }
.slot-when { min-width: 6rem; text-align: right; }
.row-now { background: rgba(212, 175, 55, 0.12); }
.row-now .slot-time { color: var(--d2r-gold-bright); font-weight: 600; }
.row-past { opacity: 0.55; }
.row-dim { opacity: 0.35; }

.zone-panel { position: sticky; top: 1rem; }
.drop-table { max-height: 28rem; overflow-y: auto; }
.unique-name { color: #c7b377; }
.set-name { color: #7fdc7f; }
.flag {
  display: inline-block; width: 0.45rem; height: 0.45rem; border-radius: 50%;
  background: var(--d2r-gold); margin-left: 0.35rem; vertical-align: middle; opacity: 0.8;
}

.zone-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.4rem; }
.zone-tile {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem;
  padding: 0.45rem 0.55rem; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.03); color: var(--d2r-text); text-align: left; cursor: pointer;
}
.zone-tile:hover { border-color: var(--d2r-gold); }
.zone-tile.fav { border-color: rgba(212, 175, 55, 0.6); }
.zone-tile.dim { opacity: 0.35; }
.tile-name { font-size: 0.85rem; line-height: 1.15; }
.tile-next { font-size: 0.75rem; color: var(--d2r-muted); }

.source-note a { color: var(--d2r-gold); }

@media (max-width: 991px) {
  .zone-panel { position: static; }
}
</style>
