<script setup>
import { computed } from 'vue';
import propertyGroupsData from '@/assets/propertygroups.json';

const MAX_AFFIX_COLUMNS = 8;
const SHARED_ULTRA_GROUP_CODE = 'ex-ultra-rare';

const ITEM_TYPE_GROUPS = [
  { groupCode: 'ex-amu', label: 'Amulets' },
  { groupCode: 'ex-ring', label: 'Rings' },
  { groupCode: 'ex-weap', label: 'Weapons' },
  { groupCode: 'ex-offh', label: 'Shields / Offhand' },
  { groupCode: 'ex-body', label: 'Armor' },
  { groupCode: 'ex-head', label: 'Helmets' },
  { groupCode: 'ex-glov', label: 'Gloves' },
  { groupCode: 'ex-boot', label: 'Boots' },
  { groupCode: 'ex-belt', label: 'Belts' }
];

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'ultraRare'];

const RARITY_CONFIG = {
  common: {
    label: 'Common',
    badgeClass: 'rarity-common'
  },
  uncommon: {
    label: 'Uncommon',
    badgeClass: 'rarity-uncommon'
  },
  rare: {
    label: 'Rare',
    badgeClass: 'rarity-rare'
  },
  ultraRare: {
    label: 'Ultra Rare',
    badgeClass: 'rarity-ultra'
  }
};

const GLOBAL_RARITY_SPLIT = [
  { key: 'common', label: 'Common', chance: 600, badgeClass: 'rarity-common' },
  { key: 'uncommon', label: 'Uncommon', chance: 300, badgeClass: 'rarity-uncommon' },
  { key: 'rare', label: 'Rare', chance: 99, badgeClass: 'rarity-rare' },
  { key: 'ultraRare', label: 'Ultra Rare', chance: 1, badgeClass: 'rarity-ultra' }
];

const propertyGroupsByCode = new Map(propertyGroupsData.map((group) => [group.Code, group]));

const parseChance = (chanceValue) => {
  const parsed = Number.parseInt(chanceValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }

  return a || 1;
};

const createFraction = (numerator, denominator) => {
  if (!denominator || numerator === 0) {
    return { numerator: 0, denominator: 1 };
  }

  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor
  };
};

const addFractions = (first, second) => {
  return createFraction(
    (first.numerator * second.denominator) + (second.numerator * first.denominator),
    first.denominator * second.denominator
  );
};

const multiplyFractions = (first, second) => {
  return createFraction(first.numerator * second.numerator, first.denominator * second.denominator);
};

const compareFractions = (first, second) => {
  return (first.numerator * second.denominator) - (second.numerator * first.denominator);
};

const formatFraction = (fraction) => `${fraction.numerator}/${fraction.denominator}`;

const formatPercent = (fraction) => {
  const percent = (fraction.numerator / fraction.denominator) * 100;
  const cleanedPercent = percent
    .toFixed(4)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');

  return `${cleanedPercent}%`;
};

const getRarityKeyFromProp = (prop = '') => {
  if (prop.includes('ultra-rare')) {
    return 'ultraRare';
  }

  if (prop.endsWith('-comm')) {
    return 'common';
  }

  if (prop.endsWith('-unco')) {
    return 'uncommon';
  }

  if (prop.endsWith('-rare')) {
    return 'rare';
  }

  return null;
};

const sumEntryChances = (entries = []) => {
  return entries.reduce((sum, entry) => sum + parseChance(entry.Chance), 0);
};

const getEntryDescription = (entry) => {
  const resolvedDescriptions = (entry.ResolvedProperties || [])
    .map((property) => property.Description?.trim())
    .filter(Boolean);

  return resolvedDescriptions.length
    ? resolvedDescriptions.join(' + ')
    : (entry.Prop || 'Unknown property');
};

