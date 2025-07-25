<script setup>
import { ref, onMounted, computed } from 'vue';
import craftingData from '@/assets/crafting.json';
import itemMapping from '@/assets/item_mapping.json';

const craftingRecipes = ref([]);
const searchQuery = ref('');
const activeFilters = ref({
  craftedType: null,
  itemType: null,
  rune: null
});

// Get unique crafted types for filter buttons
const craftedTypes = computed(() => {
  const types = [...new Set(craftingRecipes.value.map(recipe => recipe.CraftedType))];
  return types.sort();
});

// Get unique item types for filter buttons
const itemTypes = computed(() => {
  const types = [...new Set(craftingRecipes.value.map(recipe => recipe.ItemType))];
  return types.sort();
});

// Get unique runes for filter buttons
const runeTypes = computed(() => {
  // Define the order of runes
  const runeOrder = [
    'El', 'Eld', 'Tir', 'Nef', 'Eth', 'Ith', 'Tal', 'Ral', 'Ort', 'Thul', 
    'Amn', 'Sol', 'Shael', 'Dol', 'Hel', 'Io', 'Lum', 'Ko', 'Fal', 'Lem', 
    'Pul', 'Um', 'Mal', 'Ist', 'Gul', 'Vex', 'Ohm', 'Lo', 'Sur', 'Ber', 
    'Jah', 'Cham', 'Zod'
  ];

  // Get all unique runes from recipes
  const runesSet = new Set();
  craftingRecipes.value.forEach(recipe => {
    recipe.InputNames.forEach(input => {
      if (input.includes('Rune')) {
        runesSet.add(input);
      }
    });
  });

  // Convert to array
  const runesArray = [...runesSet];

  // Sort according to the defined order
  return runesArray.sort((a, b) => {
    // Extract rune name without " Rune" suffix
    const runeA = a.replace(' Rune', '');
    const runeB = b.replace(' Rune', '');

    // Find positions in the order array
    const indexA = runeOrder.indexOf(runeA);
    const indexB = runeOrder.indexOf(runeB);

    // If both runes are in the order array, sort by their positions
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }

    // If only one rune is in the order array, prioritize it
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    // If neither rune is in the order array, maintain original order
    return 0;
  });
});

// Group recipes by CraftedType
const categorizedRecipes = computed(() => {
  const result = {};

  filteredRecipes.value.forEach(recipe => {
    if (!result[recipe.CraftedType]) {
      result[recipe.CraftedType] = [];
    }
    result[recipe.CraftedType].push(recipe);
  });

  return result;
});

// Filter recipes based on search query and active filters
const filteredRecipes = computed(() => {
  let filtered = [...craftingRecipes.value];

  // Apply search filter - search in ingredients (InputNames)
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(recipe => 
      recipe.InputNames.some(input => 
        input.toLowerCase().includes(query)
      )
    );
  }

  // Apply crafted type filter
  if (activeFilters.value.craftedType) {
    filtered = filtered.filter(recipe => recipe.CraftedType === activeFilters.value.craftedType);
  }

  // Apply item type filter
  if (activeFilters.value.itemType) {
    filtered = filtered.filter(recipe => recipe.ItemType === activeFilters.value.itemType);
  }

  // Apply rune filter
  if (activeFilters.value.rune) {
    filtered = filtered.filter(recipe => 
      recipe.InputNames.some(input => input === activeFilters.value.rune)
    );
  }

  return filtered;
});

// Get readable name for item type using item_mapping.json
const getItemTypeName = (itemType) => {
  return itemMapping[itemType]?.name || itemType;
};

// Get readable name for first input ingredient using item_mapping.json
const getInputName = (inputName) => {
  // Check if it's in item_mapping first
  const mapping = itemMapping[inputName.toLowerCase()];
  if (mapping) {
    return mapping.name;
  }
  // Otherwise return as is (for runes, gems, etc.)
  return inputName;
};

// Get CSS class for gem type
const getGemClass = (gemName) => {
  if (gemName.includes('Ruby') || gemName.includes('Amber')) {
    return 'gem-ruby';
  } else if (gemName.includes('Sapphire')) {
    return 'gem-sapphire';
  } else if (gemName.includes('Emerald')) {
    return 'gem-emerald';
  } else if (gemName.includes('Diamond')) {
    return 'gem-diamond';
  } else if (gemName.includes('Amethyst')) {
    return 'gem-amethyst';
  } else if (gemName.includes('Topaz')) {
    return 'gem-topaz';
  } else if (gemName.includes('Skull')) {
    return 'gem-skull';
  }
  return '';
};

