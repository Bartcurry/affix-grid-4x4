import type { OpeningId, Run } from '../core/types';
import type { RunRecords } from '../core/openings';

export interface RunArchive {
  id: string;
  seed: string;
  wave: number;
  opening: OpeningId;
  status: 'victory' | 'defeat' | 'active';
  lastDamage: number;
  bestCombo: number;
  date: string;
  relicsCount: number;
  altarRule?: 1;
  bountyRule?: 1;
  bountiesCleared?: number;
}

export interface SaveData {
  schemaVersion: 2;
  run: Run;
  muted: boolean;
  skin: boolean;
  speed: 1 | 2;
  exactForecast?: boolean;
  trackedUpgrade?: string;
  records: RunRecords;
  history?: RunArchive[];
  ambientMuted?: boolean;
}

export type Reward = 'refresh' | 'retry' | 'support';

export interface PlatformAdapter {
  load(): SaveData | null;
  save(data: SaveData): void;
  showRewardedVideo(reward: Reward): Promise<boolean>;
  exportScore(run: Run): Promise<boolean>;
}