const buildLeafOutcomes = (group, accumulatedFraction = createFraction(1, 1)) => {
  if (!group?.Entries?.length) {
    return [];
  }

  const totalChance = sumEntryChances(group.Entries);
  if (!totalChance) {
    return [];
  }

  const outcomes = [];

  group.Entries.forEach((entry) => {
    const entryChance = parseChance(entry.Chance);
    if (!entryChance) {
      return;
    }

    const entryFraction = createFraction(entryChance, totalChance);
    const nextFraction = multiplyFractions(accumulatedFraction, entryFraction);

    if (entry.NestedGroup?.Entries?.length) {
      outcomes.push(...buildLeafOutcomes(entry.NestedGroup, nextFraction));
      return;
    }

    outcomes.push({
      description: getEntryDescription(entry),
      relativeFraction: nextFraction
    });
  });

  return outcomes;
};

const mergeDuplicateOutcomes = (outcomes) => {
  const byDescription = new Map();

  outcomes.forEach((outcome) => {
    const current = byDescription.get(outcome.description);
    if (current) {
      byDescription.set(outcome.description, addFractions(current, outcome.relativeFraction));
      return;
    }

    byDescription.set(outcome.description, outcome.relativeFraction);
  });

  return [...byDescription.entries()]
    .map(([description, relativeFraction]) => ({
      description,
      relativeFraction
    }))
    .sort((left, right) => {
      const chanceDiff = compareFractions(right.relativeFraction, left.relativeFraction);
      if (chanceDiff !== 0) {
        return chanceDiff;
      }

      return left.description.localeCompare(right.description);
    });
};

const fillAffixColumns = (columns) => {
  const filled = [...columns];

  while (filled.length < MAX_AFFIX_COLUMNS) {
    filled.push(null);
  }

  return filled.slice(0, MAX_AFFIX_COLUMNS);
};

const buildAffixSlot = (entry, rarityGroupTotalChance) => {
  const slotChanceRaw = parseChance(entry.Chance);
  if (!slotChanceRaw || !rarityGroupTotalChance) {
    return null;
  }

  const slotFraction = createFraction(slotChanceRaw, rarityGroupTotalChance);
  const isGroup = Boolean(entry.NestedGroup?.Entries?.length);

  if (!isGroup) {
    return {
      isGroup: false,
      outcomes: [
        {
          description: getEntryDescription(entry),
          chanceWithinRarity: slotFraction
        }
      ]
    };
  }

  const nestedOutcomes = mergeDuplicateOutcomes(buildLeafOutcomes(entry.NestedGroup));
  const outcomes = nestedOutcomes.map((outcome) => ({
    description: outcome.description,
    chanceWithinRarity: multiplyFractions(slotFraction, outcome.relativeFraction)
  }));

  return {
    isGroup: true,
    outcomes
  };
};

const buildRarityRow = (entry) => {
  const rarityKey = getRarityKeyFromProp(entry.Prop);
  if (!rarityKey) {
    return null;
  }

  const rarityConfig = RARITY_CONFIG[rarityKey];

  if (rarityKey === 'ultraRare') {
    return {
      rarityKey,
      rarityLabel: rarityConfig.label,
      badgeClass: rarityConfig.badgeClass,
      isSharedUltra: true,
      affixColumns: []
    };
  }

  const rarityEntries = entry.NestedGroup?.Entries || [];
  const rarityGroupTotalChance = sumEntryChances(rarityEntries);

  const affixColumns = fillAffixColumns(
    rarityEntries.map((slotEntry) => buildAffixSlot(slotEntry, rarityGroupTotalChance))
  );

  return {
    rarityKey,
    rarityLabel: rarityConfig.label,
    badgeClass: rarityConfig.badgeClass,
    isSharedUltra: false,
    affixColumns
  };
};

const mythicItemTables = computed(() => {
  return ITEM_TYPE_GROUPS.map((itemType) => {
    const itemGroup = propertyGroupsByCode.get(itemType.groupCode);
    const itemEntries = itemGroup?.Entries || [];

    const rowsByRarity = new Map();
    itemEntries.forEach((entry) => {
      const row = buildRarityRow(entry);
      if (row) {
        rowsByRarity.set(row.rarityKey, row);
      }
    });

    const rows = RARITY_ORDER
      .map((rarityKey) => rowsByRarity.get(rarityKey))
      .filter(Boolean);

    return {
      ...itemType,
      rows
    };
  });
});