// Format property with chance information
const formatProperty = (property) => {
  if (property.Chance < 100) {
    return `${property.Description} (${property.Chance}% chance)`;
  }
  return property.Description;
};

// Sort properties by chance (100% chance first, then others) and then by priority
const sortPropertiesByPriority = (properties) => {
  return [...properties].sort((a, b) => {
    // First sort by chance (100% first)
    if (a.Chance === 100 && b.Chance < 100) return -1;
    if (a.Chance < 100 && b.Chance === 100) return 1;
    // Then sort by priority
    return parseInt(b.Priority) - parseInt(a.Priority);
  });
};

// Reset filters
const resetFilters = () => {
  activeFilters.value = {
    craftedType: null,
    itemType: null,
    rune: null
  };
  searchQuery.value = '';
};

// Reset only filter tabs, keep search query
const resetOnlyFilters = () => {
  activeFilters.value = {
    craftedType: null,
    itemType: null,
    rune: null
  };
};

// Set active filter - only one filter can be active at a time
const setCraftedTypeFilter = (craftedType) => {
  if (craftedType === 'All') {
    activeFilters.value.craftedType = null;
  } else {
    activeFilters.value = {
      craftedType: activeFilters.value.craftedType === craftedType ? null : craftedType,
      itemType: null,
      rune: null
    };
  }
};

const setItemTypeFilter = (itemType) => {
  if (itemType === 'All') {
    activeFilters.value.itemType = null;
  } else {
    activeFilters.value = {
      craftedType: null,
      itemType: activeFilters.value.itemType === itemType ? null : itemType,
      rune: null
    };
  }
};

// Set rune filter - only one filter can be active at a time
const setRuneFilter = (rune) => {
  if (rune === 'All') {
    activeFilters.value.rune = null;
  } else {
    activeFilters.value = {
      craftedType: null,
      itemType: null,
      rune: activeFilters.value.rune === rune ? null : rune
    };
  }
};

onMounted(() => {
  craftingRecipes.value = craftingData;
});
</script>

