<script setup>
import { computed, ref, watch } from 'vue';
import setsData from '@/assets/sets.json';

const MYTHIC_PREFIX = 'Mythic ';
const ITEM_MYTHIC_PROP = 'item-mythic';
const CLASS_LABELS = {
  '': 'Not Class-Specific',
  ama: 'Amazon',
  ass: 'Assassin',
  bar: 'Barbarian',
  dru: 'Druid',
  nec: 'Necromancer',
  pal: 'Paladin',
  sor: 'Sorceress',
  war: 'War'
};
const CLASS_ORDER = ['', 'ama', 'ass', 'bar', 'dru', 'nec', 'pal', 'sor', 'war'];

const searchQuery = ref('');
const selectedBaseName = ref('');

const getClassLabel = (uiClass) => {
  if (!uiClass) {
    return CLASS_LABELS[''];
  }
  return CLASS_LABELS[uiClass] ?? `Class: ${uiClass.toUpperCase()}`;
};

const stripMythicPrefix = (name = '') => {
  if (name.startsWith(MYTHIC_PREFIX)) {
    return name.slice(MYTHIC_PREFIX.length);
  }
  return name;
};

const toNumber = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isSpawnable = (entry) => String(entry?.Spawnable ?? '1') === '1';

const sortPropertiesByPriority = (properties = []) => {
  return [...properties].sort((left, right) => toNumber(right.Priority) - toNumber(left.Priority));
};

const sortPartialBonuses = (partialBonuses = []) => {
  return [...partialBonuses].sort((left, right) => toNumber(left.EquippedItems) - toNumber(right.EquippedItems));
};

const sortAdditionalBonuses = (additionalBonuses = []) => {
  return [...additionalBonuses].sort(
    (left, right) => toNumber(left.AdditionalSetItemsEquipped) - toNumber(right.AdditionalSetItemsEquipped)
  );
};

const setPairs = computed(() => {
  const normalByBaseName = new Map();
  const mythicByBaseName = new Map();

  setsData.forEach((setEntry) => {
    const isMythic = setEntry.Name.startsWith(MYTHIC_PREFIX);
    const baseName = stripMythicPrefix(setEntry.Name);

    if (isMythic) {
      mythicByBaseName.set(baseName, setEntry);
      return;
    }

    normalByBaseName.set(baseName, setEntry);
  });

  const allBaseNames = [...new Set([...normalByBaseName.keys(), ...mythicByBaseName.keys()])]
    .sort((left, right) => left.localeCompare(right));

  return allBaseNames.map((baseName) => {
    const normal = normalByBaseName.get(baseName) ?? null;
    const mythic = mythicByBaseName.get(baseName) ?? null;

    return {
      baseName,
      uiClass: normal?.UiClass ?? mythic?.UiClass ?? '',
      normal,
      mythic
    };
  });
});

const buildSearchText = (pair) => {
  const tokens = [pair.baseName, getClassLabel(pair.uiClass)];

  [pair.normal, pair.mythic].forEach((variant) => {
    if (!variant) {
      return;
    }

    tokens.push(stripMythicPrefix(variant.Name));

    (variant.Items ?? []).forEach((item) => {
      tokens.push(stripMythicPrefix(item.Name), item.ItemCode ?? '');
    });
  });

  return tokens.join(' ').toLowerCase();
};

const filteredPairs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  if (!query) {
    return setPairs.value;
  }

  return setPairs.value.filter((pair) => buildSearchText(pair).includes(query));
});

const groupedPairsByClass = computed(() => {
  const grouped = new Map();

  filteredPairs.value.forEach((pair) => {
    const classCode = pair.uiClass ?? '';
    if (!grouped.has(classCode)) {
      grouped.set(classCode, []);
    }
    grouped.get(classCode).push(pair);
  });

  const sortedClassCodes = [...grouped.keys()].sort((left, right) => {
    const leftIndex = CLASS_ORDER.indexOf(left);
    const rightIndex = CLASS_ORDER.indexOf(right);

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }

    return getClassLabel(left).localeCompare(getClassLabel(right));
  });

  return sortedClassCodes.map((classCode) => ({
    code: classCode,
    label: getClassLabel(classCode),
    pairs: [...(grouped.get(classCode) ?? [])].sort((left, right) => left.baseName.localeCompare(right.baseName))
  }));
});

