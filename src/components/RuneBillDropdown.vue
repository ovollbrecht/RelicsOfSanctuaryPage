<script setup>
import { computed } from 'vue';
import { runeIcon } from '@/composables/useItemIcon.js';

/**
 * A dropdown that sums the runes a list of runewords would take - one of
 * each, the built ones left out, what you hold not subtracted. Sits in a
 * table header, or above all the tables for everything the filters let
 * through. A native <details>, so it needs no script to open and close.
 */
const props = defineProps({
  groups: { type: Array, required: true },  // table groups: { runes: [names], built }
  runes: { type: Array, required: true },   // [{ code, name, number }] in rune order
  label: { type: String, default: '' },
  // leave the built ones out - on only while the page marks them
  excludeBuilt: { type: Boolean, default: false },
});
const bill = computed(() => {
  const counts = new Map();
  let words = 0; let built = 0;
  for (const g of props.groups) {
    if (props.excludeBuilt && g.built) { built++; continue; }
    words++;
    for (const name of g.runes ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const list = props.runes.filter((r) => counts.has(r.name)).map((r) => ({ ...r, n: counts.get(r.name) }));
  return { list, words, built, total: list.reduce((s, r) => s + r.n, 0), high: list.filter((r) => r.number >= 26).reduce((s, r) => s + r.n, 0) };
});
</script>

<template>
  <details class="rune-dd" @click.stop>
    <summary class="btn btn-sm btn-outline-secondary">{{ label || $t('Runes needed') }} <span class="dd-total">{{ bill.total }}</span></summary>
    <div class="dd-panel">
      <div class="small text-muted mb-2">
        <template v-if="bill.words">{{ bill.words === 1 ? $t('1 runeword takes') : $t('{n} runewords take', { n: bill.words }) }} <strong>{{ bill.total }}</strong> {{ $t('runes, {n} of them Vex or higher.', { n: bill.high }) }}</template>
        <template v-else>{{ $t('Nothing left to build here.') }}</template>
        <template v-if="bill.built">{{ ' ' + (bill.built === 1 ? $t('1 built one left out.') : $t('{n} built ones left out.', { n: bill.built })) }}</template>
        {{ ' ' + $t('What you hold is not subtracted.') }}
      </div>
      <div class="dd-grid">
        <span v-for="r in bill.list" :key="r.code" class="dd-chip" :class="{ 'is-high': r.number >= 26 }">
          <img v-if="runeIcon(r.name)" :src="runeIcon(r.name)" class="dd-icon" alt="" />{{ r.name }} <span class="dd-n">×{{ r.n }}</span>
        </span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.rune-dd { position: relative; }
.rune-dd summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; }
.rune-dd summary::-webkit-details-marker { display: none; }
.rune-dd summary::after { content: '▾'; opacity: 0.7; }
.rune-dd[open] summary::after { content: '▴'; }
.dd-total { color: var(--d2r-gold-bright); font-variant-numeric: tabular-nums; }
.dd-panel { position: absolute; right: 0; top: calc(100% + 0.35rem); z-index: 20; width: min(34rem, 90vw); padding: 0.75rem; text-align: left;
  background: var(--d2r-panel); border: 1px solid rgba(201, 163, 106, 0.4); border-radius: var(--radius-sm); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); }
.dd-grid { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.dd-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.5rem; font-size: 0.85rem; color: var(--d2r-text); border: 1px solid rgba(59, 42, 31, 0.9); border-radius: var(--radius-sm); background: rgba(0, 0, 0, 0.2); }
.dd-chip.is-high { border-color: rgba(224, 184, 90, 0.5); }
.dd-icon { width: 1.1rem; height: 1.1rem; display: inline-block; object-fit: contain; }
.dd-n { color: var(--d2r-gold-bright); font-variant-numeric: tabular-nums; font-weight: 600; }
</style>
