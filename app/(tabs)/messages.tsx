import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Pressable,
  FlatList,
  Keyboard,
  TouchableHighlight,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';
import { useAppTheme } from '@/src/theme/colors';
import { useAuthStore } from '@/src/store/authStore';
import { useChatStore } from '@/src/store/chatStore';
import { useNotificationStore } from '@/src/store/notificationStore';
import { socketService } from '@/src/lib/socket';
import { upsertIncomingMessage } from '@/src/lib/chatMessages';
import { useCall } from '@/src/context/CallContext';
import { useCallHistoryStore } from '@/src/store/callHistoryStore';
import { FollowButton } from '@/src/components/common/FollowButton';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
import { ConversationListItem } from '@/components/messages/ConversationListItem';
import { StoryBar } from '@/components/messages/StoryBar';
import { Image } from 'expo-image';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { ChatListSkeleton } from '@/components/ui/SkeletonLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiClient } from '@/src/api/client';
import {
  openChat,
  prepareChatFromUser,
  prefetchSearchResultChats,
  prefetchChatMessages,
  prefetchChatRoute,
  warmChatIntent,
} from '@/src/lib/chatNavigation';

type UserSearchResultRowProps = {
  user: any;
  existingConversation?: any;
  colors: ReturnType<typeof useAppTheme>;
  onPressIn: (user: any, existingConversation?: any) => void;
  onPress: (user: any, existingConversation?: any) => void;
};

const UserSearchResultRow = React.memo(({ user, existingConversation, colors, onPressIn, onPress }: UserSearchResultRowProps) => {
  const styles = getStyles(colors);
  const uUsername = user.username || '';
  const uAvatar = user.avatar || '';

  return (
    <TouchableHighlight
      style={styles.userSearchRow}
      underlayColor={colors.surface}
      onPressIn={() => onPressIn(user, existingConversation)}
      onPress={() => onPress(user, existingConversation)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Image
          source={{ uri: resolveAvatarUrl(uAvatar, uUsername, false) }}
          style={styles.searchUserAvatar}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.searchUserUsername}>@{uUsername}</Text>
          {user.name ? <Text style={styles.searchUserName}>{user.name}</Text> : null}
        </View>
      </View>
    </TouchableHighlight>
  );
});

