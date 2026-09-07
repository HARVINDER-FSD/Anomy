import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  RefreshControl,
  DeviceEventEmitter,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Modal,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

// Internal Store & API Client Imports
import { useChatStore, sortConversationsPinnedFirst } from '@/src/store/chatStore';
import { useAuthStore } from '@/src/store/authStore';
import { useAppTheme } from '@/src/theme/colors';
import { socketService } from '@/src/lib/socket';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { clearConversationNotifications } from '@/src/components/NotificationManager';
import { apiClient } from '@/src/api/client';

// Helper to format relative time nicely
const formatRelativeTime = (timeInput: any): string => {
  if (!timeInput) return 'just now';
  const date = new Date(timeInput);
  if (isNaN(date.getTime())) return 'just now';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Initial Avatar Fallback Palette
const INITIAL_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#6366F1'];

const getInitialBg = (name: string) => {
  if (!name) return INITIAL_COLORS[0];
  let charCode = 0;
  for (let i = 0; i < name.length; i++) {
    charCode += name.charCodeAt(i);
  }
  return INITIAL_COLORS[charCode % INITIAL_COLORS.length];
};

// 🎯 Safe Message Content Formatter (Translates URLs/Media types to clean labels like "🖼️ Post", "📷 Photo")
const formatMessageContent = (lastMsg: any): string => {
  if (!lastMsg) return 'Active now';
  if (lastMsg.is_deleted) return 'Message deleted';

  const mt = (lastMsg.message_type || lastMsg.type || '').toLowerCase();
  const content = typeof lastMsg.content === 'string' ? lastMsg.content.trim() : '';

  if (mt === 'image' || lastMsg.media_type === 'image') return '📷 Photo';
  if (mt === 'video' || lastMsg.media_type === 'video') return '🎥 Video';
  if (mt === 'audio' || lastMsg.media_type === 'audio') return '🎵 Voice note';
  if (mt === 'sticker') return content || '✨ Sticker';
  if (
    mt === 'shot_share' ||
    mt === 'reel_share' ||
    mt === 'reel' ||
    content.includes('/reels/') ||
    content.includes('/shot/') ||
    content.includes('anufy.app/reels/') ||
    content.includes('anufy.app/shot/')
  ) {
    return '📽️ Reel';
  }
  if (
    mt === 'post_share' ||
    mt === 'post' ||
    content.includes('/post/') ||
    content.includes('/posts/') ||
    content.includes('anufy.app/post/')
  ) {
    return '🖼️ Post';
  }
  if (
    mt === 'profile_share' ||
    mt === 'profile' ||
    content.includes('/user/') ||
    content.includes('anufy.app/user/')
  ) {
    return '👤 Profile';
  }
  if (mt === 'lottie_voice') return '✨ Voice sticker';
  if (mt === 'story_reply') return '↩️ Story reply';
  if (content.startsWith('http://') || content.startsWith('https://')) return '🔗 Link';
  return content || 'Active now';
};

const EMPTY_CONVERSATIONS: any[] = [];

// ------------------------------------------------------------
// MESSAGES SCREEN - 100% REAL BACKEND INTEGRATION
// ------------------------------------------------------------
export default function MessagesScreen() {
  const theme = useAppTheme();
  const router = useSafeRouter();
  const currentUser = useAuthStore((state: any) => state.user);
  const myId = (currentUser?._id || currentUser?.id)?.toString();

  // Global App Mode Detection
  const isAnonymousMode = useAuthStore((state: any) => !!state.user?.isAnonymousMode);

  // Real Chat Store State (Stable Selectors)
  const normalConversations = useChatStore((state: any) => state.normalConversations) || EMPTY_CONVERSATIONS;
  const anonymousConversations = useChatStore((state: any) => state.anonymousConversations) || EMPTY_CONVERSATIONS;
  const rawConversations = isAnonymousMode ? anonymousConversations : normalConversations;

  // Component State
  const [headerTab, setHeaderTab] = useState<'chats' | 'calls'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // Debounced Global User Search
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchedUsers([]);
      setIsSearchingUsers(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingUsers(true);
        const { data } = await apiClient.get(`/users/search?q=${encodeURIComponent(query)}`);
        const list = Array.isArray(data) ? data : (data?.data || data?.users || []);
        // Filter out my own user
        setSearchedUsers(list.filter((u: any) => (u.id || u._id)?.toString() !== myId));
      } catch (e) {
        setSearchedUsers([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [searchQuery, myId]);

  // Focus Effect - Sync Conversations on Screen Focus
  useFocusEffect(
    useCallback(() => {
      useChatStore.getState().switchMode(isAnonymousMode);
      useChatStore.getState().refreshConversations(isAnonymousMode);
    }, [isAnonymousMode])
  );

  // Listen to Mode Switch Events
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('mode_switched', (evt: any) => {
      const anon = !!evt?.isAnonymous;
      useChatStore.getState().switchMode(anon);
      useChatStore.getState().refreshConversations(anon);
    });
    return () => sub.remove();
  }, []);

  // Fetch REAL Suggested Users & REAL Stories from Backend API
  const [realStories, setRealStories] = useState<any[]>([]);

  const fetchRealStories = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/stories');
      const list = Array.isArray(data) ? data : (data?.data || data?.stories || []);
      setRealStories(list);
    } catch (e) {
      setRealStories([]);
    }
  }, []);

  const fetchSuggestedUsers = useCallback(async () => {
    try {
      setLoadingSuggestions(true);
      const { data } = await apiClient.get('/users/suggestions?limit=6');
      const list = Array.isArray(data) ? data : (data?.data || []);
      setSuggestedUsers(list);
    } catch (e) {
      setSuggestedUsers([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestedUsers();
    fetchRealStories();
  }, []);

  // Socket Event Handlers
  useEffect(() => {
    const handleStatusUpdate = (data: { userId: string; status: string }) => {
      if (!data?.userId) return;
      setOnlineUsers(prev => {
        const next = new Set(prev);
        if (data.status === 'online') {
          next.add(data.userId.toString());
        } else {
          next.delete(data.userId.toString());
        }
        return next;
      });
    };

    const handleNewMessage = () => {
      useChatStore.getState().refreshConversations(isAnonymousMode);
    };

    const handleConversationDeleted = (data: any) => {
      const cId = data?.conversationId || data?.id;
      if (cId) {
        useChatStore.getState().removeConversation(String(cId));
      }
    };

    socketService.on('user_status_update', handleStatusUpdate);
    socketService.on('message:received', handleNewMessage);
    socketService.on('conversation:updated', handleNewMessage);
    socketService.on('conversation:deleted', handleConversationDeleted);

    return () => {
      socketService.off('user_status_update', handleStatusUpdate);
      socketService.off('message:received', handleNewMessage);
      socketService.off('conversation:updated', handleNewMessage);
      socketService.off('conversation:deleted', handleConversationDeleted);
    };
  }, [isAnonymousMode]);

  // Refresh Handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      useChatStore.getState().refreshConversations(isAnonymousMode),
      fetchSuggestedUsers(),
    ]);
    setRefreshing(false);
  };

  // Action Sheet State for Long-Press on Conversation
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  const openActionSheet = useCallback((conv: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedConv(conv);
    setActionSheetVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
    }).start();
  }, [slideAnim]);

  const closeActionSheet = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setActionSheetVisible(false);
      setSelectedConv(null);
    });
  }, [slideAnim]);

  const handlePinAction = async () => {
    if (!selectedConv) return;
    const convId = (selectedConv._id || selectedConv.id)?.toString();
    const isPinned = !!selectedConv.is_pinned;
    closeActionSheet();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await useChatStore.getState().pinConversation(convId, !isPinned);
    if (!res?.success && res?.reason === 'limit_reached') {
      Alert.alert('Pin Limit Reached', 'You can only pin up to 5 chats.');
    }
  };

  const handleMuteAction = async () => {
    if (!selectedConv) return;
    const convId = (selectedConv._id || selectedConv.id)?.toString();
    const isMuted = !!selectedConv.is_muted;
    closeActionSheet();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await useChatStore.getState().muteConversation(convId, !isMuted);
  };

  const handleDeleteAction = () => {
    if (!selectedConv) return;
    const conv = selectedConv;
    const convId = (conv._id || conv.id)?.toString();
    closeActionSheet();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    useChatStore.getState().deleteConversation(convId);
  };

  // Filter Conversations with Strict Isolation Wall & Pinned Prioritization
  const filteredConversations = useMemo(() => {
    const list = (rawConversations || []).filter((conv: any) => {
      if (!conv) return false;

      const isConvAnon = conv.is_anonymous === true;
      if (isAnonymousMode && !isConvAnon) return false;
      if (!isAnonymousMode && isConvAnon) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const participants = conv.participants || [];
        const matchesName = participants.some((p: any) => {
          const u = p.user || p || {};
          const name = isAnonymousMode
            ? (u.ghost_persona?.name || u.full_name || '').toLowerCase()
            : (u.full_name || u.name || u.username || '').toLowerCase();
          const username = (u.username || '').toLowerCase();
          return name.includes(query) || username.includes(query);
        });
        const matchesLastMsg = (conv.last_message?.content || '').toLowerCase().includes(query);
        return matchesName || matchesLastMsg;
      }

      return true;
    });
    return sortConversationsPinnedFirst(list);
  }, [rawConversations, isAnonymousMode, searchQuery]);

  // Navigation to Chatroom
  const handleOpenConversation = (conv: any) => {
    const convId = (conv._id || conv.id)?.toString();
    if (!convId) return;

    clearConversationNotifications(convId);
    router.push(`/chat/${convId}`);
  };

  // Start or Open Chat with a Searched User
  const handleStartChatWithUser = async (user: any) => {
    const targetUserId = (user._id || user.id)?.toString();
    if (!targetUserId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Check if conversation already exists in active store
    const existing = (rawConversations || []).find((c: any) => {
      return (c.participants || []).some((p: any) => {
        const uid = (p.user?._id || p.user?.id || p.user || p._id || p.id)?.toString();
        return uid === targetUserId;
      });
    });

    const q = new URLSearchParams();
    q.set('recipientId', targetUserId);
    q.set('username', user.username || user.name || 'user');
    if (user.avatar || user.avatar_url) q.set('profileImage', String(user.avatar || user.avatar_url));

    if (existing) {
      const convId = (existing._id || existing.id)?.toString();
      useChatStore.getState().unskipConversation?.(convId);
      router.push(`/chat/${convId}?${q.toString()}` as any);
      return;
    }

    try {
      const res = await apiClient.post('/users/conversations', {
        recipientId: targetUserId,
        isAnonymous: isAnonymousMode,
      });
      const convData = res.data?.data;
      const convId = (convData?.conversation?.id || convData?.conversation?._id || convData?._id || convData?.id)?.toString();

      if (convId) {
        useChatStore.getState().unskipConversation?.(convId);
        if (convData?.conversation) {
          const storeConvs = useChatStore.getState().conversations || [];
          useChatStore.getState().setConversations([
            convData.conversation,
            ...storeConvs.filter((c: any) => (c._id || c.id)?.toString() !== convId)
          ], isAnonymousMode);
        }
        router.push(`/chat/${convId}?${q.toString()}` as any);
      } else {
        router.push(`/chat/new?${q.toString()}` as any);
      }
    } catch (e) {
      router.push(`/chat/new?${q.toString()}` as any);
    }
  };

  // REAL Follow / Unfollow Backend API Action
  const handleToggleFollow = async (targetUserId: string) => {
    const isCurrentlyFollowed = followedIds.has(targetUserId);
    
    // Optimistic UI Update
    setFollowedIds(prev => {
      const next = new Set(prev);
      if (isCurrentlyFollowed) next.delete(targetUserId);
      else next.add(targetUserId);
      return next;
    });

    try {
      if (isCurrentlyFollowed) {
        await apiClient.post(`/users/${targetUserId}/unfollow`);
      } else {
        await apiClient.post(`/users/${targetUserId}/follow`);
      }
    } catch (e) {
      // Revert on API error
      setFollowedIds(prev => {
        const next = new Set(prev);
        if (isCurrentlyFollowed) next.add(targetUserId);
        else next.delete(targetUserId);
        return next;
      });
    }
  };

  // Dismiss Suggestion Item
  const handleDismissSuggestion = (targetUserId: string) => {
    setSuggestedUsers(prev => prev.filter(u => (u._id || u.id)?.toString() !== targetUserId?.toString()));
  };

  // Skip Ghost Room Action
  const handleSkipGhostChat = async (conv: any) => {
    const convId = (conv._id || conv.id)?.toString();
    if (!convId) return;

    Alert.alert('Skip Ghost Room', 'Are you sure you want to end and skip this anonymous chat?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/chat/conversations/${convId}`);
            useChatStore.getState().refreshConversations(isAnonymousMode);
          } catch (e) {
            useChatStore.getState().refreshConversations(isAnonymousMode);
          }
        },
      },
    ]);
  };

  // Render Real Recent Chat Item
  const renderConversationItem = ({ item: conv }: { item: any }) => {
    if (!conv) return null;

    const convId = (conv._id || conv.id)?.toString();
    const participants = conv.participants || [];
    
    const partnerObj = participants.find((p: any) => {
      const u = p.user || p || {};
      const uid = (u._id || u.id)?.toString();
      return uid && uid !== myId;
    })?.user || {};

    const isConvAnon = conv.is_anonymous === true || isAnonymousMode;

    // Safety: In normal direct chats, if the partner user is missing or deleted, do not render orphaned card
    if (!isConvAnon && conv.type !== 'group') {
      const pId = (partnerObj._id || partnerObj.id)?.toString();
      if (!pId || partnerObj.is_deleted_user) return null;
    }
    const ghostPersona = partnerObj.ghost_persona || partnerObj.anonymousPersona || {};

    const partnerName = isConvAnon
      ? (ghostPersona.name || partnerObj.full_name || 'Shadow Ghost')
      : (partnerObj.full_name || partnerObj.name || partnerObj.username || 'AnuFi User');

    const partnerAvatar = isConvAnon
      ? (ghostPersona.avatar || partnerObj.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=Ghost')
      : resolveAvatarUrl(partnerObj.avatar_url || partnerObj.avatar);

    const partnerInitials = partnerName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const isPinned = !!conv.is_pinned;
    const isMuted = !!conv.is_muted;

    const lastMsg = conv.last_message;
    const lastMsgContent = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
    const lastMsgType = lastMsg?.message_type || lastMsg?.type || 'text';

    const senderId = (
      lastMsg?.sender_id?._id ||
      lastMsg?.sender_id?.id ||
      lastMsg?.sender_id ||
      lastMsg?.senderId ||
      lastMsg?.sender?._id ||
      lastMsg?.sender?.id ||
      lastMsg?.sender
    )?.toString();

    const isMine = !!(senderId && myId && senderId === myId);

    const isRead = lastMsg?.status === 'read' ||
      (lastMsg?.read_by && Array.isArray(lastMsg.read_by) && lastMsg.read_by.length > 0);

    const isUnread = !isMine && !!lastMsg && (
      (conv.unread_count && Number(conv.unread_count) > 0) ||
      (conv.unread_counts && Number(conv.unread_counts[myId]) > 0) ||
      lastMsg.status !== 'read'
    );

    const msgFormatted = formatMessageContent(lastMsg);
    let previewText = msgFormatted;

    if (!lastMsg) {
      previewText = 'Active now';
    } else {
      const timeRef = isMine
        ? (isRead
            ? (lastMsg.readAt || lastMsg.read_at || lastMsg.updated_at || lastMsg.created_at || conv.updated_at)
            : (lastMsg.created_at || conv.updated_at))
        : (lastMsg.created_at || conv.updated_at);
      const timeStr = formatRelativeTime(timeRef);

      if (isMine) {
        const statusLabel = isRead ? `Seen ${timeStr}` : `Sent ${timeStr}`;
        previewText = timeStr ? `${msgFormatted} · ${statusLabel}` : msgFormatted;
      } else {
        previewText = timeStr && msgFormatted !== 'Active now' ? `${msgFormatted} · ${timeStr}` : msgFormatted;
      }
    }

    return (
      <Pressable
        key={convId}
        style={({ pressed }) => [
          styles.chatRow,
          isPinned && styles.pinnedChatRow,
          isConvAnon && styles.ghostChatRow,
          pressed && styles.cardPressed,
        ]}
        onPress={() => handleOpenConversation(conv)}
        onLongPress={() => openActionSheet(conv)}
        delayLongPress={220}
      >
        {/* Real Avatar or Initial Circle */}
        <View style={styles.avatarWrap}>
          {partnerAvatar && !partnerAvatar.includes('placeholder') ? (
            <Image
              source={{ uri: partnerAvatar }}
              style={styles.avatarImg}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatarInitialCircle, { backgroundColor: getInitialBg(partnerName) }]}>
              <Text style={styles.initialText}>{partnerInitials}</Text>
            </View>
          )}
        </View>

        {/* Real User Info & Preview */}
        <View style={styles.chatInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={[
                styles.partnerName,
                { color: isConvAnon ? '#FFFFFF' : theme.text },
                isUnread && { fontWeight: '800' }
              ]}
              numberOfLines={1}
            >
              {partnerName}
            </Text>
            {isMuted && (
              <Ionicons
                name="volume-mute"
                size={14}
                color={isConvAnon ? '#94A3B8' : (theme.subtitle || '#94A3B8')}
                style={{ marginLeft: 5, marginBottom: 2 }}
              />
            )}
          </View>
          <Text
            style={[
              styles.previewSubtext,
              {
                color: isUnread
                  ? (isConvAnon ? '#FFFFFF' : theme.text)
                  : (isConvAnon ? '#94A3B8' : (theme.subtitle || '#64748B')),
                fontWeight: isUnread ? '800' : '500',
              }
            ]}
            numberOfLines={1}
          >
            {previewText}
          </Text>
        </View>

        {/* Pin indicator badge */}
        {isPinned && (
          <View style={styles.pinIndicatorBadge}>
            <Ionicons name="pin" size={13} color="#6366F1" />
          </View>
        )}

        {/* Unread indicator dot */}
        {isUnread && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#9333EA', marginRight: 6 }} />
        )}

        {/* Actions: Call button in Normal Mode, Skip + Report in Anonymous Mode */}
        {!isAnonymousMode && !isConvAnon ? (
          <TouchableOpacity
            style={styles.callIconBtn}
            onPress={() => handleOpenConversation(conv)}
          >
            <Ionicons name="call-outline" size={20} color={theme.primary || '#5B21B6'} />
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={styles.anonActionBtnSkip}
              onPress={() => handleSkipGhostChat(conv)}
            >
              <Ionicons name="play-skip-forward-outline" size={15} color="#FF9800" />
              <Text style={styles.anonActionBtnTextSkip}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.anonActionBtnReport}
              onPress={() => router.push(`/report?targetId=${convId}&targetType=conversation` as any)}
            >
              <Ionicons name="flag-outline" size={14} color="#FF3B30" />
              <Text style={styles.anonActionBtnTextReport}>Report</Text>
            </TouchableOpacity>
          </View>
        )}
      </Pressable>
    );
  };

  // Dynamic Stylesheet based on Light / Dark Mode & Anonymous Mode
  const styles = useMemo(() => getStyles(theme, isAnonymousMode), [theme, isAnonymousMode]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isAnonymousMode ? '#0F172A' : theme.background }]}>
      <StatusBar barStyle={theme.background === '#121212' || isAnonymousMode ? 'light-content' : 'dark-content'} />
      {/* 1. Header Navigation Bar */}
      <View style={styles.topHeader}>
        {/* Left Segmented Pill Switcher [Chats | Calls] */}
        {isAnonymousMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 }}>
              Ghost Inbox
            </Text>
          </View>
        ) : (
          <View style={styles.segmentedPillContainer}>
            <TouchableOpacity
              style={[styles.segmentTab, headerTab === 'chats' && styles.segmentTabActive]}
              onPress={() => setHeaderTab('chats')}
            >
              <Text style={[styles.segmentTabText, headerTab === 'chats' && styles.segmentTabTextActive]}>
                Chats
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentTab, headerTab === 'calls' && styles.segmentTabActive]}
              onPress={() => setHeaderTab('calls')}
            >
              <Text style={[styles.segmentTabText, headerTab === 'calls' && styles.segmentTabTextActive]}>
                Calls
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Right Action Icons (Envelope / Plus) — Only in Normal Mode */}
        {!isAnonymousMode && (
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/message-requests')}
            >
              <Ionicons name="mail-outline" size={24} color={theme.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => {
                searchInputRef.current?.focus();
              }}
            >
              <Ionicons name="create-outline" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 2. Search Messages Input Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInnerBar}>
          <Ionicons name="search-outline" size={18} color={theme.subtitle || '#64748B'} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search people or messages..."
            placeholderTextColor={theme.subtitle || '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.subtitle || '#94A3B8'} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* 3. Main Inbox Scroll Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#5B21B6']}
            tintColor="#5B21B6"
          />
        }
      >
        {/* ── SEARCH MODE ACTIVE ── */}
        {searchQuery.trim().length > 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            {/* 1. Matching Conversations from Inbox */}
            {filteredConversations.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.searchSectionTitle}>CHATS</Text>
                {filteredConversations.map((conv: any) => (
                  renderConversationItem({ item: conv })
                ))}
              </View>
            )}

            {/* 2. Global People / Users Search Results from Backend */}
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.searchSectionTitle}>PEOPLE</Text>
              {isSearchingUsers ? (
                <ActivityIndicator size="small" color="#5B21B6" style={{ marginVertical: 14 }} />
              ) : searchedUsers.length > 0 ? (
                searchedUsers.map((user: any) => {
                  const uId = (user._id || user.id)?.toString();
                  const uName = user.name || user.full_name || user.username || 'User';
                  const uUsername = user.username || 'user';
                  const uAvatar = resolveAvatarUrl(user.avatar || user.avatar_url);
                  const uInitials = uName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

                  return (
                    <TouchableOpacity
                      key={uId}
                      style={styles.searchedUserRow}
                      onPress={() => handleStartChatWithUser(user)}
                      activeOpacity={0.7}
                    >
                      {/* Avatar */}
                      {uAvatar && !uAvatar.includes('placeholder') ? (
                        <Image source={{ uri: uAvatar }} style={styles.searchedUserAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.searchedUserInitialCircle, { backgroundColor: getInitialBg(uName) }]}>
                          <Text style={styles.initialText}>{uInitials}</Text>
                        </View>
                      )}

                      {/* Name & @username */}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={[styles.searchedUserName, { color: isAnonymousMode ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
                            {uName}
                          </Text>
                          {user.verified && (
                            <Ionicons name="checkmark-circle" size={14} color="#3B82F6" />
                          )}
                        </View>
                        <Text style={[styles.searchedUserUsername, { color: isAnonymousMode ? '#94A3B8' : (theme.subtitle || '#64748B') }]} numberOfLines={1}>
                          @{uUsername}
                        </Text>
                      </View>

                      {/* Chat action button */}
                      <View style={styles.searchChatBtn}>
                        <Ionicons name="chatbubble-outline" size={16} color="#5B21B6" />
                        <Text style={styles.searchChatBtnText}>Chat</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                filteredConversations.length === 0 && (
                  <View style={styles.emptyInboxWrap}>
                    <Text style={[styles.emptyTitle, isAnonymousMode && { color: '#FFFFFF' }]}>
                      No users found
                    </Text>
                    <Text style={styles.emptySub}>
                      No users matching "{searchQuery}"
                    </Text>
                  </View>
                )
              )}
            </View>
          </View>
        ) : (
          /* ── NORMAL INBOX MODE ── */
          <>
            {/* Horizontal Stories Bar (Only in Normal Mode) */}
            {!isAnonymousMode && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storyScrollContainer}
              >
                {/* Your Story */}
                <TouchableOpacity style={styles.storyItem} onPress={() => router.push('/create-story')}>
                  <View style={styles.yourStoryAvatarWrap}>
                    <Image
                      source={{ uri: resolveAvatarUrl(currentUser?.avatar_url || currentUser?.avatar) }}
                      style={styles.storyAvatar}
                    />
                    <View style={styles.addStoryPlusBadge}>
                      <Ionicons name="add" size={12} color="#FFFFFF" />
                    </View>
                  </View>
                  <Text style={styles.storyLabel}>Your Story</Text>
                </TouchableOpacity>

                {/* Active Real Stories from Backend API ONLY */}
                {realStories.map((storyGroup: any, idx: number) => {
                  const storyUser = storyGroup.user || storyGroup.author || {};
                  const name = storyUser.full_name || storyUser.username || 'Story';
                  const avatar = resolveAvatarUrl(storyUser.avatar_url || storyUser.avatar || storyGroup.avatar);

                  return (
                    <TouchableOpacity
                      key={storyGroup._id || idx}
                      style={styles.storyItem}
                      onPress={() => router.push(`/story-view?userId=${storyUser._id || storyGroup.userId}` as any)}
                    >
                      <View style={styles.friendStoryAvatarRing}>
                        <Image source={{ uri: avatar }} style={styles.storyAvatar} />
                      </View>
                      <Text style={styles.storyLabel} numberOfLines={1}>
                        {name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Recent Conversations List */}
            <View style={styles.conversationsListWrap}>
              {filteredConversations.length > 0 ? (
                filteredConversations.map((conv: any) => (
                  renderConversationItem({ item: conv })
                ))
              ) : (
                <View style={styles.emptyInboxWrap}>
                  <Text style={[styles.emptyTitle, isAnonymousMode && { color: '#FFFFFF' }]}>No messages yet</Text>
                  <Text style={styles.emptySub}>
                    {isAnonymousMode ? 'No ghost conversations yet.' : 'Start a chat with your friends below!'}
                  </Text>
                </View>
              )}
            </View>

            {/* 4. REAL SUGGESTED FOR YOU Section (Only in Normal Mode) */}
            {!isAnonymousMode && suggestedUsers.length > 0 && (
              <View style={styles.suggestedSectionWrap}>
                <Text style={styles.suggestedHeaderTitle}>SUGGESTED FOR YOU</Text>

                {loadingSuggestions ? (
                  <ActivityIndicator size="small" color="#5B21B6" style={{ marginVertical: 12 }} />
                ) : (
                  suggestedUsers.map((user: any) => {
                    const userIdStr = (user._id || user.id)?.toString();
                    if (!userIdStr || userIdStr === myId) return null;

                    const isFollowed = followedIds.has(userIdStr);
                    const fullName = user.full_name || user.name || user.username || 'User';
                    const avatar = resolveAvatarUrl(user.avatar_url || user.avatar);
                    const initials = fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

                    return (
                      <View key={userIdStr} style={styles.suggestedRow}>
                        {/* Avatar or Initials */}
                        {avatar && !avatar.includes('placeholder') ? (
                          <Image source={{ uri: avatar }} style={styles.suggestedAvatar} />
                        ) : (
                          <View style={[styles.suggestedInitialCircle, { backgroundColor: getInitialBg(fullName) }]}>
                            <Text style={styles.initialText}>{initials}</Text>
                          </View>
                        )}

                        {/* Name & @username */}
                        <View style={styles.suggestedInfo}>
                          <Text style={styles.suggestedName} numberOfLines={1}>{fullName}</Text>
                          <Text style={styles.suggestedUsername} numberOfLines={1}>@{user.username || 'user'}</Text>
                        </View>

                        {/* Follow Pill Button */}
                        <TouchableOpacity
                          style={[styles.followBtn, isFollowed && styles.followingBtn]}
                          onPress={() => handleToggleFollow(userIdStr)}
                        >
                          <Text style={[styles.followBtnText, isFollowed && { color: '#0F172A' }]}>
                            {isFollowed ? 'Following' : 'Follow'}
                          </Text>
                        </TouchableOpacity>

                        {/* Dismiss Button */}
                        <TouchableOpacity
                          style={styles.dismissBtn}
                          onPress={() => handleDismissSuggestion(userIdStr)}
                        >
                          <Ionicons name="close" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Long-Press Action Modal Bottom Sheet */}
      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="none"
        onRequestClose={closeActionSheet}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeActionSheet} />
        <Animated.View
          style={[
            styles.modalSheet,
            {
              backgroundColor: isAnonymousMode ? '#1E293B' : (theme.background || '#FFFFFF'),
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Top Handle */}
          <View style={styles.modalHandle} />

          {/* Chat Header Details */}
          {selectedConv && (() => {
            const participants = selectedConv.participants || [];
            const partner = participants.find((p: any) => {
              const u = p.user || p || {};
              const uid = (u._id || u.id)?.toString();
              return uid && uid !== myId;
            })?.user || {};

            const isAnon = selectedConv.is_anonymous === true || isAnonymousMode;
            const ghost = partner.ghost_persona || partner.anonymousPersona || {};
            const pName = isAnon
              ? (ghost.name || partner.full_name || 'Shadow Ghost')
              : (partner.full_name || partner.name || partner.username || 'AnuFy User');
            const pAvatar = isAnon
              ? (ghost.avatar || partner.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=Ghost')
              : resolveAvatarUrl(partner.avatar_url || partner.avatar);

            const preview = formatMessageContent(selectedConv.last_message);

            const isPinned = !!selectedConv.is_pinned;
            const isMuted = !!selectedConv.is_muted;

            return (
              <>
                <View style={styles.modalHeaderRow}>
                  <Image
                    source={{ uri: pAvatar }}
                    style={styles.modalAvatar}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalTitle, { color: isAnon ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
                      {pName}
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: isAnon ? '#94A3B8' : (theme.subtitle || '#64748B') }]} numberOfLines={1}>
                      {preview}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalDivider} />

                {/* Option 1: Pin / Unpin */}
                <TouchableOpacity
                  style={styles.modalActionItem}
                  onPress={handlePinAction}
                  activeOpacity={0.7}
                >
                  <View style={[styles.modalActionIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                    <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={20} color="#6366F1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalActionText, { color: isAnon ? '#FFFFFF' : theme.text }]}>
                      {isPinned ? 'Unpin from top' : 'Pin to top'}
                    </Text>
                    <Text style={styles.modalActionSubtext}>
                      {isPinned ? 'Remove from top of chat list' : 'Keep at the top of your chats (up to 5)'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* Option 2: Mute / Unmute */}
                <TouchableOpacity
                  style={styles.modalActionItem}
                  onPress={handleMuteAction}
                  activeOpacity={0.7}
                >
                  <View style={[styles.modalActionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <Ionicons name={isMuted ? 'notifications-outline' : 'notifications-off-outline'} size={20} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalActionText, { color: isAnon ? '#FFFFFF' : theme.text }]}>
                      {isMuted ? 'Unmute notifications' : 'Mute notifications'}
                    </Text>
                    <Text style={styles.modalActionSubtext}>
                      {isMuted ? 'Resume notifications for this chat' : 'Silence notifications for this chat'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* Option 3: Delete Chat */}
                <TouchableOpacity
                  style={styles.modalActionItem}
                  onPress={handleDeleteAction}
                  activeOpacity={0.7}
                >
                  <View style={[styles.modalActionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalActionText, { color: '#EF4444' }]}>
                      Delete chat
                    </Text>
                    <Text style={styles.modalActionSubtext}>
                      Delete chat and messages from your side only
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </>
            );
          })()}

          <View style={{ height: Platform.OS === 'ios' ? 36 : 18 }} />
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

// ------------------------------------------------------------
// STYLESHEET
// ------------------------------------------------------------
const getStyles = (theme: any, isAnonymousMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isAnonymousMode ? '#0F172A' : theme.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  segmentedPillContainer: {
    flexDirection: 'row',
    backgroundColor: isAnonymousMode ? '#1E293B' : (theme.surface || '#F3F0FF'),
    borderRadius: 14,
    padding: 3,
  },
  segmentTab: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  segmentTabActive: {
    backgroundColor: isAnonymousMode ? '#334155' : theme.background,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: isAnonymousMode ? '#94A3B8' : (theme.subtitle || '#64748B'),
  },
  segmentTabTextActive: {
    color: isAnonymousMode ? '#FFFFFF' : theme.text,
    fontWeight: '800',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerActionBtn: {
    padding: 4,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchInnerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isAnonymousMode ? '#1E293B' : (theme.surface || '#F5F3FF'),
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14.5,
    color: isAnonymousMode ? '#FFFFFF' : theme.text,
    height: '100%',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  storyScrollContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  storyItem: {
    alignItems: 'center',
    width: 68,
  },
  yourStoryAvatarWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  friendStoryAvatarRing: {
    padding: 2,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#8B5CF6',
    marginBottom: 6,
  },
  storyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: isAnonymousMode ? '#1E293B' : (theme.surface || '#E2E8F0'),
  },
  addStoryPlusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.primary || '#5B21B6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: isAnonymousMode ? '#0F172A' : theme.background,
  },
  storyLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: isAnonymousMode ? '#94A3B8' : theme.text,
    textAlign: 'center',
  },
  conversationsListWrap: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  pinnedChatRow: {
    backgroundColor: isAnonymousMode ? 'rgba(99, 102, 241, 0.08)' : (theme.surface || 'rgba(99, 102, 241, 0.05)'),
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
    paddingLeft: 8,
    marginBottom: 2,
  },
  pinIndicatorBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  ghostChatRow: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  cardPressed: {
    opacity: 0.8,
  },
  avatarWrap: {
    marginRight: 14,
  },
  avatarImg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: isAnonymousMode ? '#1E293B' : (theme.surface || '#E2E8F0'),
  },
  avatarInitialCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestedAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: isAnonymousMode ? '#1E293B' : (theme.surface || '#E2E8F0'),
  },
  suggestedInitialCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  chatInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 3,
  },
  previewSubtext: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  callIconBtn: {
    padding: 8,
  },
  anonActionBtnSkip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 152, 0, 0.12)',
    gap: 3,
  },
  anonActionBtnTextSkip: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF9800',
  },
  anonActionBtnReport: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    gap: 3,
  },
  anonActionBtnTextReport: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF3B30',
  },
  emptyInboxWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: isAnonymousMode ? '#FFFFFF' : theme.text,
  },
  emptySub: {
    fontSize: 13,
    color: isAnonymousMode ? '#94A3B8' : (theme.subtitle || '#94A3B8'),
    marginTop: 4,
  },
  suggestedSectionWrap: {
    marginTop: 12,
    borderTopWidth: 8,
    borderTopColor: isAnonymousMode ? '#1E293B' : (theme.surface || '#F8FAFC'),
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  suggestedHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.subtitle || '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: isAnonymousMode ? '#1E293B' : (theme.border || '#F1F5F9'),
  },
  suggestedInfo: {
    flex: 1,
    marginLeft: 14,
  },
  suggestedName: {
    fontSize: 15,
    fontWeight: '700',
    color: isAnonymousMode ? '#FFFFFF' : theme.text,
  },
  suggestedUsername: {
    fontSize: 13,
    color: theme.subtitle || '#64748B',
    marginTop: 1,
  },
  followBtn: {
    backgroundColor: theme.primary || '#4C0099',
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 999,
    marginRight: 10,
  },
  followingBtn: {
    backgroundColor: isAnonymousMode ? '#334155' : (theme.surface || '#E2E8F0'),
  },
  followBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  dismissBtn: {
    padding: 6,
  },

  // ── Long Press Action Bottom Sheet ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 24,
  },
  modalHandle: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: isAnonymousMode ? '#475569' : '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 14,
  },
  modalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isAnonymousMode ? '#334155' : '#F1F5F9',
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: isAnonymousMode ? '#334155' : '#E5E7EB',
    marginBottom: 8,
  },
  modalActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 14,
  },
  modalActionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionText: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  modalActionSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },

  // ── Global Search Mode Styles ──
  searchSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.subtitle || '#94A3B8',
    letterSpacing: 0.8,
    marginVertical: 10,
  },
  searchedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: isAnonymousMode ? '#1E293B' : (theme.border || '#F1F5F9'),
  },
  searchedUserAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isAnonymousMode ? '#334155' : '#F1F5F9',
  },
  searchedUserInitialCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchedUserName: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  searchedUserUsername: {
    fontSize: 13,
    marginTop: 1,
  },
  searchChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isAnonymousMode ? '#334155' : 'rgba(91, 33, 182, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  searchChatBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: isAnonymousMode ? '#FFFFFF' : (theme.primary || '#5B21B6'),
  },
});
