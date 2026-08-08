import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

// 🚀 Custom error-resistant AsyncStorage wrapper
const safeAsyncStorage = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
    }
  },
};

interface NotificationState {
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  notifications: any[];
  loadingNotifications: boolean;
  setNotifications: (notifications: any[] | ((prev: any[]) => any[])) => void;
  addNotification: (notification: any) => boolean;
  clearNotifications: () => void;
  fetchNotifications: (isRefreshing?: boolean) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  fetchUnreadNotificationsCount: () => Promise<void>;
  setUnreadMessagesCount: (count: number) => void;
  setUnreadNotificationsCount: (count: number) => void;
  incrementUnreadCount: () => void;
  decrementUnreadCount: () => void;
  incrementUnreadNotificationsCount: () => void;
  decrementUnreadNotificationsCount: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      unreadMessagesCount: 0,
      unreadNotificationsCount: 0,
      notifications: [],
      loadingNotifications: false,

      setNotifications: (notifications) => set((state) => ({
        notifications: typeof notifications === 'function' ? (notifications as any)(state.notifications) : notifications
      })),

      addNotification: (notification) => {
        if (notification.type === 'message') return false;

        const prev = get().notifications || [];
        const notificationId = notification.id || notification._id;

        // Check if we already have this notification by ID
        if (notificationId && prev.some(item => (item.id || item._id) === notificationId)) {
          return false;
        }

        // If it's a follow or follow request, check if we already have one from this actor
        if (notification.type === 'follow' || notification.type === 'follow_request' || notification.is_request) {
          const actorId = notification.actor?.id || notification.actor?._id;
          if (actorId && prev.some(item => 
            (item.type === 'follow' || item.type === 'follow_request' || item.is_request) && 
            (item.actor?.id || item.actor?._id) === actorId
          )) {
            return false;
          }
        }

        const newNotifications = [notification, ...prev];
        const sorted = newNotifications.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        set({ notifications: sorted.slice(0, 50) });
        return true;
      },

      clearNotifications: () => set({ notifications: [] }),

      fetchNotifications: async (isRefreshing = false) => {
        try {
          const currentNotifications = get().notifications || [];
          if (currentNotifications.length === 0 && !isRefreshing) {
            set({ loadingNotifications: true });
          }

          const { useAuthStore } = await import('../store/authStore');
          const currentUser = useAuthStore.getState().user;

          const [notifsRes, requestsRes] = await Promise.all([
            apiClient.get('/notifications').catch(err => {
              return { data: { success: true, data: [] } };
            }),
            currentUser?.is_private ? 
              apiClient.get('/users/follow-requests').catch(err => {
                return { data: { success: true, data: [] } };
              }) : 
              Promise.resolve({ data: { success: true, data: [] } })
          ]);

          const formattedNotifs = notifsRes.data?.data || [];
          const rawRequests = requestsRes.data?.data || [];
          const formattedRequests = Array.isArray(rawRequests) ? rawRequests.map((req: any) => {
            const userId = req._id || req.id;
            const userIdStr = userId?.toString() || '';
            
            return {
              ...req,
              id: userIdStr,
              _id: userIdStr,
              actor: {
                id: userIdStr,
                _id: userIdStr,
                username: req.username || 'Someone',
                avatar_url: req.avatar_url,
                full_name: req.full_name,
                is_verified: req.is_verified
              },
              type: 'follow_request',
              is_request: true,
              created_at: req.requested_at || new Date()
            };
          }) : [];

          const allNotifications = [...formattedRequests, ...formattedNotifs];
          
          const seenIds = new Set();
          const seenFollowRequests = new Set();
          
          const deduplicated = allNotifications.filter(item => {
            const itemId = item.id || item._id;
            
            if (item.type === 'follow_request' || item.is_request) {
              const actorId = item.actor?.id || item.actor?._id;
              if (actorId) {
                if (seenFollowRequests.has(actorId.toString())) return false;
                seenFollowRequests.add(actorId.toString());
              }
            }
            
            if (itemId) {
              if (seenIds.has(itemId.toString())) return false;
              seenIds.add(itemId.toString());
            }
            
            return true;
          });

          const grouped: any[] = [];
          const mentionGroups: Record<string, any> = {};

          deduplicated.forEach(notif => {
            const actorId = (notif.actor?.id || notif.actor?._id || '').toString();
            
            if (notif.type === 'mention' && actorId) {
              if (!mentionGroups[actorId]) {
                mentionGroups[actorId] = { ...notif, count: 1, targetIds: [notif.data?.targetId].filter(Boolean) };
                grouped.push(mentionGroups[actorId]);
              } else {
                mentionGroups[actorId].count += 1;
                if (notif.data?.targetId && !mentionGroups[actorId].targetIds.includes(notif.data.targetId)) {
                  mentionGroups[actorId].targetIds.push(notif.data.targetId);
                }
                if (new Date(notif.created_at) > new Date(mentionGroups[actorId].created_at)) {
                  mentionGroups[actorId].created_at = notif.created_at;
                }
              }
            } else {
              grouped.push(notif);
            }
          });

          const sorted = grouped.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          set({ notifications: sorted });
        } catch (error) {
        } finally {
          set({ loadingNotifications: false });
        }
      },

