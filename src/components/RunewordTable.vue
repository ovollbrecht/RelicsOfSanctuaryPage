<script setup>
import { runeIcon } from '@/composables/useItemIcon.js';
import { ref } from 'vue';
import RunewordDetail from '@/components/RunewordDetail.vue';

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
  // Wide screens show the open runeword in a panel beside the list instead of
  // inline under its row: the row click selects, and selection lives with the
  // parent because it spans the three tier tables.
  panelMode: { type: Boolean, default: false },
  // the Grail's word, when there is one: a check on built runewords, and the
  // bases in the files a runeword would go into
  markBuilt: { type: Boolean, default: false },
  basesFor: { type: Function, default: null },
  selectedKey: { type: String, default: null },
});

const emit = defineEmits(['select']);

const expanded = ref(new Set());

const toggle = (key) => {
  const next = new Set(expanded.value);
  next.has(key) ? next.delete(key) : next.add(key);
  expanded.value = next;
};

const rowClick = (group) => {
  if (props.panelMode) emit('select', group);
  else toggle(group.key);
};

const setAll = (open) => {
  expanded.value = open ? new Set(props.groups.map((group) => group.key)) : new Set();
};

</script>

<template>
  <div class="card card-enhanced">
    <div class="card-header card-header-primary d-flex justify-content-between align-items-center flex-wrap gap-2">
      <h2 class="h4 mb-0">
        {{ title }}
        <span class="tier-hint">{{ subtitle ? subtitle + ' · ' : '' }}{{ groups.length }}</span>
      </h2>
      <span v-if="!panelMode" class="d-flex gap-2">
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
            <col style="width: 22%" />
            <col style="width: 30%" />
            <col style="width: 9%" />
            <col style="width: 8%" />
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
              <tr
                :class="{ 'is-selected': panelMode && group.key === selectedKey }"
                @click="rowClick(group)"
                style="cursor: pointer;"
              >
                <td>
                  <!-- One mark for both, since it answers one question: did
                       the mod touch this. Which of the two it was is in the
                       tooltip, and the filter above splits them. -->
                  <span v-if="markBuilt && group.built" class="built" title="Built - your Grail has it">✓</span>{{ group.name }}<span
                    v-if="group.isNew || group.isReworked"
                    class="flag"
                    :title="group.isNew ? 'New in Relics of Sanctuary' : 'Reworked by Relics of Sanctuary'"
                  >•</span>
                  <span
                    v-for="className in group.classNames"
                    :key="className"
                    class="badge class-badge ms-2"
                    :class="'class-' + className.toLowerCase()"
                  >
                    {{ className }}
                  </span>
                </td>
                <td class="runes-cell">
                  <!-- In the "one rune away" list the one you lack is the
                       whole point, so it is the one thing marked. -->
                  <template v-for="(rune, runeIndex) in group.runes" :key="runeIndex">
                    <span v-if="runeIndex > 0"> - </span><span
                      class="rune-name"
                      :class="{ 'rune-missing': (group.missingNames ?? []).includes(rune) }"
                    ><img v-if="runeIcon(rune)" :src="runeIcon(rune)" class="rune-icon" alt="" />{{ rune }}</span>
                  </template>
                </td>
                <td class="text-center tnum">{{ group.sockets }}</td>
                <td class="text-center tnum">{{ group.levelReq || '—' }}</td>
                <td>
                  <!-- One chip per kind of item the runeword names, across all
                       its variants: Insight lists four, and one chip saying
                       "Polearm" was three answers short. -->
                  <span
                    v-for="label in group.variants.flatMap(variant => variant.labels)"
                    :key="label"
                    class="item-chip"
                  >
                    {{ label }}
                  </span>
                </td>
              </tr>
              <tr v-if="!panelMode && expanded.has(group.key)" class="expanded-row">
                <td colspan="5">
                  <RunewordDetail :group="group" :rework-title="reworkTitle" :bases="basesFor ? basesFor(group) : []" :built="markBuilt && group.built" />
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

/* Bootstrap gives the table width: 100%, and a percentage-width table inside a
   scrolling wrapper has no sane intrinsic width: asked how wide it would like
   to be, the wrapper answered 500000px. A layout that believes that answer -
   and a second tier section was enough to make one believe it - drags the page
   sideways for as long as the tables exist. Containment settles the question
   before it is asked: this box takes the width it is given. The percentages
   still resolve against it, so the columns stay aligned across the sections. */
.table-responsive {
  contain: inline-size;
}

/* The mod's own mark, quiet on purpose: a dot in the page's gold, small
   enough to read as punctuation until you look for it. Two colours competing
   for attention in a name column was more than the distinction is worth.
   Not called "mark": Bootstrap owns that class name and paints it like a
   highlighter pen. */
.flag {
  margin-left: 0.3rem;
  font-size: 0.7em;
  vertical-align: 0.35em;
  color: rgba(201, 163, 106, 0.75);
  cursor: help;
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
  /* with an icon per rune a six-rune word no longer fits one line at every
     width; the runes wrap as pairs of icon and name */
  white-space: normal;
  line-height: 1.9;
}

/* The rune you do not have yet. */
.rune-missing {
  color: var(--d2r-gold-bright);
  font-weight: 600;
  border-bottom: 1px dashed rgba(201, 163, 106, 0.6);
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

/* The row whose stats the panel is showing. */
.is-selected > td {
  background: rgba(201, 163, 106, 0.1);
  box-shadow: inset 0 1px 0 rgba(201, 163, 106, 0.35), inset 0 -1px 0 rgba(201, 163, 106, 0.35);
}
.rune-name { white-space: nowrap; }
.rune-icon { display: inline-block; width: 17px; height: 17px; object-fit: contain; vertical-align: -3px; margin-right: 0.1rem; }
.built { color: #7fdc7f; margin-right: 0.35rem; font-weight: 700; }
</style>
