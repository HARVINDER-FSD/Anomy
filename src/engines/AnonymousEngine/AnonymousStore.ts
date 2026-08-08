import { create } from 'zustand';

interface AnonymousStoreState {
  isAnonymousMode: boolean;
  isQueueing: boolean;
  activeMatchConvId: string | null;

  setAnonymousMode: (active: boolean) => void;
  setQueueing: (queueing: boolean) => void;
  setActiveMatch: (convId: string | null) => void;
}

export const useAnonymousStore = create<AnonymousStoreState>((set) => ({
  isAnonymousMode: false,
  isQueueing: false,
  activeMatchConvId: null,

  setAnonymousMode: (isAnonymousMode) => set({ isAnonymousMode }),
  setQueueing: (isQueueing) => set({ isQueueing }),
  setActiveMatch: (activeMatchConvId) => set({ activeMatchConvId }),
}));
