import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, SafeAreaView, RefreshControl, Platform,
  TextInput, StatusBar, Alert, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { socketService } from '@/src/lib/socket';
import { useAuthStore } from '@/src/store/authStore';
import { verticalScale, moderateScale, scale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';

export default function MessagesScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [conversations, setConversations] = useState<any[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [myActiveStories, setMyActiveStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isAnonymous = currentUser?.isAnonymousMode;

  const formatTime = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffInSeconds < 0) return 'just now'; 
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const fetchData = async () => {
    try {
      const [convRes, reqRes, storyRes] = await Promise.all([
        apiClient.get('/chat/conversations'),
        apiClient.get('/users/message-requests').catch(() => ({ data: { success: true, data: [] } })),
        apiClient.get('/stories', { headers: { 'Cache-Control': 'no-cache' } }).catch(() => ({ data: { success: true, data: [] } }))
      ]);

      const convs = convRes.data || [];
      setConversations(convs);
      setRequests(reqRes.data?.data || []);

      // 🚀 Join all conversation rooms to receive typing events in real-time
      convs.forEach((conv: any) => {
        if (conv._id) socketService.joinRoom(conv._id);
      });

      const storyData = storyRes.data?.data || [];
      const groupedObj: any = {};
      storyData.forEach((s: any) => {
        if (!groupedObj[s.user_id]) {
          groupedObj[s.user_id] = { user_id: s.user_id, user: { username: s.username, avatar_url: s.avatar_url }, stories: [] };
        }
        groupedObj[s.user_id].stories.push(s);
      });

      const allGroups = Object.values(groupedObj);
      const others = allGroups.filter((g: any) => g.user_id !== currentUser?.id);
      const mine = allGroups.find((g: any) => g.user_id === currentUser?.id) as any;

      setStories(others);
      setMyActiveStories(mine ? mine.stories : []);
    } catch (error) {
      console.error('Error fetching messages data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, [])
  );

  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const socket = socketService.socket;
    if (!socket || !currentUser?.id) return;

    // 🚀 Function to join all conversation rooms
    const joinAllRooms = () => {
      conversations.forEach((conv: any) => {
        if (conv._id) socketService.joinRoom(conv._id);
      });
    };

    // Join rooms immediately if conversations are already loaded
    if (conversations.length > 0) joinAllRooms();

    const handleNewMessage = (message: any) => {
      fetchData();
    };

    const handleUserPresenceChange = ({ userId, lastSeen }: { userId: string, lastSeen?: string }) => {
      setConversations(prev => prev.map(conv => {
        const hasUser = conv.participants.some((p: any) => (p.user?._id || p.user || '').toString() === userId);
        if (hasUser) {
          return {
            ...conv,
            participants: conv.participants.map((p: any) => {
              if ((p.user?._id || p.user || '').toString() === userId) {
                return { ...p, user: { ...p.user, is_online: !lastSeen } };
              }
              return p;
            })
          };
        }
        return conv;
      }));
    };

    const handleConversationUpdate = (data: any) => {
      const { conversationId, unread_count, last_message, updated_at } = data;
      setConversations(prev => prev.map(conv => {
        if (conv._id === conversationId) {
          const updatedConv = { ...conv };
          if (unread_count !== undefined) {
            updatedConv.unread_count = unread_count;
            updatedConv.unread_counts = { ...conv.unread_counts, [currentUser.id]: unread_count };
          }
          if (last_message !== undefined) {
            updatedConv.last_message = last_message;
          }
          if (updated_at !== undefined) {
            updatedConv.updated_at = updated_at;
          }
          return updatedConv;
        }
        return conv;
      }));
    };

    const handleMessageStatusUpdate = ({ chatId, messageIds, status }: any) => {
      setConversations(prev => prev.map(conv => {
        if (conv._id === chatId && conv.last_message && messageIds.includes(conv.last_message._id || conv.last_message)) {
          return {
            ...conv,
            last_message: { ...conv.last_message, status, updated_at: new Date().toISOString() }
          };
        }
        return conv;
      }));
    };

    const handleTyping = ({ chatId, userId, isTyping }: any) => {
      if (chatId) {
        setTypingUsers(prev => ({ ...prev, [chatId]: isTyping }));
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('conversation:updated', handleConversationUpdate);
    socket.on('message:status_updated', handleMessageStatusUpdate);
    socket.on('user:online', ({ userId }) => handleUserPresenceChange({ userId }));
    socket.on('user:offline', ({ userId, lastSeen }) => handleUserPresenceChange({ userId, lastSeen }));
    socket.on('chat:typing', handleTyping);
    socket.on('connect', joinAllRooms); // Re-join rooms on reconnection

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('conversation:updated', handleConversationUpdate);
      socket.off('message:status_updated', handleMessageStatusUpdate);
      socket.off('user:online');
      socket.off('user:offline');
      socket.off('chat:typing', handleTyping);
      socket.off('connect', joinAllRooms);
    };
  }, [socketService.socket, currentUser?.id, conversations.length]);

  useEffect(() => {
    let filtered = conversations.filter(conv => {
      const otherParticipant = conv.participants.find((p: any) => (p.user?._id || p.user || '').toString() !== currentUser?.id)?.user;
      return conv.last_message && otherParticipant;
    });

    if (isAnonymous) {
      filtered = filtered.filter(conv => conv.is_anonymous === true);
    } else {
      filtered = filtered.filter(conv => conv.is_anonymous !== true);
    }

    if (!searchQuery.trim()) {
      console.log(`--- [Messages Inbox] FILTERED (${isAnonymous ? 'GHOST' : 'REALITY'}) ---`, JSON.stringify({
        visibleChats: filtered.length,
        sample: filtered[0] ? {
          ...filtered[0],
          participants: filtered[0].participants.map((p: any) => ({
            ...p,
            user: p.user ? {
              ...p.user,
              avatar_url: p.user.avatar_url && p.user.avatar_url.startsWith('data:image') ? '[Base64 Avatar]' : p.user.avatar_url
            } : p.user
          }))
        } : null
      }, null, 2));
      setFilteredConversations(filtered);
    } else {
      const searchFiltered = filtered.filter(conv => {
        const otherParticipant = conv.participants.find((p: any) => (p.user?._id || p.user || '').toString() !== currentUser?.id)?.user;
        const username = (otherParticipant?.username || '').toLowerCase();
        const fullName = (otherParticipant?.full_name || '').toLowerCase();
        const query = searchQuery.toLowerCase();
        return username.includes(query) || fullName.includes(query);
      });
      setFilteredConversations(searchFiltered);
    }
  }, [searchQuery, conversations, currentUser, isAnonymous]);

  const renderStoryBar = () => (
    <View style={styles.storyBar}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ isAdd: true }, ...stories]}
        keyExtractor={(item: any, index) => item.isAdd ? 'add' : item.user_id || index.toString()}
        contentContainerStyle={styles.storyList}
        renderItem={({ item }) => {
          if (item.isAdd) {
            const hasStories = myActiveStories.length > 0;
            const allViewed = hasStories && myActiveStories.every((s: any) => s.is_viewed === true);

            return (
              <View style={styles.storyItem}>
                <View style={[
                  styles.addStoryBorder,
                  hasStories && (allViewed ? styles.viewedStoryBorder : styles.activeStoryBorder)
                ]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => hasStories ? router.push(`/stories/${currentUser?.id}`) : router.push('/create-story')}
                    style={styles.storyAvatarWrap}
                  >
                    <Image source={{ uri: resolveAvatarUrl(currentUser?.avatar_url || currentUser?.avatar, currentUser?.username) }} style={styles.storyAvatarWrap} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.addStoryIcon}
                    onPress={() => router.push('/create-story')}
                  >
                    <Ionicons name="add" size={16} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.storyUsername} numberOfLines={1}>Your Story</Text>
              </View>
            );
          }

          const allViewed = item.stories.every((s: any) => s.is_viewed === true);

          return (
            <TouchableOpacity style={styles.storyItem} onPress={() => router.push(`/stories/${item.user_id}`)}>
              <View style={[styles.activeStoryBorder, allViewed && styles.viewedStoryBorder]}>
                <Image source={{ uri: resolveAvatarUrl(item.user.avatar_url, item.user.username) }} style={styles.storyAvatarWrap} />
              </View>
              <Text style={styles.storyUsername} numberOfLines={1}>{item.user.username}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, isAnonymous && { backgroundColor: COLORS.black }]}>
    <StatusBar barStyle={isAnonymous ? "light-content" : "dark-content"} />

    {/* Modern Header */}
    <View style={[styles.header, isAnonymous && { backgroundColor: COLORS.black, borderBottomColor: '#1A1A1A' }]}>
      <View style={styles.headerTop}>
        <Text style={[styles.headerTitle, isAnonymous && { color: '#FFF' }]}>
          {isAnonymous ? 'Ghost Chats' : 'Messages'}
        </Text>
        <TouchableOpacity style={[styles.composeBtn, isAnonymous && { backgroundColor: '#1A1A1A' }]} onPress={() => router.push('/explore')}>
          <Ionicons name="create-outline" size={24} color={isAnonymous ? '#FFF' : COLORS.secondary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar (Reality Only) */}
      {!isAnonymous && (
        <View style={[styles.searchContainer, isAnonymous && { backgroundColor: '#1A1A1A' }]}>
          <Ionicons name="search-outline" size={20} color={isAnonymous ? '#888' : COLORS.subtitle} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, isAnonymous && { color: '#FFF' }]}
            placeholder="Search chats..."
            placeholderTextColor={isAnonymous ? '#444' : COLORS.subtitle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={isAnonymous ? '#888' : COLORS.subtitle} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>

    {loading ? (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={isAnonymous ? '#FFF' : COLORS.secondary} />
      </View>
    ) : (
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => {
          const currentUserId = (currentUser?.id || currentUser?._id || '').toString();
          
          const otherParticipantData = item.participants.find((p: any) => {
            const pId = (p.user?._id || p.user || '').toString();
            return pId && pId !== currentUserId;
          });
          
          const otherParticipant = otherParticipantData?.user;
          const lastMessage = item.last_message;
          const unreadCount = item.unread_counts?.[currentUserId] || item.unread_count || 0;
          
          const senderId = (lastMessage?.sender_id?._id || lastMessage?.sender_id || '').toString();
          const isMe = senderId === currentUserId;
          const otherParticipantId = (otherParticipant?._id || otherParticipant || '').toString();

          const renderLastMessageContent = () => {
            if (typingUsers[item._id]) {
               return <Text style={{ color: COLORS.secondary, fontWeight: '600' }}>typing...</Text>;
            }
            if (!lastMessage || lastMessage.is_deleted) return '';
            
            let content = '';
            switch (lastMessage.message_type) {
              case 'image': content = '📷 Image'; break;
              case 'video': content = '🎥 Video'; break;
              case 'audio': content = '🎵 Voice message'; break;
              case 'file': content = '📁 File'; break;
              case 'sticker': content = lastMessage.content || '🎨 Sticker'; break;
              case 'story_reply': content = '📲 Replied to story'; break;
              default: content = lastMessage.content || '';
            }

            const timeStr = formatTime((lastMessage?.status === 'read' ? lastMessage?.updated_at : lastMessage?.created_at) || item.updated_at);
            
            if (isMe) {
              const status = lastMessage?.status === 'read' ? 'Seen' : 'Sent';
              return (
                <React.Fragment>
                  <Text style={unreadCount > 0 ? { fontWeight: '600', color: COLORS.text } : {}}>{content}</Text>
                  <Text style={{ color: '#8E8E93', fontWeight: '400', fontSize: 12 }}> · {status} {timeStr}</Text>
                </React.Fragment>
              );
            }
            
            return (
              <React.Fragment>
                <Text style={unreadCount > 0 ? { fontWeight: '700', color: isAnonymous ? '#FFF' : '#000' } : {}}>
                  {content}
                </Text>
                <Text style={{ color: '#8E8E93', fontWeight: '400', fontSize: 12 }}> · {timeStr}</Text>
              </React.Fragment>
            );
          };

          const unresolvedAvatar = isAnonymous ? (otherParticipant?.anonymousPersona?.avatar || '') : (otherParticipant?.avatar_url || otherParticipant?.avatar);
          const unresolvedName = isAnonymous ? (otherParticipant?.anonymousPersona?.username || 'ghost') : otherParticipant?.username;

          return (
            <TouchableOpacity
              style={styles.chatItem}
              onPress={() => router.push({
                pathname: `/chat/${item._id}`,
                params: {
                  recipientId: otherParticipant?._id,
                  username: isAnonymous ? (otherParticipant?.anonymousPersona?.name || 'Unknown Spirit') : otherParticipant?.username,
                  profileImage: unresolvedAvatar,
                  isAnonymousChat: isAnonymous ? 'true' : 'false'
                }
              } as any)}
              activeOpacity={0.7}
            >
              <View style={styles.avatarContainer}>
                <Image
                  source={{ uri: resolveAvatarUrl(unresolvedAvatar, unresolvedName) }}
                  style={[styles.avatar, isAnonymous && { borderColor: '#1A1A1A' }]}
                />
                {(otherParticipant?.is_online || isAnonymous) && (
                  <View style={[styles.statusDot, { backgroundColor: isAnonymous ? '#FFF' : '#4CAF50' }]} />
                )}
              </View>

              <View style={[styles.chatInfo, isAnonymous && { borderBottomColor: '#1A1A1A' }]}>
                <View style={styles.chatHeader}>
                  <Text style={[styles.username, isAnonymous && { color: '#FFF' }, unreadCount === 0 && { color: COLORS.subtitle, fontWeight: '500', opacity: 0.8 }]} numberOfLines={1}>
                    {isAnonymous ? (otherParticipant?.anonymousPersona?.name || 'Spirit') : (otherParticipant?.full_name || otherParticipant?.username || 'AnuFy User')}
                  </Text>
                  <Text style={[styles.time, isAnonymous && { color: '#888' }, unreadCount > 0 && { color: isAnonymous ? '#FFF' : COLORS.secondary, fontWeight: '700' }]}>
                    {/* Time is now shown in message preview below */}
                  </Text>
                </View>

                <View style={styles.chatBottom}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text
                      style={[
                        styles.lastMessage,
                        isAnonymous && { color: '#888' },
                        unreadCount > 0 ? { color: isAnonymous ? '#FFF' : COLORS.text, fontWeight: '700' } : { color: '#999', fontWeight: '400', opacity: 0.7 }
                      ]}
                      numberOfLines={1}
                    >
                      {renderLastMessageContent()}
                    </Text>
                  </View>
                  {unreadCount > 0 && (
                    <View style={[styles.unreadBadge, isAnonymous && { backgroundColor: '#FFF' }]}>
                      <Text style={[styles.unreadText, isAnonymous && { color: '#000' }]}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={isAnonymous ? '#FFF' : COLORS.secondary}
            colors={[isAnonymous ? '#FFF' : COLORS.secondary]}
          />
        }
        ListHeaderComponent={
          <View>
            {!isAnonymous && renderStoryBar()}

            {!isAnonymous && requests.length > 0 && (
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
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, isAnonymous && { backgroundColor: '#1A1A1A' }]}>
              <Ionicons name="chatbubbles-outline" size={40} color={isAnonymous ? '#444' : COLORS.subtitle} />
            </View>
            <Text style={[styles.emptyTitle, isAnonymous && { color: '#FFF' }]}>
              {searchQuery ? 'No results found' : 'No chats yet'}
            </Text>
            <Text style={[styles.emptySubtitle, isAnonymous && { color: '#888' }]}>
              {searchQuery ? 'Try searching for something else' : isAnonymous ? 'Step into the shadows...' : 'Start a conversation!'}
            </Text>
          </View>
        }
      />
    )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    paddingHorizontal: moderateScale(16), paddingTop: Platform.OS === 'ios' ? moderateScale(20) : moderateScale(40),
    paddingBottom: moderateScale(12), backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border + '10'
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(10) },
  backBtn: { marginRight: moderateScale(10) },
  headerTitle: { fontSize: moderateFont(22), fontWeight: '800' },
  emptyText: { color: COLORS.subtitle, marginTop: 10, fontSize: 14 },
  composeBtn: { padding: moderateScale(8), backgroundColor: '#F1F3F5', borderRadius: moderateScale(12) },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F3F5',
    borderRadius: moderateScale(10), paddingHorizontal: moderateScale(12),
    height: moderateScale(40), marginTop: moderateScale(5)
  },
  searchIcon: { marginRight: moderateScale(8) },
  searchInput: { flex: 1, fontSize: moderateFont(15), color: COLORS.text, height: '100%' },
  requestsHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(15),
    paddingVertical: moderateScale(12), backgroundColor: '#FFF9FB', marginHorizontal: moderateScale(16),
    borderRadius: moderateScale(15), marginBottom: moderateScale(15), marginTop: moderateScale(10),
    borderWidth: 1, borderColor: COLORS.secondary + '20'
  },
  requestIconBox: {
    width: moderateScale(48), height: moderateScale(48), borderRadius: moderateScale(24),
    backgroundColor: COLORS.secondary + '15', justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(15)
  },
  requestTitle: { fontSize: moderateFont(16), fontWeight: '700', color: COLORS.text },
  requestSub: { fontSize: moderateFont(13), color: COLORS.secondary, marginTop: moderateScale(2), fontWeight: '600' },
  listContent: { paddingVertical: moderateScale(5), paddingBottom: 100 },
  chatItem: { flexDirection: 'row', paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(12), alignItems: 'center' },
  avatarContainer: { position: 'relative', marginRight: moderateScale(15) },
  avatar: { width: moderateScale(60), height: moderateScale(60), borderRadius: moderateScale(30), borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  statusDot: { position: 'absolute', bottom: 2, right: 2, width: moderateScale(14), height: moderateScale(14), borderRadius: moderateScale(7), borderWidth: 2, borderColor: COLORS.white, zIndex: 10 },
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
  chatInfo: { flex: 1, justifyContent: 'center', paddingBottom: moderateScale(12), borderBottomWidth: 1, borderBottomColor: COLORS.border + '15' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: moderateScale(4) },
  chatBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  username: { fontSize: moderateFont(16), fontWeight: '700', color: COLORS.text, maxWidth: '70%' },
  time: { fontSize: moderateFont(12), color: COLORS.subtitle },
  unreadTime: { color: COLORS.secondary, fontWeight: '700' },
  lastMessage: { fontSize: moderateFont(14), color: COLORS.subtitle, flex: 1, marginRight: moderateScale(10) },
  unreadLastMessage: { color: COLORS.text, fontWeight: '600' },
  unreadBadge: { backgroundColor: COLORS.secondary, borderRadius: moderateScale(11), minWidth: moderateScale(22), height: moderateScale(22), justifyContent: 'center', alignItems: 'center', paddingHorizontal: moderateScale(6) },
  unreadText: { color: COLORS.white, fontSize: moderateFont(11), fontWeight: '900' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: moderateScale(100) },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: moderateScale(100), paddingHorizontal: moderateScale(40) },
  storyBar: { paddingVertical: verticalScale(12), borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.white },
  storyList: { paddingHorizontal: scale(16), gap: scale(12) },
  storyItem: { alignItems: 'center', width: scale(72) },
  storyAvatarWrap: { width: '100%', height: '100%', borderRadius: scale(35) },
  addStoryBorder: { position: 'relative', width: scale(70), height: scale(70), borderRadius: scale(35), borderWidth: 2, borderColor: COLORS.border, padding: scale(3), justifyContent: 'center', alignItems: 'center' },
  activeStoryBorder: { width: scale(70), height: scale(70), borderRadius: scale(35), borderWidth: 2.5, borderColor: COLORS.primary, padding: scale(3), justifyContent: 'center', alignItems: 'center' },
  viewedStoryBorder: { width: scale(70), height: scale(70), borderRadius: scale(35), borderWidth: 2, borderColor: '#404040', padding: scale(3), justifyContent: 'center', alignItems: 'center' },
  addStoryIcon: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.secondary, width: scale(20), height: scale(20), borderRadius: scale(10), justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.white, zIndex: 1 },
  storyUsername: { fontSize: moderateFont(11), fontWeight: '600', color: COLORS.text, marginTop: verticalScale(5), textAlign: 'center' },
  emptyIconCircle: { width: moderateScale(80), height: moderateScale(80), borderRadius: moderateScale(40), backgroundColor: '#F1F3F5', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(20) },
  emptyTitle: { fontSize: moderateFont(18), fontWeight: '700', color: COLORS.text, marginBottom: moderateScale(8), textAlign: 'center' },
  emptySubtitle: { fontSize: moderateFont(14), color: COLORS.subtitle, textAlign: 'center', marginBottom: moderateScale(25), lineHeight: moderateScale(20) },
  exploreBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: moderateScale(25), paddingVertical: moderateScale(12), borderRadius: moderateScale(25), elevation: 2, shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  exploreBtnText: { color: COLORS.white, fontWeight: '700', fontSize: moderateFont(15) }
});
