export interface ColorPalette {
  id: string;
  name: string;
  bgColor: string;
  gridLineColor: string;
  gridDotColor: string;
  wireHighColor: string;
  wireLowColor: string;
  junctionHighColor: string;
  junctionLowColor: string;
  glowing: boolean;
}

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    bgColor: '#1e1e2e',
    gridLineColor: 'rgba(71, 85, 105, 0.1)',
    gridDotColor: 'rgba(71, 85, 105, 0.25)',
    wireHighColor: '#a6e3a1',
    wireLowColor: '#313244',
    junctionHighColor: '#22c55e',
    junctionLowColor: '#334155',
    glowing: true
  },
  {
    id: 'midnight',
    name: 'Midnight Ocean',
    bgColor: '#0b0f19',
    gridLineColor: 'rgba(14, 165, 233, 0.1)',
    gridDotColor: 'rgba(14, 165, 233, 0.25)',
    wireHighColor: '#00f2fe',
    wireLowColor: '#1e293b',
    junctionHighColor: '#06b6d4',
    junctionLowColor: '#334155',
    glowing: true
  },
  {
    id: 'dracula',
    name: 'Dracula',
    bgColor: '#282a36',
    gridLineColor: 'rgba(139, 92, 246, 0.1)',
    gridDotColor: 'rgba(139, 92, 246, 0.25)',
    wireHighColor: '#ff79c6',
    wireLowColor: '#44475a',
    junctionHighColor: '#ff79c6',
    junctionLowColor: '#44475a',
    glowing: true
  },
  {
    id: 'retro',
    name: 'Retro Terminal',
    bgColor: '#040d04',
    gridLineColor: 'rgba(16, 185, 129, 0.08)',
    gridDotColor: 'rgba(16, 185, 129, 0.22)',
    wireHighColor: '#10b981',
    wireLowColor: '#072010',
    junctionHighColor: '#10b981',
    junctionLowColor: '#072010',
    glowing: true
  },
  {
    id: 'cyberpunk',
    name: 'Neon Cyber',
    bgColor: '#0f051d',
    gridLineColor: 'rgba(236, 72, 153, 0.1)',
    gridDotColor: 'rgba(236, 72, 153, 0.25)',
    wireHighColor: '#f43f5e',
    wireLowColor: '#270c3a',
    junctionHighColor: '#ec4899',
    junctionLowColor: '#4c0519',
    glowing: true
  },
  {
    id: 'classic_light',
    name: 'Slate Light',
    bgColor: '#f1f5f9',
    gridLineColor: 'rgba(148, 163, 184, 0.25)',
    gridDotColor: 'rgba(148, 163, 184, 0.4)',
    wireHighColor: '#2563eb',
    wireLowColor: '#cbd5e1',
    junctionHighColor: '#3b82f6',
    junctionLowColor: '#cbd5e1',
    glowing: false
  }
];
