<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import tz from '@/assets/terror_zones.json';
import dropData from '@/assets/dropcalc.json';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { buildContext, computeMonsterDrops, computeItemSources, formatChance } from '@/composables/useDropSimulation.js';
import { downloadIcs } from '@/composables/useCalendar.js';
import { t } from '@/i18n';
import { ELEMENTS, ELEMENT_SHORT, elementClass, areaImmunities as areaImmunitiesOf, farmableElements as farmableElementsOf, blockedElements as blockedElementsOf } from '@/composables/useImmunities.js';

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
  if (delta <= 0) return t('now');
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return t('in {n} min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('in {h} h {m} min', { h: hours, m: String(minutes % 60).padStart(2, '0') });
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
// the favorites' slots for the next two weeks as calendar events
const exportFavorites = () => {
  const from = Math.max(0, currentIndex.value);
  const to = Math.min(COUNT, from + (14 * 24 * 60) / tz.config.slotMinutes);
  const events = [];
  for (let k = from; k < to; k++) {
    const zone = zones[INDEX[k]];
    if (!favorites.value.has(zone.key)) continue;
    const slot = slotAt(k);
    events.push({
      uid: `tz-${k}-${zone.key}@relicsofsanctuary.com`, start: slot.start, end: slot.end,
      summary: t('Terror zone: {zone}', { zone: zone.short }), description: `${zone.name}${zone.boss ? ` · ${zone.boss}` : ''}`,
      url: `https://relicsofsanctuary.com/#/terror-zones?zone=${encodeURIComponent(zone.key)}`,
    });
  }
  downloadIcs(`relics-terror-zones-${new Date().toISOString().slice(0, 10)}.ics`, events, { name: `Relics of Sanctuary · ${t('Terror Zones')}` });
};
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
  try { new Notification(t('Terror Zone: {zone}', { zone: slot.zone.name }), { body: t('Terrorized until {time}', { time: fmtTime(slot.end) }) }); } catch { /* blocked */ }
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

// ---------- elements: what a zone can be farmed with ----------
const areaImmunities = (areaId, diff) => areaImmunitiesOf(dropData, areaId, diff);
const farmableElements = (zone, diff) => farmableElementsOf(dropData, zone, diff);
const blockedElements = (zone, diff) => blockedElementsOf(dropData, zone, diff);
const elementFilter = ref(new Set());
const toggleElement = (e) => {
  const next = new Set(elementFilter.value);
  if (next.has(e)) next.delete(e); else next.add(e);
  elementFilter.value = next;
};

const areaName = (id) => dropData.Areas.find((a) => a.Id === id)?.Name ?? t('Area {id}', { id });
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
 * monsters, the strongest ordinary source) and superuniques - and what its
 * runes look like: the highest one any source there reaches, and the ordinary
 * monster that pays best per kill, since runes are farmed by the hundred and
 * not by the boss. Computed once per zone and setting and kept.
 */
const HIGH_RUNE = 21; // Pul - where a rune starts to be worth the run on its own
const runeNumber = (row) => {
  const match = /^r(\d+)$/.exec(dropData.BaseItems[row.baseIndex]?.Code ?? '');
  return match ? Number(match[1]) : 0;
};
const runeName = (number) => (dropData.BaseItems.find((b) => b.Code === `r${String(number).padStart(2, '0')}`)?.Name ?? '').replace(/ Rune$/, '');
const dropCache = new Map();
const zoneDrops = (zone) => {
  const key = `${zone.key}|${difficulty.value}|${charLevel.value}|${heraldTier.value}`;
  if (dropCache.has(key)) return dropCache.get(key);
  const diff = difficulty.value;
  const areaSet = new Set(zone.areas);
  const best = new Map();
  const runes = { max: 0, any: null, high: null };
  const consider = (row, source) => {
    if (row.kind !== 'unique' && row.kind !== 'set') return;
    const id = `${row.kind}:${row.name}`;
    const prev = best.get(id);
    if (!prev || row.chance > prev.chance) best.set(id, { ...row, source });
  };
  const considerRunes = (rows, source, ordinary) => {
    let any = 0; let high = 0;
    for (const row of rows) {
      if (row.kind !== 'base' || !row.isRune) continue;
      const number = runeNumber(row);
      if (row.chance > 0 && number > runes.max) runes.max = number;
      any += row.chance;
      if (number >= HIGH_RUNE) high += row.chance;
    }
    if (!ordinary) return;
    if (any > 0 && (!runes.any || any > runes.any.chance)) runes.any = { chance: any, source };
    if (high > 0 && (!runes.high || high > runes.high.chance)) runes.high = { chance: high, source };
  };
  dropData.Monsters.forEach((monster, monsterIndex) => {
    if (monster.Boss) return;
    const areas = monster.Areas[diff].filter((a) => areaSet.has(a));
    if (areas.length === 0) return;
    const areaId = areas.reduce((top, a) => (areaLevel(a, diff) > areaLevel(top, diff) ? a : top), areas[0]);
    const unique = computeMonsterDrops(ctx.value, { kind: 'monster', monsterIndex, sourceType: 'unique', difficulty: diff, areaId });
    unique.rows.forEach((row) => consider(row, { label: monster.Name, query: { monster: monster.Id, area: String(areaId), type: 'unique' } }));
    considerRunes(unique.rows, null, false);
    const normal = computeMonsterDrops(ctx.value, { kind: 'monster', monsterIndex, sourceType: 'normal', difficulty: diff, areaId });
    considerRunes(normal.rows, { label: monster.Name, query: { monster: monster.Id, area: String(areaId), filter: 'runes', rv: 'better' } }, true);
  });
  dropData.SuperUniques.forEach((su, superUniqueIndex) => {
    if (!su.Areas.some((a) => areaSet.has(a))) return;
    const { rows } = computeMonsterDrops(ctx.value, { kind: 'superunique', superUniqueIndex, difficulty: diff });
    rows.forEach((row) => consider(row, { label: su.Name, query: { su: su.Id } }));
    considerRunes(rows, null, false);
  });
  const result = { items: [...best.values()].sort((a, b) => b.chance - a.chance), runes };
  dropCache.set(key, result);
  return result;
};
watch([difficulty, charLevel, heraldTier], () => dropCache.clear());

