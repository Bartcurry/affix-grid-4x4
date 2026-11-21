import type { OpeningId, PlaybackSpeed, Run } from '../core/types';
import type { RunRecords } from '../core/openings';

export interface RunArchive {
  id: string;
  seed: string;
  wave: number;
  opening: OpeningId;
  difficulty?: Run['difficulty'];
  status: 'victory' | 'defeat' | 'active';
  lastDamage: number;
  bestCombo: number;
  date: string;
  relicsCount: number;
  enableSynergies?: false;
  altarRule?: 1;
  bountyRule?: 1;
  engravingRule?: 1;
  bountiesCleared?: number;
  formation?: string;
  endlessRule?: 1;
  reforgeRule?: 1;
  finaleRule?: 1;
  endless?: true;
}

export interface SaveData {
  schemaVersion: 2;
  run: Run;
  muted: boolean;
  skin: boolean;
  speed: PlaybackSpeed;
  exactForecast?: boolean;
  trackedUpgrade?: string;
  firstClearPayout?: number;
  records: RunRecords;
  beginnerRecords?: RunRecords;
  expertRecords?: RunRecords;
  history?: RunArchive[];
  ambientMuted?: boolean;
}

export type Reward = 'refresh' | 'retry' | 'support';

export interface PlatformAdapter {
  load(): SaveData | null;
  save(data: SaveData): void;
  showRewardedVideo(reward: Reward): Promise<boolean>;
}