watch(
  filteredPairs,
  (pairs) => {
    if (!pairs.length) {
      selectedBaseName.value = '';
      return;
    }

    if (!pairs.some((pair) => pair.baseName === selectedBaseName.value)) {
      selectedBaseName.value = pairs[0].baseName;
    }
  },
  { immediate: true }
);

const selectedPair = computed(() => {
  if (!selectedBaseName.value) {
    return null;
  }
  return filteredPairs.value.find((pair) => pair.baseName === selectedBaseName.value) ?? null;
});

const selectedNormal = computed(() => selectedPair.value?.normal ?? null);
const selectedMythic = computed(() => selectedPair.value?.mythic ?? null);

const selectSet = (baseName) => {
  selectedBaseName.value = baseName;
};

const clearSearch = () => {
  searchQuery.value = '';
};

const getSpawnableItems = (setEntry) => (setEntry?.Items ?? []).filter((item) => isSpawnable(item));

const getSetItemCount = (setEntry) => {
  if (!isSpawnable(setEntry)) {
    return 0;
  }
  return getSpawnableItems(setEntry).length;
};

const getPairItemCount = (pair) => {
  if (!pair) return 0;
  return getSetItemCount(pair.normal) || getSetItemCount(pair.mythic);
};

const getVisibleItemProperties = (properties = []) =>
  sortPropertiesByPriority(properties.filter((property) => property.Prop !== ITEM_MYTHIC_PROP));

const getMythicAffixCount = (properties = []) => {
  const mythicProperty = properties.find((property) => property.Prop === ITEM_MYTHIC_PROP);
  if (!mythicProperty) {
    return null;
  }

  const minValue = toNumber(mythicProperty.Min);
  const maxValue = toNumber(mythicProperty.Max);
  const affixCount = minValue || maxValue;

  return affixCount > 0 ? affixCount : null;
};

const formatMythicAffixLabel = (affixCount) => {
  const count = toNumber(affixCount);
  if (count <= 0) {
    return '';
  }

  return `+${count} Mythic ${count === 1 ? 'Affix' : 'Affixes'}`;
};

const formatPartialBonusLabel = (equippedItems) => {
  const count = toNumber(equippedItems);
  return `${count} Item${count === 1 ? '' : 's'} Equipped`;
};

const formatAdditionalBonusLabel = (additionalSetItemsEquipped) => {
  const count = toNumber(additionalSetItemsEquipped);
  return `+${count} Additional Set Item${count === 1 ? '' : 's'} Equipped`;
};

