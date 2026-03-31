// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

export type ThemeKey =
  | 'dark' | 'light'
  | 'ocean-dark' | 'ocean-light'
  | 'forest-dark' | 'forest-light'
  | 'dusk-dark' | 'dusk-light'
  | 'ember-dark' | 'ember-light'
  | 'rose-dark' | 'rose-light'
  | 'arctic-dark' | 'arctic-light'
  | 'noir-dark' | 'noir-light'
  | 'slate-dark' | 'slate-light'
  | 'copper-dark' | 'copper-light'
  | 'neon-dark' | 'neon-light'
  | 'tokyo-night' | 'tokyo-storm' | 'tokyo-day'
  | 'solarized-dark' | 'solarized-light'
  | 'catppuccin-mocha' | 'catppuccin-latte'
  | 'gruvbox-dark' | 'gruvbox-light'
  | 'dracula'
  | 'nord'

export interface ThemeMeta {
  key: ThemeKey
  label: string
  group: string
  mode: 'dark' | 'light'
  preview: { bg: string; surface: string; accent: string }
}

export const THEMES: ThemeMeta[] = [
  // Base
  { key: 'dark',         label: 'Dark',          group: 'Base',   mode: 'dark',  preview: { bg: '#060a0f', surface: '#0c1118', accent: '#00c9a7' } },
  { key: 'light',        label: 'Light',         group: 'Base',   mode: 'light', preview: { bg: '#eaecf2', surface: '#f0f3f8', accent: '#0891b2' } },
  // Ocean
  { key: 'ocean-dark',   label: 'Ocean',         group: 'Ocean',  mode: 'dark',  preview: { bg: '#030b14', surface: '#071525', accent: '#38bdf8' } },
  { key: 'ocean-light',  label: 'Ocean',         group: 'Ocean',  mode: 'light', preview: { bg: '#d8eefa', surface: '#e4f4ff', accent: '#0284c7' } },
  // Forest
  { key: 'forest-dark',  label: 'Forest',        group: 'Forest', mode: 'dark',  preview: { bg: '#030d08', surface: '#071a0d', accent: '#4ade80' } },
  { key: 'forest-light', label: 'Forest',        group: 'Forest', mode: 'light', preview: { bg: '#d4f5df', surface: '#e0fae9', accent: '#15803d' } },
  // Dusk
  { key: 'dusk-dark',    label: 'Dusk',          group: 'Dusk',   mode: 'dark',  preview: { bg: '#0d0514', surface: '#160b24', accent: '#c084fc' } },
  { key: 'dusk-light',   label: 'Dusk',          group: 'Dusk',   mode: 'light', preview: { bg: '#ecdeff', surface: '#f3e8ff', accent: '#7c3aed' } },
  // Ember
  { key: 'ember-dark',   label: 'Ember',         group: 'Ember',  mode: 'dark',  preview: { bg: '#100704', surface: '#1e0d07', accent: '#fb923c' } },
  { key: 'ember-light',  label: 'Ember',         group: 'Ember',  mode: 'light', preview: { bg: '#f5e0c0', surface: '#fcefd8', accent: '#c2410c' } },
  // Rose
  { key: 'rose-dark',    label: 'Rose',          group: 'Rose',   mode: 'dark',  preview: { bg: '#100308', surface: '#1e0811', accent: '#f472b6' } },
  { key: 'rose-light',   label: 'Rose',          group: 'Rose',   mode: 'light', preview: { bg: '#f5d0d4', surface: '#fce0e3', accent: '#be123c' } },
  // Arctic
  { key: 'arctic-dark',  label: 'Arctic',        group: 'Arctic', mode: 'dark',  preview: { bg: '#040d12', surface: '#08181f', accent: '#67e8f9' } },
  { key: 'arctic-light', label: 'Arctic',        group: 'Arctic', mode: 'light', preview: { bg: '#caf0f8', surface: '#d8f5fc', accent: '#0e7490' } },
  // Noir
  { key: 'noir-dark',    label: 'Noir',          group: 'Noir',   mode: 'dark',  preview: { bg: '#000000', surface: '#0a0a0a', accent: '#e0e0e0' } },
  { key: 'noir-light',   label: 'Noir',          group: 'Noir',   mode: 'light', preview: { bg: '#dedede', surface: '#e8e8e8', accent: '#111111' } },
  // Slate
  { key: 'slate-dark',   label: 'Slate',         group: 'Slate',  mode: 'dark',  preview: { bg: '#0f1117', surface: '#171b26', accent: '#818cf8' } },
  { key: 'slate-light',  label: 'Slate',         group: 'Slate',  mode: 'light', preview: { bg: '#dde2f0', surface: '#e6eaf6', accent: '#4f46e5' } },
  // Copper
  { key: 'copper-dark',  label: 'Copper',        group: 'Copper', mode: 'dark',  preview: { bg: '#0e0907', surface: '#1c1410', accent: '#f59e0b' } },
  { key: 'copper-light', label: 'Copper',        group: 'Copper', mode: 'light', preview: { bg: '#f0dfc0', surface: '#f8ecd4', accent: '#b45309' } },
  // Neon
  { key: 'neon-dark',    label: 'Neon',          group: 'Neon',         mode: 'dark',  preview: { bg: '#020309', surface: '#050a14', accent: '#00ff94' } },
  { key: 'neon-light',   label: 'Neon',          group: 'Neon',         mode: 'light', preview: { bg: '#c0f5df', surface: '#d0faeb', accent: '#059669' } },
  // Tokyo Night
  { key: 'tokyo-night',  label: 'Tokyo Night',   group: 'Tokyo Night',  mode: 'dark',  preview: { bg: '#1a1b26', surface: '#1f2335', accent: '#7aa2f7' } },
  { key: 'tokyo-storm',  label: 'Tokyo Storm',   group: 'Tokyo Night',  mode: 'dark',  preview: { bg: '#1e2030', surface: '#24283b', accent: '#7aa2f7' } },
  { key: 'tokyo-day',    label: 'Tokyo Day',     group: 'Tokyo Night',  mode: 'light', preview: { bg: '#e1e2e7', surface: '#eaebf0', accent: '#2e7de9' } },
  // Solarized
  { key: 'solarized-dark',  label: 'Solarized', group: 'Solarized',    mode: 'dark',  preview: { bg: '#002b36', surface: '#073642', accent: '#268bd2' } },
  { key: 'solarized-light', label: 'Solarized', group: 'Solarized',    mode: 'light', preview: { bg: '#fdf6e3', surface: '#f8f0da', accent: '#268bd2' } },
  // Catppuccin
  { key: 'catppuccin-mocha', label: 'Mocha',    group: 'Catppuccin',   mode: 'dark',  preview: { bg: '#1e1e2e', surface: '#181825', accent: '#cba6f7' } },
  { key: 'catppuccin-latte', label: 'Latte',    group: 'Catppuccin',   mode: 'light', preview: { bg: '#eff1f5', surface: '#eaecf0', accent: '#8839ef' } },
  // Gruvbox
  { key: 'gruvbox-dark',  label: 'Gruvbox',     group: 'Gruvbox',      mode: 'dark',  preview: { bg: '#282828', surface: '#32302f', accent: '#fabd2f' } },
  { key: 'gruvbox-light', label: 'Gruvbox',     group: 'Gruvbox',      mode: 'light', preview: { bg: '#fbf1c7', surface: '#f5ead8', accent: '#b57614' } },
  // Dracula
  { key: 'dracula',       label: 'Dracula',     group: 'Dracula',      mode: 'dark',  preview: { bg: '#282a36', surface: '#21222c', accent: '#bd93f9' } },
  // Nord
  { key: 'nord',          label: 'Nord',        group: 'Nord',         mode: 'dark',  preview: { bg: '#2e3440', surface: '#3b4252', accent: '#88c0d0' } },
]

export const DEFAULT_THEME: ThemeKey = 'dark'
export const STORAGE_KEY = 'agency-theme'

export function getThemeMeta(key: ThemeKey): ThemeMeta {
  return THEMES.find(t => t.key === key) ?? THEMES[0]!
}

/** Explicit flip overrides for themes that don't follow the -dark/-light suffix convention */
const FLIP_MAP: Partial<Record<ThemeKey, ThemeKey>> = {
  'tokyo-night':      'tokyo-day',
  'tokyo-storm':      'tokyo-day',
  'tokyo-day':        'tokyo-night',
  'catppuccin-mocha': 'catppuccin-latte',
  'catppuccin-latte': 'catppuccin-mocha',
  'dracula':          'dracula',
  'nord':             'nord',
}

/** Return the opposite-mode variant of the current theme key */
export function flipMode(key: ThemeKey): ThemeKey {
  if (key in FLIP_MAP) return FLIP_MAP[key]!
  const meta = getThemeMeta(key)
  const newMode = meta.mode === 'dark' ? 'light' : 'dark'
  const base = key.replace(/-dark$|-light$/, '')
  if (base === 'dark') return 'light'
  if (base === 'light') return 'dark'
  return `${base}-${newMode}` as ThemeKey
}