      fetchUnreadCount: async () => {
        try {
          const { useAuthStore } = await import('../store/authStore');
          const uid = useAuthStore.getState().user?.id;
          if (!uid) {
            set({ unreadMessagesCount: 0 });
            return;
          }
          const { data } = await apiClient.get('/chat/conversations');
          const convs = Array.isArray(data) ? data : [];
          let total = 0;
          for (const c of convs) {
            const map = c.unread_counts;
            if (map && typeof map === 'object') {
              const n = map[uid];
              total += typeof n === 'number' ? n : 0;
            }
          }
          set({ unreadMessagesCount: total });
        } catch {
          set({ unreadMessagesCount: 0 });
        }
      },

      fetchUnreadNotificationsCount: async () => {
        try {
          const { useAuthStore } = await import('../store/authStore');
          const uid = useAuthStore.getState().user?.id;
          if (!uid) {
            set({ unreadNotificationsCount: 0 });
            return;
          }
          const { data } = await apiClient.get('/notifications/unread-count');
          if (data && typeof data.unreadCount === 'number') {
            set({ unreadNotificationsCount: data.unreadCount });
          }
        } catch {
          set({ unreadNotificationsCount: 0 });
        }
      },

      setUnreadMessagesCount: (count: number) => set({ unreadMessagesCount: count }),
      setUnreadNotificationsCount: (count: number) => set({ unreadNotificationsCount: count }),
      
      incrementUnreadCount: () => set((state) => ({ unreadMessagesCount: state.unreadMessagesCount + 1 })),
      decrementUnreadCount: () => set((state) => ({ unreadMessagesCount: Math.max(0, state.unreadMessagesCount - 1) })),
      incrementUnreadNotificationsCount: () => set((state) => ({ unreadNotificationsCount: state.unreadNotificationsCount + 1 })),
      decrementUnreadNotificationsCount: () => set((state) => ({ unreadNotificationsCount: Math.max(0, state.unreadNotificationsCount - 1) })),
    }),
    {
      name: 'anufy-notification-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (state) => ({
        notifications: (state.notifications || []).slice(0, 10).map((n: any) => ({
          _id: n._id || n.id,
          id: n._id || n.id,
          type: n.type,
          is_read: n.is_read || n.isRead,
          created_at: n.created_at || n.createdAt,
          actor: n.actor ? { _id: n.actor._id || n.actor.id, username: n.actor.username, avatar_url: n.actor.avatar_url || n.actor.avatar } : undefined,
          post_id: n.post_id,
        })),
        unreadMessagesCount: state.unreadMessagesCount,
        unreadNotificationsCount: state.unreadNotificationsCount,
      }),
    }
  )
);

