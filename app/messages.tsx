import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, SafeAreaView, RefreshControl, Platform,
  TextInput, StatusBar
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { socketService } from '@/src/lib/socket';
import { useAuthStore } from '@/src/store/authStore';
import { verticalScale, moderateScale, scale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';

import { formatDistanceToNow } from 'date-fns';
import { enIN } from 'date-fns/locale';

export default function MessagesScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [conversations, setConversations] = useState<any[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  const formatRelativeTime = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    const distance = formatDistanceToNow(d, { addSuffix: true });
    
    // Customize for "just now"
    if (distance.includes('less than a minute')) return 'just now';
    
    // Remove "about" from "about 1 hour ago" etc for cleaner look
    return distance.replace('about ', '');
  };

  const formatTime = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();

    // If today, show time
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // If yesterday, show 'Yesterday'
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    // Otherwise show date
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const fetchData = async () => {
    try {
      const [convRes, reqRes] = await Promise.all([
        apiClient.get('/chat/conversations'),
        apiClient.get('/users/message-requests').catch(() => ({ data: { success: true, data: [] } }))
      ]);

      const convs = convRes.data || [];
      setConversations(convs);
      setFilteredConversations(convs);
      setRequests(reqRes.data?.data || []);

      // 🚀 Join all conversation rooms to receive typing events in real-time
      convs.forEach((conv: any) => {
        if (conv._id) socketService.joinRoom(conv._id);
      });
    } catch (error) {
      console.error('Error fetching messages data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ✅ Refresh data when user returns to this screen (clears unread counts)
  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, [])
  );

  useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return;

    // 🚀 Function to join all conversation rooms
    const joinAllRooms = () => {
      conversations.forEach((conv: any) => {
        if (conv._id) socketService.joinRoom(conv._id);
      });
    };

    // Join rooms immediately if conversations are already loaded
    if (conversations.length > 0) joinAllRooms();

    // Listen for new messages to update the list in real-time
    const handleNewMessage = (message: any) => {
      fetchData();
    };

    const handleTyping = ({ chatId, isTyping }: any) => {
      if (chatId) {
        setTypingUsers(prev => ({ ...prev, [chatId]: isTyping }));
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message_deleted', fetchData);
    socket.on('message:status_updated', fetchData);
    socket.on('chat:typing', handleTyping);
    socket.on('connect', joinAllRooms); // Re-join rooms on reconnection

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message_deleted', fetchData);
      socket.off('message:status_updated', fetchData);
      socket.off('chat:typing', handleTyping);
      socket.off('connect', joinAllRooms);
    };
  }, [socketService.socket, conversations.length]); // Re-run if socket instance or conversations list changes

  useEffect(() => {
    if (!searchQuery.trim()) {
      // Show all conversations, even if they don't have a last_message yet
      setFilteredConversations(conversations);
    } else {
      const filtered = conversations.filter(conv => {
        const otherParticipantEntry = conv.participants.find((p: any) => {
          const pUserId = (p.user?._id || p.user || '').toString();
          return pUserId && pUserId !== (currentUser?.id || currentUser?._id || '').toString();
        });
        const otherParticipant = otherParticipantEntry?.user || otherParticipantEntry;
        const username = (otherParticipant?.username || '').toLowerCase();
        const fullName = (otherParticipant?.full_name || '').toLowerCase();
        const query = searchQuery.toLowerCase();
        return username.includes(query) || fullName.includes(query);
      });
      setFilteredConversations(filtered);
    }
  }, [searchQuery, conversations, currentUser]);

  const renderConversation = ({ item }: { item: any }) => {
    const currentUserId = (currentUser?.id || currentUser?._id || '').toString();
    const otherParticipantEntry = item.participants.find((p: any) => {
      const pUserId = (p.user?._id || p.user || '').toString();
      return pUserId && pUserId !== currentUserId;
    });
    
    const otherParticipant = otherParticipantEntry?.user || otherParticipantEntry;
    const lastMessage = item.last_message;
    const senderId = (lastMessage?.sender_id?._id || lastMessage?.sender_id || '').toString();
    const isMe = senderId === currentUserId;

    const username = typeof otherParticipant === 'object' ? (otherParticipant?.full_name || otherParticipant?.username) : 'AnuFy User';
    const avatar = typeof otherParticipant === 'object' ? (otherParticipant?.avatar_url || otherParticipant?.avatar) : undefined;
    const otherParticipantId = (otherParticipant?._id || otherParticipant || '').toString();

    // 🚀 Check if this user is currently typing in this specific chat
    const isTyping = typingUsers[item._id];

    const renderLastMessageContent = () => {
      // 🚀 Show typing status if user is typing
      if (isTyping) {
        return <Text style={{ color: '#8E8E93', fontWeight: '500' }}>typing...</Text>;
      }

      // 🚀 Unread count logic: If more than 1 new message, show count instead of content
      if (item.unread_count > 1) {
        return `${item.unread_count} new messages`;
      }

      if (!lastMessage) {
        return <Text style={{ color: '#8E8E93', fontStyle: 'italic' }}>No messages yet</Text>;
      }
      
      // Handle deleted messages properly
      if (lastMessage.is_deleted) {
        return <Text style={{ color: '#8E8E93', fontStyle: 'italic' }}>Message deleted</Text>;
      }
      
      let content = '';
      switch (lastMessage.message_type) {
        case 'image': content = '📷 Image'; break;
        case 'video': content = '🎥 Video'; break;
        case 'audio': content = '🎵 Voice message'; break;
        case 'file': content = '📁 File'; break;
        case 'sticker': content = lastMessage.content || '🎨 Sticker'; break;
        default: content = lastMessage.content || '';
      }

      if (isMe) {
        const status = lastMessage?.status === 'read' ? 'Seen' : 'Sent';
        const msgTimeStr = formatRelativeTime((lastMessage?.status === 'read' ? lastMessage?.updated_at : lastMessage?.created_at) || item.updated_at);
        
        // Remove dot before just now
        const formattedTime = msgTimeStr === 'just now' ? 'just now' : msgTimeStr;
        
        return (
          <Text>
            {content} · <Text style={{ color: '#8E8E93', fontWeight: '500' }}>{status} {formattedTime}</Text>
          </Text>
        );
      }
      return content;
    };

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => router.push({
          pathname: `/chat/${item._id}`,
          params: {
            recipientId: (otherParticipant?._id || otherParticipant || '').toString(),
            username: username,
            profileImage: avatar
          }
        } as any)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: resolveAvatarUrl(avatar, username) }}
            style={styles.avatar}
          />
          {/* Status Indicator (can be dynamic if backend supports it) */}
          <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.username} numberOfLines={1}>
              {username || 'AnuFy User'}
            </Text>
            <Text style={[styles.time, item.unread_count > 0 && styles.unreadTime]}>
              {!(lastMessage?.is_deleted || lastMessage?.content?.toLowerCase()?.includes('message deleted')) && formatTime(lastMessage?.created_at || item.updated_at)}
            </Text>
          </View>

          <View style={styles.chatBottom}>
            <Text style={[styles.lastMessage, item.unread_count > 0 && styles.unreadLastMessage]} numberOfLines={1}>
              {renderLastMessageContent()}
            </Text>
            {item.unread_count > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Modern Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Messages</Text>
          <TouchableOpacity style={styles.composeBtn} onPress={() => router.push('/explore')}>
            <Ionicons name="create-outline" size={24} color={COLORS.secondary} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={COLORS.subtitle} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor={COLORS.subtitle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item._id}
          renderItem={renderConversation}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData(); }}
              colors={[COLORS.secondary]}
            />
          }
          ListHeaderComponent={
            requests.length > 0 ? (
              <TouchableOpacity
                style={styles.requestsHeader}
                onPress={() => router.push('/message-requests')}
                activeOpacity={0.8}
              >
                <View style={styles.requestIconBox}>
                  <Ionicons name="mail-unread-outline" size={24} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.requestTitle}>Message Requests</Text>
                  <Text style={styles.requestSub}>
                    {requests.length} new {requests.length === 1 ? 'request' : 'requests'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="chatbubbles-outline" size={40} color={COLORS.subtitle} />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No results found' : 'No messages yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? 'Try searching for something else' : 'Connect with others and start chatting!'}
              </Text>
              {!searchQuery && (
                <TouchableOpacity style={styles.exploreBtn} onPress={() => router.push('/explore')}>
                  <Text style={styles.exploreBtnText}>Find people to chat with</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white
  },
  header: {
    paddingHorizontal: moderateScale(16),
    paddingTop: Platform.OS === 'ios' ? moderateScale(20) : moderateScale(40), // Header thoda niche kiya
    paddingBottom: moderateScale(12),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: moderateScale(10),
  },
  backBtn: {
    marginRight: moderateScale(10)
  },
  headerTitle: {
    fontSize: moderateFont(22),
    fontWeight: '800',
    color: COLORS.text,
    flex: 1
  },
  composeBtn: {
    padding: moderateScale(8),
    backgroundColor: '#F1F3F5',
    borderRadius: moderateScale(12)
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F5',
    borderRadius: moderateScale(10),
    paddingHorizontal: moderateScale(12),
    height: moderateScale(40),
    marginTop: moderateScale(5),
  },
  searchIcon: {
    marginRight: moderateScale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateFont(15),
    color: COLORS.text,
    height: '100%',
  },
  requestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(15),
    paddingVertical: moderateScale(12),
    backgroundColor: '#FFF9FB', // Very light tint of secondary
    marginHorizontal: moderateScale(16),
    borderRadius: moderateScale(15),
    marginBottom: moderateScale(15),
    marginTop: moderateScale(10),
    borderWidth: 1,
    borderColor: COLORS.secondary + '20'
  },
  requestIconBox: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    backgroundColor: COLORS.secondary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(15)
  },
  requestTitle: {
    fontSize: moderateFont(16),
    fontWeight: '700',
    color: COLORS.text
  },
  requestSub: {
    fontSize: moderateFont(13),
    color: COLORS.secondary,
    marginTop: moderateScale(2),
    fontWeight: '600'
  },
  listContent: {
    paddingVertical: moderateScale(5)
  },
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(12),
    alignItems: 'center'
  },
  avatarContainer: {
    position: 'relative',
    marginRight: moderateScale(15),
  },
  avatar: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: moderateScale(30),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: moderateScale(14),
    height: moderateScale(14),
    borderRadius: moderateScale(7),
    borderWidth: 2,
    borderColor: COLORS.white,
    zIndex: 10,
  },
  typingIndicatorDots: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#FFF',
  },
  chatInfo: {
    flex: 1,
    justifyContent: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingBottom: moderateScale(12),
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: moderateScale(4)
  },
  chatBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  username: {
    fontSize: moderateFont(16),
    fontWeight: '700',
    color: COLORS.text,
    maxWidth: '70%',
  },
  time: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle
  },
  unreadTime: {
    color: COLORS.secondary,
    fontWeight: '700',
  },
  lastMessage: {
    fontSize: moderateFont(14),
    color: COLORS.subtitle,
    flex: 1,
    marginRight: moderateScale(10)
  },
  unreadLastMessage: {
    color: COLORS.text,
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: COLORS.secondary,
    borderRadius: moderateScale(11),
    minWidth: moderateScale(22),
    height: moderateScale(22),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: moderateScale(6)
  },
  unreadText: {
    color: COLORS.white,
    fontSize: moderateFont(11),
    fontWeight: '900'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: moderateScale(100)
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: moderateScale(100),
    paddingHorizontal: moderateScale(40),
  },
  emptyIconCircle: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    backgroundColor: '#F1F3F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: moderateScale(20),
  },
  emptyTitle: {
    fontSize: moderateFont(18),
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: moderateScale(8),
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: moderateFont(14),
    color: COLORS.subtitle,
    textAlign: 'center',
    marginBottom: moderateScale(25),
    lineHeight: moderateScale(20),
  },
  exploreBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: moderateScale(25),
    paddingVertical: moderateScale(12),
    borderRadius: moderateScale(25),
    elevation: 2,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  exploreBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: moderateFont(15),
  }
});

