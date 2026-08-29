<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import runewordsData from '@/assets/runewords.json';
import itemMapping from '@/assets/item_mapping.json';
import RunewordTable from '@/components/RunewordTable.vue';
import RunewordDetail from '@/components/RunewordDetail.vue';

const runewords = ref([]);
const searchQuery = ref('');
const runesSearchQuery = ref('');
const selectedCategory = ref('all');
const dataMode = ref('mod'); // mod | vanilla (mod is the default)

// Mode-aware field access: vanilla mode resolves the embedded Vanilla* value
// for reworked runewords; new (mod-added) runewords stay visible either way.
const fieldOf = (runeword, name) =>
  dataMode.value === 'vanilla' ? (runeword['Vanilla' + name] ?? runeword[name]) : runeword[name];
const debounceTimeout = ref(null);
// New and reworked are exclusive by construction - a runeword the mod added is
// not a vanilla one it changed - so two checkboxes could only ever be ticked
// together to get nothing back. One choice, "all" first.
const statusFilter = ref('all');

// all | hide | only. Judged per runeword, not per entry: one that fits orbs
// *and* plain swords is not a class runeword, and hiding it would take a
// generally useful option off the page.
const classFilter = ref('all');

// Wide screens keep the open runeword in a sticky panel beside the list, so
// browsing is click - read - click without the table jumping. The breakpoint
// is where the 1200px content shell is fully unfolded next to the sidebar;
// below it, rows expand inline as before.
const wideQuery = window.matchMedia('(min-width: 1500px)');
const isWide = ref(wideQuery.matches);
const syncWide = () => { isWide.value = wideQuery.matches; };

const selectedGroup = ref(null);

/* ---- rune picker --------------------------------------------------------
   Which runes you have, kept for the session so the answer survives a click
   into an item page and back. A ticked rune counts however often a runeword
   asks for it: Deliverance wants two Hels and a checkbox cannot say "two", so
   the picker answers "do you have this rune at all". */
const RUNES_KEY = 'rw-owned-runes';
const RUNE_FILTER_KEY = 'rw-rune-filter';

const readSession = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeSession = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private window or blocked storage is not a reason to break the page.
  }
};

const pickerOpen = ref(false);
const ownedRunes = ref(new Set(readSession(RUNES_KEY, [])));
const useRuneFilter = ref(readSession(RUNE_FILTER_KEY, false) === true);

// Every rune any runeword asks for, in rune order - which is all 33 of them,
// and by construction never one the picker would have no use for.
const allRunes = computed(() => {
  const runes = new Map();
  runewords.value.forEach((runeword) => {
    (runeword.Runes ?? []).forEach((code, index) => {
      if (!runes.has(code)) {
        runes.set(code, {
          code,
          name: (runeword.RuneNames ?? [])[index] ?? code,
          number: Number.parseInt(code.slice(1), 10) || 0,
        });
      }
    });
  });
  return [...runes.values()].sort((a, b) => a.number - b.number);
});

const toggleRune = (code) => {
  const next = new Set(ownedRunes.value);
  next.has(code) ? next.delete(code) : next.add(code);
  ownedRunes.value = next;
};

const selectAllRunes = () => { ownedRunes.value = new Set(allRunes.value.map((rune) => rune.code)); };
const clearRunes = () => { ownedRunes.value = new Set(); };

// Off while nothing is ticked: "only what I can make" out of no runes is an
// empty page, and an empty page is not an answer anyone asked for.
const runeFilterActive = computed(() => useRuneFilter.value && ownedRunes.value.size > 0);

watch(ownedRunes, (runes) => writeSession(RUNES_KEY, [...runes]), { deep: true });
watch(useRuneFilter, (on) => writeSession(RUNE_FILTER_KEY, on));

const selectGroup = (group) => {
  selectedGroup.value = selectedGroup.value?.key === group.key ? null : group;
};

/**
 * The three tiers the in-game menu already uses, by the highest rune a
 * runeword needs. High has no ceiling: the bound used to stop at Cham, and the
 * six runewords that ask for a Zod belonged to no tier at all.
 */
const RUNE_TIERS = [
  { key: 'low', title: 'Low Runewords', hint: 'El – Lum', max: 17 },
  { key: 'mid', title: 'Mid Runewords', hint: 'Ko – Gul', max: 25 },
  { key: 'high', title: 'High Runewords', hint: 'Vex – Zod', max: Infinity },
];

