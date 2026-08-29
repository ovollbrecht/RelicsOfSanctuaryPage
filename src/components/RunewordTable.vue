<script setup>
import { ref } from 'vue';
import ReworkChanges from '@/components/ReworkChanges.vue';

/**
 * One row per runeword.
 *
 * A runeword allowed in two kinds of item is exported once per kind, because it
 * is not the same item twice: the runes give different bonuses in a shield than
 * in body armour, and the exclusions differ. The page showed that as two rows
 * with the same name and no way to tell them apart. It is one row now, and what
 * actually differs lives under it, one block per kind.
 */
const props = defineProps({
  title: { type: String, required: true },
  groups: { type: Array, required: true },
  subtitle: { type: String, default: '' },
  reworkTitle: { type: String, default: 'Changes vs. vanilla' },
});

const expanded = ref(new Set());

const toggle = (key) => {
  const next = new Set(expanded.value);
  next.has(key) ? next.delete(key) : next.add(key);
  expanded.value = next;
};

const setAll = (open) => {
  expanded.value = open ? new Set(props.groups.map((group) => group.key)) : new Set();
};

// A group's odds at the precision the numbers carry: 60% stays 60%, and a
// 9.9% draw keeps its digit instead of rounding to a lie.
const formatChance = (chance) => {
  const percent = chance * 100;
  return `${percent < 10 ? percent.toFixed(1).replace(/\.0$/, '') : Math.round(percent)}%`;
};
</script>

<template>
  <div class="card card-enhanced">
    <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
      <h2 class="h4 mb-0">
        {{ title }}
        <span class="tier-hint">{{ subtitle ? subtitle + ' · ' : '' }}{{ groups.length }}</span>
      </h2>
      <span class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAll(true)">Expand all</button>
        <button class="btn btn-sm btn-outline-secondary expand-btn" @click="setAll(false)">Collapse all</button>
      </span>
    </div>
    <div class="card-body">
      <div v-if="groups.length === 0" class="text-center text-muted py-4">
        No runewords found matching your criteria.
      </div>
      <div v-else class="table-responsive">
        <table class="table table-dark table-hover runeword-table">
          <!-- Fixed widths, so the three tier tables line up as one grid
               instead of each measuring its own longest name. -->
          <colgroup>
            <col style="width: 30%" />
            <col style="width: 21%" />
            <col style="width: 9%" />
            <col style="width: 9%" />
            <col style="width: 31%" />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Runes</th>
              <th class="text-center text-nowrap">Sockets</th>
              <th class="text-center text-nowrap">Level</th>
              <th>Allowed Items</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groups" :key="group.key">
              <tr @click="toggle(group.key)" style="cursor: pointer;">
                <td>
                  {{ group.name }}
                  <span v-if="group.isNew" class="badge bg-secondary ms-2">New</span>
                  <span v-if="group.isReworked" class="badge rework-badge ms-2">Reworked</span>
                  <span
                    v-for="className in group.classNames"
                    :key="className"
                    class="badge class-badge ms-2"
                    :class="'class-' + className.toLowerCase()"
                  >
                    {{ className }}
                  </span>
                </td>
                <td class="runes-cell">{{ group.runes.join(' - ') }}</td>
                <td class="text-center tnum">{{ group.sockets }}</td>
                <td class="text-center tnum">{{ group.levelReq || '—' }}</td>
                <td>
                  <span v-for="variant in group.variants" :key="variant.label" class="item-chip">
                    {{ variant.label }}
                  </span>
                </td>
              </tr>
              <tr v-if="expanded.has(group.key)" class="expanded-row">
                <td colspan="5">
                  <div class="p-3">
                    <div v-for="variant in group.variants" :key="variant.label" class="variant-block">
                      <!-- The heading only earns its place where there is more
                           than one kind: on a weapon-only runeword it would
                           just repeat the column above. -->
                      <h5 v-if="group.variants.length > 1" class="section-header">In {{ variant.label }}</h5>
                      <h5 v-else class="section-header">Properties</h5>
                      <ul class="list-group list-group-flush">
                        <li
                          v-for="(prop, propIndex) in variant.properties"
                          :key="propIndex"
                          class="list-group-item list-item-property"
                        >
                          {{ prop.Description }}
                          <ul v-if="prop.Rolls" class="property-rolls">
                            <li v-for="(roll, rollIndex) in prop.Rolls" :key="rollIndex">
                              <span>{{ roll.Description }}</span>
                              <span v-if="roll.Chance != null" class="roll-chance">{{ formatChance(roll.Chance) }}</span>
                            </li>
                          </ul>
                        </li>
                      </ul>
                      <ReworkChanges
                        v-if="variant.reworkChanges"
                        :changes="variant.reworkChanges"
                        :title="reworkTitle"
                      />
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.runeword-table {
  table-layout: fixed;
  min-width: 46rem;
}

/* The one badge worth a colour of its own: which class can wear this at all is
   a harder limit than where a runeword came from. Each class keeps a muted tone
   of its own so the eye can sort them without reading - but the name stays on
   the badge, because a colour nobody was taught means nothing. The tone lives
   in a pair of custom properties so fill, border and ink come from one line. */
.class-amazon      { --class-tone: 122, 158, 92;  --class-ink: #9dc47c; }
.class-sorceress   { --class-tone: 111, 168, 220; --class-ink: #9dc6ea; }
.class-necromancer { --class-tone: 150, 150, 165; --class-ink: #b9b9c8; }
.class-paladin     { --class-tone: 214, 178, 92;  --class-ink: #e0c383; }
.class-barbarian   { --class-tone: 184, 106, 70;  --class-ink: #d79372; }
.class-druid       { --class-tone: 126, 148, 74;  --class-ink: #b2c078; }
.class-assassin    { --class-tone: 94, 160, 154;  --class-ink: #86c4bd; }
.class-warlock     { --class-tone: 154, 110, 178; --class-ink: #bf9ad3; }

.class-badge {
  font-weight: 600;
  background: rgba(var(--class-tone, 201, 163, 106), 0.16);
  color: var(--class-ink, var(--d2r-muted));
  border: 1px solid rgba(var(--class-tone, 201, 163, 106), 0.45);
}

.tier-hint {
  margin-left: 0.5rem;
  font-size: 0.72em;
  letter-spacing: 0.04em;
  color: var(--d2r-muted);
}

.runes-cell {
  white-space: nowrap;
}

.tnum {
  font-variant-numeric: tabular-nums;
}

/* One chip per kind of item, so "Armor" and "Shield (not Paladin Shield)" read
   as two separate answers rather than one run-on sentence. */
.item-chip {
  display: inline-block;
  margin: 0 0.35rem 0.2rem 0;
  padding: 0.1rem 0.5rem;
  font-size: 0.85em;
  border: 1px solid rgba(201, 163, 106, 0.35);
  border-radius: 999px;
  color: var(--d2r-muted);
}

.variant-block + .variant-block {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(59, 42, 31, 0.8);
}
</style>
