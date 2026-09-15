<script setup>
import { runeIcon } from '@/composables/useItemIcon.js';
import ReworkChanges from '@/components/ReworkChanges.vue';

/**
 * A runeword's stats, the way a tooltip reads them: plain lines, one block per
 * kind of item where the runes roll differently.
 *
 * Rendered in two places - inline under a row on narrow screens, and in the
 * sticky panel beside the list on wide ones - which is exactly why it is its
 * own component: the roll styling already got lost once when markup moved and
 * its scoped styles stayed behind.
 */
defineProps({
  group: { type: Object, required: true },
  reworkTitle: { type: String, default: 'Changes vs. vanilla' },
  showHeader: { type: Boolean, default: false },
  // from the Grail: empty-socketed bases in the files that fit this runeword
  bases: { type: Array, default: () => [] },
  built: { type: Boolean, default: false },
});

// A group's odds at the precision the numbers carry: 60% stays 60%, and a
// 9.9% draw keeps its digit instead of rounding to a lie.
const formatChance = (chance) => {
  const percent = chance * 100;
  return `${percent < 10 ? percent.toFixed(1).replace(/\.0$/, '') : Math.round(percent)}%`;
};
</script>

<template>
  <div>
    <div v-if="showHeader" class="detail-head">
      <div class="detail-name">{{ group.name }}</div>
      <div class="detail-meta">
        <template v-for="(rune, n) in group.runes" :key="n"><span v-if="n > 0"> - </span><span class="rune-name"><img v-if="runeIcon(rune)" :src="runeIcon(rune)" class="rune-icon" alt="" />{{ rune }}</span></template>
        · {{ group.sockets }} {{ group.sockets === 1 ? 'socket' : 'sockets' }}
        <template v-if="group.levelReq"> · Level {{ group.levelReq }}</template>
      </div>
    </div>

    <div class="variant-row" :class="{ 'is-panel': showHeader }">
      <div v-for="variant in group.variants" :key="variant.label" class="variant-block">
        <!-- The heading only earns its place where there is more than one
             kind: on a weapon-only runeword it would just repeat the row. -->
        <div v-if="group.variants.length > 1" class="variant-label">In {{ variant.label }}</div>
        <ul class="prop-lines">
          <li v-for="(prop, propIndex) in variant.properties" :key="propIndex">
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
    <div v-if="built || bases.length || group.build" class="grail-note">
      <div v-if="built" class="grail-built">✓ Built - your Grail has it</div>
      <div v-if="group.build?.state === 'now'" class="grail-built">Your runes cover it as they lie.</div>
      <div v-else-if="group.build?.state === 'upgrade'" class="grail-cube">Via the cube: make {{ group.build.upgradeText }}.</div>
      <div v-else-if="group.build" class="text-muted">Short of {{ group.build.missingNames.join(', ') }}<template v-if="group.build.upgrades.length"> even after making {{ group.build.upgradeText }}</template>.</div>
      <template v-if="bases.length">
        <div class="grail-label">Bases you hold for it</div>
        <ul class="grail-bases">
          <li v-for="(b, n) in bases" :key="n">{{ b.name }}<span v-if="b.eth" class="text-muted"> · ethereal</span><span class="text-muted"> · {{ b.how }}</span><span v-if="b.mods" class="staffmods"> · {{ b.mods }}</span><span class="text-muted"> · {{ b.where }}</span><span v-if="b.count > 1" class="text-muted"> ×{{ b.count }}</span></li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.detail-head {
  padding: 0.25rem 0 0.6rem;
  border-bottom: 1px solid rgba(201, 163, 106, 0.3);
  margin-bottom: 0.75rem;
}

.detail-name {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--d2r-gold-bright);
}

.detail-meta {
  font-size: 0.85rem;
  color: var(--d2r-muted);
}

.variant-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem 2.5rem;
  padding: 0.75rem 1rem 1rem;
}

/* In the panel the variants stack: its width is one column by design. */
.variant-row.is-panel {
  flex-direction: column;
  gap: 1.1rem;
  padding: 0;
}

.variant-block {
  flex: 1 1 20rem;
  min-width: 0;
}

.variant-label {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--d2r-gold);
  border-bottom: 1px solid rgba(201, 163, 106, 0.25);
  padding-bottom: 0.3rem;
  margin-bottom: 0.5rem;
}

.prop-lines {
  list-style: none;
  margin: 0;
  padding: 0;
}

.prop-lines > li {
  padding: 0.14rem 0;
  color: var(--d2r-text);
  font-size: 0.95em;
  line-height: 1.4;
}

/* The rolls a property group draws from, indented under the line that
   introduces them - the same treatment the item pages give them. */
.property-rolls {
  list-style: none;
  margin: 2px 0 4px;
  padding: 0 0 0 14px;
  border-left: 2px solid rgba(255, 255, 255, 0.14);
  max-width: 26rem;
}

.property-rolls li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.9em;
  opacity: 0.85;
  padding: 1px 0;
}

.roll-chance {
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.rune-name { white-space: nowrap; }
.rune-icon { display: inline-block; width: 18px; height: 18px; object-fit: contain; vertical-align: -4px; margin-right: 0.15rem; }
.grail-note { margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.9rem; }
.grail-built { color: #7fdc7f; font-weight: 600; }
.grail-cube { color: #e0b85a; font-weight: 600; }
.grail-label { color: var(--d2r-gold); font-family: var(--font-display); font-size: 0.8rem; margin-top: 0.25rem; }
.grail-bases { margin: 0.2rem 0 0; padding-left: 1rem; }
.staffmods { color: #8f8fff; }
</style>