// ---------- zone panel ----------
const selectedZoneKey = ref(null);
const selectedZone = computed(() => (selectedZoneKey.value != null && zoneByKey.has(selectedZoneKey.value)
  ? zones[zoneByKey.get(selectedZoneKey.value)] : null));
const selectZone = (zone) => { selectedZoneKey.value = zone ? zone.key : null; };
const selectedZoneRunes = computed(() => (selectedZone.value ? zoneDrops(selectedZone.value).runes : null));

const dropKind = ref('all'); // all | uniques | sets
const dropQuery = ref('');
const DROP_ROW_LIMIT = 60;
const selectedZoneDrops = computed(() => {
  if (!selectedZone.value) return [];
  const q = dropQuery.value.trim().toLowerCase();
  return zoneDrops(selectedZone.value).items.filter((row) => {
    if (dropKind.value === 'uniques' && row.kind !== 'unique') return false;
    if (dropKind.value === 'sets' && row.kind !== 'set') return false;
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
const selectedItem = ref(null); // an item name; every spawnable row with it counts
const itemList = computed(() => (itemKind.value === 'unique' ? dropData.Uniques : dropData.Sets));
// one option per name - the eight Rainbow Facets are one search, not eight
const itemOptions = computed(() => {
  const seen = new Map();
  itemList.value.forEach((e) => {
    if (e.Spawnable === false) return;
    const base = dropData.BaseItems[e.Base]?.Name ?? '';
    const hint = itemKind.value === 'unique' ? base : `${e.SetName} · ${base}`;
    const prev = seen.get(e.Name);
    if (!prev) seen.set(e.Name, { value: e.Name, label: e.Name, hint, count: 1 });
    else { prev.count += 1; if (!prev.hint.includes(base)) prev.hint += `, ${base}`; }
  });
  return [...seen.values()].map((o) => (o.count > 1 ? { ...o, hint: `${o.hint} · ${t('{n} variants', { n: o.count })}` } : o));
});
watch(itemKind, () => { selectedItem.value = null; });

const itemName = computed(() => selectedItem.value);
const itemRows = computed(() => (selectedItem.value == null ? []
  : itemList.value.map((e, i) => (e.Name === selectedItem.value && e.Spawnable !== false ? i : -1)).filter((i) => i >= 0)));

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
  if (selectedItem.value == null || itemRows.value.length === 0) return { zones: [], herald: null, heraldOnly: false };
  // rows of the same name are the same wish: one source's chances add up
  const merged = new Map();
  for (const itemIndex of itemRows.value) {
    for (const row of computeItemSources(ctx.value, { itemKind: itemKind.value, itemIndex, difficulty: difficulty.value })) {
      const key = `${row.sourceType}|${row.monsterIndex ?? ''}|${row.superUniqueIndex ?? ''}|${row.areaId ?? ''}`;
      const prev = merged.get(key);
      if (prev) prev.chance += row.chance; else merged.set(key, { ...row });
    }
  }
  const rows = [...merged.values()];
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
  if (elementFilter.value.size) {
    const ok = farmableElements(zone, difficulty.value);
    for (const e of elementFilter.value) if (!ok.includes(e)) return false;
  }
  if (onlyFavorites.value && !favorites.value.has(zone.key)) return false;
  if (selectedItem.value != null && itemZoneSet.value && !itemZoneSet.value.has(zoneIndex)) return false;
  return true;
};
const filtersActive = computed(() => actFilter.value !== 0 || onlyFavorites.value || selectedItem.value != null || elementFilter.value.size > 0);

const nextSlot = computed(() => slotAt(currentIndex.value + 1));
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
  query: { mode: 'item', itemkind: itemKind.value, item: itemList.value[itemRows.value[0]].Index, tz: '1', diff: String(difficulty.value) },
}));

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
  if (q.el) elementFilter.value = new Set(String(q.el).split(',').filter((e) => ELEMENTS.includes(e)));
  if (q.fav === '1') onlyFavorites.value = true;
  if (q.kind === 'set') itemKind.value = 'set';
  if (q.item) {
    const list = itemKind.value === 'unique' ? dropData.Uniques : dropData.Sets;
    // by name; older links carried the row's index
    const byName = list.find((e) => e.Name === q.item && e.Spawnable !== false) ?? list.find((e) => e.Index === q.item);
    if (byName) selectedItem.value = byName.Name;
  }
});
watch([selectedZoneKey, dayKey, difficulty, charLevel, heraldTier, actFilter, onlyFavorites, itemKind, selectedItem, elementFilter], () => {
  router.replace({
    query: {
      ...(selectedZoneKey.value ? { zone: selectedZoneKey.value } : {}),
      ...(dayKey.value !== toDayKey(now.value) ? { day: dayKey.value } : {}),
      ...(difficulty.value !== 2 ? { diff: String(difficulty.value) } : {}),
      ...(charLevel.value !== 99 ? { clvl: String(charLevel.value) } : {}),
      ...(heraldTier.value !== 1 ? { ht: String(heraldTier.value) } : {}),
      ...(actFilter.value ? { act: String(actFilter.value) } : {}),
      ...(elementFilter.value.size ? { el: ELEMENTS.filter((e) => elementFilter.value.has(e)).join(',') } : {}),
      ...(onlyFavorites.value ? { fav: '1' } : {}),
      ...(itemKind.value !== 'unique' ? { kind: itemKind.value } : {}),
      ...(selectedItem.value != null ? { item: selectedItem.value } : {}),
    },
  });
});
</script>