<template>
  <div class="container py-4">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4 text-warning mobile-title">
          <span class="title-icon">◆</span> 
          Crafting Recipes 
          <span class="title-icon">◆</span>
        </h1>
      </div>
    </div>

    <!-- Search and Filter Section -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card card-enhanced filter-card">
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">Search & Filters</h2>
          </div>
          <div class="card-body">
            <!-- Search Field -->
            <div class="mb-4 search-section">
              <label for="ingredientSearch" class="form-label text-warning">Search by Ingredients</label>
              <div class="input-group search-input-group">
                <input 
                  id="ingredientSearch"
                  type="text" 
                  class="form-control search-input" 
                  placeholder="Search ingredients..." 
                  @input="(e) => { searchQuery = e.target.value; resetOnlyFilters(); }"
                />
                <button 
                  class="btn btn-outline-secondary" 
                  type="button" 
                  @click="resetFilters"
                  v-if="searchQuery || activeFilters.craftedType || activeFilters.itemType || activeFilters.rune"
                >
                  <i class="fas fa-times"></i> Clear
                </button>
              </div>
              <small class="form-text">Search for ingredients like runes, gems, or base items</small>
            </div>

            <div class="filter-divider"></div>

            <!-- Crafted Type Filters -->
            <div class="mb-4 filter-section">
              <label class="form-label text-warning">Crafted Type</label>
              <div class="btn-group d-flex flex-wrap gap-2" role="group">
                <button 
                  class="btn flex-fill filter-btn"
                  :class="activeFilters.craftedType === null ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCraftedTypeFilter('All')"
                >
                  All
                </button>
                <button 
                  v-for="craftedType in craftedTypes" 
                  :key="craftedType"
                  class="btn flex-fill filter-btn"
                  :class="activeFilters.craftedType === craftedType ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCraftedTypeFilter(craftedType)"
                >
                  <span 
                    class="craft-type-indicator"
                    :class="{
                      'blood-indicator': craftedType === 'Blood',
                      'caster-indicator': craftedType === 'Caster',
                      'discovery-indicator': craftedType === 'Discovery',
                      'eternity-indicator': craftedType === 'Eternity',
                      'hitpower-indicator': craftedType === 'Hit Power',
                      'safety-indicator': craftedType === 'Safety'
                    }"
                  ></span>
                  {{ craftedType }}
                </button>
              </div>
            </div>

            <div class="filter-divider"></div>

            <!-- Item Type Filters -->
            <div class="mb-4 filter-section">
              <label class="form-label text-warning">Item Type</label>
              <div class="btn-group d-flex flex-wrap gap-2" role="group">
                <button 
                  class="btn flex-fill filter-btn"
                  :class="activeFilters.itemType === null ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setItemTypeFilter('All')"
                >
                  All
                </button>
                <button 
                  v-for="itemType in itemTypes" 
                  :key="itemType"
                  class="btn flex-fill filter-btn"
                  :class="activeFilters.itemType === itemType ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setItemTypeFilter(itemType)"
                >
                  {{ getItemTypeName(itemType) }}
                </button>
              </div>
            </div>

            <div class="filter-divider"></div>

            <!-- Rune Filters -->
            <div class="mb-3 filter-section">
              <label class="form-label text-warning">Rune</label>
              <div class="btn-group d-flex flex-wrap gap-2" role="group">
                <button 
                  class="btn flex-fill filter-btn"
                  :class="activeFilters.rune === null ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setRuneFilter('All')"
                >
                  All
                </button>
                <button 
                  v-for="rune in runeTypes" 
                  :key="rune"
                  class="btn flex-fill filter-btn"
                  :class="activeFilters.rune === rune ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setRuneFilter(rune)"
                >
                  {{ rune.replace(' Rune', '') }}
                </button>
              </div>
            </div>

            <!-- Active Filters Summary -->
            <div class="active-filters mt-4" v-if="searchQuery || activeFilters.craftedType || activeFilters.itemType || activeFilters.rune">
              <div class="d-flex align-items-center">
                <span class="me-2 text-warning">Active Filters:</span>
                <div class="d-flex flex-wrap gap-2">
                  <span class="badge bg-secondary" v-if="searchQuery">
                    Search: "{{ searchQuery }}"
                  </span>
                  <span class="badge bg-secondary" v-if="activeFilters.craftedType">
                    Type: {{ activeFilters.craftedType }}
                  </span>
                  <span class="badge bg-secondary" v-if="activeFilters.itemType">
                    Item: {{ getItemTypeName(activeFilters.itemType) }}
                  </span>
                  <span class="badge bg-secondary" v-if="activeFilters.rune">
                    Rune: {{ activeFilters.rune.replace(' Rune', '') }}
                  </span>
                  <button class="btn btn-sm btn-outline-warning ms-2" @click="resetFilters">
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Crafting Recipes by Category -->
    <div class="row">
      <div class="col-12">
        <div v-for="(recipes, craftedType) in categorizedRecipes" :key="craftedType" class="mb-4">
          <div class="card card-enhanced">
            <div class="card-header card-header-primary">
              <h2 class="h4 mb-0">{{ craftedType }}</h2>
            </div>
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-dark table-hover">
                  <thead>
                    <tr>
                      <th>Item Type</th>
                      <th>Ingredients</th>
                      <th>Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="recipe in recipes" :key="`${recipe.ItemType}-${recipe.CraftedType}`">
                      <tr>
                        <td>{{ getItemTypeName(recipe.ItemType) }}</td>
                        <td>
                          <div v-for="(input, index) in recipe.InputNames" :key="index" class="mb-1">
                            <span v-if="index === 0">{{ getInputName(input) }}</span>
                            <span v-else-if="input.includes('Rune')" class="rune-text">{{ input }}</span>
                            <span v-else-if="input.includes('Perfect')" :class="getGemClass(input)">{{ input }}</span>
                            <span v-else>{{ input }}</span>
                          </div>
                        </td>
                        <td>
                          <div v-for="property in sortPropertiesByPriority(recipe.Properties)" :key="property.Prop" class="mb-1 small">
                            <span v-if="property.Chance < 100" class="text-info">
                              {{ property.Description }} <strong>({{ property.Chance }}% chance)</strong>
                            </span>
                            <span v-else>
                              {{ property.Description }}
                            </span>
                          </div>
                          <div class="text-muted small mt-2">
                            <em>+ up to 4 Rare Affixes</em>
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

    <!-- No Results -->
    <div v-if="filteredRecipes.length === 0" class="row">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">Search Results</h2>
          </div>
          <div class="card-body text-center py-5">
            <h5 class="text-muted">No recipes found</h5>
            <p class="text-muted">Try adjusting your search or filters</p>
            <button class="btn btn-outline-warning" @click="resetFilters">Reset Filters</button>
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

