import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

// Store & Engine Imports
import { useChatStore } from '@/src/store/chatStore';
import { useAuthStore } from '@/src/store/authStore';
import { socketService } from '@/src/lib/socket';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { clearConversationNotifications } from '@/src/components/NotificationManager';

// Format relative time helper
const formatRelativeTime = (timeInput: any): string => {
  if (!timeInput) return '';
  const date = new Date(timeInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ------------------------------------------------------------
// DEDICATED GHOST MODE MESSAGES INBOX SCREEN
// ------------------------------------------------------------
export default function GhostMessagesScreen() {
  const router = useSafeRouter();
  const currentUser = useAuthStore((state: any) => state.user);
  const myId = (currentUser?._id || currentUser?.id)?.toString();

  // Chat Store State - Dedicated strictly to Anonymous Shadow Conversations
  const anonymousConversations = useChatStore((state: any) => state.anonymousConversations || []);
  const refreshConversations = useChatStore((state: any) => state.refreshConversations);
  const removeConversation = useChatStore((state: any) => state.removeConversation);

  // Local State
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Focus Effect - Sync Incognito Conversations on Screen Focus
  useFocusEffect(
    useCallback(() => {
      refreshConversations(true); // Fetch anonymous chats strictly
    }, [refreshConversations])
  );

  // Real-Time Socket Listeners for Ghost Messages
  useEffect(() => {
    const handleNewMessage = () => {
      refreshConversations(true);
    };

    socketService.on('message:received', handleNewMessage);
    socketService.on('conversation:updated', handleNewMessage);

    return () => {
      socketService.off('message:received', handleNewMessage);
      socketService.off('conversation:updated', handleNewMessage);
    };
  }, [refreshConversations]);

  // Pull to Refresh Handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshConversations(true);
    setRefreshing(false);
  };

  // Filter Anonymous Conversations
  const filteredConversations = useMemo(() => {
    return (anonymousConversations || []).filter((conv: any) => {
      if (!conv) return false;
      // 🛡️ STRICT ISOLATION WALL: Drop non-anonymous conversations
      if (conv.is_anonymous !== true) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const participants = conv.participants || [];
        const matchesGhostName = participants.some((p: any) => {
          const u = p.user || p || {};
          const ghostName = (u.ghost_persona?.name || u.full_name || '').toLowerCase();
          return ghostName.includes(query);
        });
        const matchesLastMsg = (conv.last_message?.content || '').toLowerCase().includes(query);
        return matchesGhostName || matchesLastMsg;
      }
      return true;
    });
  }, [anonymousConversations, searchQuery]);

  // Open Anonymous Conversation
  const handleOpenConversation = (conv: any) => {
    const convId = (conv._id || conv.id)?.toString();
    if (!convId) return;

    clearConversationNotifications(convId);
    router.push(`/chat/${convId}`);
  };

  // Render Item for FlashList
  const renderItem = ({ item: conv }: { item: any }) => {
    if (!conv) return null;

    const participants = conv.participants || [];
    const partnerObj = participants.find((p: any) => {
      const u = p.user || p || {};
      const uid = (u._id || u.id)?.toString();
      return uid && uid !== myId;
    })?.user || {};

    const ghostPersona = partnerObj.ghost_persona || partnerObj.anonymousPersona || {};
    const ghostName = ghostPersona.name || partnerObj.full_name || 'Shadow Ghost';
    const ghostAvatar = ghostPersona.avatar || partnerObj.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=Ghost';

    // Last Message Inspection
    const lastMsg = conv.last_message;
    const lastMsgContent = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
    const lastMsgType = lastMsg?.message_type || 'text';
    const lastMsgSenderId = (lastMsg?.sender_id?._id || lastMsg?.sender_id)?.toString();
    const isSentByMe = lastMsgSenderId === myId;

    let previewText = lastMsgContent;
    if (lastMsgType === 'image') previewText = '📷 Sent a photo';
    else if (lastMsgType === 'video') previewText = '🎥 Sent a video';
    else if (lastMsgType === 'audio') previewText = '🎵 Voice whisper';
    else if (lastMsgType === 'sticker') previewText = '✨ Ghost sticker';
    else if (lastMsgType === 'post_share' || lastMsgType === 'post' || lastMsgContent.includes('/post/') || lastMsgContent.includes('/posts/')) previewText = '🖼️ Post';
    else if (lastMsgType === 'shot_share' || lastMsgType === 'reel_share' || lastMsgType === 'reel' || lastMsgContent.includes('/reels/') || lastMsgContent.includes('/shot/')) previewText = '📽️ Reel';
    else if (lastMsgContent.startsWith('http://') || lastMsgContent.startsWith('https://')) previewText = '🔗 Link';
    else if (!previewText) previewText = 'Ghost room active';

    if (isSentByMe) {
      previewText = `You: ${previewText}`;
    }

    const unreadCount = conv.unread_counts?.[myId] || conv.unread_count || 0;
    const isUnreadIncoming = !isSentByMe && lastMsg && (unreadCount > 0 || lastMsg.status !== 'read');

    return (
      <Pressable
        style={({ pressed }) => [styles.cardContainer, pressed && styles.cardPressed]}
        onPress={() => handleOpenConversation(conv)}
      >
        {/* Ghost Avatar */}
        <View style={styles.avatarWrapper}>
          <Image
            source={{ uri: ghostAvatar }}
            style={styles.avatarImage}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.ghostBadgeIcon}>
            <MaterialCommunityIcons name="ghost" size={10} color="#FFFFFF" />
          </View>
        </View>

        {/* Conversation Content */}
        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.ghostNameText, isUnreadIncoming && styles.unreadTextBold]} numberOfLines={1}>
              {ghostName}
            </Text>
            {lastMsg?.created_at && (
              <Text style={[styles.timeText, isUnreadIncoming && { color: '#A855F7' }]}>
                {formatRelativeTime(lastMsg.created_at)}
              </Text>
            )}
          </View>

          <View style={styles.cardSubRow}>
            <Text style={[styles.previewText, isUnreadIncoming && styles.unreadPreviewBold]} numberOfLines={1}>
              {previewText}
            </Text>

            <TouchableOpacity
              style={styles.cardSkipBtn}
              onPress={(e) => {
                e.stopPropagation();
                const convId = (conv._id || conv.id)?.toString();
                if (convId) {
                  socketService.emit('anonymous:skip', { conversationId: convId });
                  removeConversation(convId);
                }
              }}
            >
              <Ionicons name="play-skip-forward" size={12} color="#FFFFFF" style={{ marginRight: 3 }} />
              <Text style={styles.cardSkipText}>Skip</Text>
            </TouchableOpacity>

            {isUnreadIncoming && (
              <View style={styles.ghostUnreadPill}>
                <Text style={styles.ghostUnreadText}>
                  {unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : '•'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />

      {/* 1. Header Section */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <MaterialCommunityIcons name="ghost" size={22} color="#A855F7" style={{ marginRight: 6 }} />
            <Text style={styles.screenTitle}>Ghost Whispers</Text>
          </View>

          {/* Random Soul Match Button */}
          <TouchableOpacity
            style={styles.randomMatchBtn}
            onPress={() => router.push('/anonymous-chat')}
          >
            <Ionicons name="sparkles" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.randomMatchText}>Random</Text>
          </TouchableOpacity>
        </View>

        {/* 2. Search Input */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search ghost whispers..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* 3. Ghost Conversation List */}
      <FlashList
        data={filteredConversations}
        renderItem={renderItem}
        keyExtractor={(item: any) => (item._id || item.id)?.toString() || Math.random().toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#A855F7']}
            tintColor="#A855F7"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyGhostGlow}>
              <MaterialCommunityIcons name="ghost" size={64} color="#A855F7" />
            </View>
            <Text style={styles.emptyTitle}>No Ghost Whispers</Text>
            <Text style={styles.emptySubtitle}>
              Tap "Random" to pair with a wandering ghost soul anonymously.
            </Text>
            <TouchableOpacity
              style={styles.emptyActionBtn}
              onPress={() => router.push('/anonymous-chat')}
            >
              <Text style={styles.emptyActionText}>Find Random Soul 🔮</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ------------------------------------------------------------
// STYLESHEET
// ------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    padding: 4,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  randomMatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#A855F7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  randomMatchText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardPressed: {
    opacity: 0.8,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#334155',
  },
  ghostBadgeIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#A855F7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1E293B',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ghostNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
    marginRight: 8,
  },
  unreadTextBold: {
    fontWeight: '900',
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  cardSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewText: {
    fontSize: 13.5,
    color: '#94A3B8',
    flex: 1,
    marginRight: 8,
  },
  unreadPreviewBold: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  cardSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F43F5E',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginLeft: 6,
  },
  cardSkipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  ghostUnreadPill: {
    backgroundColor: '#A855F7',
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostUnreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyGhostGlow: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyActionBtn: {
    backgroundColor: '#A855F7',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
