<script setup>
import { computed, ref } from 'vue';
import { iconUrl } from '@/composables/useItemIcon.js';

/**
 * The runes lying loose in the imported files, and what they are good for:
 * the runewords still missing from the Grail that could be made right now,
 * and the ones a single rune short. Socketed runes do not count - they are
 * spent.
 */
const props = defineProps({
  runes: { type: Array, required: true },       // catalog.runes [{ code, name, number, lvl }]
  counts: { type: Object, default: () => ({}) }, // code -> loose copies
  runewords: { type: Array, required: true },   // checklist entries of kind runeword, with .record
  files: { type: Number, default: 0 },
});

const HIGH = 26; // Vex and up
const SHOW = 12;
const allNow = ref(false);
const allShort = ref(false);
const byName = computed(() => new Map(props.runes.map((r) => [r.name, r])));
const cells = computed(() => props.runes.map((r) => ({ ...r, n: props.counts[r.code] ?? 0, high: r.number >= HIGH })));
const totals = computed(() => {
  const all = cells.value.reduce((s, c) => s + c.n, 0);
  const high = cells.value.filter((c) => c.high).reduce((s, c) => s + c.n, 0);
  const best = [...cells.value].reverse().find((c) => c.n > 0) ?? null;
  return { all, high, best };
});

// what each missing runeword still needs, counting copies
const reach = computed(() => {
  const list = [];
  for (const rw of props.runewords) {
    if (rw.record) continue;
    const need = new Map();
    for (const name of rw.runes) need.set(name, (need.get(name) ?? 0) + 1);
    const missing = [];
    let top = 0;
    for (const [name, n] of need) {
      const rune = byName.value.get(name);
      top = Math.max(top, rune?.number ?? 0);
      const have = rune ? (props.counts[rune.code] ?? 0) : 0;
      for (let i = have; i < n; i++) missing.push(name);
    }
    list.push({ ...rw, missing, top });
  }
  const sortTop = (a, b) => b.top - a.top || a.name.localeCompare(b.name);
  return {
    now: list.filter((x) => x.missing.length === 0).sort(sortTop),
    oneShort: list.filter((x) => x.missing.length === 1).sort(sortTop),
  };
});
</script>

<template>
  <div class="card card-enhanced">
    <div class="card-header card-header-primary d-flex flex-wrap justify-content-between align-items-baseline gap-2">
      <h2 class="h5 card-title m-0">Rune cabinet</h2>
      <span v-if="totals.all" class="small text-muted">
        {{ totals.all }} loose {{ totals.all === 1 ? 'rune' : 'runes' }} · {{ totals.high }} Vex or higher<template v-if="totals.best"> · highest {{ totals.best.name }}</template>
      </span>
    </div>
    <div class="card-body p-3">
      <template v-if="files">
        <div class="rune-grid">
          <div v-for="r in cells" :key="r.code" class="rune" :class="{ have: r.n > 0, high: r.high }" :title="`${r.name} Rune (#${r.number}) · ${r.n} loose`">
            <img v-if="iconUrl(r.code)" :src="iconUrl(r.code)" class="rune-img" alt="" />
            <div class="rune-name">{{ r.name }}</div>
            <div class="rune-n">{{ r.n || '·' }}</div>
          </div>
        </div>
        <div class="row g-3 mt-1">
          <div class="col-md-6">
            <div class="reach-title">Missing runewords you could make now <span class="text-muted">· {{ reach.now.length }}</span></div>
            <ul v-if="reach.now.length" class="list-unstyled small m-0 reach">
              <li v-for="rw in (allNow ? reach.now : reach.now.slice(0, SHOW))" :key="rw.id">
                <router-link :to="{ path: '/runewords', query: { q: rw.name } }" class="name runeword">{{ rw.name }}</router-link>
                <span class="text-muted"> · {{ rw.runes.join(' ') }}</span>
              </li>
              <li v-if="reach.now.length > SHOW"><a href="#" class="text-muted" @click.prevent="allNow = !allNow">{{ allNow ? 'Fewer' : `All ${reach.now.length}` }}</a></li>
            </ul>
            <div v-else class="small text-muted">None - either the runes are short or the words are made already.</div>
          </div>
          <div class="col-md-6">
            <div class="reach-title">One rune short <span class="text-muted">· {{ reach.oneShort.length }}</span></div>
            <ul v-if="reach.oneShort.length" class="list-unstyled small m-0 reach">
              <li v-for="rw in (allShort ? reach.oneShort : reach.oneShort.slice(0, SHOW))" :key="rw.id">
                <router-link :to="{ path: '/runewords', query: { q: rw.name } }" class="name runeword">{{ rw.name }}</router-link>
                <span class="text-muted"> · needs <strong class="text-body">{{ rw.missing[0] }}</strong></span>
              </li>
              <li v-if="reach.oneShort.length > SHOW"><a href="#" class="text-muted" @click.prevent="allShort = !allShort">{{ allShort ? 'Fewer' : `All ${reach.oneShort.length}` }}</a></li>
            </ul>
            <div v-else class="small text-muted">Nothing within one rune.</div>
          </div>
        </div>
      </template>
      <div v-else class="small text-muted">Import the shared stash and your characters to see which runes lie around and which missing runewords they already cover.</div>
    </div>
  </div>
</template>

<style scoped>
.rune-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(4rem, 1fr)); gap: 4px; }
.rune { border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 4px; padding: 0.25rem 0.2rem; text-align: center; opacity: 0.45; }
.rune.have { opacity: 1; border-color: rgba(201, 163, 106, 0.45); background: rgba(201, 163, 106, 0.08); }
.rune.high.have { border-color: var(--d2r-gold-bright); background: rgba(212, 175, 55, 0.16); box-shadow: 0 0 6px rgba(228, 198, 138, 0.25); }
.rune-img { width: 28px; height: 28px; object-fit: contain; display: block; margin: 0 auto 0.1rem; }
.rune-name { font-family: var(--font-display); font-size: 0.8rem; color: var(--d2r-gold-bright); }
.rune-n { font-size: 0.85rem; line-height: 1.1; }
.reach-title { font-weight: 600; margin-bottom: 0.25rem; }
.reach li { padding: 0.12rem 0; }
.name { text-decoration: none; }
.name:hover { text-decoration: underline; }
.name.runeword { color: #ffb84d; }
</style>
