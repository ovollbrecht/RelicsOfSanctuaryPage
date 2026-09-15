<script setup>
import { computed, ref, watch } from 'vue';
import { t, dateLocale } from '@/i18n';
import { iconUrl } from '@/composables/useItemIcon.js';

/**
 * The Chronicle read as a diary: day by day, what fell and who dropped it.
 * A day picked on the heatmap narrows it to that day.
 */
const props = defineProps({
  entries: { type: Array, required: true },
  sources: { type: Object, default: () => ({}) },
  day: { type: String, default: null }, // yyyy-mm-dd
});
const emit = defineEmits(['clear-day']);

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dated = computed(() => props.entries.filter((e) => e.record?.when).map((e) => ({ ...e, at: new Date(e.record.when) })).sort((a, b) => b.at - a.at));
const days = computed(() => {
  const m = new Map();
  for (const e of dated.value) { const k = dayKey(e.at); if (!m.has(k)) m.set(k, { key: k, at: e.at, items: [] }); m.get(k).items.push(e); }
  return [...m.values()];
});
const STEP = 10;
const limit = ref(STEP);
watch(() => props.day, () => { limit.value = STEP; });
const shown = computed(() => (props.day ? days.value.filter((d) => d.key === props.day) : days.value.slice(0, limit.value)));
const more = computed(() => (props.day ? 0 : Math.max(0, days.value.length - limit.value)));

const today = dayKey(new Date());
const yesterday = dayKey(new Date(Date.now() - 86400000));
const dayTitle = (d) => (d.key === today ? t('Today') : d.key === yesterday ? t('Yesterday') : d.at.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
const timeOf = (d) => d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
const kindClass = (e) => (e.kind === 'runeword' ? 'runeword' : e.kind);
const tag = (e) => (e.exalted ? 'Exalted' : e.mythic ? 'Mythic' : e.kind === 'runeword' ? t('Runeword') : e.kind === 'set' ? t('Set') : null);
</script>

<template>
  <div class="card card-enhanced">
    <div class="card-header card-header-primary py-2 d-flex flex-wrap justify-content-between align-items-baseline gap-2">
      <span class="h6 m-0">{{ $t('Chronicle') }}</span>
      <span class="small text-muted">
        <template v-if="day">{{ $t('one day') }} · <a href="#" @click.prevent="emit('clear-day')">{{ $t('show all') }}</a></template>
        <template v-else>{{ days.length === 1 ? $t('1 day with a find') : $t('{n} days with a find', { n: days.length }) }}</template>
      </span>
    </div>
    <div class="card-body p-0 timeline">
      <template v-if="shown.length">
        <div v-for="d in shown" :key="d.key" class="day">
          <div class="day-head"><span class="day-title">{{ dayTitle(d) }}</span><span class="text-muted small">{{ d.items.length === 1 ? $t('1 find') : $t('{n} finds', { n: d.items.length }) }}</span></div>
          <ul class="list-unstyled m-0">
            <li v-for="e in d.items" :key="e.kind + e.id" class="find">
              <span class="time">{{ timeOf(e.at) }}</span>
              <span class="ico-wrap"><img v-if="e.code && iconUrl(e.code)" :src="iconUrl(e.code)" class="ico" alt="" /></span>
              <span class="what text-truncate">
                <span class="name" :class="kindClass(e)">{{ e.name }}</span>
                <span v-if="tag(e)" class="badge tag ms-1" :class="kindClass(e)">{{ tag(e) }}</span>
                <span v-if="e.kind !== 'runeword' && e.base" class="text-muted small"> · {{ e.base }}</span>
              </span>
              <span v-if="e.record.by && sources[e.record.by]" class="by small text-muted text-truncate">{{ sources[e.record.by] }}</span>
            </li>
          </ul>
        </div>
        <div v-if="more" class="p-2 small"><a href="#" @click.prevent="limit += STEP">{{ $t('{n} more days', { n: more }) }}</a></div>
      </template>
      <div v-else class="p-3 small text-muted">{{ day ? $t('Nothing on that day.') : $t('Nothing dated yet.') }}</div>
    </div>
  </div>
</template>

<style scoped>
.timeline { max-height: 34rem; overflow-y: auto; }
.day { border-top: 1px solid rgba(255, 255, 255, 0.06); }
.day:first-child { border-top: 0; }
.day-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0.4rem 0.75rem 0.2rem; position: sticky; top: 0; background: var(--d2r-panel); z-index: 1; }
.day-title { font-family: var(--font-display); color: var(--d2r-gold-bright); font-size: 0.95rem; }
.find { display: grid; grid-template-columns: 3rem 1.6rem minmax(0, 1fr) auto; align-items: center; gap: 0.4rem; padding: 0.2rem 0.75rem; }
.time { font-size: 0.75rem; color: var(--d2r-muted); font-variant-numeric: tabular-nums; }
.ico-wrap { width: 1.6rem; height: 1.6rem; display: flex; align-items: center; justify-content: center; }
.ico { max-width: 1.6rem; max-height: 1.6rem; display: inline-block; }
.name.unique { color: #c7b377; } .name.set { color: #7fdc7f; } .name.runeword { color: #ffb84d; }
.tag { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.04em; vertical-align: middle; color: var(--d2r-muted); background: rgba(255, 255, 255, 0.06); }
.tag.unique { color: #c7b377; } .tag.set { color: #7fdc7f; } .tag.runeword { color: #ffb84d; }
.by { max-width: 11rem; text-align: right; }
</style>
