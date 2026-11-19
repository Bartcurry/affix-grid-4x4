import rawRunes from './runes.json';
import type { Catalog, RuneConfig } from '../core/types';

export const runes = rawRunes as RuneConfig[];
export const catalog: Catalog = Object.fromEntries(runes.map(rune => [rune.id, rune]));
