import { create } from 'zustand';

interface PresenceStoreState {
  onlineUsers: Record<string, boolean>;
  typingUsers: Record<string, Record<string, boolean>>; // [roomId]: { [userId]: boolean }

  setOnlineStatus: (userId: string, isOnline: boolean) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;
}

export const usePresenceStore = create<PresenceStoreState>((set) => ({
  onlineUsers: {},
  typingUsers: {},

  setOnlineStatus: (userId, isOnline) =>
    set((state) => ({ onlineUsers: { ...state.onlineUsers, [userId]: isOnline } })),

  setTyping: (roomId, userId, isTyping) =>
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [roomId]: {
          ...(state.typingUsers[roomId] || {}),
          [userId]: isTyping,
        },
      },
    })),
}));
