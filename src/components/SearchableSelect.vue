<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  // [{ value, label, hint? }]
  options: { type: Array, required: true },
  modelValue: { default: null },
  placeholder: { type: String, default: 'Search...' },
});
const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const query = ref('');
const highlighted = ref(0);
const inputEl = ref(null);
const listEl = ref(null);

const selectedOption = computed(() =>
  props.options.find(o => o.value === props.modelValue) ?? null);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter(o =>
    o.label.toLowerCase().includes(q) || (o.hint && o.hint.toLowerCase().includes(q)));
});

watch(filtered, () => { highlighted.value = 0; });

const open = () => {
  isOpen.value = true;
  query.value = '';
  highlighted.value = Math.max(0, filtered.value.findIndex(o => o.value === props.modelValue));
};

const close = () => {
  isOpen.value = false;
  query.value = '';
};

const select = (option) => {
  emit('update:modelValue', option.value);
  close();
  inputEl.value?.blur();
};

const onKeydown = (event) => {
  if (!isOpen.value && (event.key === 'ArrowDown' || event.key === 'Enter')) {
    open();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlighted.value = Math.min(filtered.value.length - 1, highlighted.value + 1);
    scrollToHighlighted();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlighted.value = Math.max(0, highlighted.value - 1);
    scrollToHighlighted();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const option = filtered.value[highlighted.value];
    if (option) select(option);
  } else if (event.key === 'Escape') {
    close();
    inputEl.value?.blur();
  }
};

const scrollToHighlighted = () => {
  const el = listEl.value?.children[highlighted.value];
  el?.scrollIntoView({ block: 'nearest' });
};

// close when focus leaves the component (click outside included)
const onBlur = () => {
  setTimeout(() => {
    if (!inputEl.value || document.activeElement !== inputEl.value) close();
  }, 150);
};
</script>

<template>
  <div class="searchable-select">
    <input
      ref="inputEl"
      type="text"
      class="form-control"
      :value="isOpen ? query : (selectedOption?.label ?? '')"
      :placeholder="selectedOption?.label ?? placeholder"
      @focus="open"
      @blur="onBlur"
      @input="query = $event.target.value"
      @keydown="onKeydown"
    />
    <div v-if="isOpen" class="select-dropdown">
      <div v-if="filtered.length === 0" class="select-empty">No matches</div>
      <div ref="listEl">
        <button
          v-for="(option, index) in filtered"
          :key="option.value"
          type="button"
          class="select-option"
          :class="{ highlighted: index === highlighted, selected: option.value === modelValue }"
          @mousedown.prevent="select(option)"
          @mousemove="highlighted = index"
        >
          {{ option.label }}
          <span v-if="option.hint" class="select-hint">{{ option.hint }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.searchable-select {
  position: relative;
}

.select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  max-height: 18rem;
  overflow-y: auto;
  margin-top: 2px;
  background: rgb(24, 18, 12);
  border: 1px solid rgba(201, 163, 106, 0.45);
  border-radius: 0.375rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
}

.select-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.35rem 0.75rem;
  background: transparent;
  border: 0;
  color: #e8ddc8;
  font-size: 0.95rem;
}

.select-option.highlighted {
  background: rgba(201, 163, 106, 0.18);
}

.select-option.selected {
  color: #c9a36a;
}

.select-hint {
  float: right;
  color: rgba(201, 163, 106, 0.6);
  font-size: 0.8rem;
}

.select-empty {
  padding: 0.5rem 0.75rem;
  color: rgba(232, 221, 200, 0.5);
}
</style>