const sharedUltraRare = computed(() => {
  const ultraGroup = propertyGroupsByCode.get(SHARED_ULTRA_GROUP_CODE);
  if (!ultraGroup?.Entries?.length) {
    return null;
  }

  const groupTotalChance = sumEntryChances(ultraGroup.Entries);
  const affixColumns = fillAffixColumns(
    ultraGroup.Entries.map((entry) => buildAffixSlot(entry, groupTotalChance))
  );

  return {
    affixColumns
  };
});

const raritySplitDisplay = GLOBAL_RARITY_SPLIT.map((split) => {
  const fraction = createFraction(split.chance, 1000);

  return {
    ...split,
    fraction
  };
});
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row mb-4">
      <div class="col-12">
        <h1 class="display-4 mb-3">
          <span class="title-icon">◆</span>
          Mythic Affixes
          <span class="title-icon">◆</span>
        </h1>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-0">Quick Overview</h2>
          </div>
          <div class="card-body">
            <p class="mb-2">
              Use the tables below to see which mythic affixes can roll for each item type and how likely each affix is.
            </p>
            <p class="mb-2">
              If a column shows a group, that means this slot can roll one of several affixes listed in that same column.
            </p>
            <p class="mb-2">Rarity split (same for all item types):</p>
            <div class="rarity-ratio-row">
              <div v-for="split in raritySplitDisplay" :key="split.key" class="rarity-ratio-item">
                <span class="badge" :class="split.badgeClass">{{ split.label }}</span>
                <span>{{ formatFraction(split.fraction) }} ({{ formatPercent(split.fraction) }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4" v-if="sharedUltraRare">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-dark">
            <h2 class="h4 mb-0">Ultra Rare Affixes (Shared for All Item Types)</h2>
          </div>
          <div class="card-body p-0">
            <table class="table table-dark table-striped mb-0 mythic-table compact-table">
              <thead>
                <tr>
                  <th scope="col" class="rarity-head">Rarity</th>
                  <th scope="col">Affix Slots (1-8)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="rarity-cell">
                    <span class="badge rarity-ultra">Ultra Rare</span>
                  </td>
                  <td class="slots-cell">
                    <div class="affix-slot-grid">
                      <div
                        v-for="(slot, slotIndex) in sharedUltraRare.affixColumns"
                        :key="`shared-slot-${slotIndex}`"
                        class="affix-slot"
                      >
                        <div v-if="slot && !slot.isGroup" class="slot-single">
                          <div class="affix-name" :title="slot.outcomes[0].description">
                            {{ slot.outcomes[0].description }}
                          </div>
                          <div class="affix-probability">
                            {{ formatFraction(slot.outcomes[0].chanceWithinRarity) }} • {{ formatPercent(slot.outcomes[0].chanceWithinRarity) }}
                          </div>
                        </div>
                        <details v-else-if="slot && slot.isGroup" class="slot-group">
                          <summary>Group ({{ slot.outcomes.length }} options)</summary>
                          <div class="group-list">
                            <div
                              v-for="(outcome, outcomeIndex) in slot.outcomes"
                              :key="`shared-outcome-${slotIndex}-${outcomeIndex}`"
                              class="group-outcome"
                            >
                              <span class="affix-name" :title="outcome.description">{{ outcome.description }}</span>
                              <span class="affix-probability">
                                {{ formatFraction(outcome.chanceWithinRarity) }} • {{ formatPercent(outcome.chanceWithinRarity) }}
                              </span>
                            </div>
                          </div>
                        </details>
                        <div v-else class="empty-slot">-</div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div v-for="itemTable in mythicItemTables" :key="itemTable.groupCode" class="col-12">
        <div class="card card-enhanced card-hover">
          <div class="card-header card-header-dark">
            <h2 class="h4 mb-0">{{ itemTable.label }}</h2>
          </div>
          <div class="card-body p-0">
            <table class="table table-dark table-striped table-hover mb-0 mythic-table compact-table">
              <thead>
                <tr>
                  <th scope="col" class="rarity-head">Rarity</th>
                  <th scope="col">Affix Slots (1-8)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in itemTable.rows" :key="`${itemTable.groupCode}-${row.rarityKey}`">
                  <td class="rarity-cell">
                    <span class="badge" :class="row.badgeClass">{{ row.rarityLabel }}</span>
                  </td>

                  <td v-if="row.isSharedUltra" class="shared-ultra-cell">
                    Shared across all item types. See the "Ultra Rare Affixes" table above.
                  </td>

                  <td v-else class="slots-cell">
                    <div class="affix-slot-grid">
                      <div
                        v-for="(slot, slotIndex) in row.affixColumns"
                        :key="`${itemTable.groupCode}-${row.rarityKey}-slot-${slotIndex}`"
                        class="affix-slot"
                      >
                        <div v-if="slot && !slot.isGroup" class="slot-single">
                          <div class="affix-name" :title="slot.outcomes[0].description">
                            {{ slot.outcomes[0].description }}
                          </div>
                          <div class="affix-probability">
                            {{ formatFraction(slot.outcomes[0].chanceWithinRarity) }} • {{ formatPercent(slot.outcomes[0].chanceWithinRarity) }}
                          </div>
                        </div>
                        <details v-else-if="slot && slot.isGroup" class="slot-group">
                          <summary>Group ({{ slot.outcomes.length }} options)</summary>
                          <div class="group-list">
                            <div
                              v-for="(outcome, outcomeIndex) in slot.outcomes"
                              :key="`${itemTable.groupCode}-${row.rarityKey}-slot-${slotIndex}-outcome-${outcomeIndex}`"
                              class="group-outcome"
                            >
                              <span class="affix-name" :title="outcome.description">{{ outcome.description }}</span>
                              <span class="affix-probability">
                                {{ formatFraction(outcome.chanceWithinRarity) }} • {{ formatPercent(outcome.chanceWithinRarity) }}
                              </span>
                            </div>
                          </div>
                        </details>
                        <div v-else class="empty-slot">-</div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mythic-table th,
.mythic-table td {
  vertical-align: top;
}

.rarity-head,
.rarity-cell {
  width: 150px;
  white-space: nowrap;
}

.compact-table {
  table-layout: fixed;
  width: 100%;
}

.slots-cell {
  width: auto;
}

.affix-slot-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.affix-slot {
  background: rgba(15, 10, 8, 0.5);
  border: 1px solid rgba(59, 42, 31, 0.65);
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
  min-height: 66px;
}

.slot-single {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.affix-name {
  color: var(--d2r-text);
  line-height: 1.15;
  font-size: 0.82rem;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.affix-probability {
  color: rgba(194, 176, 143, 0.85);
  font-size: 0.76rem;
  line-height: 1.05;
}

.slot-group summary {
  cursor: pointer;
  color: var(--d2r-gold);
  font-size: 0.75rem;
  line-height: 1.05;
}

.slot-group[open] summary {
  margin-bottom: 0.35rem;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.group-outcome {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding-top: 0.25rem;
  border-top: 1px dashed rgba(201, 163, 106, 0.2);
}

.group-outcome:first-child {
  border-top: none;
  padding-top: 0;
}

.empty-slot {
  color: rgba(194, 176, 143, 0.55);
  text-align: center;
  font-size: 0.85rem;
  padding-top: 0.25rem;
}

.shared-ultra-cell {
  color: rgba(194, 176, 143, 0.85);
  font-style: italic;
}

.rarity-ratio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
}

.rarity-ratio-item {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--d2r-text);
}

.badge.rarity-common {
  background: rgba(82, 106, 130, 0.45);
  border: 1px solid rgba(134, 171, 207, 0.45);
  color: #e3f0ff;
}

.badge.rarity-uncommon {
  background: rgba(36, 98, 52, 0.45);
  border: 1px solid rgba(95, 180, 122, 0.45);
  color: #d7f3dd;
}

.badge.rarity-rare {
  background: rgba(124, 88, 20, 0.45);
  border: 1px solid rgba(216, 172, 86, 0.5);
  color: #fae3bc;
}

.badge.rarity-ultra {
  background: rgba(126, 28, 28, 0.55);
  border: 1px solid rgba(206, 96, 96, 0.55);
  color: #ffd7d7;
}

@media (min-width: 1500px) {
  .affix-slot-grid {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}

@media (max-width: 1199.98px) {
  .affix-slot-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 767.98px) {
  .affix-slot-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rarity-head,
  .rarity-cell {
    width: 102px;
  }

  .affix-slot {
    min-height: 60px;
  }
}
</style>
