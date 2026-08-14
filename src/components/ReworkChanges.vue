<script setup>
// Shared "Changes vs. vanilla" block for reworked entries (runewords,
// affixes, ...). Expects a list of {label?, old, new} change lines, e.g.
// produced by pairing Properties with VanillaProperties.
defineProps({
  changes: {
    type: Array,
    required: true
  },
  title: {
    type: String,
    default: 'Changes vs. vanilla'
  }
});
</script>

<template>
  <div class="rework-changes mt-3">
    <h6 class="section-header">{{ title }}</h6>
    <ul class="list-group list-group-flush">
      <li
        v-for="(change, changeIndex) in changes"
        :key="changeIndex"
        class="list-group-item list-item-property"
      >
        <span v-if="change.label" class="rework-label">{{ change.label }}: </span>
        <span v-if="change.old" class="rework-old">{{ change.old }}</span>
        <span v-if="change.old && change.new" class="rework-arrow"> → </span>
        <span v-if="change.new" class="rework-new">{{ change.new }}</span>
        <span v-if="!change.new" class="rework-removed"> (removed)</span>
        <span v-if="!change.old" class="rework-added"> (new)</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rework-old {
  color: rgba(194, 176, 143, 0.55);
  text-decoration: line-through;
}

.rework-new {
  color: var(--d2r-gold, #c9a36a);
}

.rework-arrow {
  color: rgba(194, 176, 143, 0.7);
}

.rework-added,
.rework-removed,
.rework-label {
  color: rgba(194, 176, 143, 0.7);
  font-style: italic;
}
</style>