const highestRune = (runeword) =>
  Math.max(0, ...(runeword.Runes ?? []).map((code) => Number.parseInt(code.slice(1), 10) || 0));

const tierOf = (runeword) =>
  RUNE_TIERS.find((tier) => highestRune(runeword) <= tier.max) ?? RUNE_TIERS[RUNE_TIERS.length - 1];

const classBoundRows = computed(() => {
  const bound = new Map();
  runewords.value.forEach((runeword) => {
    const isBound = (runeword.ClassOnly ?? []).length > 0;
    bound.set(runeword.RowId, (bound.get(runeword.RowId) ?? true) && isBound);
  });
  return new Set([...bound].filter(([, isBound]) => isBound).map(([row]) => row));
});

const visibleRunewords = computed(() => runewords.value.filter((runeword) => {
  if (classFilter.value === 'hide' && classBoundRows.value.has(runeword.RowId)) return false;
  if (classFilter.value === 'only' && !classBoundRows.value.has(runeword.RowId)) return false;
  if (statusFilter.value === 'new') return runeword.IsNew;
  if (statusFilter.value === 'reworked') return runeword.IsReworked;
  return true;
}));

// Filter runewords based on search queries and category
const filteredRunewords = computed(() => {
  let filtered = [...visibleRunewords.value];

  // What the picked runes can actually make
  if (runeFilterActive.value) {
    filtered = filtered.filter((runeword) =>
      (runeword.Runes ?? []).every((code) => ownedRunes.value.has(code)));
  }

  // Apply the item-kind filter
  if (selectedCategory.value !== 'all') {
    const matches = {
      weapons: (runeword) => runeword.IsWeapon,
      armors: (runeword) => runeword.IsTorso,
      helmets: (runeword) => runeword.IsHelmet,
      shields: (runeword) => runeword.IsShield,
    }[selectedCategory.value];
    if (matches) filtered = filtered.filter(matches);
  }

  // Apply name search filter if query exists
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(runeword => 
      runeword.Name.toLowerCase().includes(query)
    );
  }

  // Apply runes search filter if query exists
  if (runesSearchQuery.value.trim()) {
    const runesQuery = runesSearchQuery.value.toLowerCase();
    // Split by spaces or commas
    const searchRunes = runesQuery.split(/[\s,]+/).filter(rune => rune.trim() !== '');

    if (searchRunes.length > 0) {
      filtered = filtered.filter(runeword => {
        const runewordRunes = runeword.RuneNames.map(rune => rune.toLowerCase());
        // Check if all search runes match exactly with the runeword runes
        return searchRunes.every(searchRune => 
          runewordRunes.some(runewordRune => runewordRune === searchRune)
        );
      });
    }
  }

  return filtered;
});

// Get human-readable allowed items
const getAllowedItemsText = (allowedItems) => {
  if (!allowedItems || allowedItems.length === 0) return 'None';

  return allowedItems.map(itemCode => {
    // Find the mapping for the item code
    // First try exact match
    if (itemMapping[itemCode]) {
      return itemMapping[itemCode].name;
    }

    // If no exact match, try to find a partial match
    // This handles cases like "shld" matching to "shie" in the mapping
    for (const [code, details] of Object.entries(itemMapping)) {
      if (itemCode.includes(code) || code.includes(itemCode)) {
        return details.name;
      }
    }

    // If no mapping found, return the original code
    return itemCode;
  }).join(', ');
};

/**
 * What this entry can be made in.
 *
 * A runeword allowed in two item types is exported once per type, and both
 * carried the full AllowedItems list - so Deliverance read "Armor, Shield"
 * twice and nothing said that Paladin shields are excluded. Types[0] is the
 * one this entry is actually for; ETypes are the exclusions.
 */
const getEntryItemsText = (runeword) => {
  const own = fieldOf(runeword, 'Types')?.[0];
  const base = own
    ? getAllowedItemsText([own])
    : getAllowedItemsText(fieldOf(runeword, 'AllowedItems'));

  const excluded = fieldOf(runeword, 'ETypes') ?? [];
  return excluded.length ? `${base} (not ${getAllowedItemsText(excluded)})` : base;
};

