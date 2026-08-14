<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import runewordsData from '@/assets/runewords.json';
import itemMapping from '@/assets/item_mapping.json';
import ReworkChanges from '@/components/ReworkChanges.vue';

const runewords = ref([]);
const searchQuery = ref('');
const runesSearchQuery = ref('');
const selectedCategory = ref('all');
const dataMode = ref('mod'); // mod | vanilla (mod is the default)

// Mode-aware field access: vanilla mode resolves the embedded Vanilla* value
// for reworked runewords; new (mod-added) runewords stay visible either way.
const fieldOf = (runeword, name) =>
  dataMode.value === 'vanilla' ? (runeword['Vanilla' + name] ?? runeword[name]) : runeword[name];
const expandedRows = ref(new Set());
const debounceTimeout = ref(null);
const itemsSection = ref(null);
const onlyReworked = ref(false);

// Sticky filter panel: auto-collapse to a summary bar while scrolled, with a
// manual override to re-open it in place.
const isScrolled = ref(false);
const forceOpen = ref(false);
const filtersCollapsed = computed(() => isScrolled.value && !forceOpen.value);
const onScroll = () => {
  const scrolled = window.scrollY > 380;
  if (scrolled !== isScrolled.value) {
    isScrolled.value = scrolled;
    if (!scrolled) forceOpen.value = false;
  }
};
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // the page may load pre-scrolled (scroll restoration)
});
onUnmounted(() => window.removeEventListener('scroll', onScroll));

const visibleRunewords = computed(() =>
  onlyReworked.value ? runewords.value.filter(runeword => runeword.IsReworked) : runewords.value
);

// Group runewords by category
const categorizedRunewords = computed(() => {
  const result = {
    new: [],
    weapons: [],
    armors: [],
    helmets: [],
    shields: []
  };

  visibleRunewords.value.forEach(runeword => {
    if (runeword.IsNew) {
      result.new.push(runeword);
    }
    if (runeword.IsWeapon) {
      result.weapons.push(runeword);
    }
    if (runeword.IsTorso) {
      result.armors.push(runeword);
    }
    if (runeword.IsHelmet) {
      result.helmets.push(runeword);
    }
    if (runeword.IsShield) {
      result.shields.push(runeword);
    }
  });

  return result;
});

