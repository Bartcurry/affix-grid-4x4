import type { PlaybackSpeed, Run } from '../core/types';
import type { RunRecords } from '../core/openings';

export interface SaveData {
  schemaVersion: 2;
  run: Run;
  muted: boolean;
  skin: boolean;
  speed: PlaybackSpeed;
  exactForecast?: boolean;
  records: RunRecords;
}

export type Reward = 'refresh' | 'retry' | 'support';

export interface PlatformAdapter {
  load(): SaveData | null;
  save(data: SaveData): void;
  showRewardedVideo(reward: Reward): Promise<boolean>;
  exportScore(run: Run): Promise<boolean>;
}
