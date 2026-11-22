interface BoardTheme {
  name: string;
  unlock: string;
  frame: readonly [string, string];
  well: readonly [string, string];
  trim: string;
  groove: string;
  mark: string;
  accent: readonly [string, string, string];
}

export const boardThemes = {
  obsidian: {
    name: '玄金', unlock: '初始外观', frame: ['#131722', '#0b0e14'], well: ['#1a2025', '#0e1218'],
    trim: '#785a28', groove: '#3c3934', mark: '#334155', accent: ['#d4af37', '#fde047', '#785a28'],
  },
  jade: {
    name: '青玉', unlock: '通过阵师试炼的五关', frame: ['#284238', '#0b201a'], well: ['#233d34', '#11231f'],
    trim: '#789f84', groove: '#426857', mark: '#486b5b', accent: ['#9fd7ac', '#dcf4b5', '#4c8268'],
  },
  frost: {
    name: '寒玉', unlock: '同一道每日残局拿满步数和伤害', frame: ['#304b62', '#102235'], well: ['#28455c', '#132c40'],
    trim: '#81acca', groove: '#456879', mark: '#51768c', accent: ['#9ad7f5', '#d5f2ff', '#527d9d'],
  },
  copper: {
    name: '赤铜', unlock: '任意难度通过战役第 20 波', frame: ['#50332a', '#211512'], well: ['#472e24', '#281d19'],
    trim: '#bd865a', groove: '#735142', mark: '#785749', accent: ['#ecab78', '#ffe2ae', '#9b6341'],
  },
  violet: {
    name: '紫铜', unlock: '在设置里支持作者', frame: ['#3b2d48', '#21172b'], well: ['#352b42', '#21192c'],
    trim: '#a882a1', groove: '#6a536f', mark: '#675777', accent: ['#c084fc', '#e9d5ff', '#6b21a8'],
  },
} as const satisfies Record<string, BoardTheme>;

export type BoardThemeId = keyof typeof boardThemes;
export const boardThemeIds = Object.keys(boardThemes) as BoardThemeId[];
