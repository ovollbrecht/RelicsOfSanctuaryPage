<script setup>
import { computed } from 'vue';
import optionData from '@/assets/mod_options.json';

// The standalone archive is a D2RMM install of this same mod with every option
// left alone, packaged as game files. So its column is not a second source of
// truth - it is what the default says, read as "is this in the box".
const standaloneOf = (option) => {
  if (option.type === 'checkbox') {
    return option.defaultValue
      ? { text: 'Included', included: true }
      : { text: 'Not included', included: false };
  }

  const chosen = defaultLabel(option);
  return chosen ? { text: `${chosen}, fixed`, included: true } : { text: 'Fixed', included: true };
};

const defaultLabel = (option) => {
  if (option.type === 'checkbox') return option.defaultValue ? 'On' : 'Off';

  const choice = (option.options ?? []).find((entry) => entry.value === option.defaultValue);
  return choice?.label ?? (option.defaultValue == null ? '' : String(option.defaultValue));
};

const groups = computed(() => optionData.groups.map((group) => ({
  ...group,
  // Options ahead of the first section are the ones D2RMM shows above
  // everything else; they have no heading of their own in the installer.
  name: group.name ?? 'General',
  options: group.options.map((option) => ({
    ...option,
    choices: (option.options ?? []).map((entry) => entry.label).join(' · '),
    default: defaultLabel(option),
    standalone: standaloneOf(option),
  })),
})));

const optionCount = computed(() =>
  groups.value.reduce((total, group) => total + group.options.length, 0));

const offByDefault = computed(() => groups.value
  .flatMap((group) => group.options.map((option) => ({ ...option, group: group.name })))
  .filter((option) => option.type === 'checkbox' && !option.defaultValue));
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-3">Options</h1>
        <p class="lead text-muted">
          Every part of this mod can be switched off, and most of it can be tuned.
          Here is the full list, what each one does, and what the standalone archive brings with it.
        </p>
      </div>
    </div>

    <!-- The two archives -->
    <div class="row mt-4 g-4">
      <div class="col-md-6">
        <div class="card h-100 card-enhanced card-hover">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">D2RMM — every option</h3>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              The D2RMM download is the installer script, not the game files: D2RMM builds them
              when you install, from the settings you pick. All {{ optionCount }} options below
              are yours to set, and changing your mind means changing a checkbox and installing again.
            </p>
            <ul class="feature-list">
              <li>Install D2RMM, drop the mod into its <code>mods</code> folder</li>
              <li>Set the options, then install</li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card h-100 card-enhanced card-hover">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">Standalone — the defaults</h3>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              The standalone archive carries the finished game files. It is this same mod installed
              through D2RMM with every option left at its default and then packaged, so it needs no
              tools — and it has no settings. What the <strong>Standalone</strong> column below says
              is what is in it.
            </p>
            <ul class="feature-list">
              <li>Extract to <code>[GamePath]/mods</code> — you should end up with
                <code>mods/RelicsOfSanctuary/RelicsOfSanctuary.mpq/…</code></li>
              <li>Make a shortcut of <code>D2R.exe</code></li>
              <li>Add <code>-mod RelicsOfSanctuary -txt</code> to its target path</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- What the standalone leaves out -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-dark">
            <h4 class="m-0">Only in the D2RMM version</h4>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              Everything the mod does is in the standalone except the {{ offByDefault.length }} options
              that stay off until you ask for them — a narrower way to play, or a workaround you may
              not need:
            </p>
            <ul class="feature-list">
              <li v-for="option in offByDefault" :key="option.id">
                <strong>{{ option.name }}</strong>
                <span class="option-group">({{ option.group }})</span> — {{ option.description }}
              </li>
            </ul>
            <p class="card-text mb-0">
              The drop chances can be changed in D2RMM as well; the standalone is fixed at the
              recommended 5%.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- The options themselves -->
    <div v-for="group in groups" :key="group.id ?? 'general'" class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-dark">
            <h4 class="m-0">{{ group.name }}</h4>
          </div>
          <div class="card-body p-0">
            <p v-if="group.description" class="group-note px-4 pt-3 mb-0">{{ group.description }}</p>
            <div class="table-responsive">
              <table class="table table-dark table-striped table-hover mb-0 options-table">
                <thead>
                  <tr>
                    <th scope="col">Option</th>
                    <th scope="col">What it does</th>
                    <th scope="col" class="text-nowrap">Default</th>
                    <th scope="col" class="text-nowrap">Standalone</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="option in group.options" :key="option.id">
                    <th scope="row" class="option-name">
                      {{ option.name }}
                      <div v-if="option.choices" class="option-choices">{{ option.choices }}</div>
                    </th>
                    <td class="option-text">{{ option.description }}</td>
                    <td class="text-nowrap">
                      <span class="badge" :class="option.default === 'Off' ? 'state-off' : 'state-on'">
                        {{ option.default }}
                      </span>
                    </td>
                    <td class="text-nowrap option-text">
                      <span :class="option.standalone.included ? 'in-box' : 'not-in-box'">
                        {{ option.standalone.text }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="text-muted mt-4 mb-0 small">
      Read from the mod's own installer manifest, version {{ optionData.modVersion }} — the same
      list D2RMM shows you.
    </p>
  </div>
</template>

<style scoped>
.options-table th,
.options-table td {
  vertical-align: top;
}

.options-table {
  min-width: 34rem;
}

.option-name {
  width: 22%;
  min-width: 11rem;
  color: var(--d2r-gold-bright);
  font-weight: 600;
}

.option-choices {
  margin-top: 0.15rem;
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--d2r-muted);
}

.option-text {
  color: var(--d2r-text);
}

.group-note {
  color: var(--d2r-muted);
}

.option-group {
  color: var(--d2r-muted);
  font-size: 0.85em;
  margin-left: 0.15rem;
}

.badge.state-on {
  background: linear-gradient(135deg, rgba(58, 76, 42, 0.95), rgba(24, 32, 18, 0.95));
  color: var(--d2r-text);
  border: 1px solid rgba(96, 122, 70, 0.8);
}

.badge.state-off {
  background: linear-gradient(135deg, rgba(36, 26, 18, 0.95), rgba(18, 14, 10, 0.95));
  color: var(--d2r-muted);
  border: 1px solid rgba(59, 42, 31, 0.8);
}

.in-box {
  color: var(--d2r-gold);
}

.not-in-box {
  color: var(--d2r-muted);
}

code {
  color: var(--d2r-gold);
  background: rgba(0, 0, 0, 0.35);
  padding: 0.05rem 0.3rem;
  border-radius: var(--radius-sm);
}
</style>
