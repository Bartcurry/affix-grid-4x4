import type { Run } from '../core/types';

export interface SaveData { run: Run; muted: boolean; skin: boolean; speed: 1 | 2 }
export type Reward = 'refresh' | 'retry' | 'support';

export interface PlatformAdapter {
  load(): SaveData | null;
  save(data: SaveData): void;
  showRewardedVideo(reward: Reward): Promise<boolean>;
  exportScore(run: Run): Promise<boolean>;
}