.mobile-title {
  font-size: 2rem;
}

@media (min-width: 768px) {
  .mobile-title {
    font-size: 3rem;
  }
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
  color: var(--d2r-text);
}

.card-header {
  border-bottom-color: var(--d2r-border);
}

.card-header-primary {
  background: linear-gradient(90deg, #3a1e00, #0e0e0e);
  border-bottom: 2px solid var(--d2r-gold);
  position: relative;
}

/* Search Input Styling */
.search-input-group {
  max-width: 500px;
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

/* Button Styling */
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

.btn-secondary {
  background: linear-gradient(135deg, #5e3200, #3a2000);
  color: var(--d2r-gold);
  border-color: var(--d2r-gold);
  font-family: 'EB Garamond', serif;
  letter-spacing: 0.03em;
  transition: all 0.3s ease;
}

.btn-secondary:hover {
  background: linear-gradient(135deg, #7e4200, #5a3000);
  color: var(--d2r-gold);
  border-color: var(--d2r-gold);
  box-shadow: 0 0 8px rgba(198, 156, 109, 0.4);
}

.btn-outline-warning {
  border-color: var(--d2r-gold);
  color: var(--d2r-gold);
  background: linear-gradient(135deg, #2e2e2e, #1a1a1a);
  transition: all 0.3s ease;
}

.btn-outline-warning:hover {
  background: linear-gradient(135deg, #5e3200, #3a2000);
  color: var(--d2r-gold);
  border-color: var(--d2r-gold);
  box-shadow: 0 0 8px rgba(198, 156, 109, 0.4);
}

.btn-warning {
  background-color: var(--d2r-gold);
  border-color: var(--d2r-gold);
  color: var(--d2r-bg);
}

.badge {
  font-size: 0.75em;
}

/* Form Label Styling */
.form-label {
  font-weight: 600;
  letter-spacing: 0.03em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  margin-bottom: 0.5rem;
}

.form-text {
  color: rgba(224, 212, 183, 0.7);
  font-style: italic;
  margin-top: 0.5rem;
}

/* Table Styling */
.table {
  margin-bottom: 0;
  width: 100%;
  table-layout: fixed;
}

.table-dark {
  background-color: transparent;
  color: var(--d2r-text);
}

.table-dark th {
  background-color: rgba(0, 0, 0, 0.3);
  color: var(--d2r-gold);
  border-color: var(--d2r-border);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.table-dark td {
  border-color: var(--d2r-border);
  vertical-align: middle;
}

.table-hover tbody tr:hover {
  background-color: rgba(58, 30, 0, 0.3);
  transition: all 0.2s ease;
}

/* Table alignment */
.table th:nth-child(1) {
  width: 20%;
}

.table th:nth-child(2) {
  width: 30%;
}

.table th:nth-child(3) {
  width: 50%;
}

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

.list-item-property {
  background-color: transparent;
  border-color: var(--d2r-border);
  padding: 0.5rem 0;
}

/* Crafted Type indicators */
.craft-type-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  position: relative;
  top: -1px;
}

.blood-indicator {
  background: rgb(255, 77, 77);
  box-shadow: 0 0 4px rgba(255, 77, 77, 0.7);
}

.caster-indicator {
  background: rgb(174, 0, 255);
  box-shadow: 0 0 4px rgba(174, 0, 255, 0.7);
}

.discovery-indicator {
  background: rgb(240, 240, 0);
  box-shadow: 0 0 4px rgba(240, 240, 0, 0.7);
}

.eternity-indicator {
  background: rgb(240, 240, 240);
  box-shadow: 0 0 4px rgba(240, 240, 240, 0.7);
}

.hitpower-indicator {
  background: rgb(105, 105, 255);
  box-shadow: 0 0 4px rgba(105, 105, 255, 0.7);
}

.safety-indicator {
  background: rgb(0, 200, 0);
  box-shadow: 0 0 4px rgba(0, 200, 0, 0.7);
}

/* Add a subtle left border to active buttons to match the indicator color */
.btn-secondary .blood-indicator {
  box-shadow: 0 0 6px rgba(255, 77, 77, 0.9);
}

.btn-secondary .caster-indicator {
  box-shadow: 0 0 6px rgba(174, 0, 255, 0.9);
}

.btn-secondary .discovery-indicator {
  box-shadow: 0 0 6px rgba(240, 240, 0, 0.9);
}

.btn-secondary .eternity-indicator {
  box-shadow: 0 0 6px rgba(240, 240, 240, 0.9);
}

.btn-secondary .hitpower-indicator {
  box-shadow: 0 0 6px rgba(105, 105, 255, 0.9);
}

.btn-secondary .safety-indicator {
  box-shadow: 0 0 6px rgba(0, 200, 0, 0.9);
}

/* Gem colors with enhanced styling */
.gem-ruby {
  color: #E34234 !important;
  text-shadow: 0 0 5px rgba(227, 66, 52, 0.5);
}
.gem-sapphire {
  color: #0F52BA !important;
  text-shadow: 0 0 5px rgba(15, 82, 186, 0.5);
}
.gem-emerald {
  color: #50C878 !important;
  text-shadow: 0 0 5px rgba(80, 200, 120, 0.5);
}
.gem-diamond {
  color: #B9F2FF !important;
  text-shadow: 0 0 5px rgba(185, 242, 255, 0.5);
}
.gem-amethyst {
  color: #9966CC !important;
  text-shadow: 0 0 5px rgba(153, 102, 204, 0.5);
}
.gem-topaz {
  color: #FFC87C !important;
  text-shadow: 0 0 5px rgba(255, 200, 124, 0.5);
}
.gem-skull {
  color: #FFFFFF !important;
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
}

/* Rune color with enhanced styling */
.rune-text {
  color: rgb(255, 168, 0) !important;
  text-shadow: 0 0 5px rgba(255, 168, 0, 0.5);
  font-weight: 600;
}

/* Filter Section Styling */
.filter-card {
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.4);
}

.filter-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(198, 156, 109, 0.3), transparent);
  margin: 1.5rem 0;
}

.filter-section {
  position: relative;
}

.filter-section .form-label {
  display: inline-block;
  padding: 0 0.5rem;
  margin-bottom: 0.75rem;
  position: relative;
}

.filter-section .form-label::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--d2r-gold), transparent);
}

