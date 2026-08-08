import { create } from 'zustand';

interface NotificationStoreState {
  unreadCount: number;
  notifications: any[];
  setUnreadCount: (count: number) => void;
  setNotifications: (notifications: any[]) => void;
}

export const useNotificationEngineStore = create<NotificationStoreState>((set) => ({
  unreadCount: 0,
  notifications: [],
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setNotifications: (notifications) => set({ notifications }),
}));
