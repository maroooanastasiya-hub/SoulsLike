export interface BiomePalette {
  sky0: string;
  sky1: string;
  fog: string;
  far: string;
  mid: string;
  tile: string;
  tileTop: string;
  tileDark: string;
  accent: string;
  glow: string;
  name: string;
}

export const BIOMES: Record<string, BiomePalette> = {
  ashen: {
    sky0: '#0a0910',
    sky1: '#1a1526',
    fog: 'rgba(120,100,180,0.05)',
    far: '#161221',
    mid: '#211a30',
    tile: '#2a2438',
    tileTop: '#4a4160',
    tileDark: '#191420',
    accent: '#b9a6ff',
    glow: '#7d6ad6',
    name: 'ПЕПЕЛЬНОЕ ПРЕДМЕСТЬЕ',
  },
  fungal: {
    sky0: '#07100c',
    sky1: '#12241a',
    fog: 'rgba(90,200,150,0.045)',
    far: '#0d1b14',
    mid: '#14291f',
    tile: '#1e3a2c',
    tileTop: '#3f7054',
    tileDark: '#0e1e16',
    accent: '#7fe0a8',
    glow: '#3fb87a',
    name: 'ГРИБНЫЕ КАТАКОМБЫ',
  },
  sunken: {
    sky0: '#060c16',
    sky1: '#0f2038',
    fog: 'rgba(90,150,220,0.05)',
    far: '#0b1728',
    mid: '#12233c',
    tile: '#1c3450',
    tileTop: '#3a6288',
    tileDark: '#0a1624',
    accent: '#8cc9ff',
    glow: '#4d8fd6',
    name: 'ЗАТОНУВШИЙ СОБОР',
  },
  forge: {
    sky0: '#120705',
    sky1: '#2a0f08',
    fog: 'rgba(255,120,50,0.05)',
    far: '#200c07',
    mid: '#351409',
    tile: '#3a1c12',
    tileTop: '#6d3620',
    tileDark: '#1a0a06',
    accent: '#ff9a5c',
    glow: '#ff5c28',
    name: 'ЖЕЛЕЗНАЯ КУЗНЯ',
  },
  bone: {
    sky0: '#0d0c0a',
    sky1: '#211f19',
    fog: 'rgba(220,210,180,0.045)',
    far: '#181611',
    mid: '#27241c',
    tile: '#35312a',
    tileTop: '#5c5648',
    tileDark: '#151310',
    accent: '#e8dfc4',
    glow: '#b8ad8c',
    name: 'КОСТЯНОЙ ШПИЛЬ',
  },
  throne: {
    sky0: '#100610',
    sky1: '#2a0c24',
    fog: 'rgba(255,80,180,0.05)',
    far: '#1d0819',
    mid: '#330f2b',
    tile: '#3a1632',
    tileTop: '#6b2a58',
    tileDark: '#170812',
    accent: '#ff8ad4',
    glow: '#d64d9e',
    name: 'ТРОН ГЕРОЯ',
  },
};

export const C = {
  white: '#f2eefc',
  bone: '#e8dfc4',
  dim: '#8b84a3',
  dark: '#07060b',
  red: '#e0485c',
  redDark: '#7a1f2c',
  gold: '#ffcf6b',
  goldDark: '#8a6524',
  blue: '#7fb8ff',
  mana: '#8f7bff',
  soul: '#9fe8ff',
  green: '#7fe0a8',
  ghost: '#a9d8ff',
  ghostDark: '#5a86b8',
  purple: '#b9a6ff',
  spectral: '#7df9ff',
  ectoplasm: '#c8fff2',
  void: '#08060f',
  ember: '#ff9a5c',
  rose: '#ff8ad4',
};
