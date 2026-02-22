import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

/**
 * @typedef {'graph' | 'files' | 'git' | 'settings'} TabId
 */

function createStore() {
  const { subscribe, update, set } = writable({
    appName: 'FV Skills Command',
    skills: [],
    selectedSkillId: null,
    searchQuery: '',
    folderPath: null,
    loading: false,
    typeFilters: new Set(),
    activeDofs: new Map(),
    /** @type {TabId} */
    activeTab: 'graph',
  });

  return {
    subscribe,
    set,

    async openFolder() {
      let previousPath = '';
      update((s) => {
        previousPath = s.folderPath || '';
        return { ...s, loading: true };
      });

      try {
        if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
          throw new Error('Folder picker is unavailable in this runtime.');
        }

        const folderPath = window.prompt('Enter the absolute path to your skills folder:', previousPath || '')?.trim();
        if (!folderPath) {
          update((s) => ({ ...s, loading: false }));
          return;
        }

        const scanResult = await invoke('scan_folder', { folderPath });
        const scannedSkills = Array.isArray(scanResult?.skills) ? scanResult.skills : [];
        const normalizedSkills = scannedSkills
          .map((skill) => normalizeSkill(skill, folderPath))
          .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

        update((s) => ({
          ...s,
          folderPath,
          skills: normalizedSkills,
          selectedSkillId: normalizedSkills[0]?.id || null,
          activeTab: 'files',
          loading: false,
        }));
      } catch (error) {
        const message = String(error?.message || error || 'Failed to open folder.');
        console.error('[store.openFolder] scan failed:', error);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(`Unable to open folder.\n\n${message}`);
        }
        update((s) => ({ ...s, loading: false }));
      }
    },

    selectSkill(skillId) {
      update((s) => ({ ...s, selectedSkillId: skillId }));
    },

    setSkills(skills) {
      update((s) => {
        const selectedStillExists = skills.some((skill) => skill.id === s.selectedSkillId);
        return {
          ...s,
          skills,
          selectedSkillId: selectedStillExists ? s.selectedSkillId : (skills[0]?.id || null),
          loading: false,
        };
      });
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

    /** @param {TabId} tab */
    setActiveTab(tab) {
      update((s) => ({ ...s, activeTab: tab }));
    },
  };
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function toRelativePath(fullPath, folderPath) {
  const full = normalizePath(fullPath);
  const root = normalizePath(folderPath).replace(/\/+$/, '');
  if (!full || !root) return full;
  if (full === root) return '';
  if (full.startsWith(`${root}/`)) return full.slice(root.length + 1);
  return full;
}

function normalizeSkill(entry, folderPath) {
  const frontmatter = entry?.frontmatter && typeof entry.frontmatter === 'object' ? entry.frontmatter : {};
  const path = typeof entry?.path === 'string' ? entry.path : '';
  const relativePath = toRelativePath(path, folderPath);
  const pathParts = normalizePath(relativePath || path).split('/').filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] || '';
  const fallbackName = fileName.replace(/\.md$/i, '') || 'Untitled';
  const name = typeof entry?.name === 'string' && entry.name.trim().length > 0 ? entry.name : fallbackName;

  return {
    id: path || relativePath || name,
    path,
    relativePath,
    fileName,
    name,
    type: typeof frontmatter.type === 'string' ? frontmatter.type : 'skill',
    status: typeof frontmatter.status === 'string' ? frontmatter.status : null,
    frontmatter,
    body: typeof entry?.body === 'string' ? entry.body : '',
  };
}

export const store = createStore();