// Filter runewords based on search queries and category
const filteredRunewords = computed(() => {
  let filtered = [...visibleRunewords.value];

  // Apply category filter
  if (selectedCategory.value !== 'all') {
    filtered = filtered.filter(runeword => {
      switch (selectedCategory.value) {
        case 'new':
          return runeword.IsNew;
        case 'weapons':
          return runeword.IsWeapon;
        case 'armors':
          return runeword.IsTorso;
        case 'helmets':
          return runeword.IsHelmet;
        case 'shields':
          return runeword.IsShield;
        default:
          return true;
      }
    });
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

// Generate a unique key for each runeword
const getRunewordKey = (runeword, category) => {
  // Combine name with runes, allowed items, and category to create a unique identifier
  const allowedItems = runeword.AllowedItems ? runeword.AllowedItems.join('-') : '';
  return `${runeword.Name}-${runeword.RuneNames.join('-')}-${allowedItems}-${category}`;
};

const setAllRowsExpanded = (list, category, expanded) => {
  list.forEach(runeword => {
    const key = getRunewordKey(runeword, category);
    if (expanded) expandedRows.value.add(key);
    else expandedRows.value.delete(key);
  });
};

// Toggle row expansion
const toggleRowExpansion = (runeword, category) => {
  const key = getRunewordKey(runeword, category);
  if (expandedRows.value.has(key)) {
    expandedRows.value.delete(key);
  } else {
    expandedRows.value.add(key);
  }
};

// Scroll to items section
const scrollToItems = async () => {
  // Wait for the DOM to update
  await nextTick();
  if (itemsSection.value) {
    itemsSection.value.scrollIntoView({ behavior: 'smooth' });
  }
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

// Handle Enter key press in search field
const handleSearchKeyup = (event) => {
  if (event.key === 'Enter' && (searchQuery.value.trim() || runesSearchQuery.value.trim())) {
    scrollToItems();
  }
};

// Set category filter
const setCategoryFilter = (category) => {
  selectedCategory.value = category;
  scrollToItems();
};

// Reset filters
const resetFilters = () => {
  searchQuery.value = '';
  runesSearchQuery.value = '';
  selectedCategory.value = 'all';
  onlyReworked.value = false;
  expandedRows.value.clear();
};

// Sort properties by priority
const sortPropertiesByPriority = (properties) => {
  return [...properties].sort((a, b) => parseInt(b.Priority) - parseInt(a.Priority));
};

// Get categories for a runeword (excluding "new")
const getRunewordCategories = (runeword) => {
  const categories = [];
  if (runeword.IsWeapon) categories.push('Weapon');
  if (runeword.IsTorso) categories.push('Armor');
  if (runeword.IsHelmet) categories.push('Helmet');
  if (runeword.IsShield) categories.push('Shield');
  return categories;
};

// Check if a runeword name appears multiple times in the dataset (excluding "new" runewords)
const hasMultipleEntries = (runewordName) => {
  const nonNewRunewords = runewords.value.filter(rw => !rw.IsNew);
  const matchingRunewords = nonNewRunewords.filter(rw => rw.Name === runewordName);
  return matchingRunewords.length > 1;
};

// Get display name with category suffix if the name appears in multiple entries
const getRunewordDisplayName = (runeword) => {
  // Don't add category suffix for "new" runewords
  if (runeword.IsNew) {
    return runeword.Name;
  }

  // Check if this runeword name appears multiple times in the dataset
  if (hasMultipleEntries(runeword.Name)) {
    const categories = getRunewordCategories(runeword);
    if (categories.length > 0) {
      return `${runeword.Name} (${categories[0]})`;
    }
  }

  return runeword.Name;
};

onMounted(() => {
  runewords.value = runewordsData;
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

    <!-- Search and Filter Section (sticky; collapses to a summary bar while scrolled) -->
    <div class="row mb-4 sticky-filters">
      <div class="col-12">
        <div class="card card-enhanced filters-panel">
          <div v-if="filtersCollapsed" class="card-body compact-bar d-flex align-items-center flex-wrap gap-2">
            <span class="compact-summary">
              {{ selectedCategory === 'all' ? 'All categories' : selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1) }} ·
              {{ dataMode === 'mod' ? 'Relics of Sanctuary' : 'Vanilla' }}<span v-if="onlyReworked"> · {{ dataMode === 'vanilla' ? 'only changed by mod' : 'only reworked' }}</span>
            </span>
            <input
              type="text"
              class="form-control form-control-sm compact-search"
              placeholder="Search runewords..."
              :value="searchQuery"
              @input="(e) => handleSearch(e, false)"
              @keyup="handleSearchKeyup"
            />
            <button class="btn btn-sm btn-outline-secondary" @click="forceOpen = true">Edit filters</button>
          </div>
          <div v-else class="card-body">
            <button
              v-if="isScrolled"
              class="btn btn-sm btn-outline-secondary filters-collapse-btn"
              title="Collapse filters"
              @click="forceOpen = false"
            >Collapse ▲</button>
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

            <!-- Category Filter Buttons -->
            <div class="mb-3">
              <label class="form-label text-warning">Filter by Category</label>
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
                  :class="selectedCategory === 'new' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('new')"
                >
                  New
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
              <div class="form-check mt-2 reworked-toggle">
                <input id="rw-only-reworked" v-model="onlyReworked" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="rw-only-reworked">
                  {{ dataMode === 'vanilla' ? 'Only changed by mod' : 'Only reworked' }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Runewords Tables -->
    <div class="row g-4" ref="itemsSection">
      <!-- Filtered Results Table (when search or category filter is active) -->
      <div class="col-12" v-if="searchQuery || runesSearchQuery || selectedCategory !== 'all'">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h2 class="h4 mb-0">
              <span v-if="searchQuery || runesSearchQuery">Search Results</span>
              <span v-else-if="selectedCategory === 'new'">New Runewords</span>
              <span v-else-if="selectedCategory === 'weapons'">Weapon Runewords</span>
              <span v-else-if="selectedCategory === 'armors'">Armor Runewords</span>
              <span v-else-if="selectedCategory === 'helmets'">Helmet Runewords</span>
              <span v-else-if="selectedCategory === 'shields'">Shield Runewords</span>
              <span v-else>Filtered Runewords</span>
            </h2>
            <span class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(filteredRunewords, 'filtered', true)">Expand all</button>
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(filteredRunewords, 'filtered', false)">Collapse all</button>
            </span>
          </div>
          <div class="card-body">
            <div v-if="filteredRunewords.length === 0" class="text-center text-muted py-4">
              No runewords found matching your criteria.
            </div>
            <div v-else class="table-responsive">
              <table class="table table-dark table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runes</th>
                    <th>Allowed Items</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="runeword in filteredRunewords" :key="getRunewordKey(runeword, 'filtered')">
                    <tr @click="toggleRowExpansion(runeword, 'filtered')" style="cursor: pointer;">
                      <td>
                        {{ getRunewordDisplayName(runeword) }}
                        <span v-if="runeword.IsNew" class="badge bg-secondary ms-2">New</span>
                        <span v-if="runeword.IsReworked && dataMode === 'mod'" class="badge rework-badge ms-2">Reworked</span>
                      </td>
                      <td>{{ fieldOf(runeword, 'RuneNames').join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(fieldOf(runeword, 'AllowedItems')) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'filtered'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(fieldOf(runeword, 'Properties'))"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
                          <ReworkChanges v-if="runeword.IsReworked" :changes="getReworkChanges(runeword)" :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- New Runewords Table -->
      <div class="col-12" v-if="categorizedRunewords.new.length > 0 && !searchQuery && !runesSearchQuery && selectedCategory === 'all'">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h2 class="h4 mb-0">New Runewords</h2>
            <span class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.new, 'new', true)">Expand all</button>
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.new, 'new', false)">Collapse all</button>
            </span>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-dark table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runes</th>
                    <th>Allowed Items</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="runeword in categorizedRunewords.new" :key="runeword.Name">
                    <tr @click="toggleRowExpansion(runeword, 'new')" style="cursor: pointer;">
                      <td>{{ runeword.Name }}</td>
                      <td>{{ fieldOf(runeword, 'RuneNames').join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(fieldOf(runeword, 'AllowedItems')) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'new'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(fieldOf(runeword, 'Properties'))"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
                          <ReworkChanges v-if="runeword.IsReworked" :changes="getReworkChanges(runeword)" :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Weapons Runewords Table -->
      <div class="col-12" v-if="categorizedRunewords.weapons.length > 0 && !searchQuery && !runesSearchQuery && selectedCategory === 'all'">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h2 class="h4 mb-0">Weapon Runewords</h2>
            <span class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.weapons, 'weapons', true)">Expand all</button>
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.weapons, 'weapons', false)">Collapse all</button>
            </span>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-dark table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runes</th>
                    <th>Allowed Items</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="runeword in categorizedRunewords.weapons" :key="runeword.Name">
                    <tr @click="toggleRowExpansion(runeword, 'weapons')" style="cursor: pointer;">
                      <td>
                        {{ getRunewordDisplayName(runeword) }}
                        <span v-if="runeword.IsNew" class="badge bg-secondary ms-2">New</span>
                        <span v-if="runeword.IsReworked && dataMode === 'mod'" class="badge rework-badge ms-2">Reworked</span>
                      </td>
                      <td>{{ fieldOf(runeword, 'RuneNames').join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(fieldOf(runeword, 'AllowedItems')) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'weapons'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(fieldOf(runeword, 'Properties'))"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
                          <ReworkChanges v-if="runeword.IsReworked" :changes="getReworkChanges(runeword)" :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Armor Runewords Table -->
      <div class="col-12" v-if="categorizedRunewords.armors.length > 0 && !searchQuery && !runesSearchQuery && selectedCategory === 'all'">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h2 class="h4 mb-0">Armor Runewords</h2>
            <span class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.armors, 'armors', true)">Expand all</button>
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.armors, 'armors', false)">Collapse all</button>
            </span>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-dark table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runes</th>
                    <th>Allowed Items</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="runeword in categorizedRunewords.armors" :key="runeword.Name">
                    <tr @click="toggleRowExpansion(runeword, 'armors')" style="cursor: pointer;">
                      <td>
                        {{ getRunewordDisplayName(runeword) }}
                        <span v-if="runeword.IsNew" class="badge bg-secondary ms-2">New</span>
                        <span v-if="runeword.IsReworked && dataMode === 'mod'" class="badge rework-badge ms-2">Reworked</span>
                      </td>
                      <td>{{ fieldOf(runeword, 'RuneNames').join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(fieldOf(runeword, 'AllowedItems')) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'armors'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(fieldOf(runeword, 'Properties'))"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
                          <ReworkChanges v-if="runeword.IsReworked" :changes="getReworkChanges(runeword)" :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Helmet Runewords Table -->
      <div class="col-12" v-if="categorizedRunewords.helmets.length > 0 && !searchQuery && !runesSearchQuery && selectedCategory === 'all'">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h2 class="h4 mb-0">Helmet Runewords</h2>
            <span class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.helmets, 'helmets', true)">Expand all</button>
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.helmets, 'helmets', false)">Collapse all</button>
            </span>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-dark table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runes</th>
                    <th>Allowed Items</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="runeword in categorizedRunewords.helmets" :key="runeword.Name">
                    <tr @click="toggleRowExpansion(runeword, 'helmets')" style="cursor: pointer;">
                      <td>
                        {{ getRunewordDisplayName(runeword) }}
                        <span v-if="runeword.IsNew" class="badge bg-secondary ms-2">New</span>
                        <span v-if="runeword.IsReworked && dataMode === 'mod'" class="badge rework-badge ms-2">Reworked</span>
                      </td>
                      <td>{{ fieldOf(runeword, 'RuneNames').join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(fieldOf(runeword, 'AllowedItems')) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'helmets'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(fieldOf(runeword, 'Properties'))"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
                          <ReworkChanges v-if="runeword.IsReworked" :changes="getReworkChanges(runeword)" :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Shield Runewords Table -->
      <div class="col-12" v-if="categorizedRunewords.shields.length > 0 && !searchQuery && !runesSearchQuery && selectedCategory === 'all'">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h2 class="h4 mb-0">Shield Runewords</h2>
            <span class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.shields, 'shields', true)">Expand all</button>
              <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAllRowsExpanded(categorizedRunewords.shields, 'shields', false)">Collapse all</button>
            </span>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-dark table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runes</th>
                    <th>Allowed Items</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="runeword in categorizedRunewords.shields" :key="runeword.Name">
                    <tr @click="toggleRowExpansion(runeword, 'shields')" style="cursor: pointer;">
                      <td>
                        {{ getRunewordDisplayName(runeword) }}
                        <span v-if="runeword.IsNew" class="badge bg-secondary ms-2">New</span>
                        <span v-if="runeword.IsReworked && dataMode === 'mod'" class="badge rework-badge ms-2">Reworked</span>
                      </td>
                      <td>{{ fieldOf(runeword, 'RuneNames').join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(fieldOf(runeword, 'AllowedItems')) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'shields'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(fieldOf(runeword, 'Properties'))"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
                          <ReworkChanges v-if="runeword.IsReworked" :changes="getReworkChanges(runeword)" :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Search Results Table -->
      <div class="col-12" v-if="searchQuery || runesSearchQuery">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">
              <span v-if="searchQuery && runesSearchQuery">
                Search Results for "{{ searchQuery }}" with runes "{{ runesSearchQuery }}"
              </span>
              <span v-else-if="searchQuery">
                Search Results for "{{ searchQuery }}"
              </span>
              <span v-else>
                Search Results for runes "{{ runesSearchQuery }}"
              </span>
            </h2>
            <button class="btn btn-sm btn-outline-secondary mt-2" @click="resetFilters">
              Clear Search
            </button>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-dark table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runes</th>
                    <th>Allowed Items</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="runeword in filteredRunewords" :key="runeword.Name">
                    <tr @click="toggleRowExpansion(runeword, 'search')" style="cursor: pointer;">
                      <td>
                        {{ getRunewordDisplayName(runeword) }}
                        <span v-if="runeword.IsNew" class="badge bg-secondary ms-2">New</span>
                        <span v-if="runeword.IsReworked && dataMode === 'mod'" class="badge rework-badge ms-2">Reworked</span>
                      </td>
                      <td>{{ fieldOf(runeword, 'RuneNames').join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(fieldOf(runeword, 'AllowedItems')) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'search'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(fieldOf(runeword, 'Properties'))"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
                          <ReworkChanges v-if="runeword.IsReworked" :changes="getReworkChanges(runeword)" :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sticky-filters {
  position: sticky;
  top: 0;
  z-index: 100;
}

.sticky-filters .filters-panel {
  /* fully opaque so scrolled content cannot bleed through the pinned card */
  background: linear-gradient(180deg, rgb(36, 26, 18), rgb(16, 12, 10));
}

/* keep the compact summary clear of the floating menu button */
@media (max-width: 1199px) {
  .compact-bar {
    padding-left: 3.5rem;
  }
}

.filters-panel .card-body {
  position: relative;
}

.filters-collapse-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.compact-bar {
  padding: 0.5rem 0.75rem;
}

.compact-summary {
  color: rgba(201, 163, 106, 0.95);
  font-size: 0.9rem;
}

.compact-search {
  max-width: 16rem;
  flex: 1 1 10rem;
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

