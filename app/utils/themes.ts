/**
 * Theme definitions for the OpenCode Visualizer.
 *
 * Each theme defines a complete set of semantic color tokens.
 * The tokens are applied as CSS custom properties on :root via
 * the useTheme() composable in app/composables/useTheme.ts.
 *
 * To add a new theme:
 *   1. Add an entry below following the ThemePalette shape.
 *   2. Register it in the THEMES map.
 *   3. It will automatically appear in the settings dropdown.
 */

export type ThemePalette = {
  /* Backgrounds */
  'bg-base': string;
  'bg-elevated': string;
  'bg-surface': string;
  'bg-overlay': string;
  'bg-hover': string;
  'bg-selected': string;

  /* Text */
  'text-primary': string;
  'text-secondary': string;
  'text-muted': string;
  'text-subtle': string;
  'text-inverse': string;

  /* Borders */
  border: string;
  'border-subtle': string;
  'border-strong': string;

  /* Accents */
  accent: string;
  'accent-strong': string;
  'accent-soft': string;
  success: string;
  warning: string;
  danger: string;
  'danger-strong': string;
  info: string;
  special: string;

  /* Scrollbar */
  'scrollbar-thumb': string;

  /* Search highlights */
  'highlight-bg': string;
  'highlight-fg': string;
  'highlight-current-bg': string;
  'highlight-current-fg': string;

  /* Diff / code viewer */
  'diff-add-bg': string;
  'diff-add-text': string;
  'diff-add-border': string;
  'diff-del-bg': string;
  'diff-del-text': string;
  'diff-del-border': string;
  'diff-hunk-bg': string;
  'diff-hunk-border': string;
  'diff-header-bg': string;
  'diff-header-border': string;

  /* Readable tinted text on dark surfaces */
  'success-text': string;
  'info-text': string;
};

export type ThemeDefinition = {
  id: string;
  name: string;
  /** 'dark' | 'light' — used for color-scheme / form widgets */
  mode: 'dark' | 'light';
  palette: ThemePalette;
};

const dark: ThemeDefinition = {
  id: 'dark',
  name: 'Dark (Slate)',
  mode: 'dark',
  palette: {
    'bg-base': '#0f172a',
    'bg-elevated': '#0b1320',
    'bg-surface': '#111a2c',
    'bg-overlay': 'rgba(15, 23, 42, 0.92)',
    'bg-hover': '#1d2a45',
    'bg-selected': 'rgba(59, 130, 246, 0.2)',

    'text-primary': '#f1f5f9',
    'text-secondary': '#e2e8f0',
    'text-muted': '#94a3b8',
    'text-subtle': '#64748b',
    'text-inverse': '#ffffff',

    border: '#334155',
    'border-subtle': 'rgba(71, 85, 105, 0.5)',
    'border-strong': '#475569',

    accent: '#60a5fa',
    'accent-strong': '#3b82f6',
    'accent-soft': 'rgba(59, 130, 246, 0.45)',
    success: '#86efac',
    warning: '#fbbf24',
    danger: '#fca5a5',
    'danger-strong': '#ef4444',
    info: '#93c5fd',
    special: '#c4b5fd',

    'scrollbar-thumb': 'rgba(255, 255, 255, 0.15)',

    'highlight-bg': 'rgba(234, 179, 8, 0.35)',
    'highlight-fg': '#fef08a',
    'highlight-current-bg': 'rgba(59, 130, 246, 0.58)',
    'highlight-current-fg': '#ffffff',

    'diff-add-bg': 'rgba(46, 160, 67, 0.22)',
    'diff-add-text': '#aff5b4',
    'diff-add-border': 'rgba(46, 160, 67, 0.55)',
    'diff-del-bg': 'rgba(248, 81, 73, 0.2)',
    'diff-del-text': '#ffdcd7',
    'diff-del-border': 'rgba(248, 81, 73, 0.55)',
    'diff-hunk-bg': 'rgba(56, 139, 253, 0.18)',
    'diff-hunk-border': 'rgba(56, 139, 253, 0.55)',
    'diff-header-bg': 'rgba(110, 118, 129, 0.18)',
    'diff-header-border': 'rgba(110, 118, 129, 0.55)',

    'success-text': '#d1fae5',
    'info-text': '#dbeafe',
  },
};

const light: ThemeDefinition = {
  id: 'light',
  name: 'Light',
  mode: 'light',
  palette: {
    'bg-base': '#ffffff',
    'bg-elevated': '#f8fafc',
    'bg-surface': '#f1f5f9',
    'bg-overlay': 'rgba(248, 250, 252, 0.94)',
    'bg-hover': '#e2e8f0',
    'bg-selected': 'rgba(59, 130, 246, 0.15)',

    'text-primary': '#0f172a',
    'text-secondary': '#1e293b',
    'text-muted': '#475569',
    'text-subtle': '#64748b',
    'text-inverse': '#ffffff',

    border: '#cbd5e1',
    'border-subtle': 'rgba(148, 163, 184, 0.5)',
    'border-strong': '#94a3b8',

    accent: '#2563eb',
    'accent-strong': '#1d4ed8',
    'accent-soft': 'rgba(37, 99, 235, 0.25)',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    'danger-strong': '#b91c1c',
    info: '#2563eb',
    special: '#7c3aed',

    'scrollbar-thumb': 'rgba(15, 23, 42, 0.2)',

    'highlight-bg': 'rgba(234, 179, 8, 0.5)',
    'highlight-fg': '#713f12',
    'highlight-current-bg': 'rgba(37, 99, 235, 0.45)',
    'highlight-current-fg': '#ffffff',

    'diff-add-bg': 'rgba(22, 163, 74, 0.15)',
    'diff-add-text': '#14532d',
    'diff-add-border': 'rgba(22, 163, 74, 0.5)',
    'diff-del-bg': 'rgba(220, 38, 38, 0.12)',
    'diff-del-text': '#7f1d1d',
    'diff-del-border': 'rgba(220, 38, 38, 0.45)',
    'diff-hunk-bg': 'rgba(37, 99, 235, 0.12)',
    'diff-hunk-border': 'rgba(37, 99, 235, 0.45)',
    'diff-header-bg': 'rgba(100, 116, 139, 0.15)',
    'diff-header-border': 'rgba(100, 116, 139, 0.45)',

    'success-text': '#166534',
    'info-text': '#1e40af',
  },
};