.search-section .form-label {
  display: inline-block;
  padding: 0 0.5rem;
  margin-bottom: 0.75rem;
  position: relative;
}

.search-section .form-label::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--d2r-gold), transparent);
}

.filter-btn {
  transition: all 0.3s ease;
  font-size: 0.9rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.25rem;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.filter-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.filter-btn.btn-secondary {
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}

.active-filters {
  background: rgba(30, 30, 30, 0.5);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--d2r-border);
}

.active-filters .badge {
  background: linear-gradient(135deg, #5e3200, #3a2000);
  color: var(--d2r-gold);
  border: 1px solid var(--d2r-gold);
  padding: 0.5rem 0.75rem;
  font-weight: 400;
  letter-spacing: 0.03em;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.active-filters .btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

/* Results Summary Styling */
.results-summary {
  background: linear-gradient(90deg, rgba(58, 30, 0, 0.4), rgba(30, 30, 30, 0.2));
  border-radius: 0.5rem;
  padding: 1rem 1.5rem;
  margin-bottom: 1rem;
  border-left: 4px solid var(--d2r-gold);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.results-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--d2r-gold);
  margin-bottom: 0.25rem;
  letter-spacing: 0.03em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  font-family: 'EB Garamond', serif;
  background: linear-gradient(135deg, var(--d2r-gold), #a67c3d);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.results-subtitle {
  font-size: 0.9rem;
  color: rgba(224, 212, 183, 0.7);
  margin-bottom: 0;
  font-style: italic;
  margin-left: 2px;
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

  /* Mobile filter styles */
  .filter-divider {
    margin: 1rem 0;
  }

  .filter-section, .search-section {
    margin-bottom: 1rem;
  }

  .filter-section .form-label, .search-section .form-label {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }

  .filter-btn {
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
  }

  .active-filters {
    padding: 0.5rem;
    flex-direction: column;
    align-items: flex-start;
  }

  .active-filters .badge {
    margin-bottom: 0.3rem;
    font-size: 0.75rem;
    padding: 0.3rem 0.5rem;
  }

  .active-filters .btn-sm {
    margin-top: 0.5rem;
    align-self: flex-end;
  }

  /* Mobile results summary styles */
  .results-summary {
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .results-title {
    font-size: 1.3rem;
    margin-bottom: 0.1rem;
  }

  .results-subtitle {
    font-size: 0.8rem;
  }
}
</style>