// Changes of a reworked runeword vs vanilla, as display lines.
// Properties are paired by prop code + parameter.
const getReworkChanges = (runeword) => {
  const changes = [];

  if (runeword.VanillaProperties) {
    const key = p => `${p.Prop}|${p.Par}`;
    const oldMap = new Map(runeword.VanillaProperties.map(p => [key(p), p]));
    const newMap = new Map(runeword.Properties.map(p => [key(p), p]));

    for (const [k, np] of newMap) {
      const op = oldMap.get(k);
      if (!op) {
        changes.push({ old: null, new: np.Description });
      } else if (op.Description !== np.Description) {
        changes.push({ old: op.Description, new: np.Description });
      }
    }
    for (const [k, op] of oldMap) {
      if (!newMap.has(k)) {
        changes.push({ old: op.Description, new: null });
      }
    }
  }

  if (runeword.VanillaAllowedItems) {
    changes.push({
      label: 'Usable in',
      old: getAllowedItemsText(runeword.VanillaAllowedItems),
      new: getAllowedItemsText(fieldOf(runeword, 'AllowedItems'))
    });
  }

  if (runeword.VanillaRuneNames) {
    changes.push({
      label: 'Runes',
      old: runeword.VanillaRuneNames.join(' - '),
      new: fieldOf(runeword, 'RuneNames').join(' - ')
    });
  }

  return changes;
};

// Handle search with debounce
const handleSearch = (event, isRunesSearch = false) => {
  clearTimeout(debounceTimeout.value);
  debounceTimeout.value = setTimeout(() => {
    if (isRunesSearch) {
      runesSearchQuery.value = event.target.value;
    } else {
      searchQuery.value = event.target.value;
    }
  }, 300); // 300ms debounce
};

// Enter closes the keyboard on a phone; the list is already filtered as you
// type. It used to scroll the page down to the results, which moved the ground
// under a reader who was still adjusting filters.
const handleSearchKeyup = (event) => {
  if (event.key === 'Enter') {
    event.target.blur();
  }
};

const setCategoryFilter = (category) => {
  selectedCategory.value = category;
};

// Reset filters
const resetFilters = () => {
  searchQuery.value = '';
  runesSearchQuery.value = '';
  selectedCategory.value = 'all';
  statusFilter.value = 'all';
  classFilter.value = 'all';
  useRuneFilter.value = false;
};

// Sort properties by priority
const sortPropertiesByPriority = (properties) => {
  return [...properties].sort((a, b) => parseInt(b.Priority) - parseInt(a.Priority));
};

/**
 * One group per runeword, its per-item-kind entries underneath.
 *
 * The export writes a runeword once per kind of item it goes in, because the
 * runes give different bonuses in a shield than in body armour and the
 * exclusions differ. Two rows with the same name said none of that; the group
 * says it once and keeps the difference where it belongs.
 */
const toGroups = (list) => {
  const groups = new Map();

  list.forEach((runeword) => {
    const key = runeword.RowId || runeword.Name;
    if (!groups.has(key)) {
      const runes = fieldOf(runeword, 'RuneNames') ?? [];
      groups.set(key, {
        key,
        name: runeword.Name,
        runes,
        sockets: runeword.Sockets ?? runes.length,
        levelReq: runeword.LevelReq ?? 0,
        isNew: runeword.IsNew,
        isReworked: runeword.IsReworked && dataMode.value === 'mod',
        // Only where every variant is bound: a runeword that also fits a plain
        // sword is not "Sorceress Only", however many orbs it lists.
        classNames: classBoundRows.value.has(runeword.RowId) ? (runeword.ClassNames ?? []) : [],
        variants: [],
      });
    }

    const changes = runeword.IsReworked ? getReworkChanges(runeword) : [];
    groups.get(key).variants.push({
      label: getEntryItemsText(runeword),
      properties: sortPropertiesByPriority(fieldOf(runeword, 'Properties') ?? []),
      reworkChanges: changes.length ? changes : null,
    });
  });

  return [...groups.values()];
};

/**
 * One list, cut into the three tiers. Sections used to double as filters -
 * "New" was a button and a table of its own - so the same runeword appeared
 * three times on one screen and no state said which view you were in.
 */
const tiers = computed(() => RUNE_TIERS
  .map((tier) => ({
    ...tier,
    groups: toGroups(filteredRunewords.value
      .filter((runeword) => tierOf(runeword).key === tier.key)
      .sort((a, b) => (a.LevelReq ?? 0) - (b.LevelReq ?? 0) || a.Name.localeCompare(b.Name))),
  }))
  .filter((tier) => tier.groups.length > 0));

const resultCount = computed(() => tiers.value.reduce((total, tier) => total + tier.groups.length, 0));

