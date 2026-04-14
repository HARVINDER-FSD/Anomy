import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, SafeAreaView, RefreshControl, Platform, Alert, Animated, PanResponder, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { socketService } from '@/src/lib/socket';
import { verticalScale, moderateScale, scale } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';

export default function NotificationsScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [favoriteNotifications, setFavoriteNotifications] = useState<Set<string>>(new Set());
  const [resharedIds, setResharedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleFavoriteNotification = async (notificationId: string, index: number) => {
    try {
      if (!notificationId) return;
      
      const isFavorite = favoriteNotifications.has(notificationId);
      
      // Optimistic update
      if (isFavorite) {
        setFavoriteNotifications(prev => {
          const newSet = new Set(prev);
          newSet.delete(notificationId);
          return newSet;
        });
      } else {
        setFavoriteNotifications(prev => new Set([...prev, notificationId]));
      }
      
      // Update backend
      await apiClient.put(`/notifications/${notificationId}/favorite`, { 
        isFavorite: !isFavorite 
      }).catch(err => {
        console.error("Error updating favorite:", err);
        // Revert on error
        if (isFavorite) {
          setFavoriteNotifications(prev => new Set([...prev, notificationId]));
        } else {
          setFavoriteNotifications(prev => {
            const newSet = new Set(prev);
            newSet.delete(notificationId);
            return newSet;
          });
        }
      });
    } catch (error) {
      console.error("Error favoriting notification:", error);
    }
  };

  const formatTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const markAllRead = async () => {
    try {
      await apiClient.put('/notifications/read-all');
      fetchNotifications();
    } catch (error) {
       console.error("Error marking read:", error);
       Alert.alert("Error", "Could not mark notifications as read.");
    }
  };

  const fetchNotifications = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      
      const [notifsRes, requestsRes] = await Promise.all([
        apiClient.get('/notifications').catch(err => {
          console.error('[Notifications] API Error:', err?.response?.data || err.message);
          return { data: { success: true, data: [] } };
        }),
        // Only fetch follow requests if current user is private OR we want to show pending ones
        currentUser?.is_private ? 
          apiClient.get('/users/follow-requests').catch(err => {
            console.error('[FollowRequests] API Error:', err?.response?.data || err.message);
            return { data: { success: true, data: [] } };
          }) : 
          Promise.resolve({ data: { success: true, data: [] } })
      ]);

      const formattedNotifs = notifsRes.data?.data || [];
      
      // Follow requests already come with user data at root from UserService.getPendingFollowRequests
      const rawRequests = requestsRes.data?.data || [];
      const formattedRequests = Array.isArray(rawRequests) ? rawRequests.map((req: any) => {
        const userId = req._id || req.id;
        const userIdStr = userId?.toString() || '';
        
        return {
          ...req,
          id: userIdStr, // Ensure stable string ID
          _id: userIdStr,
          // Ensure actor structure matches what renderNotification expects
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

      // Combine and sort by date
      const allNotifications = [...formattedRequests, ...formattedNotifs];
      
      // De-duplicate: 
      // 1. By unique ID (if available)
      // 2. For follow requests, ensure only one request per actor is shown
      const seenIds = new Set();
      const seenFollowRequests = new Set();
      
      const deduplicated = allNotifications.filter(item => {
        const itemId = item.id || item._id;
        
        // If it's a follow request, de-duplicate by actor ID
        if (item.type === 'follow_request' || item.is_request) {
          const actorId = item.actor?.id || item.actor?._id;
          if (actorId) {
            if (seenFollowRequests.has(actorId.toString())) return false;
            seenFollowRequests.add(actorId.toString());
          }
        }
        
        // General de-duplication by ID
        if (itemId) {
          if (seenIds.has(itemId.toString())) return false;
          seenIds.add(itemId.toString());
        }
        
        return true;
      });

      // Grouping mentions and other repetitive notifications
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
            // Keep the most recent timestamp
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

      setNotifications(sorted);
      
      // Update unread count if returned
      if (notifsRes.data.unreadCount !== undefined) {
        // You could update a global store here if needed
      }
    } catch (error) {
      console.error('Error fetching activity:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAcceptRequest = async (followerId: string, index: number) => {
    if (!followerId) {
      console.error("[Notifications] Cannot accept: No followerId provided");
      return;
    }
    try {
      console.log(`[Notifications] Accepting request from ${followerId}`);
      const res = await apiClient.post(`/users/follow-requests/${followerId}/accept`);
      console.log(`[Notifications] Accept successful:`, res.data);
      
      const updated = [...notifications];
      // Convert request to a regular follow notification
      if (updated[index]) {
        updated[index].is_request = false;
        updated[index].type = 'follow_accept';
        updated[index].content = 'is now following you';
        // Note: isFollowing should stay whatever it was (false if not following back)
        // so that the "Follow back" button appears.
        setNotifications(updated);
      }
    } catch (error) {
      console.error("[Notifications] Error accepting request:", error);
      Alert.alert("Action Failed", "Could not accept follow request. Please try again.");
    }
  };

  const handleRejectRequest = async (followerId: string, index: number) => {
    if (!followerId) return;
    try {
      console.log(`[Notifications] Rejecting request from ${followerId}`);
      await apiClient.post(`/users/follow-requests/${followerId}/reject`);
      setNotifications(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      console.error("[Notifications] Error rejecting request:", error);
      Alert.alert("Action Failed", "Could not reject follow request.");
    }
  };

  useEffect(() => {
    fetchNotifications();

    socketService.socket?.on('notification:new', (notification: any) => {
      console.log('[Notifications] Real-time notification received:', notification);
      
      // 🚀 SKIP messages in the notification list (they should only show as banners)
      if (notification.type === 'message') return;

      setNotifications(prev => {
        const notificationId = notification.id || notification._id;
        
        // Check if we already have this notification by ID
        if (notificationId && prev.some(item => (item.id || item._id) === notificationId)) {
          return prev;
        }
        
        // If it's a follow request, check if we already have a request from this actor
        if (notification.type === 'follow_request' || notification.is_request) {
          const actorId = notification.actor?.id || notification.actor?._id;
          if (actorId && prev.some(item => 
            (item.type === 'follow_request' || item.is_request) && 
            (item.actor?.id || item.actor?._id) === actorId
          )) {
            return prev;
          }
        }
        
        return [notification, ...prev];
      });
    });

    return () => {
      socketService.socket?.off('notification:new');
    };
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': 
      case 'reel_like':
      case 'story_like':
      case 'comment_like': // 🚀 Handle new comment like type
        return { name: 'heart', color: COLORS.error };
      case 'comment': 
      case 'reel_comment':
      case 'reply':
      case 'story_reply':
        return { name: 'chatbubble', color: COLORS.secondary };
      case 'follow': 
      case 'follow_request': 
      case 'follow_accept': 
        return { name: 'person-add', color: '#3182CE' };
      case 'mention': return { name: 'at', color: COLORS.primary };
      case 'secret_crush_match': return { name: 'heart-half', color: '#E53E3E' };
      default: return { name: 'notifications', color: COLORS.subtitle };
    }
  };

  const handleFollow = async (actorId: string, index: number) => {
    if (!actorId || !actorId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error("[handleFollow] Invalid actorId:", actorId);
      return;
    }
    
    try {
      const res = await apiClient.post(`/users/${actorId}/follow`);
      const updatedNotifs = [...notifications];
      
      if (updatedNotifs[index]) {
        const isFollowing = res.data.isFollowing ?? res.data.is_following;
        const isPending = res.data.isPending ?? res.data.is_pending;
        
        updatedNotifs[index].isFollowing = isFollowing;
        updatedNotifs[index].is_following = isFollowing;
        updatedNotifs[index].isPending = isPending;
        updatedNotifs[index].is_pending = isPending;
        
        setNotifications(updatedNotifs);
      }
    } catch (error: any) {
      console.error("Error following from notification:", error?.response?.data || error.message);
      Alert.alert("Error", error?.response?.data?.message || "Failed to follow user");
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      if (!notificationId) return;
      await apiClient.put(`/notifications/${notificationId}/read`);
      // Update local state to show it's read (but DON'T remove it if you want it to stay)
      setNotifications(prev => prev.map(n => 
        (n.id || n._id) === notificationId ? { ...n, is_read: true } : n
      ));
    } catch (error) {
      console.error("Error marking read:", error);
    }
  };

  const handleDeleteNotification = async (notificationId: string, index: number) => {
    try {
      if (!notificationId) return;
      
      // Optimistic removal
      setNotifications(prev => prev.filter((_, i) => i !== index));
      
      // Delete from backend
      await apiClient.delete(`/notifications/${notificationId}`).catch(err => {
        console.error("Error deleting notification:", err);
        // Revert on error
        fetchNotifications();
      });
    } catch (error) {
      console.error("Error deleting notification:", error);
      fetchNotifications();
    }
  };

  const SwipeableNotificationItem = ({ item, index }: { item: any; index: number }) => {
    const swipeAnim = useRef(new Animated.Value(0)).current;
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 10,
        onPanResponderMove: (evt, gestureState) => {
          if (gestureState.dx < 0) {
            swipeAnim.setValue(Math.max(gestureState.dx, -100));
          }
        },
        onPanResponderRelease: (evt, gestureState) => {
          if (gestureState.dx < -50) {
            Animated.spring(swipeAnim, {
              toValue: -100,
              useNativeDriver: false,
            }).start();
          } else {
            Animated.spring(swipeAnim, {
              toValue: 0,
              useNativeDriver: false,
            }).start();
          }
        },
      })
    ).current;

    const icon = getIcon(item.type);
    const actor = item.actor || item.user || item.from_user || (item.username ? item : null);
    const isFollowType = item.type === 'follow' || item.type === 'follow_request' || item.type === 'follow_accept';
    const isFollowRequest = item.type === 'follow_request' || item.is_request === true;
    const actorId = actor?.id || actor?._id || (isFollowRequest ? (item.id || item._id) : null);
    const actorIdStr = actorId ? actorId.toString() : '';
    const actorUsername = actor?.username || 'Someone';
    const canFollowBack = isFollowType && !isFollowRequest && actor && actorIdStr && actorIdStr !== currentUser?.id?.toString();
    const actorAvatar = resolveAvatarUrl(actor?.avatar_url || actor?.avatar, actorUsername);
    const postThumbnail = item.post?.image || item.data?.postImage;
    const postId = item.post?.id || item.post?._id || item.data?.postId;
    const notifId = item.id || item._id;

    return (
      <View style={styles.swipeContainer}>
        {/* Hidden Action Buttons - Only visible when swiped */}
        <View style={styles.deleteAction}>
          <TouchableOpacity 
            style={styles.favoriteBtn}
            onPress={() => {
              handleFavoriteNotification(notifId, index);
              Animated.spring(swipeAnim, { toValue: 0, useNativeDriver: false }).start();
            }}
          >
            <Ionicons 
              name={favoriteNotifications.has(notifId) ? "star" : "star-outline"} 
              size={24} 
              color="#000" 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.deleteBtn}
            onPress={() => handleDeleteNotification(notifId, index)}
          >
            <Ionicons name="trash" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Main Content - Slides over the action buttons */}
        <Animated.View 
          style={[styles.notificationContent, { transform: [{ translateX: swipeAnim }] }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity 
            style={styles.notificationItem}
            onPress={() => {
              if (notifId && !isFollowRequest) handleMarkRead(notifId);
              if (item.type === 'mention') {
                router.push(`/stories/${actorIdStr}`);
              } else if (item.data?.canReshare) {
                router.push(`/create-story?refId=${item.data.targetId}`);
              } else if (postId) {
                router.push(`/post/${postId}`);
              } else if (actorUsername && actorUsername !== 'Someone') {
                router.push(`/user/${actorUsername}`);
              }
            }}
          >
            <Image source={{ uri: actorAvatar }} style={styles.avatar} />
            <View style={styles.content}>
              <Text style={styles.message}>
                <Text style={styles.bold}>{actorUsername.replace(/^@/, '')} </Text>
                {isFollowRequest ? 'requested to follow you' : (
                  item.type === 'mention' && item.count > 1 
                    ? `mentioned you in ${item.count} stories` 
                    : (item.content || item.message || 'interacted with you')
                )}
              </Text>
              <Text style={styles.time}>{item.timestamp || formatTime(item.created_at)}</Text>
            </View>
            
            {(item.data?.canReshare || item.targetIds?.length > 0) && (
              <TouchableOpacity 
                style={[styles.reshareBtn, resharedIds.has(notifId) && styles.addedBtn]} 
                disabled={resharedIds.has(notifId)}
                onPress={() => {
                  setResharedIds(prev => new Set([...prev, notifId]));
                  const targetId = item.targetIds?.[0] || item.data?.targetId;
                  router.push(`/create-story?refId=${targetId}`);
                }}
              >
                <Text style={[styles.reshareBtnText, resharedIds.has(notifId) && styles.addedBtnText]}>
                  {resharedIds.has(notifId) ? 'Added' : 'Add to story'}
                </Text>
              </TouchableOpacity>
            )}
            {isFollowRequest ? (
              <View style={styles.requestBtns}>
                <TouchableOpacity 
                  style={styles.acceptBtn} 
                  onPress={() => actorIdStr && handleAcceptRequest(actorIdStr, index)}
                >
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.rejectBtn} 
                  onPress={() => actorIdStr && handleRejectRequest(actorIdStr, index)}
                >
                  <Ionicons name="close" size={20} color={COLORS.subtitle} />
                </TouchableOpacity>
              </View>
            ) : canFollowBack && (
              <TouchableOpacity 
                style={[styles.followBtn, (item.isFollowing || item.is_following) && styles.followingBtn, (item.isPending || item.is_pending) && styles.requestedBtn]} 
                onPress={() => handleFollow(actorIdStr, index)}
                disabled={item.isPending || item.is_pending}
              >
                <Text style={[styles.followBtnText, (item.isFollowing || item.is_following) && styles.followingBtnText, (item.isPending || item.is_pending) && styles.requestedBtnText]}>
                  {item.isPending || item.is_pending ? 'Requested' : (item.isFollowing || item.is_following ? 'Following' : 'Follow back')}
                </Text>
              </TouchableOpacity>
            )}

            {(!isFollowType && !isFollowRequest && item.type !== 'mention') && (
              postThumbnail ? (
                <TouchableOpacity 
                  style={styles.thumbnailContainer}
                  onPress={() => { if (postId) router.push(`/post/${postId}`); }}
                >
                  <Image source={{ uri: resolveMediaUrl(postThumbnail) }} style={styles.postThumbnail} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <View style={styles.iconContainer}>
                  <Ionicons name={icon.name as any} size={20} color={icon.color} />
                </View>
              )
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  const renderNotification = ({ item, index }: { item: any; index: number }) => (
    <View style={styles.notificationWrapper}>
      <SwipeableNotificationItem item={item} index={index} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity</Text>
        <TouchableOpacity onPress={markAllRead} style={styles.readAllBtn}>
          <Text style={styles.readAllText}>Mark read</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id || item.id}
          renderItem={renderNotification}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(true); }} />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="notifications-off-outline" size={60} color={COLORS.border} />
              <Text style={styles.emptyText}>No activity yet</Text>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? verticalScale(45) : verticalScale(40)
  },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, flex: 1 },
  readAllBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: COLORS.surface, borderRadius: 15 },
  readAllText: { color: COLORS.secondary, fontSize: 13, fontWeight: '700' },
  listContent: { paddingVertical: 10 },
  notificationWrapper: { borderBottomWidth: 0.5, borderBottomColor: COLORS.border + '50' },
  swipeContainer: { 
    position: 'relative', 
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  notificationContent: { 
    backgroundColor: COLORS.white,
    zIndex: 1,
    width: Dimensions.get('window').width,
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: scale(100),
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    zIndex: 0,
  },
  favoriteBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(12),
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(12),
  },
  notificationItem: { 
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 15, alignItems: 'center',
  },
  avatar: { width: 46, height: 46, borderRadius: 23, marginRight: 15, borderWidth: 1, borderColor: COLORS.surface },
  content: { flex: 1, marginRight: 10 },
  message: { fontSize: 14, color: COLORS.text, lineHeight: 18 },
  bold: { fontWeight: '700' },
  time: { fontSize: 12, color: COLORS.subtitle, marginTop: 4 },
  followBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  followingBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  followBtnText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  followingBtnText: {
    color: COLORS.subtitle,
  },
  requestedBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  requestedBtnText: {
    color: COLORS.subtitle,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 16, color: COLORS.subtitle, marginTop: 15 },
  requestBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  acceptBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  acceptBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  rejectBtn: { backgroundColor: COLORS.surface, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  reshareBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  reshareBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  addedBtn: { backgroundColor: '#E2E8F0', borderWidth: 1, borderColor: '#CBD5E0' },
  addedBtnText: { color: '#718096' },
  postThumbnail: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(10),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border + '30',
  },
  thumbnailContainer: {
    position: 'relative',
    width: moderateScale(44),
    height: moderateScale(44),
  },
  typeBadge: {
    position: 'absolute',
    bottom: -moderateScale(2),
    right: -moderateScale(2),
    width: moderateScale(18),
    height: moderateScale(18),
    borderRadius: moderateScale(9),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: moderateScale(48),
    justifyContent: 'center',
    alignItems: 'center',
  }
});