const getVariantSummary = (pair) => {
  if (!pair?.normal || !pair?.mythic) {
    return 'Partial Variant Data';
  }
  return 'Normal + Mythic';
};
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row mb-4">
      <div class="col-12">
        <h1 class="display-4 mb-3">
          <span class="title-icon">◈</span>
          Sets
          <span class="title-icon">◈</span>
        </h1>
        <p class="lead text-muted mb-0">
          Browse all set collections by class and compare normal and mythic versions side by side. {{ setPairs.length }} sets total.
        </p>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-12 col-xl-4">
        <div class="card card-enhanced overview-panel">
          <div class="card-header card-header-primary">
            <h2 class="h5 mb-0">Set Overview</h2>
          </div>
          <div class="card-body overview-body">
            <div class="mb-3">
              <label for="set-search" class="form-label text-warning">Search Sets</label>
              <div class="input-group search-input-group">
                <input
                  id="set-search"
                  v-model="searchQuery"
                  type="text"
                  class="form-control search-input"
                  placeholder="Search by set or item name..."
                  autocomplete="off"
                >
                <button
                  v-if="searchQuery"
                  class="btn btn-outline-secondary"
                  type="button"
                  @click="clearSearch"
                >
                  Clear
                </button>
              </div>
            </div>

            <div v-if="filteredPairs.length" class="class-groups">
              <section
                v-for="group in groupedPairsByClass"
                :key="group.code || 'not-class-specific'"
                class="class-group"
              >
                <div class="class-group-head">
                  <h3 class="h6 mb-0">{{ group.label }}</h3>
                  <span class="badge bg-secondary">{{ group.pairs.length }}</span>
                </div>
                <div class="set-button-wrap">
                  <button
                    v-for="pair in group.pairs"
                    :key="pair.baseName"
                    type="button"
                    class="set-pill"
                    :class="{ 'active-set': pair.baseName === selectedBaseName }"
                    @click="selectSet(pair.baseName)"
                  >
                    {{ pair.baseName }}
                  </button>
                </div>
              </section>
            </div>

            <p v-else class="no-data mb-0">
              No sets found for "{{ searchQuery }}".
            </p>
          </div>
        </div>
      </div>

      <div class="col-12 col-xl-8">
        <div v-if="selectedPair" class="card card-enhanced detail-shell">
          <div class="card-header card-header-primary">
            <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2">
              <div>
                <h2 class="h3 mb-1">{{ selectedPair.baseName }}</h2>
                <p class="mb-0 text-light opacity-75">
                  {{ getClassLabel(selectedPair.uiClass) }} • {{ getPairItemCount(selectedPair) }} set items
                </p>
              </div>
              <span class="badge bg-secondary detail-badge">{{ getVariantSummary(selectedPair) }}</span>
            </div>
          </div>

          <div class="card-body">
            <div class="row g-3">
              <div class="col-12 col-lg-6">
                <div class="card h-100 variant-card">
                  <div class="card-header card-header-dark text-center">
                    <h3 class="h5 mb-0">Normal</h3>
                  </div>
                  <div class="card-body p-3">
                    <template v-if="selectedNormal && isSpawnable(selectedNormal)">
                      <div class="variant-meta">
                        <span class="meta-pill">Items: {{ getSetItemCount(selectedNormal) }}</span>
                      </div>

                      <section class="variant-section section-set-items">
                        <h4 class="section-header">Set Items</h4>
                        <p class="expand-hint-note">Select a set piece row to show details.</p>
                        <div v-if="getSpawnableItems(selectedNormal).length">
                          <details
                            v-for="item in getSpawnableItems(selectedNormal)"
                            :key="item.Index"
                            class="set-item-entry"
                          >
                            <summary class="set-item-summary">
                              <span class="item-name">{{ stripMythicPrefix(item.Name) }}</span>
                              <span class="summary-right">
                                <span class="expand-hint" aria-hidden="true"><span class="hint-arrow">▸</span></span>
                              </span>
                            </summary>
                            <div class="set-item-details">
                              <p class="item-mini-meta mb-2">
                                Level {{ item.Lvl }} • Required Level {{ item.LvlReq }}
                              </p>

                              <ul
                                v-if="getVisibleItemProperties(item.Properties).length || getMythicAffixCount(item.Properties)"
                                class="list-group list-group-flush mb-3"
                              >
                                <li
                                  v-for="(property, propertyIndex) in getVisibleItemProperties(item.Properties)"
                                  :key="`${item.Index}-property-${propertyIndex}`"
                                  class="list-group-item list-item-property"
                                >
                                  {{ property.Description }}
                                </li>
                                <li
                                  v-if="getMythicAffixCount(item.Properties)"
                                  :key="`${item.Index}-property-mythic-affixes`"
                                  class="list-group-item list-item-property mythic-affix-text"
                                >
                                  {{ formatMythicAffixLabel(getMythicAffixCount(item.Properties)) }}
                                </li>
                              </ul>
                              <p v-else class="no-data mb-3">No item properties listed.</p>

                              <div v-if="item.AdditionalBonuses?.length">
                                <div
                                  v-for="bonus in sortAdditionalBonuses(item.AdditionalBonuses)"
                                  :key="`${item.Index}-additional-${bonus.AdditionalSetItemsEquipped}`"
                                  class="bonus-block bonus-block-additional"
                                >
                                  <div class="bonus-title bonus-title-additional">{{ formatAdditionalBonusLabel(bonus.AdditionalSetItemsEquipped) }}</div>
                                  <ul class="list-group list-group-flush">
                                    <li
                                      v-for="(property, propertyIndex) in sortPropertiesByPriority(bonus.Properties)"
                                      :key="`${item.Index}-additional-${bonus.AdditionalSetItemsEquipped}-${propertyIndex}`"
                                      class="list-group-item list-item-enhanced additional-bonus-item"
                                    >
                                      {{ property.Description }}
                                    </li>
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </details>
                        </div>
                        <p v-else class="no-data">
                          {{ selectedNormal?.Items?.length ? 'Currently not available.' : 'No set items listed.' }}
                        </p>
                      </section>

                      <section class="variant-section section-set-bonuses">
                        <h4 class="section-header">Set Bonuses</h4>

                        <h5 class="bonus-subsection-title">Partial Set Bonuses</h5>
                        <div v-if="selectedNormal.PartialBonuses?.length">
                          <div
                            v-for="bonus in sortPartialBonuses(selectedNormal.PartialBonuses)"
                            :key="`normal-partial-${bonus.EquippedItems}`"
                            class="bonus-block"
                          >
                            <div class="bonus-title">{{ formatPartialBonusLabel(bonus.EquippedItems) }}</div>
                            <ul class="list-group list-group-flush">
                              <li
                                v-for="(property, propertyIndex) in sortPropertiesByPriority(bonus.Properties)"
                                :key="`normal-partial-${bonus.EquippedItems}-${propertyIndex}`"
                                class="list-group-item list-item-enhanced"
                              >
                                {{ property.Description }}
                              </li>
                            </ul>
                          </div>
                        </div>
                        <p v-else class="no-data">No partial bonuses listed.</p>

                        <h5 class="bonus-subsection-title bonus-subsection-title-full">Full Set Bonuses</h5>
                        <div class="full-bonus-panel">
                          <ul v-if="selectedNormal.FullSetBonuses?.length" class="list-group list-group-flush">
                            <li
                              v-for="(property, propertyIndex) in sortPropertiesByPriority(selectedNormal.FullSetBonuses)"
                              :key="`normal-full-${propertyIndex}`"
                              class="list-group-item list-item-enhanced full-bonus-item"
                            >
                              {{ property.Description }}
                            </li>
                          </ul>
                          <p v-else class="no-data mb-0">No full set bonuses listed.</p>
                        </div>
                      </section>
                    </template>

                    <p v-else class="no-data mb-0">
                      {{ selectedNormal ? 'Currently not available.' : 'No normal version found for this set.' }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="col-12 col-lg-6">
                <div class="card h-100 variant-card">
                  <div class="card-header card-header-dark text-center">
                    <h3 class="h5 mb-0">Mythic</h3>
                  </div>
                  <div class="card-body p-3">
                    <template v-if="selectedMythic && isSpawnable(selectedMythic)">
                      <div class="variant-meta">
                        <span class="meta-pill">Items: {{ getSetItemCount(selectedMythic) }}</span>
                      </div>

                      <section class="variant-section section-set-items">
                        <h4 class="section-header">Set Items</h4>
                        <p class="expand-hint-note">Select a set piece row to show details.</p>
                        <div v-if="getSpawnableItems(selectedMythic).length">
                          <details
                            v-for="item in getSpawnableItems(selectedMythic)"
                            :key="item.Index"
                            class="set-item-entry"
                          >
                            <summary class="set-item-summary">
                              <span class="item-name">{{ stripMythicPrefix(item.Name) }}</span>
                              <span class="summary-right">
                                <span class="expand-hint" aria-hidden="true"><span class="hint-arrow">▸</span></span>
                              </span>
                            </summary>
                            <div class="set-item-details">
                              <p class="item-mini-meta mb-2">
                                Level {{ item.Lvl }} • Required Level {{ item.LvlReq }}
                              </p>

                              <ul
                                v-if="getVisibleItemProperties(item.Properties).length || getMythicAffixCount(item.Properties)"
                                class="list-group list-group-flush mb-3"
                              >
                                <li
                                  v-for="(property, propertyIndex) in getVisibleItemProperties(item.Properties)"
                                  :key="`${item.Index}-property-${propertyIndex}`"
                                  class="list-group-item list-item-property"
                                >
                                  {{ property.Description }}
                                </li>
                                <li
                                  v-if="getMythicAffixCount(item.Properties)"
                                  :key="`${item.Index}-property-mythic-affixes`"
                                  class="list-group-item list-item-property mythic-affix-text"
                                >
                                  {{ formatMythicAffixLabel(getMythicAffixCount(item.Properties)) }}
                                </li>
                              </ul>
                              <p v-else class="no-data mb-3">No item properties listed.</p>

                              <div v-if="item.AdditionalBonuses?.length">
                                <div
                                  v-for="bonus in sortAdditionalBonuses(item.AdditionalBonuses)"
                                  :key="`${item.Index}-additional-${bonus.AdditionalSetItemsEquipped}`"
                                  class="bonus-block bonus-block-additional"
                                >
                                  <div class="bonus-title bonus-title-additional">{{ formatAdditionalBonusLabel(bonus.AdditionalSetItemsEquipped) }}</div>
                                  <ul class="list-group list-group-flush">
                                    <li
                                      v-for="(property, propertyIndex) in sortPropertiesByPriority(bonus.Properties)"
                                      :key="`${item.Index}-additional-${bonus.AdditionalSetItemsEquipped}-${propertyIndex}`"
                                      class="list-group-item list-item-enhanced additional-bonus-item"
                                    >
                                      {{ property.Description }}
                                    </li>
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </details>
                        </div>
                        <p v-else class="no-data">
                          {{ selectedMythic?.Items?.length ? 'Currently not available.' : 'No set items listed.' }}
                        </p>
                      </section>

                      <section class="variant-section section-set-bonuses">
                        <h4 class="section-header">Set Bonuses</h4>

                        <h5 class="bonus-subsection-title">Partial Set Bonuses</h5>
                        <div v-if="selectedMythic.PartialBonuses?.length">
                          <div
                            v-for="bonus in sortPartialBonuses(selectedMythic.PartialBonuses)"
                            :key="`mythic-partial-${bonus.EquippedItems}`"
                            class="bonus-block"
                          >
                            <div class="bonus-title">{{ formatPartialBonusLabel(bonus.EquippedItems) }}</div>
                            <ul class="list-group list-group-flush">
                              <li
                                v-for="(property, propertyIndex) in sortPropertiesByPriority(bonus.Properties)"
                                :key="`mythic-partial-${bonus.EquippedItems}-${propertyIndex}`"
                                class="list-group-item list-item-enhanced"
                              >
                                {{ property.Description }}
                              </li>
                            </ul>
                          </div>
                        </div>
                        <p v-else class="no-data">No partial bonuses listed.</p>

                        <h5 class="bonus-subsection-title bonus-subsection-title-full">Full Set Bonuses</h5>
                        <div class="full-bonus-panel">
                          <ul v-if="selectedMythic.FullSetBonuses?.length" class="list-group list-group-flush">
                            <li
                              v-for="(property, propertyIndex) in sortPropertiesByPriority(selectedMythic.FullSetBonuses)"
                              :key="`mythic-full-${propertyIndex}`"
                              class="list-group-item list-item-enhanced full-bonus-item"
                            >
                              {{ property.Description }}
                            </li>
                          </ul>
                          <p v-else class="no-data mb-0">No full set bonuses listed.</p>
                        </div>
                      </section>
                    </template>

                    <p v-else class="no-data mb-0">
                      {{ selectedMythic ? 'Currently not available.' : 'No mythic version found for this set.' }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="card card-enhanced detail-shell">
          <div class="card-body">
            <p class="no-data mb-0">Select a set from the overview to compare normal and mythic versions.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overview-panel {
  position: sticky;
  top: 1rem;
}

.overview-body {
  max-height: calc(100vh - 11rem);
  overflow-y: auto;
}

.class-group + .class-group {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid rgba(59, 42, 31, 0.7);
}

.class-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
}

.set-button-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.set-pill {
  background: linear-gradient(135deg, rgba(31, 23, 16, 0.95), rgba(14, 11, 8, 0.95));
  color: var(--d2r-text);
  border: 1px solid rgba(59, 42, 31, 0.75);
  border-radius: 999px;
  padding: 0.3rem 0.78rem;
  font-size: 0.88rem;
  line-height: 1.2;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
}

.set-pill:hover {
  transform: translateY(-1px);
  border-color: rgba(201, 163, 106, 0.55);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  color: var(--d2r-gold-bright);
}

.set-pill.active-set {
  border-color: rgba(201, 163, 106, 0.75);
  background: linear-gradient(135deg, rgba(72, 40, 12, 0.95), rgba(34, 21, 10, 0.95));
  color: var(--d2r-gold);
  box-shadow: 0 0 0 1px rgba(201, 163, 106, 0.2);
}

.detail-shell {
  min-height: 420px;
}

.detail-badge {
  font-size: 0.8rem;
}

.variant-card {
  background: rgba(14, 10, 8, 0.92);
  border: 1px solid rgba(59, 42, 31, 0.7);
  box-shadow: none;
}

.variant-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.9rem;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(59, 42, 31, 0.75);
  border-radius: 999px;
  padding: 0.15rem 0.7rem;
  font-size: 0.83rem;
  color: var(--d2r-muted);
  background: rgba(22, 16, 12, 0.85);
}

