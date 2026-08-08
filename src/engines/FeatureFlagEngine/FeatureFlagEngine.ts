import { BaseEngine } from '../shared/BaseEngine';
import { create } from 'zustand';

export interface FeatureFlags {
  enableStories: boolean;
  enableCalls: boolean;
  enableGhost: boolean;
  enableLive: boolean;
  enableChatAI: boolean;
  enableExperimental: boolean;
}

const defaultFlags: FeatureFlags = {
  enableStories: true,
  enableCalls: true,
  enableGhost: true,
  enableLive: false,
  enableChatAI: false,
  enableExperimental: false,
};

export const useFeatureFlagStore = create<{
  flags: FeatureFlags;
  setFlag: (key: keyof FeatureFlags, enabled: boolean) => void;
  setFlags: (flags: Partial<FeatureFlags>) => void;
}>((set) => ({
  flags: defaultFlags,
  setFlag: (key, enabled) => set((s) => ({ flags: { ...s.flags, [key]: enabled } })),
  setFlags: (newFlags) => set((s) => ({ flags: { ...s.flags, ...newFlags } })),
}));

export class FeatureFlagEngineClass extends BaseEngine {
  readonly name = 'FeatureFlagEngine';

  protected async onInitialize(): Promise<void> {}
  protected async onDestroy(): Promise<void> {}

  isEnabled(flag: keyof FeatureFlags): boolean {
    return !!useFeatureFlagStore.getState().flags[flag];
  }
}

export const FeatureFlagEngine = new FeatureFlagEngineClass();
