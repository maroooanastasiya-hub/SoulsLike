export const VIEW_W = 480;
export const VIEW_H = 270;

/** Внутреннее разрешение рендера. Мир остаётся 480×270, но вектор рисуется в 3×. */
export const RENDER_SCALE = 3;

export const GAME_TITLE = 'ПЕПЕЛЬНЫЙ ЛЕГИОН';
export const GAME_SUBTITLE = 'ДУША ПАВШЕГО';

export const ENEMY_NAMES: Record<string, string> = {
  guard: 'СТРАЖНИК',
  archer: 'ЛУЧНИК',
  crawler: 'ПОЛЗУН',
  mage: 'МАГ',
  bomber: 'БОМБАРДИР',
  elite: 'ЭЛИТА',
};

export const BOSS_NAMES: Record<string, string> = {
  executioner: 'ПАЛАЧ',
  matriarch: 'ГНИЛОЙ МАТРИАРХ',
  choir: 'ХОР ЗАТОНУВШИХ',
  golem: 'КУЗНЕЧНЫЙ ГОЛЕМ',
  boneking: 'КОСТЯНОЙ КОРОЛЬ',
  hero: 'ГЕРОЙ',
};
