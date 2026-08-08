import { create } from 'zustand';
import { CallSession } from './CallTypes';

interface CallStoreState {
  activeSession: CallSession | null;
  localStream: any | null;
  remoteStream: any | null;

  setActiveSession: (session: CallSession | null) => void;
  updateSession: (update: Partial<CallSession>) => void;
  setLocalStream: (stream: any | null) => void;
  setRemoteStream: (stream: any | null) => void;
  clearCall: () => void;
}

export const useCallEngineStore = create<CallStoreState>((set) => ({
  activeSession: null,
  localStream: null,
  remoteStream: null,

  setActiveSession: (activeSession) => set({ activeSession }),
  updateSession: (update) =>
    set((state) => ({
      activeSession: state.activeSession ? { ...state.activeSession, ...update } : null,
    })),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  clearCall: () => set({ activeSession: null, localStream: null, remoteStream: null }),
}));