.variant-section {
  margin-bottom: 0.9rem;
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(59, 42, 31, 0.7);
  background: rgba(12, 9, 7, 0.74);
}

.variant-section:last-child {
  margin-bottom: 0;
}

.variant-section .section-header {
  margin: 0 0 0.75rem;
}

.section-set-items {
  background: linear-gradient(180deg, rgba(26, 19, 13, 0.7), rgba(14, 11, 9, 0.7));
}

.section-set-bonuses {
  background: linear-gradient(180deg, rgba(22, 16, 12, 0.7), rgba(12, 10, 8, 0.75));
}

.set-item-entry {
  border: 1px solid rgba(59, 42, 31, 0.65);
  border-radius: 10px;
  margin-bottom: 0.75rem;
  overflow: hidden;
  background: rgba(16, 12, 10, 0.85);
}

.set-item-summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.8rem;
  background: linear-gradient(90deg, rgba(44, 26, 12, 0.65), rgba(16, 12, 10, 0.7));
  list-style: none;
}

.set-item-summary::-webkit-details-marker {
  display: none;
}

.summary-right {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
}

.item-name {
  color: var(--d2r-gold);
  font-weight: 600;
}

.expand-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 999px;
  border: 1px solid rgba(194, 176, 143, 0.38);
  background: rgba(24, 18, 12, 0.7);
}