export default function MessagesScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const myId = user?.id || '';
  const isAnonymous = user?.isAnonymousMode === true;
  const switchMode = useChatStore((s) => s.switchMode);
  // 🛡️ IRONCLAD MODE WALL: Frame #1 0ms selector reads mode-isolated array directly
  const rawConversations = useChatStore((s) =>
    isAnonymous ? (s.anonymousConversations || []) : (s.normalConversations || [])
  );
  const conversations = React.useMemo(() => {
    return (rawConversations || []).filter((c: any) =>
      isAnonymous ? (c.is_anonymous === true) : (c.is_anonymous !== true)
    );
  }, [rawConversations, isAnonymous]);

  const refreshConversations = useChatStore((s) => s.refreshConversations);

  React.useEffect(() => {
    if (typeof switchMode === 'function') {
      switchMode(isAnonymous);
    }
  }, [isAnonymous, switchMode]);

  // Handle Real-time Sync for Conversations and Account Deletions
  React.useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return;
    
    const handleRefresh = () => {
      refreshConversations(myId, isAnonymous);
    };

    socket.on('conversation:created', handleRefresh);
    socket.on('user:deleted', handleRefresh);

    return () => {
      socket.off('conversation:created', handleRefresh);
      socket.off('user:deleted', handleRefresh);
    };
  }, [myId, isAnonymous, refreshConversations]);

  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);
  const [refreshing, setRefreshing] = React.useState(false);
  const [typingMap, setTypingMap] = React.useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = React.useState(() => {
    const storeState = useChatStore.getState();
    const cachedConvs = isAnonymous ? storeState.anonymousConversations : storeState.normalConversations;
    // Don't show loading if a skip just happened — conversations being empty is intentional
    const lastSkip = storeState.lastSkipTs;
    const skipJustHappened = lastSkip && (Date.now() - lastSkip) < 8000;
    if (skipJustHappened) return false;
    return !cachedConvs || cachedConvs.length === 0;
  });
  const [searchQuery, setSearchQuery] = React.useState('');
  const [localSearchQuery, setLocalSearchQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'chats' | 'calls'>('chats');
  
  // Pagination State
  const [chatPage, setChatPage] = React.useState(1);
  const [hasMoreChats, setHasMoreChats] = React.useState(true);
  const [loadingMoreChats, setLoadingMoreChats] = React.useState(false);
  const loadMoreConversations = useChatStore((s) => s.loadMoreConversations);

  const lastLoadTimeRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const skipSuppressUntilRef = useRef<number>(0); // Block ALL reloads briefly after anonymous skip
  const DATA_FRESHNESS_MS = 30000; // Consider data fresh for 30 seconds
  
  const callLogs = useCallHistoryStore((s) => s.callLogs);
  const { startCall } = useCall();

  // Suggestions state
  const [suggestedUsers, setSuggestedUsers] = React.useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const [dismissedUserIds, setDismissedUserIds] = React.useState<string[]>([]);

  // Load dismissed suggestions on mount
  useEffect(() => {
    const loadDismissed = async () => {
      try {
        const stored = await AsyncStorage.getItem('dismissed_suggestions');
        if (stored) {
          setDismissedUserIds(JSON.parse(stored));
        }
      } catch (err) {
      }
    };
    void loadDismissed();
  }, []);

  const fetchSuggestions = useCallback(async () => {
    if (!user?.id) return; // Don't fetch if user is not authenticated
    try {
      setLoadingSuggestions(true);
      const res = await apiClient.get('/users/suggestions?limit=15');
      const data = res.data?.data || res.data?.users || res.data || [];

      // Load current dismissed suggestions directly to avoid state lag
      let dismissedList: string[] = [];
      try {
        const stored = await AsyncStorage.getItem('dismissed_suggestions');
        if (stored) {
          dismissedList = JSON.parse(stored);
        }
      } catch (e) {}

      const activeList = (Array.isArray(data) ? data : []).filter(
        (u: any) => !dismissedList.includes((u._id || u.id)?.toString())
      );
      setSuggestedUsers(activeList);
    } catch (err) {
    } finally {
      setLoadingSuggestions(false);
    }
  }, [user?.id]);



  const dismissSuggestion = async (sugId: string) => {
    const stringId = sugId.toString();
    setSuggestedUsers(prev => prev.filter(u => (u._id || u.id)?.toString() !== stringId));
    
    // Save to persistent storage
    try {
      const stored = await AsyncStorage.getItem('dismissed_suggestions');
      let currentList: string[] = stored ? JSON.parse(stored) : [];
      if (!currentList.includes(stringId)) {
        currentList.push(stringId);
        await AsyncStorage.setItem('dismissed_suggestions', JSON.stringify(currentList));
        setDismissedUserIds(currentList);
      }
    } catch (err) {
    }
  };

  // Debounce input to prevent lagging the keyboard on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [localSearchQuery]);

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const formatLogDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    // Check if today
    if (date.toDateString() === now.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Otherwise show date and time
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const renderCallLogItem = useCallback(({ item }: { item: any }) => {
    const isOutgoing = item.direction === 'outgoing';
    const isConnected = item.status === 'connected';
    
    // Icon color: Green for connected calls, Red for missed/failed/declined calls
    const iconColor = isConnected ? '#34C759' : '#FF3B30';
    const callIcon = isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline' as const;

    return (
      <View style={styles.callRow}>
        <Image
          source={{ uri: resolveAvatarUrl(item.avatar, item.username, false) }}
          style={styles.callUserAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        
        <View style={styles.callInfoContainer}>
          <Text style={styles.callUsername}>@{item.username}</Text>
          
          <View style={styles.callDetailsRow}>
            <Ionicons name={callIcon} size={15} color={iconColor} style={{ marginRight: 4 }} />
            <Text style={styles.callSubtitle}>
              {isOutgoing ? 'Outgoing' : 'Incoming'} • {formatLogDate(item.timestamp)}
              {isConnected && item.duration > 0 ? ` (${formatDuration(item.duration)})` : ` • ${item.status === 'no_answer' ? 'No Answer' : item.status === 'declined' ? 'Declined' : 'Missed'}`}
            </Text>
          </View>
        </View>

        <View style={styles.callActions}>
          <TouchableOpacity 
            style={[styles.callActionBtn, { backgroundColor: COLORS.surface }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              startCall(item.userId, item.username, item.avatar, item.type === 'video');
            }}
          >
            <Ionicons 
              name={item.type === 'video' ? 'videocam-outline' : 'call-outline'} 
              size={20} 
              color={COLORS.text} 
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [COLORS, styles]);

  const [requestCount, setRequestCount] = React.useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // User search states for starting new chats
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      setSearchLoading(true);
      const res = await apiClient.get(`/users/search?q=${encodeURIComponent(query)}`);
      // Filter out myself from search results
      const filtered = (res.data || []).filter((u: any) => (u.id || u._id)?.toString() !== myId);
      setSearchResults(filtered);
    } catch (err) {
    } finally {
      setSearchLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(searchQuery);
    }, 400); // 400ms debounce
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, searchUsers]);

  // Group creation states
  const [showCreateGroupModal, setShowCreateGroupModal] = React.useState(false);
  const [groupName, setGroupName] = React.useState('');
  const [followingUsers, setFollowingUsers] = React.useState<any[]>([]);
  const [loadingFollowing, setLoadingFollowing] = React.useState(false);
  const [selectedParticipants, setSelectedParticipants] = React.useState<Set<string>>(new Set());
  const [groupSearchQuery, setGroupSearchQuery] = React.useState('');
  const [creatingGroup, setCreatingGroup] = React.useState(false);

  const fetchFollowing = useCallback(async () => {
    if (!myId) return;
    try {
      setLoadingFollowing(true);
      const res = await apiClient.get(`/users/${myId}/following`);
      setFollowingUsers(res.data?.data || res.data || []);
    } catch (err) {
    } finally {
      setLoadingFollowing(false);
    }
  }, [myId]);

  useEffect(() => {
    if (showCreateGroupModal) {
      fetchFollowing();
      setSelectedParticipants(new Set());
      setGroupName('');
      setGroupSearchQuery('');
    }
  }, [showCreateGroupModal, fetchFollowing]);

  const toggleParticipant = (userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const filteredGroupUsers = useMemo(() => {
    if (!groupSearchQuery.trim()) return followingUsers;
    const lower = groupSearchQuery.toLowerCase();
    return followingUsers.filter(u =>
      (u.username || '').toLowerCase().includes(lower) ||
      (u.fullName || u.full_name || '').toLowerCase().includes(lower)
    );
  }, [followingUsers, groupSearchQuery]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Required', 'Please enter a group name.');
      return;
    }
    if (selectedParticipants.size < 2) {
      Alert.alert('Required', 'Please select at least 2 participants.');
      return;
    }

    try {
      setCreatingGroup(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const participantIds = Array.from(selectedParticipants);
      const res = await apiClient.post('/chat/conversations/group', {
        name: groupName.trim(),
        participantIds
      });

      const newConv = res.data;
      const convId = newConv?._id || newConv?.id;
      if (convId) {
        useChatStore.getState().setConversations([newConv, ...conversations]);
        setShowCreateGroupModal(false);
        router.push(`/chat/${convId}` as any);
      } else {
        Alert.alert('Error', 'Failed to create group.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not create group conversation.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const load = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    // 🚫 Block ALL reloads (including forced) within the skip suppression window
    if (now < skipSuppressUntilRef.current) {
      return;
    }
    // Skip if data is fresh and not forcing refresh
    if (!forceRefresh && !isFetchingRef.current && lastLoadTimeRef.current > 0 && (now - lastLoadTimeRef.current) < DATA_FRESHNESS_MS) {
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!isAnonymous && user?.id) {
        void apiClient.get('/users/message-requests')
          .then(res => {
            if (res?.data?.success && Array.isArray(res?.data?.data)) {
              setRequestCount(res.data.data.length);
            }
          })
          .catch(() => {
            // Quietly ignore transient auth refresh errors
          });
      }
      if (user?.id) {
        await Promise.allSettled([
          refreshConversations(user?.isAnonymousMode),
          fetchUnreadCount()
        ]);
      }
      const now = Date.now();
      lastLoadTimeRef.current = now;
      setChatPage(1);
      setHasMoreChats(true);

      // If active conversations count < 10, fetch suggestions
      const currentConvs = useChatStore.getState().conversations || [];
      if (!isAnonymous && currentConvs.length < 10) {
        void fetchSuggestions();
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [refreshConversations, fetchUnreadCount, myId, isAnonymous, isLoading, fetchSuggestions, user?.id]);

  useFocusEffect(
    useCallback(() => {
      // Sync skip suppression from chatStore (covers cross-screen navigation,
      // e.g. User B was in chatroom when skip happened — their local ref was never set)
      const lastSkip = (useChatStore.getState() as any).lastSkipTs;
      if (lastSkip) {
        const suppressUntil = lastSkip + 8000;
        if (Date.now() < suppressUntil && suppressUntil > skipSuppressUntilRef.current) {
          skipSuppressUntilRef.current = suppressUntil;
        }
      }

      performanceEngine.startScreenTrace('MessagesScreen');
      const cachedConvs = useChatStore.getState().conversations || [];
      const hasCache = cachedConvs.length > 0;
      performanceEngine.trackCacheAccess('Chat', hasCache);
      performanceEngine.endScreenTrace('MessagesScreen', hasCache);

      const withinSuppressWindow = Date.now() < skipSuppressUntilRef.current;
      if (withinSuppressWindow) {
        // Skip just happened — don't reload, and make sure loading spinner is off
        setIsLoading(false);
      } else {
        void load(false); // Use cache if fresh, fetch in background if stale
      }

      const token = useAuthStore.getState().token;
      if (token && !socketService.socket?.connected) {
        socketService.connect(token);
      }

      // Only prefetch if data is stale (more than 30 seconds old)
      const now = Date.now();
      if (!lastLoadTimeRef.current || (now - lastLoadTimeRef.current) > DATA_FRESHNESS_MS) {
        const convs = useChatStore.getState().conversations || [];
        convs.slice(0, 3).forEach((c: any) => {
          const cid = (c._id || c.id)?.toString();
          if (cid) prefetchChatMessages(cid);
        });
        prefetchChatRoute(router);
      }

      // Clear search query and results when returning to Messages screen
      setLocalSearchQuery('');
      setSearchQuery('');
      setSearchResults([]);
    }, [load])
  );

  const prevModeRef = useRef(user?.isAnonymousMode);
  
  useEffect(() => {
    if (prevModeRef.current !== user?.isAnonymousMode) {
      const isAnon = user?.isAnonymousMode === true;

      // 🛡️ HARD TRANSIENT STATE RESET: Clear search queries, results, and transient state
      setLocalSearchQuery('');
      setSearchQuery('');
      setSearchResults([]);
      setTypingMap({});
      setActiveTab('chats');

      // 1. Switch the visible list immediately from existing cache
      if (typeof switchMode === 'function') {
        switchMode(isAnon);
      }

      const storeState = useChatStore.getState();
      const cached = isAnon ? storeState.anonymousConversations : storeState.normalConversations;
      const hasFreshCache = cached && cached.length > 0;

      if (hasFreshCache) {
        // ✅ Cache exists — show instantly, refresh silently in background
        setIsLoading(false);
        // Background refresh without showing loading spinner
        setTimeout(() => { void load(false); }, 300);
      } else {
        // ❌ Cache empty — show loading and fetch
        setIsLoading(true);
        void load(true);
      }

      prevModeRef.current = user?.isAnonymousMode;
    }
  }, [user?.isAnonymousMode, load, switchMode]);

  useEffect(() => {
    const bump = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void load(true); // Background sync
      }, 100); // Fast 100ms background sync
    };

    const handleMessageOrConvUpdated = (data: any) => {
      if (!data) return;
      const convId = (data.conversationId || data.conversation_id || data.id || data.last_message?.conversation_id)?.toString();
      if (!convId) {
        bump();
        return;
      }

      // A clear/delete action marks the user as left_at on the backend, so keep
      // this conversation out of local search/open-chat mapping immediately.
      if ('last_message' in data && data.last_message === null && (data.unread_count ?? 0) === 0) {
        useChatStore.getState().removeConversation(convId);
        bump();
        return;
      }

      const nowIso = data.created_at || data.updated_at || new Date().toISOString();
      const currentConvs: any[] = useChatStore.getState().conversations || [];
      const existingIdx = currentConvs.findIndex((c: any) => (c._id || c.id)?.toString() === convId);
      const nextLastMsg = data.last_message || (data._id ? data : null);

      // ⚡ INSTANT PRE-CACHE: Upsert incoming message into messagesCache so opening chatroom renders it IMMEDIATELY on frame 1!
      if (nextLastMsg && typeof nextLastMsg === 'object' && (nextLastMsg.content || nextLastMsg.media_url || nextLastMsg.message_type)) {
        const currentCache = useChatStore.getState().messagesCache?.[convId] || [];
        const formattedMsg = {
          ...nextLastMsg,
          _id: (nextLastMsg._id || nextLastMsg.id)?.toString?.() || nextLastMsg._id,
          conversation_id: convId,
          created_at: nextLastMsg.created_at || nowIso
        };
        const updatedCache = upsertIncomingMessage(currentCache, formattedMsg);
        useChatStore.getState().setCachedMessages(convId, updatedCache);
      }

      if (existingIdx >= 0) {
        const existing = currentConvs[existingIdx];
        const updatedConv = {
          ...existing,
          last_message: nextLastMsg ? {
            ...nextLastMsg,
            created_at: nextLastMsg.created_at || nowIso
          } : existing.last_message,
          updated_at: nowIso,
          unread_count: typeof data.unread_count === 'number' ? data.unread_count : ((existing.unread_count || 0) + 1)
        };

        // Move updated card to position 0 (top of conversation list)
        const otherConvs = currentConvs.filter((_, idx) => idx !== existingIdx);
        useChatStore.getState().setConversations([updatedConv, ...otherConvs]);
      } else {
        // New incoming conversation from someone not yet in list — place at top immediately!
        const newPlaceholder = {
          _id: convId,
          id: convId,
          updated_at: nowIso,
          unread_count: 1,
          last_message: data.last_message || (data._id ? data : null),
          participants: data.participants || []
        };
        useChatStore.getState().setConversations([newPlaceholder, ...currentConvs]);
      }

      bump();
    };

    const handleMessagesRead = (data: any) => {
      if (!data || !data.conversationId) return;
      const convId = data.conversationId.toString();
      const nowIso = data.readAt || data.read_at || new Date().toISOString();
      const currentConvs: any[] = useChatStore.getState().conversations || [];
      const existingIdx = currentConvs.findIndex((c: any) => (c._id || c.id)?.toString() === convId);

      if (existingIdx >= 0) {
        const existing = currentConvs[existingIdx];
        const updatedLast = existing.last_message ? {
          ...existing.last_message,
          status: 'read',
          readAt: nowIso,
          read_at: nowIso,
          read_by: [{ user_id: data.readBy || 'peer', read_at: nowIso }]
        } : existing.last_message;

        const updatedConv = {
          ...existing,
          unread_count: 0,
          last_message: updatedLast,
          updated_at: nowIso
        };

        const nextConvs = [...currentConvs];
        nextConvs[existingIdx] = updatedConv;
        useChatStore.getState().setConversations(nextConvs);
      }
    };

    const handleChatTyping = (data: any) => {
      if (data && data.chatId) {
        setTypingMap(prev => ({
          ...prev,
          [data.chatId.toString()]: !!data.isTyping
        }));
      }
    };

    socketService.on('message:new', handleMessageOrConvUpdated);
    socketService.on('conversation:updated', handleMessageOrConvUpdated);
    socketService.on('messages:read', handleMessagesRead);
    socketService.on('message:status_updated', handleMessagesRead);
    socketService.on('chat:typing', handleChatTyping);
    socketService.on('user:deleted', bump);
    const handleUserOnlineStatus = (data: any, online: boolean) => {
      const uid = (data?.userId || data?.id || data)?.toString();
      if (!uid) return;
      const currentConvs = useChatStore.getState().conversations || [];
      const updated = currentConvs.map((c: any) => {
        const parts = c.participants || [];
        const matches = parts.some((p: any) => {
          const pId = (p.user?._id || p.user?.id || p.user || p)?.toString();
          return pId === uid;
        });
        if (matches) {
          return {
            ...c,
            is_online: online,
            participants: parts.map((p: any) => {
              const pId = (p.user?._id || p.user?.id || p.user || p)?.toString();
              if (pId === uid) {
                return typeof p.user === 'object' ? { ...p, user: { ...p.user, is_online: online } } : { ...p, is_online: online };
              }
              return p;
            })
          };
        }
        return c;
      });
      useChatStore.getState().setConversations(updated);
    };

    const handleUserOnline = (data: any) => handleUserOnlineStatus(data, true);
    const handleUserOffline = (data: any) => handleUserOnlineStatus(data, false);

    socketService.on('user:online', handleUserOnline);
    socketService.on('user:offline', handleUserOffline);

    // Remove skipped anonymous conversation from chat list (no page reload)
    const handleAnonymousSkip = (data: any) => {
      const convId = typeof data === 'string' ? data : (data?.conversationId || data?.conversation_id || data?.id);
      if (!convId) return;
      // 1. Remove from local store instantly — no spinner
      useChatStore.getState().removeConversation(convId.toString());
      // 2. Block ALL reloads (even force-refreshes from socket events) for 5 seconds
      //    This prevents the list from flickering/reloading after skip for both parties
      skipSuppressUntilRef.current = Date.now() + 5000;
      lastLoadTimeRef.current = Date.now();
      // Cancel any pending debounce reload
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    socketService.on('anonymous:skipped', handleAnonymousSkip);

    return () => {
      socketService.off('message:new', handleMessageOrConvUpdated);
      socketService.off('conversation:updated', handleMessageOrConvUpdated);
      socketService.off('messages:read', handleMessagesRead);
      socketService.off('message:status_updated', handleMessagesRead);
      socketService.off('chat:typing', handleChatTyping);
      socketService.off('user:online', handleUserOnline);
      socketService.off('user:offline', handleUserOffline);
      socketService.off('anonymous:skipped', handleAnonymousSkip);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true); // Force refresh on pull-to-refresh
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filteredConversations = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    
    // Sort conversations: Pinned first, then sorted by last message time / updated_at time
    const sorted = [...conversations].sort((a, b) => {
      const aPinned = !!a.is_pinned;
      const bPinned = !!b.is_pinned;
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }
      const aTime = new Date(a.last_message?.created_at || a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.last_message?.created_at || b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });

    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase();
    return sorted.filter((conv) => {
      const parts = conv.participants || [];
      return parts.some((p: any) => {
        const u = p.user || p;
        const uid = (u.id || u._id)?.toString();
        if (uid === myId) return false;
        const name = (u.username || u.anonymousPersona?.username || '').toLowerCase();
        return name.includes(query);
      });
    });
  }, [conversations, searchQuery, myId]);

  const userIdToConversation = useMemo(() => {
    const map = new Map<string, any>();
    if (!Array.isArray(conversations)) return map;
    for (const c of conversations) {
      if (c.type === 'group') continue;
      for (const p of c.participants || []) {
        const pUserId = (p.user?._id || p.user)?.toString();
        if (pUserId && pUserId !== myId) {
          map.set(pUserId, c);
          break;
        }
      }
    }
    return map;
  }, [conversations, myId]);

  useEffect(() => {
    if (searchResults.length === 0) return;
    prefetchSearchResultChats(searchResults, userIdToConversation);
  }, [searchResults, userIdToConversation]);

  const handleWarmUserChat = useCallback((u: any, existing?: any) => {
    warmChatIntent(prepareChatFromUser(u, existing));
  }, []);

  const handleOpenUserChat = useCallback((u: any, existing?: any) => {
    const params = prepareChatFromUser(u, existing);
    openChat(router, params);
    requestAnimationFrame(() => {
      Keyboard.dismiss();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    });
  }, [router]);

  const renderSearchListItem = useCallback(({ item }: { item: any }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>{item.title}</Text>
        </View>
      );
    }
    if (item.type === 'loading') {
      return (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      );
    }
    if (item.type === 'chat') {
      const cid = (item.data?._id || item.data?.id)?.toString();
      return <ConversationListItem item={item.data} currentUserId={myId} isTyping={!!typingMap[cid]} />;
    }
    if (item.type === 'user') {
      return (
        <UserSearchResultRow
          user={item.data}
          existingConversation={item.existing}
          colors={COLORS}
          onPressIn={handleWarmUserChat}
          onPress={handleOpenUserChat}
        />
      );
    }
    return null;
  }, [COLORS, styles.sectionHeader, styles.sectionHeaderTitle, myId, handleWarmUserChat, handleOpenUserChat]);

  const renderListItem = useCallback(({ item }: { item: any }) => {
    if (!searchQuery.trim()) {
      if (item.type === 'chat') {
        const cid = (item.data?._id || item.data?.id)?.toString();
        return <ConversationListItem item={item.data} currentUserId={myId} isTyping={!!typingMap[cid]} />;
      }
      if (item.type === 'empty-state') {
        return (
          <EmptyState 
            icon={isAnonymous ? "help-circle-outline" : "chatbubbles-outline"}
            title={isAnonymous ? "No Ghost Matches" : "No conversations yet"}
            subtitle={isAnonymous 
              ? "Go to Ghost Explore to find and match with strangers anonymously." 
              : "Start a chat from a profile or anonymous match."}
          />
        );
      }
      if (item.type === 'header') {
        const isSuggestionsHeader = item.id === 'hdr-suggestions';
        return (
          <View style={styles.suggestionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>{item.title}</Text>
            {isSuggestionsHeader && (
              <TouchableOpacity onPress={() => router.push('/explore')} activeOpacity={0.7}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }
      if (item.type === 'suggestion') {
        const sugUser = item.data;
        return (
          <MessageSuggestionRow 
            sugUser={sugUser} 
            COLORS={COLORS} 
            router={router} 
            onDismiss={() => dismissSuggestion(sugUser._id || sugUser.id)} 
          />
        );
      }
      return null;
    }
    return renderSearchListItem({ item });
  }, [searchQuery, myId, renderSearchListItem, COLORS, dismissSuggestion, isAnonymous, styles.sectionHeader, styles.sectionHeaderTitle, router]);

  const listData = useMemo(() => {
    if (!searchQuery.trim()) {
      const data: any[] = [];
      if (filteredConversations.length > 0) {
        data.push(...filteredConversations.map(c => ({ id: `chat-${c._id || c.id}`, type: 'chat', data: c })));
      } else {
        data.push({ id: 'empty-state-row', type: 'empty-state' });
      }

      // Append suggested users if less than 10 conversations
      if (!isAnonymous && conversations.length < 10 && suggestedUsers.length > 0) {
        data.push({ id: 'hdr-suggestions', type: 'header', title: 'Accounts to follow' });
        data.push(...suggestedUsers.map(u => ({
          id: `suggested-${u._id || u.id}`,
          type: 'suggestion',
          data: u,
        })));
      }
      return data;
    }
    const data: any[] = [];
    if (filteredConversations.length > 0) {
      data.push({ id: 'hdr-recent', type: 'header', title: 'Recent Chats' });
      data.push(...filteredConversations.map(c => ({ id: `chat-${c._id || c.id}`, type: 'chat', data: c })));
    }
    if (searchResults.length > 0 || searchLoading) {
      data.push({ id: 'hdr-search', type: 'header', title: 'Start New Chat' });
      if (searchLoading) {
        data.push({ id: 'loading-indicator', type: 'loading' });
      } else {
        data.push(...searchResults.map(u => ({
          id: `user-${u.id || u._id}`,
          type: 'user',
          data: u,
          existing: userIdToConversation.get((u.id || u._id)?.toString()),
        })));
      }
    }
    return data;
  }, [filteredConversations, searchResults, searchLoading, searchQuery, userIdToConversation]);


  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Sleek Instagram-style Clean Header with Text Tabs */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('chats');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.topTabText, activeTab === 'chats' && styles.topTabTextActive]}>
              Chats
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('calls');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.topTabText, activeTab === 'calls' && styles.topTabTextActive]}>
              Calls
            </Text>
          </TouchableOpacity>
        </View>

        {!isAnonymous && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={() => setShowCreateGroupModal(true)} hitSlop={10}>
              <Ionicons name="add" size={30} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>
 
      {activeTab === 'chats' && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.subtitle} style={{ opacity: 0.7 }} />
            <TextInput
              placeholder="Search"
              placeholderTextColor={COLORS.subtitle}
              style={styles.searchInput}
              value={localSearchQuery}
              onChangeText={setLocalSearchQuery}
              autoCorrect={false}
              returnKeyType="search"
            />
            {localSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setLocalSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.listContainer}>
        {isLoading ? (
          <ChatListSkeleton />
        ) : activeTab === 'chats' ? (
          <FastFlashList
            data={listData as any}
            keyExtractor={(item: any, index: number) => {
              return item.id || (item?._id || item?.id || index).toString();
            }}
            renderItem={renderListItem}
            estimatedItemSize={75}
            getItemType={(item: any) => item.is_group ? 'group' : 'direct'}
            drawDistance={300}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                {!isAnonymous && <StoryBar />}
                <View style={styles.messagesHeaderRow}>
                  <Text style={styles.messagesHeaderTitle}>
                    {isAnonymous ? 'Ghost Messages' : 'Messages'}
                  </Text>
                  {!isAnonymous && (
                    <TouchableOpacity
                      onPress={() => router.push('/message-requests')}
                      style={styles.requestsButton}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.requestsText}>Requests</Text>
                      {requestCount > 0 && (
                        <View style={styles.requestsBadge}>
                          <Text style={styles.requestsBadgeText}>{requestCount}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            }
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            style={{ flex: 1 }}
          />
        ) : (
          <FlatList
            data={callLogs}
            keyExtractor={(item) => item.id}
            renderItem={renderCallLogItem}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            ListEmptyComponent={
              <EmptyState
                icon="call-outline"
                title="No call history"
                subtitle="Recent audio and video calls will show up here."
              />
            }
            contentContainerStyle={callLogs.length === 0 ? styles.emptyList : styles.listContent}
          />
        )}
      </View>

      {/* Group Creation Modal */}
      <Modal
        visible={showCreateGroupModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowCreateGroupModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateGroupModal(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Group Chat</Text>
            <TouchableOpacity
              onPress={handleCreateGroup}
              disabled={creatingGroup || !groupName.trim() || selectedParticipants.size < 2}
              style={[
                styles.modalCreateBtn,
                (creatingGroup || !groupName.trim() || selectedParticipants.size < 2) && { opacity: 0.5 }
              ]}
            >
              {creatingGroup ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.modalCreateTxt}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Group Info Input */}
          <View style={styles.groupInfoContainer}>
            <TextInput
              style={styles.groupNameInput}
              placeholder="Enter Group Name..."
              placeholderTextColor={COLORS.subtitle}
              value={groupName}
              onChangeText={setGroupName}
            />
          </View>

          {/* Search Participants */}
          <View style={styles.modalSearchContainer}>
            <View style={styles.modalSearchBar}>
              <Ionicons name="search" size={18} color={COLORS.subtitle} />
              <TextInput
                placeholder="Search friends..."
                placeholderTextColor={COLORS.subtitle}
                style={styles.modalSearchInput}
                value={groupSearchQuery}
                onChangeText={setGroupSearchQuery}
              />
            </View>
          </View>

          {/* Following Users List */}
          <View style={{ flex: 1 }}>
            {loadingFollowing ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : (
              <FlatList
                data={filteredGroupUsers}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item) => (item._id || item.id).toString()}
                renderItem={({ item }) => {
                  const isSelected = selectedParticipants.has(item._id || item.id);
                  return (
                    <TouchableOpacity
                      onPress={() => toggleParticipant(item._id || item.id)}
                      activeOpacity={0.7}
                      style={styles.participantItem}
                    >
                      <Image
                        source={{ uri: resolveAvatarUrl(item.profileImage || item.avatar_url || item.avatar, item.username) }}
                        style={styles.participantAvatar}
                        contentFit="cover"
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.participantUsername}>{item.fullName || item.full_name || item.username}</Text>
                        <Text style={styles.participantFullName}>@{item.username}</Text>
                      </View>
                      <View style={[
                        styles.checkbox,
                        isSelected && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                      ]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.subtitle }}>No friends found.</Text>
                  </View>
                }
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const MessageSuggestionRow = React.memo(({ sugUser, COLORS, router, onDismiss }: any) => {
  const targetId = sugUser._id || sugUser.id;
  const { toggleFollow, isLoading } = useFollowStatus(targetId, {
    isFollowing: !!sugUser.is_following,
    isPending: !!sugUser.is_requested
  });

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: COLORS.background
    }}>
      <TouchableOpacity
        onPress={() => router.push(`/user/${sugUser.username}`)}
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
        activeOpacity={0.7}
        delayPressIn={100}
      >
        <Image
          source={{ uri: resolveAvatarUrl(sugUser.avatar_url || sugUser.avatar || sugUser.profileImage, sugUser.username || sugUser.name || sugUser.full_name, false) }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: COLORS.surface
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }} numberOfLines={1}>
            {sugUser.username}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.subtitle, marginTop: 1 }} numberOfLines={1}>
            {sugUser.name || sugUser.full_name || sugUser.username}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FollowButton
          targetUserId={targetId}
          onToggle={toggleFollow}
          isLoading={isLoading}
          variant="primary"
          size="md"
        />
        <TouchableOpacity onPress={onDismiss} hitSlop={10}>
          <Ionicons name="close" size={20} color={COLORS.subtitle} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const getStyles = (COLORS: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  topTabText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.subtitle,
    letterSpacing: -0.3,
  },
  topTabTextActive: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 21,
    paddingHorizontal: 14,
    height: 42,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 0,
    height: '100%',
  },
  listContainer: { flexGrow: 1, minHeight: 0, paddingBottom: 100 },
  messagesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  suggestionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  messagesHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  requestsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  requestsText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  requestsBadge: {
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  listContent: { paddingBottom: 20 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  emptySub: { marginTop: 8, fontSize: 14, color: COLORS.subtitle, textAlign: 'center', lineHeight: 20 },
  
  // Group creation modal styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  modalCloseBtn: { padding: 4 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  modalCreateBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  modalCreateTxt: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  groupInfoContainer: { padding: 16 },
  groupNameInput: {
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  modalSearchContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  modalSearchInput: { flex: 1, marginLeft: 6, fontSize: 14, color: COLORS.text, padding: 0 },
  modalLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border + '50',
  },
  participantAvatar: { width: 44, height: 44, borderRadius: 22 },
  participantUsername: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  participantFullName: { fontSize: 13, color: COLORS.subtitle, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface + '60',
    marginTop: 10,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.subtitle,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  userSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  searchUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
  },
  searchUserUsername: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  searchUserName: {
    fontSize: 13,
    color: COLORS.subtitle,
    marginTop: 2,
  },
  chatBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chatBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  // Segmented Tabs Styles
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 3,
    borderRadius: 12,
    width: 170,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: COLORS.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.subtitle,
  },
  tabTextActive: {
    color: COLORS.text,
  },
  // Call History List Row Styles
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border + '35',
  },
  callUserAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E5E7EB',
  },
  callInfoContainer: {
    flex: 1,
    marginLeft: 14,
  },
  callUsername: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  callDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  callSubtitle: {
    fontSize: 13,
    color: COLORS.subtitle,
  },
  callActions: {
    marginLeft: 12,
  },
  callActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