<template>
  <div class="container py-4 page-content tz-page">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h2 mb-1">{{ $t('Terror Zones') }}</h1>
        <p class="text-muted mb-0">
          {{ $t('Single player and offline, {n} minutes a zone. Times in your zone ({zone}).', { n: tz.config.slotMinutes, zone: timeZone }) }}
        </p>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <label class="small text-muted">{{ $t('Difficulty') }}</label>
        <select v-model.number="difficulty" class="form-select form-select-sm w-auto">
          <option :value="0">{{ $t('Normal') }}</option>
          <option :value="1">{{ $t('Nightmare') }}</option>
          <option :value="2">{{ $t('Hell') }}</option>
        </select>
        <label class="small text-muted" :title="$t('Terrorized monsters follow the character level of the player who made the game')">{{ $t('Char level') }}</label>
        <input v-model.number="charLevel" type="number" min="1" max="99" class="form-control form-control-sm clvl" />
        <label class="small text-muted" :title="$t('Sunder charms need a tier 4+ Herald')">{{ $t('Herald tier') }}</label>
        <select v-model.number="heraldTier" class="form-select form-select-sm w-auto">
          <option v-for="tier in 5" :key="tier" :value="tier">{{ tier }}</option>
        </select>
      </div>
    </div>

    <!-- Schedule outside the imported range: say so instead of showing an empty clock -->
    <div v-if="coverage !== 'ok'" class="alert alert-warning">
      <template v-if="coverage === 'before'">{{ $t('The imported schedule starts on {day}.', { day: fmtDay(FIRST) }) }}</template>
      <template v-else>{{ $t('The imported schedule ended on {day} - the page needs a fresh import.', { day: fmtDay(scheduleEnd) }) }}</template>
    </div>

    <!-- Now -->
    <div v-if="current" class="card card-enhanced now-card mb-4">
      <div class="card-body p-4">
        <div class="row g-4 align-items-center">
          <div class="col-lg-7">
            <div class="section-header mb-1">{{ $t('Terrorized now') }}</div>
            <div class="d-flex align-items-start gap-2">
              <button class="star" :class="{ on: isFavorite(current.zone) }" :title="isFavorite(current.zone) ? $t('Remove favorite') : $t('Mark as favorite')" @click="toggleFavorite(current.zone)">★</button>
              <div>
                <h2 class="now-name mb-1">
                  <a href="#" class="zone-link" @click.prevent="selectZone(current.zone)">{{ current.zone.name }}</a>
                </h2>
                <div class="d-flex flex-wrap gap-2 align-items-center small">
                  <span class="badge act-badge" :class="`act-${current.zone.act}`">{{ $t('Act {n}', { n: current.zone.act }) }}</span>
                  <span v-if="current.zone.boss" class="badge boss-badge" :title="$t(`{boss}'s zone`, { boss: current.zone.boss })">{{ current.zone.boss }}</span>
                  <span v-if="current.zone.bossPacks" class="text-muted">{{ $t('{min}–{max} boss packs', { min: current.zone.bossPacks[0], max: current.zone.bossPacks[1] }) }}</span>
                </div>
                <div class="mt-2 small d-flex flex-wrap gap-1 align-items-center">
                  <span class="text-muted me-1">{{ $t('Farm with:') }}</span>
                  <span v-for="e in farmableElements(current.zone, difficulty)" :key="e" class="badge el" :class="elementClass(e)">{{ $t(e) }}</span>
                  <span v-if="blockedElements(current.zone, difficulty).length" class="text-muted ms-2">
                    {{ $t('immune everywhere: {list}', { list: blockedElements(current.zone, difficulty).map((e) => $t(e)).join(', ') }) }}
                  </span>
                </div>
              </div>
            </div>
            <div class="mt-3 small">
              <span class="text-muted">{{ $t('Superuniques:') }}</span>
              <template v-if="superUniquesOf(current.zone).length">
                <router-link v-for="su in superUniquesOf(current.zone)" :key="su.Id" :to="dropCalcLink({ su: su.Id })" class="chip">{{ su.Name }}</router-link>
              </template>
              <span v-else class="text-muted">{{ $t('none') }}</span>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="countdown-box">
              <div class="small text-muted">{{ $t('Ends {time} · remaining', { time: fmtTime(current.end) }) }}</div>
              <div class="countdown">{{ fmtCountdown(remainingMs) }}</div>
              <div class="progress tz-progress" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
              </div>
              <div v-if="nextSlot" class="next-up mt-2">
                <span class="text-muted small">{{ $t('Next, {time}:', { time: fmtTime(nextSlot.start) }) }}</span>
                <a href="#" class="zone-link" @click.prevent="selectZone(nextSlot.zone)">{{ nextSlot.zone.name }}</a>
                <span class="badge act-badge ms-1" :class="`act-${nextSlot.zone.act}`">A{{ nextSlot.zone.act }}</span>
                <span v-if="nextSlot.zone.boss" class="badge boss-badge ms-1">{{ nextSlot.zone.boss }}</span>
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
                <label class="form-label small text-muted mb-1">{{ $t('Show') }}</label>
                <select v-model.number="actFilter" class="form-select form-select-sm">
                  <option :value="0">{{ $t('All acts') }}</option>
                  <option v-for="act in 5" :key="act" :value="act">{{ $t('Act {n} only', { n: act }) }}</option>
                </select>
              </div>
              <div class="col-sm-8">
                <label class="form-label small text-muted mb-1">{{ $t('When can I farm…') }}</label>
                <div class="d-flex gap-2">
                  <select v-model="itemKind" class="form-select form-select-sm w-auto">
                    <option value="unique">{{ $t('Unique') }}</option>
                    <option value="set">{{ $t('Set') }}</option>
                  </select>
                  <div class="flex-grow-1">
                    <SearchableSelect v-model="selectedItem" :options="itemOptions" :placeholder="$t('Pick an item - the lists keep only zones where it can drop')" />
                  </div>
                  <button v-if="selectedItem != null" class="btn btn-sm btn-outline-secondary" :title="$t('Clear')" @click="selectedItem = null">×</button>
                </div>
              </div>
              <div class="col-12 d-flex flex-wrap gap-1 align-items-center">
                <span class="small text-muted me-1" :title="$t('Keeps the zones where at least one area has no monster immune to the element')">{{ $t('Farmable with') }}</span>
                <button v-for="e in ELEMENTS" :key="e" class="btn btn-sm el-toggle" :class="[elementClass(e), { active: elementFilter.has(e) }]" @click="toggleElement(e)">{{ $t(e) }}</button>
              </div>
              <div class="col-12 d-flex flex-wrap gap-3 align-items-center">
                <div class="form-check form-switch mb-0">
                  <input id="fav-only" v-model="onlyFavorites" class="form-check-input" type="checkbox" />
                  <label class="form-check-label small" for="fav-only">{{ $t('Favorites only') }} <span class="text-muted">({{ favorites.size }})</span></label>
                </div>
                <div v-if="notifyAvailable" class="form-check form-switch mb-0">
                  <input id="notify" class="form-check-input" type="checkbox" :checked="notify" @change="toggleNotify" />
                  <label class="form-check-label small" for="notify" :title="$t('A browser notification when a favorite starts - only while this tab is open')">{{ $t('Notify me when a favorite starts') }}</label>
                </div>
                <button class="btn btn-sm btn-outline-secondary" :disabled="!favorites.size" :title="$t('An .ics file with every slot of your favorites in the next two weeks - import it once and the phone rings when Travincal is up')" @click="exportFavorites">{{ $t('Favorites to calendar') }}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Item result -->
        <div v-if="selectedItem != null" class="card card-enhanced mb-4">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center">
            <h2 class="h5 card-title m-0">{{ $t('{item} - where and when', { item: itemName }) }}</h2>
            <router-link v-if="itemLink" :to="itemLink" class="small">{{ $t('all sources') }} ›</router-link>
          </div>
          <div class="card-body p-0">
            <div v-if="itemZones.length === 0 && !itemSearch.herald" class="p-3 text-muted small">{{ $t('No terror zone drops this item on this difficulty.') }}</div>
            <div v-if="itemSearch.herald" class="p-3 pb-2 small">
              <span class="text-muted">{{ $t('Any terror zone, from a Herald:') }}</span> {{ fmt(itemSearch.herald.chance) }}
              <span v-if="itemSearch.heraldOnly" class="text-muted d-block">{{ $t('Only heralds carry it, so no zone beats another.') }}</span>
            </div>
            <div v-if="itemZones.length" class="table-responsive">
              <table class="table table-dark table-sm table-hover mb-0 align-middle">
                <thead>
                  <tr><th>{{ $t('Zone') }}</th><th>{{ $t('Next') }}</th><th class="text-end">{{ $t('Best chance / kill') }}</th><th>{{ $t('From') }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="entry in itemZones" :key="entry.zoneIndex" :class="{ 'row-now': entry.next && entry.next.index === currentIndex }">
                    <td>
                      <a href="#" class="zone-link" @click.prevent="selectZone(entry.zone)">{{ entry.zone.short }}</a>
                      <span class="badge act-badge ms-1" :class="`act-${entry.zone.act}`">A{{ entry.zone.act }}</span>
                      <span v-if="entry.zone.boss" class="badge boss-badge ms-1">{{ entry.zone.boss }}</span>
                    </td>
                    <td class="text-nowrap">
                      <template v-if="entry.next">{{ entry.next.index === currentIndex ? $t('now') : fmtWhen(entry.next.start) }}</template>
                      <span v-else class="text-muted">{{ $t('not in the imported range') }}</span>
                    </td>
                    <td class="text-end text-nowrap">{{ fmt(entry.row.chance) }}</td>
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
            <h2 class="h5 card-title m-0">{{ $t('Coming up') }}<span v-if="filtersActive" class="text-muted fw-normal small"> · {{ $t('filtered') }}</span></h2>
          </div>
          <div class="card-body p-0">
            <div v-if="upcoming.length === 0" class="p-3 text-muted small">{{ $t('Nothing matches in the imported range.') }}</div>
            <ul v-else class="list-unstyled mb-0 slot-list">
              <li v-for="slot in upcoming" :key="slot.index" class="slot-row" :class="{ 'row-boss': slot.zone.boss }">
                <button class="star" :class="{ on: isFavorite(slot.zone) }" @click="toggleFavorite(slot.zone)">★</button>
                <span class="slot-time">{{ sameLocalDay(slot.start, now) ? fmtTime(slot.start) : `${fmtShortDay(slot.start)} ${fmtTime(slot.start)}` }}</span>
                <a href="#" class="zone-link flex-grow-1" @click.prevent="selectZone(slot.zone)">{{ slot.zone.name }}<span v-if="slot.zone.boss" class="badge boss-badge ms-2">{{ slot.zone.boss }}</span></a>
                <span class="el-row"><span v-for="e in farmableElements(slot.zone, difficulty)" :key="e" class="el-dot" :class="elementClass(e)" :title="$t('{el}: farmable', { el: $t(e) })">{{ $t(ELEMENT_SHORT[e]) }}</span></span>
                <span class="badge act-badge" :class="`act-${slot.zone.act}`">A{{ slot.zone.act }}</span>
                <span class="slot-when text-muted small">{{ fmtWhen(slot.start) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Day view -->
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h2 class="h5 card-title m-0">{{ dayLabel }}<span v-if="isToday" class="text-muted fw-normal small"> · {{ $t('today') }}</span></h2>
            <div class="d-flex gap-1 align-items-center">
              <button class="btn btn-sm btn-outline-secondary" :disabled="dayKey <= dayMin" @click="shiftDay(-1)">‹</button>
              <input v-model="dayKey" type="date" class="form-control form-control-sm w-auto" :min="dayMin" :max="dayMax" />
              <button class="btn btn-sm btn-outline-secondary" :disabled="dayKey >= dayMax" @click="shiftDay(1)">›</button>
              <button v-if="!isToday" class="btn btn-sm btn-outline-secondary" @click="dayKey = toDayKey(now)">{{ $t('Today') }}</button>
            </div>
          </div>
          <div class="card-body p-0">
            <div v-if="daySlots.length === 0" class="p-3 text-muted small">{{ $t('No schedule for this day.') }}</div>
            <ul v-else class="list-unstyled mb-0 slot-list">
              <li v-for="slot in daySlots" :key="slot.index" class="slot-row"
                  :class="{ 'row-now': slot.index === currentIndex, 'row-past': slot.end <= now, 'row-dim': !passesFilters(slot.zone, slot.zoneIndex), 'row-boss': slot.zone.boss }">
                <button class="star" :class="{ on: isFavorite(slot.zone) }" @click="toggleFavorite(slot.zone)">★</button>
                <span class="slot-time">{{ fmtTime(slot.start) }}</span>
                <a href="#" class="zone-link flex-grow-1" @click.prevent="selectZone(slot.zone)">{{ slot.zone.name }}<span v-if="slot.zone.boss" class="badge boss-badge ms-2">{{ slot.zone.boss }}</span></a>
                <span class="el-row"><span v-for="e in farmableElements(slot.zone, difficulty)" :key="e" class="el-dot" :class="elementClass(e)" :title="$t('{el}: farmable', { el: $t(e) })">{{ $t(ELEMENT_SHORT[e]) }}</span></span>
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
                  <span class="badge act-badge" :class="`act-${selectedZone.act}`">{{ $t('Act {n}', { n: selectedZone.act }) }}</span>
                  <span v-if="selectedZone.boss" class="badge boss-badge">{{ selectedZone.boss }}</span>
                  <span v-if="selectedZone.bossPacks" class="text-muted">{{ $t('{min}–{max} boss packs', { min: selectedZone.bossPacks[0], max: selectedZone.bossPacks[1] }) }}</span>
                </div>
                <div class="d-flex flex-wrap gap-1 mt-2 small align-items-center">
                  <span class="text-muted me-1">{{ $t('Farm with:') }}</span>
                  <span v-for="e in farmableElements(selectedZone, difficulty)" :key="e" class="badge el" :class="elementClass(e)">{{ $t(e) }}</span>
                </div>
              </div>
              <div class="d-flex gap-1">
                <button class="star" :class="{ on: isFavorite(selectedZone) }" @click="toggleFavorite(selectedZone)">★</button>
                <button class="btn btn-sm btn-outline-secondary" :title="$t('Close')" @click="selectZone(null)">×</button>
              </div>
            </div>
            <div class="card-body p-3">
              <div class="section-header mb-1">{{ $t('Next up') }}</div>
              <ul class="list-unstyled mb-3 small">
                <li v-for="slot in nextOccurrences(zoneByKey.get(selectedZone.key))" :key="slot.index" :class="{ 'fw-semibold': slot.index === currentIndex }">
                  {{ slot.index === currentIndex ? $t('Now, until {time}', { time: fmtTime(slot.end) }) : `${fmtShortDay(slot.start)} ${fmtTime(slot.start)} · ${fmtWhen(slot.start)}` }}
                </li>
                <li v-if="nextOccurrences(zoneByKey.get(selectedZone.key)).length === 0" class="text-muted">{{ $t('Not within the imported range.') }}</li>
              </ul>

              <div class="section-header mb-1">{{ $t('Areas') }}</div>
              <ul class="list-unstyled mb-3 small area-list">
                <li v-for="areaId in selectedZone.areas" :key="areaId" class="d-flex flex-wrap align-items-center gap-1">
                  <router-link :to="dropCalcLink({ area: String(areaId) })" class="chip"
                               :title="$t('Area level {lvl} - open in the drop calculator', { lvl: areaLevel(areaId, difficulty) })">{{ areaName(areaId) }}</router-link>
                  <span v-if="areaImmunities(areaId, difficulty).size" class="text-muted">{{ $t('immune:') }}</span>
                  <span v-for="e in ELEMENTS.filter((x) => areaImmunities(areaId, difficulty).has(x))" :key="e" class="el-dot" :class="elementClass(e)">{{ $t(ELEMENT_SHORT[e]) }}</span>
                  <span v-if="!areaImmunities(areaId, difficulty).size" class="text-muted">{{ $t('no immunities') }}</span>
                </li>
              </ul>

              <div class="section-header mb-1">{{ $t('Superuniques') }}</div>
              <div class="d-flex flex-wrap gap-1 mb-3">
                <router-link v-for="su in superUniquesOf(selectedZone)" :key="su.Id" :to="dropCalcLink({ su: su.Id })" class="chip">{{ su.Name }}</router-link>
                <span v-if="superUniquesOf(selectedZone).length === 0" class="text-muted small">{{ $t('none') }}</span>
              </div>

              <div class="section-header mb-1">{{ $t('Runes') }}</div>
              <div v-if="selectedZoneRunes" class="rune-box mb-3 small">
                <div v-if="selectedZoneRunes.max">
                  <span class="text-muted">{{ $t('Highest rune here:') }}</span> <strong class="rune-name">{{ runeName(selectedZoneRunes.max) }}</strong>
                </div>
                <div v-if="selectedZoneRunes.any">
                  <span class="text-muted">{{ $t('Any rune, per ordinary kill:') }}</span> {{ fmt(selectedZoneRunes.any.chance) }}
                  <span class="text-muted">· {{ $t('best from') }}</span>
                  <router-link :to="dropCalcLink(selectedZoneRunes.any.source.query)" class="text-muted">{{ selectedZoneRunes.any.source.label }}</router-link>
                </div>
                <div v-if="selectedZoneRunes.high">
                  <span class="text-muted">{{ $t('Pul or better, per ordinary kill:') }}</span> {{ fmt(selectedZoneRunes.high.chance) }}
                  <span class="text-muted">· {{ $t('best from') }}</span>
                  <router-link :to="dropCalcLink(selectedZoneRunes.high.source.query)" class="text-muted">{{ selectedZoneRunes.high.source.label }}</router-link>
                </div>
                <div v-if="!selectedZoneRunes.max" class="text-muted">{{ $t(`No rune drops from this zone's tables.`) }}</div>
              </div>

              <div class="section-header mb-1">{{ $t('What can drop here') }}</div>
              <p class="small text-muted mb-2">
                {{ $t('Best chance per kill on {diff} at character level {lvl}, from unique monsters and superuniques, players 1, no magic find.', { diff: $t(['Normal', 'Nightmare', 'Hell'][difficulty]), lvl: charLevel }) }}
              </p>
              <div class="d-flex gap-2 mb-2">
                <select v-model="dropKind" class="form-select form-select-sm w-auto">
                  <option value="all">{{ $t('Uniques + sets') }}</option>
                  <option value="uniques">{{ $t('Uniques') }}</option>
                  <option value="sets">{{ $t('Sets') }}</option>
                </select>
                <input v-model="dropQuery" class="form-control form-control-sm" :placeholder="$t('Filter by name or base')" />
              </div>
              <div class="table-responsive drop-table">
                <table class="table table-dark table-sm table-hover mb-0 align-middle">
                  <thead><tr><th>{{ $t('Item') }}</th><th class="text-end">{{ $t('Chance') }}</th><th>{{ $t('Best from') }}</th></tr></thead>
                  <tbody>
                    <tr v-for="row in selectedZoneDrops.slice(0, DROP_ROW_LIMIT)" :key="row.kind + row.name">
                      <td>
                        <span :class="row.kind === 'set' ? 'set-name' : 'unique-name'">{{ row.name }}</span>
                        <span v-if="row.mod" class="flag" :title="row.mod === 'added' ? $t('Added by the mod') : $t('Changed by the mod')"></span>
                        <div class="small text-muted">{{ row.baseName }}<span v-if="row.setName"> · {{ row.setName }}</span></div>
                      </td>
                      <td class="text-end text-nowrap">{{ fmt(row.chance) }}</td>
                      <td class="small"><router-link :to="dropCalcLink(row.source.query)" class="text-muted">{{ row.source.label }}</router-link></td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="selectedZoneDrops.length > DROP_ROW_LIMIT" class="small text-muted p-2">
                  {{ $t('{n} more - narrow it down with the filter, or open an area in the drop calculator.', { n: selectedZoneDrops.length - DROP_ROW_LIMIT }) }}
                </div>
                <div v-if="selectedZoneDrops.length === 0" class="small text-muted p-2">{{ $t('Nothing matches.') }}</div>
              </div>
            </div>
          </template>
          <div v-else class="card-body p-4 text-muted">
            <div class="section-header mb-2">{{ $t('Zone details') }}</div>
            <p class="mb-2">{{ $t('Pick a zone from the lists - or from this overview - to see its next slots, its areas and superuniques with links into the drop calculator, and what it can drop in terror mode.') }}</p>
            <div class="zone-grid">
              <div v-for="(zone, zi) in zones" :key="zone.key" class="zone-tile" :class="{ dim: !passesFilters(zone, zi), fav: isFavorite(zone), boss: zone.boss }">
                <button class="star tile-star" :class="{ on: isFavorite(zone) }" :title="isFavorite(zone) ? $t('Remove favorite') : $t('Mark as favorite')" @click="toggleFavorite(zone)">★</button>
                <button class="tile-main" @click="selectZone(zone)">
                  <span class="d-flex gap-1 align-items-center">
                    <span class="badge act-badge" :class="`act-${zone.act}`">A{{ zone.act }}</span>
                    <span v-if="zone.boss" class="badge boss-badge">{{ zone.boss }}</span>
                  </span>
                  <span class="tile-name">{{ zone.short }}</span>
                  <span class="tile-next">{{ nextOccurrences(zi, 1)[0] ? (nextOccurrences(zi, 1)[0].index === currentIndex ? $t('now') : fmtWhen(nextOccurrences(zi, 1)[0].start)) : '—' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="small text-muted mt-4 mb-0 source-note">
      <span v-html="$t(`Zones and levels from the game's {file}; areas, superuniques and drop odds from this site's data.`, { file: '<code>desecratedzones.json</code>' })"></span>
      {{ $t('The slot sequence is imported from') }} <a :href="tz.source.page" target="_blank" rel="noopener">{{ tz.source.name }}</a>
      ({{ $t('imported {date}, covers until {day}', { date: new Date(tz.generatedAt).toLocaleDateString(), day: fmtDay(scheduleEnd) }) }}<template v-if="daysLeft >= 0">, {{ $t('{n} days', { n: daysLeft }) }}</template>).
      {{ $t(`Blizzard's generator behind the seed is not public; when it is, the import goes away.`) }}
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

.el, .el-dot, .el-toggle { font-weight: 500; }
.el { background: rgba(255, 255, 255, 0.06); }
.el-fire { color: #ff9a5c; }
.el-cold { color: #8fd3ff; }
.el-lightning { color: #ffe97a; }
.el-poison { color: #9fe870; }
.el-magic { color: #d7a6ff; }
.el-physical { color: #e0d6c2; }
.el-row { display: inline-flex; gap: 0.2rem; flex-wrap: wrap; justify-content: flex-end; min-width: 9rem; }
.el-dot {
  font-size: 0.68rem; line-height: 1; padding: 0.15rem 0.3rem; border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.06); letter-spacing: 0.02em;
}
.el-toggle {
  border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.03);
  padding: 0.1rem 0.55rem; font-size: 0.8rem; opacity: 0.7;
}
.el-toggle.active { opacity: 1; border-color: currentColor; background: rgba(255, 255, 255, 0.1); }
.area-list li { padding: 0.15rem 0; }

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
.rune-name { color: #ffb84d; }
.rune-box { line-height: 1.6; }
.next-up { font-size: 0.95rem; }
.set-name { color: #7fdc7f; }
.flag {
  display: inline-block; width: 0.45rem; height: 0.45rem; border-radius: 50%;
  background: var(--d2r-gold); margin-left: 0.35rem; vertical-align: middle; opacity: 0.8;
}

/* act bosses: one colour, everywhere the zone shows up */
.boss-badge { background: rgba(170, 40, 40, 0.45); color: #ffb3b3; font-weight: 600; }
.row-boss { box-shadow: inset 3px 0 0 rgba(200, 50, 50, 0.7); }

.zone-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.4rem; }
.zone-tile {
  position: relative; display: flex; flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.03); color: var(--d2r-text);
}
.zone-tile:hover { border-color: var(--d2r-gold); }
.zone-tile.fav { border-color: rgba(212, 175, 55, 0.6); }
.zone-tile.boss { border-left: 3px solid rgba(200, 50, 50, 0.8); }
.zone-tile.dim { opacity: 0.35; }
.tile-main {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem;
  width: 100%; padding: 0.45rem 1.6rem 0.45rem 0.55rem; border: 0; background: none;
  color: inherit; text-align: left; cursor: pointer;
}
.tile-star { position: absolute; top: 0.3rem; right: 0.3rem; }
.tile-name { font-size: 0.85rem; line-height: 1.15; }
.tile-next { font-size: 0.75rem; color: var(--d2r-muted); }

.source-note a { color: var(--d2r-gold); }

@media (max-width: 991px) {
  .zone-panel { position: static; }
}
</style>