.hint-arrow {
  display: inline-block;
  transition: transform 0.2s ease;
  font-size: 0.72rem;
  color: rgba(194, 176, 143, 0.86);
}

.set-item-entry[open] .hint-arrow {
  transform: rotate(90deg);
}

.expand-hint-note {
  margin: -0.2rem 0 0.65rem;
  color: rgba(194, 176, 143, 0.72);
  font-size: 0.78rem;
  letter-spacing: 0.02em;
}

.set-item-details {
  padding: 0.75rem 0.8rem 0.6rem;
}

.item-mini-meta {
  font-size: 0.86rem;
  color: rgba(194, 176, 143, 0.8);
}

.bonus-block {
  border: 1px solid rgba(59, 42, 31, 0.62);
  border-radius: 10px;
  margin-bottom: 0.65rem;
  overflow: hidden;
}

.bonus-title {
  padding: 0.35rem 0.65rem;
  font-size: 0.86rem;
  color: var(--d2r-gold);
  background: linear-gradient(90deg, rgba(58, 30, 0, 0.65), rgba(14, 14, 14, 0.35));
  border-bottom: 1px solid rgba(59, 42, 31, 0.75);
}

.bonus-block-additional {
  border-color: rgba(94, 174, 103, 0.6);
}

.bonus-title-additional {
  color: #8de198;
  border-bottom-color: rgba(94, 174, 103, 0.7);
  background: linear-gradient(90deg, rgba(19, 64, 26, 0.75), rgba(11, 28, 14, 0.5));
}

.additional-bonus-item {
  color: #8de198;
  border-left-color: rgba(94, 174, 103, 0.8);
}

.additional-bonus-item:hover {
  color: #a7ecb0;
}

.bonus-subsection-title {
  margin: 0.35rem 0 0.65rem;
  font-size: 0.9rem;
  color: var(--d2r-muted);
  letter-spacing: 0.04em;
}

.bonus-subsection-title-full {
  color: rgba(228, 198, 138, 0.95);
}

.full-bonus-panel {
  border: 1px solid rgba(201, 163, 106, 0.35);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(35, 25, 17, 0.55), rgba(18, 13, 10, 0.6));
  padding: 0.4rem 0.45rem;
}

.full-bonus-item {
  border-left-color: rgba(201, 163, 106, 0.92);
}

.no-data {
  color: rgba(194, 176, 143, 0.75);
  font-style: italic;
}

.mythic-affix-text {
  color: #b87cff;
  text-shadow: 0 0 6px rgba(184, 124, 255, 0.35);
  font-weight: 600;
}

@media (max-width: 1199.98px) {
  .overview-panel {
    position: static;
  }

  .overview-body {
    max-height: none;
    overflow: visible;
  }
}
</style>