const reworkTitle = computed(() =>
  dataMode.value === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla');

onMounted(() => {
  runewords.value = runewordsData;
  wideQuery.addEventListener('change', syncWide);
  // Belt and braces: some environments resize without firing the media query.
  window.addEventListener('resize', syncWide);
});

onUnmounted(() => {
  wideQuery.removeEventListener('change', syncWide);
  window.removeEventListener('resize', syncWide);
});
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4">
          <span class="title-icon">◆</span> 
          Runewords 
          <span class="title-icon">◆</span>
        </h1>
      </div>
    </div>

    <!-- Search and Filter Section -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card card-enhanced filters-panel">
          <div class="card-body">
            <!-- Name Search Field -->
            <div class="mb-3">
              <label for="nameSearch" class="form-label text-warning">Search by Name</label>
              <div class="input-group search-input-group">
                <input 
                  id="nameSearch"
                  type="text" 
                  class="form-control search-input" 
                  placeholder="Search runewords by name..." 
                  @input="(e) => handleSearch(e, false)"
                  @keyup="handleSearchKeyup"
                  :value="searchQuery"
                >
              </div>
            </div>

            <!-- Runes Search Field -->
            <div class="mb-3">
              <label for="runesSearch" class="form-label text-warning">Search by Runes</label>
              <div class="input-group search-input-group">
                <input 
                  id="runesSearch"
                  type="text" 
                  class="form-control search-input" 
                  placeholder="Search by runes (e.g., Jah Ber)..." 
                  @input="(e) => handleSearch(e, true)"
                  @keyup="handleSearchKeyup"
                  :value="runesSearchQuery"
                >
                <button 
                  class="btn btn-outline-secondary" 
                  type="button" 
                  @click="resetFilters"
                  v-if="searchQuery || runesSearchQuery"
                >
                  Clear
                </button>
              </div>
              <small class="form-text text-muted">Enter exact rune names, separated by spaces or commas</small>
            </div>

            <!-- Rune picker: which runes you have, and whether that filters -->
            <div class="mb-3">
              <div class="d-flex align-items-center flex-wrap gap-3">
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="pickerOpen = !pickerOpen">
                  {{ pickerOpen ? '▾' : '▸' }} My runes
                  <span class="picker-count">{{ ownedRunes.size }}/{{ allRunes.length }}</span>
                </button>
                <div class="form-check reworked-toggle mb-0">
                  <input id="rw-rune-filter" v-model="useRuneFilter" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="rw-rune-filter">Only what I can make</label>
                </div>
                <small v-if="useRuneFilter && ownedRunes.size === 0" class="text-muted">
                  pick a rune first
                </small>
              </div>

              <div v-show="pickerOpen" class="rune-picker">
                <div class="rune-grid">
                  <button
                    v-for="rune in allRunes"
                    :key="rune.code"
                    type="button"
                    class="rune-chip"
                    :class="{ 'is-owned': ownedRunes.has(rune.code) }"
                    @click="toggleRune(rune.code)"
                  >
                    {{ rune.name }}
                  </button>
                </div>
                <div class="d-flex gap-2 mt-2">
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="selectAllRunes">Select all</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="clearRunes">Clear</button>
                </div>
              </div>
            </div>

            <!-- Category Filter Buttons -->
            <div class="mb-3">
              <label class="form-label text-warning">Filter by Item</label>
              <div class="btn-group d-flex flex-wrap gap-2" role="group">
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'all' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('all')"
                >
                  All
                </button>
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'weapons' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('weapons')"
                >
                  Weapons
                </button>
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'armors' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('armors')"
                >
                  Armors
                </button>
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'helmets' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('helmets')"
                >
                  Helmets
                </button>
                <button
                  type="button"
                  class="btn flex-fill"
                  :class="selectedCategory === 'shields' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('shields')"
                >
                  Shields
                </button>
              </div>
            </div>

            <!-- Data source toggle -->
            <div class="mb-1">
              <label class="form-label text-warning">Data</label>
              <div class="btn-group d-flex flex-wrap gap-2" role="group">
                <button
                  type="button"
                  class="btn flex-fill"
                  :class="dataMode === 'mod' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="dataMode = 'mod'"
                >
                  Relics of Sanctuary
                </button>
                <button
                  type="button"
                  class="btn flex-fill"
                  :class="dataMode === 'vanilla' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="dataMode = 'vanilla'"
                >
                  Vanilla
                </button>
              </div>
              <div class="d-flex flex-wrap gap-4 mt-2">
                <div class="form-check reworked-toggle">
                  <input id="rw-status-all" v-model="statusFilter" value="all" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-status-all">All</label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-status-new" v-model="statusFilter" value="new" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-status-new">
                    Only new <span class="flag flag-new">*</span>
                  </label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-status-reworked" v-model="statusFilter" value="reworked" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-status-reworked">
                    {{ dataMode === 'vanilla' ? 'Only changed by mod' : 'Only reworked' }}
                    <span class="flag flag-reworked">*</span>
                  </label>
                </div>
              </div>
              <div class="d-flex flex-wrap gap-4 mt-2">
                <div class="form-check reworked-toggle">
                  <input id="rw-class-all" v-model="classFilter" value="all" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-class-all">All</label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-class-hide" v-model="classFilter" value="hide" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-class-hide">Hide class specific</label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-class-only" v-model="classFilter" value="only" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-class-only">Only class specific</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Runewords, one list cut into rune tiers - with the open runeword's
         stats in a sticky panel beside it where the width allows. -->
    <div class="rw-layout">
      <div class="rw-list row g-4">
        <div class="col-12" v-if="resultCount === 0">
          <div class="card card-enhanced">
            <div class="card-body text-center text-muted py-4">
              No runewords match the current filters.
            </div>
          </div>
        </div>

        <div class="col-12" v-for="tier in tiers" :key="tier.key">
          <RunewordTable
            :title="tier.title"
            :subtitle="tier.hint"
            :groups="tier.groups"
            :rework-title="reworkTitle"
            :panel-mode="isWide"
            :selected-key="selectedGroup?.key ?? null"
            @select="selectGroup"
          />
        </div>
      </div>

      <aside v-if="isWide" class="rw-panel">
        <div class="card card-enhanced rw-panel-card">
          <div class="card-body">
            <RunewordDetail
              v-if="selectedGroup"
              :group="selectedGroup"
              :rework-title="reworkTitle"
              show-header
            />
            <div v-else class="text-muted rw-panel-hint">
              Click a runeword to see its stats here.
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* The same two flags the table uses, so the filter labels double as its
   legend - a red star is new, an amber one reworked. */
.flag {
  font-weight: 700;
  font-size: 1.05em;
  line-height: 0;
  vertical-align: super;
}

.flag-new {
  color: #d3644f;
}

.flag-reworked {
  color: #d6b25c;
}

/* ---- rune picker ------------------------------------------------------- */
.picker-count {
  margin-left: 0.4rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.rune-picker {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid rgba(59, 42, 31, 0.8);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.2);
}

.rune-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.rune-chip {
  min-width: 3.6rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.85rem;
  color: var(--d2r-muted);
  background: transparent;
  border: 1px solid rgba(59, 42, 31, 0.9);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.rune-chip:hover {
  border-color: rgba(201, 163, 106, 0.5);
  color: var(--d2r-text);
}

/* A rune you own reads as filled - the picker is a shelf, not a form. */
.rune-chip.is-owned {
  background: rgba(201, 163, 106, 0.18);
  border-color: rgba(201, 163, 106, 0.6);
  color: var(--d2r-gold-bright);
  font-weight: 600;
}

/* List and detail panel side by side. The panel sticks, so the stats stay put
   while the list scrolls under the cursor - which is the whole point. */
.rw-layout {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
}

.rw-list {
  flex: 1 1 auto;
  min-width: 0;
}

.rw-panel {
  flex: 0 0 23rem;
  position: sticky;
  top: 1rem;
}

.rw-panel-card {
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
}

.rw-panel-hint {
  padding: 1.5rem 0.5rem;
  text-align: center;
  font-size: 0.9rem;
}

.reworked-toggle .form-check-label {
  color: rgba(201, 163, 106, 0.95);
  font-size: 0.9rem;
}

.expand-btn {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  white-space: nowrap;
}

.filters-panel {
  background: linear-gradient(180deg, rgba(32, 24, 18, 0.95), rgba(16, 12, 10, 0.98));
  border: 1px solid rgba(59, 42, 31, 0.9);
}

.filters-panel .card-body {
  padding: 1.5rem;
}

.expanded-row {
  background-color: rgba(14, 10, 8, 0.8) !important;
}

.expanded-row td {
  padding: 0;
}

.table-dark tbody tr {
  transition: background-color 0.2s ease;
}

@media (max-width: 767.98px) {
  .filters-panel .card-body {
    padding: 1.1rem;
  }

  .table-responsive {
    margin: -0.75rem;
    width: calc(100% + 1.5rem);
  }
}


</style>

