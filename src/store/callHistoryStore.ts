import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CallLog {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  timestamp: number;
  duration: number; // in seconds
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing';
  status: 'connected' | 'missed' | 'declined' | 'no_answer';
}

interface CallHistoryState {
  callLogs: CallLog[];
  loadCallLogs: () => Promise<void>;
  addCallLog: (log: Omit<CallLog, 'id' | 'timestamp'>) => Promise<void>;
  clearCallLogs: () => Promise<void>;
}

const STORAGE_KEY = 'call-history-logs';

export const useCallHistoryStore = create<CallHistoryState>((set, get) => ({
  callLogs: [],

  loadCallLogs: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        set({ callLogs: JSON.parse(stored) });
      }
    } catch (e) {
    }
  },

  addCallLog: async (newLog) => {
    try {
      const logItem: CallLog = {
        ...newLog,
        id: Math.random().toString(36).substring(7) + Date.now().toString(),
        timestamp: Date.now(),
      };
      
      const updatedLogs = [logItem, ...get().callLogs];
      set({ callLogs: updatedLogs });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));
    } catch (e) {
    }
  },

  clearCallLogs: async () => {
    try {
      set({ callLogs: [] });
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
    }
  },
}));
