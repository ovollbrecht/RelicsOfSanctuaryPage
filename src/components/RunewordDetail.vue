<script setup>
import { computed, ref, watch } from 'vue';
import { runeIcon } from '@/composables/useItemIcon.js';
import { flattenAllOf } from '@/composables/useProperties.js';
import { basesForGroup } from '@/composables/useItemBases.js';
import { calcStats, nonZeroStats } from '@/composables/useItemStats.js';
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
const props = defineProps({
  group: { type: Object, required: true },
  reworkTitle: { type: String, default: 'Changes vs. vanilla' },
  showHeader: { type: Boolean, default: false },
  // from the Grail: empty-socketed bases in the files that fit this runeword
  bases: { type: Array, default: () => [] },
  built: { type: Boolean, default: false },
  // the base the page filter picked, so the stats open on it where it fits
  defaultBase: { type: String, default: null },
});

// The runeword read on one base: every base it can be made in, the one the
// reader picked, and whether that one is ethereal. Nothing is stored; the
// pick follows the page's base filter when it fits and resets with the group.
const TIERS = ['elite', 'exceptional', 'normal'];
const TIER_LABELS = { normal: 'Normal', exceptional: 'Exceptional', elite: 'Elite' };
const pickable = computed(() => basesForGroup(props.group));
const pickableByTier = computed(() => TIERS
  .map((tier) => ({ tier, bases: pickable.value.filter((p) => p.base.Tier === tier) }))
  .filter((t) => t.bases.length));
const pickedCode = ref(null);
const ethereal = ref(false);
watch([() => props.group.key, () => props.defaultBase], () => {
  pickedCode.value = pickable.value.some((p) => p.base.Code === props.defaultBase) ? props.defaultBase : null;
}, { immediate: true });
const picked = computed(() => pickable.value.find((p) => p.base.Code === pickedCode.value) ?? null);
// Bows, crossbows and phase blades carry no durability and can never drop ethereal.
const canBeEthereal = computed(() => picked.value?.base.Durability != null);
watch(canBeEthereal, (can) => { if (!can) ethereal.value = false; });
const statsFor = (variantIndex) => {
  if (!picked.value || picked.value.variant !== variantIndex) return [];
  const stats = calcStats(picked.value.base, flattenAllOf(props.group.variants[variantIndex].properties), {
    ethereal: ethereal.value && canBeEthereal.value,
    levelReq: props.group.levelReq,
  });
  return nonZeroStats(stats);
};

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
        · {{ group.sockets === 1 ? $t('1 socket') : $t('{n} sockets', { n: group.sockets }) }}
        <template v-if="group.levelReq"> · {{ $t('Level {n}', { n: group.levelReq }) }}</template>
      </div>
    </div>

    <div v-if="pickable.length" class="base-pick" :class="{ 'is-panel': showHeader }">
      <label class="base-pick-label">
        <span>{{ $t('Base') }}</span>
        <select v-model="pickedCode" class="form-select form-select-sm base-select">
          <option :value="null">{{ $t('Pick a base for its stats') }}</option>
          <optgroup v-for="tier in pickableByTier" :key="tier.tier" :label="$t(TIER_LABELS[tier.tier])">
            <option v-for="p in tier.bases" :key="p.base.Code" :value="p.base.Code">{{ p.base.Name }}</option>
          </optgroup>
        </select>
      </label>
      <label v-if="picked" class="form-check form-check-inline base-eth" :class="{ 'text-muted': !canBeEthereal }" :title="canBeEthereal ? '' : $t('This base cannot be ethereal')">
        <input v-model="ethereal" type="checkbox" class="form-check-input" :disabled="!canBeEthereal" />
        <span class="form-check-label">{{ $t('Ethereal') }}</span>
      </label>
    </div>

    <div class="variant-row" :class="{ 'is-panel': showHeader }">
      <div v-for="(variant, variantIndex) in group.variants" :key="variant.label" class="variant-block">
        <!-- The heading only earns its place where there is more than one
             kind: on a weapon-only runeword it would just repeat the row. -->
        <div v-if="group.variants.length > 1" class="variant-label">{{ $t('In {item}', { item: variant.label }) }}</div>
        <ul v-if="statsFor(variantIndex).length" class="prop-lines stat-lines">
          <li v-for="[label, value] in statsFor(variantIndex)" :key="label">{{ $t(label) }}: {{ value }}</li>
        </ul>
        <ul class="prop-lines">
          <li v-for="(prop, propIndex) in flattenAllOf(variant.properties)" :key="propIndex">
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
      <div v-if="built" class="grail-built">✓ {{ $t('Built - your Grail has it') }}</div>
      <div v-if="group.build?.state === 'now'" class="grail-built">{{ $t('Your runes cover it as they lie.') }}</div>
      <div v-else-if="group.build?.state === 'upgrade'" class="grail-cube">{{ $t('Via the cube: make {text}.', { text: group.build.upgradeText }) }}</div>
      <div v-else-if="group.build" class="text-muted">{{ group.build.upgrades.length ? $t('Short of {names} even after making {text}.', { names: group.build.missingNames.join(', '), text: group.build.upgradeText }) : $t('Short of {names}.', { names: group.build.missingNames.join(', ') }) }}</div>
      <template v-if="bases.length">
        <div class="grail-label">{{ $t('Bases you hold for it') }}</div>
        <ul class="grail-bases">
          <li v-for="(b, n) in bases" :key="n">{{ b.name }}<span v-if="b.eth" class="text-muted"> · {{ $t('ethereal') }}</span><span class="text-muted"> · {{ b.how }}</span><span v-if="b.mods" class="staffmods"> · {{ b.mods }}</span><span class="text-muted"> · {{ b.where }}</span><span v-if="b.count > 1" class="text-muted"> ×{{ b.count }}</span></li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.base-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.5rem 1rem 0;
  font-size: 0.85rem;
}
.base-pick.is-panel { padding: 0 0 0.5rem; }
.base-pick-label { display: flex; align-items: center; gap: 0.5rem; color: var(--d2r-muted); }
.base-select { width: auto; max-width: 16rem; }
.base-eth { margin: 0; }
.stat-lines {
  margin-bottom: 0.6rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(201, 163, 106, 0.4);
}
.stat-lines > li { color: var(--d2r-muted); }
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
