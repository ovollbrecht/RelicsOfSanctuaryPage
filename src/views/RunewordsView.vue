<script setup>
import { ref, onMounted, computed, nextTick } from 'vue';
import runewordsData from '@/assets/runewords.json';
import itemMapping from '@/assets/item_mapping.json';

const runewords = ref([]);
const searchQuery = ref('');
const runesSearchQuery = ref('');
const selectedCategory = ref('all');
const expandedRows = ref(new Set());
const debounceTimeout = ref(null);
const itemsSection = ref(null);

// Group runewords by category
const categorizedRunewords = computed(() => {
  const result = {
    new: [],
    weapons: [],
    armors: [],
    helmets: [],
    shields: []
  };

  runewords.value.forEach(runeword => {
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
  let filtered = [...runewords.value];

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

// Generate a unique key for each runeword
const getRunewordKey = (runeword, category) => {
  // Combine name with runes, allowed items, and category to create a unique identifier
  const allowedItems = runeword.AllowedItems ? runeword.AllowedItems.join('-') : '';
  return `${runeword.Name}-${runeword.RuneNames.join('-')}-${allowedItems}-${category}`;
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
  <div class="container py-4">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4 text-warning mobile-title">
          <span class="title-icon">◆</span> 
          Runewords 
          <span class="title-icon">◆</span>
        </h1>
      </div>
    </div>

    <!-- Search and Filter Section -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card card-enhanced">
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
          </div>
        </div>
      </div>
    </div>

    <!-- Runewords Tables -->
    <div class="row g-4" ref="itemsSection">
      <!-- Filtered Results Table (when search or category filter is active) -->
      <div class="col-12" v-if="searchQuery || runesSearchQuery || selectedCategory !== 'all'">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">
              <span v-if="searchQuery || runesSearchQuery">Search Results</span>
              <span v-else-if="selectedCategory === 'new'">New Runewords</span>
              <span v-else-if="selectedCategory === 'weapons'">Weapon Runewords</span>
              <span v-else-if="selectedCategory === 'armors'">Armor Runewords</span>
              <span v-else-if="selectedCategory === 'helmets'">Helmet Runewords</span>
              <span v-else-if="selectedCategory === 'shields'">Shield Runewords</span>
              <span v-else>Filtered Runewords</span>
            </h2>
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
                      </td>
                      <td>{{ runeword.RuneNames.join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(runeword.AllowedItems) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'filtered'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(runeword.Properties)"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
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
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">New Runewords</h2>
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
                      <td>{{ runeword.RuneNames.join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(runeword.AllowedItems) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'new'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(runeword.Properties)"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
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
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">Weapon Runewords</h2>
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
                      </td>
                      <td>{{ runeword.RuneNames.join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(runeword.AllowedItems) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'weapons'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(runeword.Properties)"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
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
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">Armor Runewords</h2>
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
                      </td>
                      <td>{{ runeword.RuneNames.join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(runeword.AllowedItems) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'armors'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(runeword.Properties)"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
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
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">Helmet Runewords</h2>
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
                      </td>
                      <td>{{ runeword.RuneNames.join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(runeword.AllowedItems) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'helmets'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(runeword.Properties)"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
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
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">Shield Runewords</h2>
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
                      </td>
                      <td>{{ runeword.RuneNames.join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(runeword.AllowedItems) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'shields'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(runeword.Properties)"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
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
                      </td>
                      <td>{{ runeword.RuneNames.join(' - ') }}</td>
                      <td>{{ getAllowedItemsText(runeword.AllowedItems) }}</td>
                    </tr>
                    <tr v-if="expandedRows.has(getRunewordKey(runeword, 'search'))" class="expanded-row">
                      <td colspan="3">
                        <div class="p-3">
                          <h5 class="section-header">Properties</h5>
                          <ul class="list-group list-group-flush">
                            <li
                              v-for="(prop, propIndex) in sortPropertiesByPriority(runeword.Properties)"
                              :key="propIndex"
                              class="list-group-item list-item-property"
                            >
                              {{ prop.Description }}
                            </li>
                          </ul>
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
/* Enhanced Typography */
.display-4 {
  font-family: 'EB Garamond', serif;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
  color: var(--d2r-gold);
  border-bottom: 2px solid var(--d2r-gold);
  padding-bottom: 0.5rem;
  text-align: center;
  background: linear-gradient(to bottom, rgba(20, 10, 0, 0.7), transparent);
}

.title-icon {
  font-size: 0.8em;
  vertical-align: middle;
  margin: 0 0.5rem;
  opacity: 0.8;
  text-shadow: 0 0 10px var(--d2r-gold);
  display: inline-block;
}

.text-warning {
  color: var(--d2r-gold);
}

/* Enhanced Cards */
.card {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-radius: 0.5rem;
  overflow: hidden;
  position: relative;
}

.card-enhanced {
  border: 1px solid var(--d2r-border);
  background: linear-gradient(to bottom, #2a2a2a, #1e1e1e);
}

.card-header-primary {
  background: linear-gradient(90deg, #3a1e00, #0e0e0e);
  border-bottom: 2px solid var(--d2r-gold);
  position: relative;
}

/* Table Styling */
.table {
  margin-bottom: 0;
  color: var(--d2r-text);
}

.table-dark {
  background-color: transparent;
}

.table-dark thead th {
  background-color: rgba(0, 0, 0, 0.3);
  border-bottom: 2px solid var(--d2r-border);
  color: var(--d2r-gold);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.table-dark tbody tr {
  transition: all 0.2s ease;
}

.table-dark tbody tr:hover {
  background-color: rgba(58, 30, 0, 0.3);
}

.expanded-row {
  background-color: rgba(30, 30, 30, 0.8) !important;
}

.expanded-row td {
  padding: 0;
}

/* Enhanced Section Headers */
.section-header {
  color: var(--d2r-gold);
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--d2r-border);
  padding-bottom: 0.5rem;
  letter-spacing: 0.05em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* Enhanced List Items */
.list-group-item {
  background-color: rgba(40, 40, 40, 0.8);
  border-color: var(--d2r-border);
  transition: all 0.2s ease;
}

.list-group-item:hover {
  background-color: rgba(58, 58, 58, 0.8);
}

.list-item-property {
  border-left: 4px solid #2a2a2a;
}

/* Search Input Styling */
.search-input-group {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-radius: 0.25rem;
  overflow: hidden;
  position: relative;
}

.search-input-group::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--d2r-gold), transparent);
  z-index: 1;
}

.search-input {
  background-color: rgba(30, 30, 30, 0.9);
  color: var(--d2r-text);
  border: 1px solid var(--d2r-border);
  padding: 0.75rem 1rem;
  font-family: 'EB Garamond', serif;
  letter-spacing: 0.03em;
  transition: all 0.3s ease;
}

.search-input:focus {
  background-color: rgba(40, 40, 40, 0.9);
  border-color: var(--d2r-gold);
  box-shadow: 0 0 0 0.2rem rgba(198, 156, 109, 0.25);
  letter-spacing: 0.05em;
}

.search-input::placeholder {
  color: rgba(224, 212, 183, 0.5);
  font-style: italic;
}

.btn-outline-secondary {
  border-color: var(--d2r-border);
  color: var(--d2r-gold);
  background: linear-gradient(135deg, #2e2e2e, #1a1a1a);
  font-family: 'EB Garamond', serif;
  letter-spacing: 0.03em;
  transition: all 0.3s ease;
}

.btn-outline-secondary:hover {
  background: linear-gradient(135deg, #5e3200, #3a2000);
  color: var(--d2r-gold);
  border-color: var(--d2r-gold);
  box-shadow: 0 0 8px rgba(198, 156, 109, 0.4);
}

/* Form Label Styling */
.form-label {
  font-weight: 600;
  letter-spacing: 0.03em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.form-text {
  color: rgba(224, 212, 183, 0.7);
  font-style: italic;
}

/* Mobile Responsive Styles */
@media (max-width: 767.98px) {
  .mobile-title {
    font-size: 1.8rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
  }

  .title-icon {
    font-size: 0.7em;
    margin: 0 0.3rem;
  }

  .card {
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .card-body {
    padding: 0.75rem;
  }

  .card-header-primary {
    padding: 0.75rem;
  }

  .card-header-primary h2 {
    font-size: 1.2rem;
  }

  .section-header {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
    letter-spacing: 0.03em;
  }

  .table-responsive {
    margin: -0.75rem;
    width: calc(100% + 1.5rem);
  }

  .search-input {
    height: 44px;
    font-size: 1rem;
    letter-spacing: 0.02em;
  }
}
</style>