const dracula: ThemeDefinition = {
  id: 'dracula',
  name: 'Dracula',
  mode: 'dark',
  palette: {
    'bg-base': '#282a36',
    'bg-elevated': '#21222c',
    'bg-surface': '#343746',
    'bg-overlay': 'rgba(40, 42, 54, 0.94)',
    'bg-hover': '#44475a',
    'bg-selected': 'rgba(189, 147, 249, 0.25)',

    'text-primary': '#f8f8f2',
    'text-secondary': '#e6e6e0',
    'text-muted': '#a9a9b8',
    'text-subtle': '#6272a4',
    'text-inverse': '#282a36',

    border: '#44475a',
    'border-subtle': 'rgba(98, 114, 164, 0.4)',
    'border-strong': '#6272a4',

    accent: '#bd93f9',
    'accent-strong': '#a878f0',
    'accent-soft': 'rgba(189, 147, 249, 0.4)',
    success: '#50fa7b',
    warning: '#f1fa8c',
    danger: '#ff5555',
    'danger-strong': '#ff3333',
    info: '#8be9fd',
    special: '#ff79c6',

    'scrollbar-thumb': 'rgba(248, 248, 242, 0.2)',

    'highlight-bg': 'rgba(241, 250, 140, 0.4)',
    'highlight-fg': '#f1fa8c',
    'highlight-current-bg': 'rgba(189, 147, 249, 0.55)',
    'highlight-current-fg': '#ffffff',

    'diff-add-bg': 'rgba(80, 250, 123, 0.15)',
    'diff-add-text': '#ccffd8',
    'diff-add-border': 'rgba(80, 250, 123, 0.5)',
    'diff-del-bg': 'rgba(255, 85, 85, 0.15)',
    'diff-del-text': '#ffb8b8',
    'diff-del-border': 'rgba(255, 85, 85, 0.5)',
    'diff-hunk-bg': 'rgba(189, 147, 249, 0.18)',
    'diff-hunk-border': 'rgba(189, 147, 249, 0.55)',
    'diff-header-bg': 'rgba(98, 114, 164, 0.18)',
    'diff-header-border': 'rgba(98, 114, 164, 0.55)',

    'success-text': '#ccffd8',
    'info-text': '#cdeeff',
  },
};

const solarizedDark: ThemeDefinition = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  mode: 'dark',
  palette: {
    'bg-base': '#002b36',
    'bg-elevated': '#001f27',
    'bg-surface': '#073642',
    'bg-overlay': 'rgba(0, 43, 54, 0.94)',
    'bg-hover': '#0a4754',
    'bg-selected': 'rgba(38, 139, 210, 0.25)',

    'text-primary': '#fdf6e3',
    'text-secondary': '#eee8d5',
    'text-muted': '#93a1a1',
    'text-subtle': '#586e75',
    'text-inverse': '#002b36',

    border: '#073642',
    'border-subtle': 'rgba(88, 110, 117, 0.5)',
    'border-strong': '#586e75',

    accent: '#268bd2',
    'accent-strong': '#2076b8',
    'accent-soft': 'rgba(38, 139, 210, 0.4)',
    success: '#859900',
    warning: '#b58900',
    danger: '#dc322f',
    'danger-strong': '#cb1d1a',
    info: '#2aa198',
    special: '#d33682',

    'scrollbar-thumb': 'rgba(253, 246, 227, 0.18)',

    'highlight-bg': 'rgba(181, 137, 0, 0.4)',
    'highlight-fg': '#fdf6e3',
    'highlight-current-bg': 'rgba(38, 139, 210, 0.55)',
    'highlight-current-fg': '#fdf6e3',

    'diff-add-bg': 'rgba(133, 153, 0, 0.2)',
    'diff-add-text': '#d1e8a0',
    'diff-add-border': 'rgba(133, 153, 0, 0.55)',
    'diff-del-bg': 'rgba(203, 29, 26, 0.18)',
    'diff-del-text': '#f4c0bf',
    'diff-del-border': 'rgba(203, 29, 26, 0.5)',
    'diff-hunk-bg': 'rgba(38, 139, 210, 0.18)',
    'diff-hunk-border': 'rgba(38, 139, 210, 0.55)',
    'diff-header-bg': 'rgba(88, 110, 117, 0.2)',
    'diff-header-border': 'rgba(88, 110, 117, 0.55)',

    'success-text': '#d1e8a0',
    'info-text': '#b5d9f0',
  },
};

export const THEMES: Record<string, ThemeDefinition> = {
  dark,
  light,
  dracula,
  'solarized-dark': solarizedDark,
};

export const DEFAULT_THEME_ID = 'dark';

export function getTheme(id: string | null | undefined): ThemeDefinition {
  if (id && THEMES[id]) return THEMES[id];
  return THEMES[DEFAULT_THEME_ID];
}

export function listThemes(): ThemeDefinition[] {
  return Object.values(THEMES);
}
