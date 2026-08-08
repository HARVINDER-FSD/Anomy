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

const prefetchInflight = new Set<string>();

function normalizeCachedMessage(msg: any) {
  const m = { ...msg };
  if (!m.media_url && m.mediaUrl) m.media_url = m.mediaUrl;
  if (!m.author_username && m.authorUsername) m.author_username = m.authorUsername;
  if (!m.author_avatar && m.authorAvatar) m.author_avatar = m.authorAvatar;
  if (!m.message_type && m.type) m.message_type = m.type;
  return m;
}

// Runtime-only blacklist — NOT persisted, cleared on app restart
// Prevents refreshConversations from re-adding skipped/removed conversations
const skippedConversationIds = new Set<string>();

export const useChatStore = create<any>()(
  persist(
    (set) => ({
      normalConversations: [],
      anonymousConversations: [],
      conversations: [],
      skippedIds: [], // Persisted blacklist of skipped/removed conversation IDs
      lastSkipTs: 0, // Timestamp of last anonymous skip — used to suppress reload flash
      modeVersion: 1, // Monotonic token incremented on mode switch to drop stale async API responses
      switchMode: (isAnonymousMode: boolean) => {
        set((state: any) => ({
          modeVersion: (state.modeVersion || 0) + 1,
          conversations: isAnonymousMode
            ? (state.anonymousConversations || []).filter((c: any) => c.is_anonymous === true)
            : (state.normalConversations || []).filter((c: any) => c.is_anonymous !== true)
        }));
      },
      setConversations: (v: any[], isAnonymousMode = false) => {
        const filtered = (v || []).filter((c: any) =>
          isAnonymousMode ? (c.is_anonymous === true) : (c.is_anonymous !== true)
        );
        if (isAnonymousMode) {
          set({ anonymousConversations: filtered, conversations: filtered });
        } else {
          set({ normalConversations: filtered, conversations: filtered });
        }
      },
      removeConversation: (conversationId: string) => {
        // Permanently blacklist this conversation so refreshConversations never brings it back
        skippedConversationIds.add(conversationId);
        set((state: any) => {
          const filterOut = (list: any[]) =>
            (list || []).filter((c: any) => (c._id || c.id)?.toString() !== conversationId);
          const nextSkipped = Array.from(new Set([...(state.skippedIds || []), conversationId]));
          const nextCache = { ...(state.messagesCache || {}) };
          delete nextCache[conversationId];
          return {
            conversations: filterOut(state.conversations),
            normalConversations: filterOut(state.normalConversations),
            anonymousConversations: filterOut(state.anonymousConversations),
            messagesCache: nextCache,
            skippedIds: nextSkipped,
            lastSkipTs: Date.now(), // Mark skip time so MessagesScreen suppresses reload
          };
        });
      },
      refreshConversations: async (isAnonymousMode = false) => {
        const reqVersion = useChatStore.getState().modeVersion || 1;
        try {
          const endpoint = isAnonymousMode ? '/chat/conversations?anonymous=true' : '/chat/conversations';
          const { data } = await apiClient.get(endpoint);
          
          // 🛡️ STALE ASYNC RESPONSE CANCELLATION: Discard if user toggled mode during in-flight fetch
          if (useChatStore.getState().modeVersion !== reqVersion) {
            return;
          }

          const rawArr = Array.isArray(data) ? data : (data?.data || []);
          // 🛡️ STRICT MODE PARTITIONING: Drop cross-mode conversations at store boundary
          const arr = rawArr.filter((c: any) =>
            isAnonymousMode ? (c.is_anonymous === true) : (c.is_anonymous !== true)
          );

          set((state: any) => {
            if (state.modeVersion !== reqVersion) return state;

            const currentList: any[] = isAnonymousMode ? (state.anonymousConversations || []) : (state.normalConversations || []);
            const skippedSet = new Set([...(state.skippedIds || []), ...Array.from(skippedConversationIds)]);

            // Build new list:
            // 1. Keep existing conversations that the server still returns (update their data)
            //    UNLESS they are in the permanent skip blacklist
            // 2. Append brand-new conversations from server not yet in current list
            const seenPartners = new Set<string>();
            const merged: any[] = [];

            // First pass: process server results in order (newest first)
            arr.forEach((newConv: any) => {
              const cid = (newConv._id || newConv.id)?.toString();
              // 🚫 Never re-add conversations that were explicitly skipped/removed this session
              if (!cid || skippedSet.has(cid)) return;

              // Deduplicate by partner
              const parts = newConv.participants || [];
              let partnerId: string | null = null;
              for (const p of parts) {
                const u = p.user || p;
                const uid = (u._id || u.id)?.toString();
                if (uid && uid !== 'anonymous') { partnerId = uid; break; }
              }
              if (partnerId) {
                if (seenPartners.has(partnerId)) return;
                seenPartners.add(partnerId);
              }

              // Preserve local wallpaper if server doesn't have it
              const existing = currentList.find((c: any) => (c._id || c.id)?.toString() === cid);
              if (existing?.wallpaper_url?.startsWith('file://') && !newConv.wallpaper_url?.startsWith('http')) {
                merged.push({ ...newConv, wallpaper_url: existing.wallpaper_url });
              } else {
                merged.push(newConv);
              }
            });

            // Early-exit if nothing changed
            const isSame = currentList.length === merged.length &&
              currentList.every((c: any, idx: number) => {
                const mc = merged[idx];
                if (!mc) return false;
                
                const isIdSame = (c._id || c.id)?.toString() === (mc._id || mc.id)?.toString();
                if (!isIdSame) return false;

                const isLastMessageSame = (c.last_message?._id || c.last_message?.id)?.toString() === (mc.last_message?._id || mc.last_message?.id)?.toString();
                if (!isLastMessageSame) return false;

                // Also check if any participant details changed (e.g., online status, deleted account, avatar)
                const isParticipantsSame = JSON.stringify(c.participants) === JSON.stringify(mc.participants);
                if (!isParticipantsSame) return false;

                return true;
              });

            if (isSame) return state;

            if (isAnonymousMode) {
              return { anonymousConversations: merged, conversations: merged };
            } else {
              return { normalConversations: merged, conversations: merged };
            }
          });

          // Pre-populate messagesCache with last_message if cache is empty
          set((state: any) => {
            if (state.modeVersion !== reqVersion) return state;
            const newCache = { ...state.messagesCache };
            let changed = false;
            arr.forEach((conv: any) => {
              const cid = conv._id || conv.id;
              if (cid && conv.last_message && !newCache[cid]) {
                newCache[cid] = [conv.last_message];
                changed = true;
              }
            });
            return changed ? { messagesCache: newCache } : state;
          });
        } catch (e) {
          // Don't clear conversations on error — keep stale data visible
        }
      },
      loadMoreConversations: async (page: number, isAnonymousMode = false) => {
        const reqVersion = useChatStore.getState().modeVersion || 1;
        try {
          const baseEndpoint = isAnonymousMode ? '/chat/conversations?anonymous=true' : '/chat/conversations';
          const endpoint = `${baseEndpoint}${baseEndpoint.includes('?') ? '&' : '?'}page=${page}&limit=20`;
          const { data } = await apiClient.get(endpoint);

          if (useChatStore.getState().modeVersion !== reqVersion) return false;

          const rawArr = Array.isArray(data) ? data : (data?.data || []);
          const arr = rawArr.filter((c: any) =>
            isAnonymousMode ? (c.is_anonymous === true) : (c.is_anonymous !== true)
          );
          const hasMore = data?.hasMore ?? false;

          if (arr.length > 0) {
            set((state: any) => {
              // Only de-duplicate, don't mode-filter (backend already handles that)
              const newConvs = arr.filter((nc: any) => {
                const ncid = nc._id || nc.id;
                return !state.conversations.some((ec: any) => (ec._id || ec.id) === ncid);
              });

              return { conversations: [...state.conversations, ...newConvs] };
            });

            // Populate messagesCache
            set((state: any) => {
              const newCache = { ...state.messagesCache };
              let changed = false;
              arr.forEach((conv: any) => {
                const cid = conv._id || conv.id;
                if (cid && conv.last_message && !newCache[cid]) {
                  newCache[cid] = [conv.last_message];
                  changed = true;
                }
              });
              return changed ? { messagesCache: newCache } : state;
            });
          }
          return hasMore;
        } catch (error) {
          return false;
        }
      },
      messagesCache: {},
      quickReactions: ['❤️', '😂', '👍', '🔥', '😮'],
      setQuickReactions: (reactions: string[]) => set({ quickReactions: reactions }),
      setCachedMessages: (convId: string, msgs: any[]) =>
        set((state: any) => {
          try {
            const newCache = { ...state.messagesCache };
            // 🚀 Preserve existing reactions when updating cache
            const existingCache = newCache[convId] || [];
            const existingReactions = new Map<string, any>();
            existingCache.forEach((m: any) => {
              if (m._id && m.reactions) {
                existingReactions.set(m._id, m.reactions);
              }
            });

            const messagesWithReactions = msgs.slice(0, 20).map((m: any) => {
              if (m._id && existingReactions.has(m._id)) {
                return { ...m, reactions: existingReactions.get(m._id) };
              }
              return m;
            });

            newCache[convId] = messagesWithReactions;
            const keys = Object.keys(newCache);
            if (keys.length > 12) {
              const keysToRemove = keys.slice(0, keys.length - 12);
              keysToRemove.forEach(k => delete newCache[k]);
            }
            return { messagesCache: newCache };
          } catch (_e) {
            return state;
          }
        }),
      prefetchMessages: async (convId: string) => {
        if (!convId || convId === 'new') return;
        const cached = useChatStore.getState().messagesCache?.[convId];
        if (cached && cached.length > 3) return;
        if (prefetchInflight.has(convId)) return;

        prefetchInflight.add(convId);
        try {
          const { data } = await apiClient.get(`/chat/conversations/${convId}/messages`);
          const raw = Array.isArray(data) ? data : [];
          if (raw.length === 0) return;
          useChatStore.getState().setCachedMessages(
            convId,
            raw.map(normalizeCachedMessage)
          );
        } catch {
          // Prefetch is best-effort; chat screen will fetch on open.
        } finally {
          prefetchInflight.delete(convId);
        }
      },
      updateCachedMessage: (convId: string, messageId: string, updates: any) =>
        set((state: any) => {
          const targetConvId = convId?.toString();
          const targetMsgId = messageId?.toString();
          if (!targetConvId || !targetMsgId || !state.messagesCache[targetConvId]) return state;
          const newCache = { ...state.messagesCache };
          newCache[targetConvId] = newCache[targetConvId].map((m: any) =>
            (m._id || m.id)?.toString() === targetMsgId ? { ...m, ...updates } : m
          );

          // 🚀 Also update last_message in conversations list if it matches
          const newConversations = (state.conversations || []).map((c: any) => {
            const cId = (c._id || c.id)?.toString();
            const lastMsgId = (c.last_message?._id || c.last_message?.id)?.toString();
            if (cId === targetConvId && lastMsgId === targetMsgId) {
              return { ...c, last_message: { ...c.last_message, ...updates } };
            }
            return c;
          });

          return { messagesCache: newCache, conversations: newConversations };
        }),
      removeCachedMessage: (convId: string, messageId: string) =>
        set((state: any) => {
          const targetConvId = convId?.toString();
          const targetMsgId = messageId?.toString();
          const newCache = { ...state.messagesCache };
          if (targetConvId && newCache[targetConvId]) {
            newCache[targetConvId] = newCache[targetConvId].filter((m: any) => (m._id || m.id)?.toString() !== targetMsgId);
          }

          // 🚀 If last_message was deleted, update last_message status
          const newConversations = (state.conversations || []).map((c: any) => {
            const cId = (c._id || c.id)?.toString();
            const lastMsgId = (c.last_message?._id || c.last_message?.id)?.toString();
            if (cId === targetConvId && lastMsgId === targetMsgId) {
              return { ...c, last_message: { ...c.last_message, content: 'Message deleted', is_deleted: true } };
            }
            return c;
          });

          return { messagesCache: newCache, conversations: newConversations };
        }),
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (state: any) => {
        const cleanConv = (convs: any[]) => (convs || []).slice(0, 8).map((c: any) => ({
          _id: (c._id || c.id)?.toString(),
          id: (c._id || c.id)?.toString(),
          unread_count: c.unread_count || 0,
          is_anonymous: c.is_anonymous,
          participants: (c.participants || []).slice(0, 4).map((p: any) => {
            const u = p?.user || p || {};
            const pId = (u._id || u.id || p._id || p.id)?.toString();
            return {
              user: {
                _id: pId,
                id: pId,
                username: u.username || p.username,
                full_name: u.full_name || u.name || p.full_name,
                avatar_url: u.avatar_url || u.avatar || p.avatar_url,
                avatar: u.avatar_url || u.avatar || p.avatar_url,
                is_anonymous: u.is_anonymous || false,
                anonymousPersona: (u.anonymousPersona || p.anonymousPersona) ? {
                  name: (u.anonymousPersona || p.anonymousPersona).name,
                  username: (u.anonymousPersona || p.anonymousPersona).username,
                  avatar: (u.anonymousPersona || p.anonymousPersona).avatar
                } : undefined,
                ghost_persona: (u.ghost_persona || p.ghost_persona) ? {
                  name: (u.ghost_persona || p.ghost_persona).name,
                  avatar: (u.ghost_persona || p.ghost_persona).avatar
                } : undefined
              }
            };
          }),
          last_message: c.last_message ? {
            _id: (c.last_message._id || c.last_message.id)?.toString(),
            content: typeof c.last_message.content === 'string' ? c.last_message.content.substring(0, 100) : '',
            created_at: c.last_message.created_at,
            sender_id: typeof c.last_message.sender_id === 'object' ? (c.last_message.sender_id._id || c.last_message.sender_id.id)?.toString() : c.last_message.sender_id?.toString(),
            reactions: c.last_message.reactions || {}
          } : null,
          updated_at: c.updated_at
        }));

        return {
          normalConversations: cleanConv(state.normalConversations),
          anonymousConversations: cleanConv(state.anonymousConversations),
          conversations: cleanConv(state.conversations),
          messagesCache: state.messagesCache,
          skippedIds: state.skippedIds || [],
          quickReactions: state.quickReactions,
        };
      },
    }
  )
);
