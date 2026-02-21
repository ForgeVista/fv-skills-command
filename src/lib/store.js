import { writable, derived } from 'svelte/store';

function createStore() {
  const { subscribe, update, set } = writable({
    appName: 'FV Skills Graph Viewer',
    skills: [],
    selectedSkillId: null,
    searchQuery: '',
    folderPath: null,
    loading: false,
    typeFilters: new Set(),
    activeDofs: new Map(),
  });

  return {
    subscribe,
    set,

    async openFolder() {
      // Desktop: invoke Tauri dialog, then scan
      // Web: use showDirectoryPicker()
      update((s) => ({ ...s, loading: true }));
      // Implementation wired up in platform-specific layer
    },

    selectSkill(skillId) {
      update((s) => ({ ...s, selectedSkillId: skillId }));
    },

    setSkills(skills) {
      update((s) => ({ ...s, skills, loading: false }));
    },

    setSearchQuery(query) {
      update((s) => ({ ...s, searchQuery: query }));
    },

    toggleTypeFilter(type) {
      update((s) => {
        const filters = new Set(s.typeFilters);
        if (filters.has(type)) {
          filters.delete(type);
        } else {
          filters.add(type);
        }
        return { ...s, typeFilters: filters };
      });
    },

    toggleDof(stepIndex, dofIndex) {
      update((s) => {
        const key = `${stepIndex}:${dofIndex}`;
        const active = new Map(s.activeDofs);
        if (active.has(key)) {
          active.delete(key);
        } else {
          active.set(key, true);
        }
        return { ...s, activeDofs: active };
      });
    },
  };
}

export const store = createStore();
