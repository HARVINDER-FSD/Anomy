import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Platform, Alert, Animated, PanResponder, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageCircleDashed } from 'lucide-react-native';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { socketService } from '@/src/lib/socket';
import { verticalScale, moderateScale, scale } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { ListSkeleton } from '@/src/components/common/Skeleton';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useNotificationStore } from '@/src/store/notificationStore';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
import { FollowButton } from '@/src/components/common/FollowButton';
import { FollowRequestActions } from '@/src/components/common/FollowRequestActions';

// Wrapper so each notification row can own its own hook instance without hooks-in-renderItem violation
function NotificationFollowButton({ targetUserId, initialState }: { targetUserId: string; initialState?: any }) {
  const { toggleFollow, isLoading } = useFollowStatus(targetUserId, initialState);
  return (
    <FollowButton
      targetUserId={targetUserId}
      onToggle={toggleFollow}
      isLoading={isLoading}
      variant="primary"
      size="sm"
      followsBackLabel={!!initialState?.isFollower}
    />
  );
}


export default function NotificationsScreen() {
  const router = useSafeRouter();
  const { user: currentUser } = useAuthStore();
  // Use global Zustand store states and actions
  const { 
    notifications, 
    setNotifications, 
    fetchNotifications 
  } = useNotificationStore();

  const [favoriteNotifications, setFavoriteNotifications] = useState<Set<string>>(new Set());
  const [resharedIds, setResharedIds] = useState<Set<string>>(new Set());
  
  // Initialize loading based on whether we already have cached notifications
  const [loading, setLoading] = useState(notifications.length === 0);
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
      useNotificationStore.getState().setUnreadNotificationsCount(0);
      fetchNotifications(true);
    } catch (error) {
       Alert.alert("Error", "Could not mark notifications as read.");
    }
  };

  const handleAcceptRequest = async (followerId: string, index: number) => {
    if (!followerId) {
      return;
    }
    
    const originalNotifs = [...notifications];
    const targetNotif = originalNotifs[index];
    if (!targetNotif) return;

    // Optimistic Update
    setNotifications(prev => prev.map((item) => {
      const itemId = item.id || item._id;
      const targetId = targetNotif.id || targetNotif._id;
      if (itemId === targetId) {
        return {
          ...item,
          is_request: false,
          type: 'follow_accept',
          content: 'is now following you',
        };
      }
      return item;
    }));

    try {
      // Actual API call is handled by the hook inside the item component
    } catch (error) {
      // Revert on error
      setNotifications(originalNotifs);
      Alert.alert("Action Failed", "Could not accept follow request. Please try again.");
    }
  };

  const handleRejectRequest = async (followerId: string, index: number) => {
    if (!followerId) return;

    const originalNotifs = [...notifications];
    const targetNotif = originalNotifs[index];
    if (!targetNotif) return;

    // Optimistic Update: immediately remove from UI list
    setNotifications(prev => prev.filter((item) => (item.id || item._id) !== (targetNotif.id || targetNotif._id)));

    try {
      // Actual API call is handled by the hook inside the item component
    } catch (error) {
      // Revert on error
      setNotifications(originalNotifs);
      Alert.alert("Action Failed", "Could not reject follow request.");
    }
  };

  useEffect(() => {
    // Fresh background fetch
    const refreshData = async () => {
      try {
        await fetchNotifications(false);
      } catch (err) {
      } finally {
        setLoading(false);
      }
    };
    
    refreshData();

    apiClient.put('/notifications/read-all')
      .then(() => useNotificationStore.getState().setUnreadNotificationsCount(0))
      .catch(() => {});
  }, []);

  // Handle Real-time Account Deletions for Notifications
  useEffect(() => {
    const cachedNotifs = useNotificationStore.getState().notifications;
    const hasCache = cachedNotifs.length > 0 || notifications.length > 0;
    performanceEngine.startScreenTrace('NotificationsScreen');
    performanceEngine.trackCacheAccess('Profile', hasCache);
    performanceEngine.endScreenTrace('NotificationsScreen', hasCache);
    const socket = socketService.socket;
    if (!socket) return;
    
    const handleUserDeleted = ({ userId }: { userId: string }) => {
      // Optimistically remove notifications related to the deleted user
      setNotifications(prev => prev.filter(item => {
        const actorId = item.actor_id || item.actorId || item.actor?.id || item.actor?._id;
        return String(actorId) !== String(userId);
      }));
    };

    const handleFollowStatusChanged = ({ followerId, followingId, isFollowing, isPending }: any) => {
      // If the current user followed or unfollowed someone, update the button state
      if (String(followerId) === String(currentUser?.id || currentUser?._id)) {
        setNotifications(prev => prev.map(item => {
          const actorId = item.actor_id || item.actorId || item.actor?.id || item.actor?._id;
          if (String(actorId) === String(followingId)) {
            return { 
              ...item, 
              isFollowing: isFollowing, 
              is_following: isFollowing, 
              isPending: isPending || false, 
              is_pending: isPending || false 
            };
          }
          return item;
        }));
      }
    };

    const handleFollowRemoved = ({ followerId, followingId }: any) => {
      // If someone unfollows the current user, remove the follow notification
      if (String(followingId) === String(currentUser?.id || currentUser?._id)) {
        setNotifications(prev => prev.filter(item => {
          if (item.type === 'follow' || item.type === 'follow_request') {
            const actorId = item.actor_id || item.actorId || item.actor?.id || item.actor?._id;
            return String(actorId) !== String(followerId);
          }
          return true;
        }));
      }
    };

    const handleFollowRequestCancelled = ({ followerId, followingId }: any) => {
      if (String(followingId) === String(currentUser?.id || currentUser?._id)) {
        setNotifications(prev => prev.filter(item => {
          if (item.type === 'follow_request') {
            const actorId = item.actor_id || item.actorId || item.actor?.id || item.actor?._id;
            return String(actorId) !== String(followerId);
          }
          return true;
        }));
      }
    };

    const handleRelationshipUpdated = (payload: any) => {
      // payload: { currentUserId, targetUserId, state }
      // state: { isFollowing, isPending, isMutualFollow, followsBack }
      if (String(payload.targetUserId) === String(currentUser?.id || currentUser?._id)) {
        setNotifications(prev => prev.map(item => {
          const actorId = item.actor_id || item.actorId || item.actor?.id || item.actor?._id;
          if (String(actorId) === String(payload.currentUserId)) {
            return {
              ...item,
              isFollowing: payload.state.isFollowing,
              is_following: payload.state.isFollowing,
              isPending: payload.state.isPending,
              is_pending: payload.state.isPending,
            };
          }
          return item;
        }));
      }
    };

    const handleNotificationNew = (notification: any) => {
      setNotifications(prev => {
        // Prevent duplicates
        if (prev.find(n => (n._id || n.id) === (notification._id || notification.id))) return prev;
        return [notification, ...prev];
      });
    };

    const handleNotificationDeleted = (payload: { notificationId: string }) => {
      setNotifications(prev => prev.filter(n => (n._id || n.id) !== payload.notificationId));
    };

    socket.on('user:deleted', handleUserDeleted);
    socket.on('follow_status_changed', handleFollowStatusChanged);
    socket.on('follow:removed', handleFollowRemoved);
    socket.on('follow_request:cancelled', handleFollowRequestCancelled);
    socket.on('relationship:updated', handleRelationshipUpdated);
    socket.on('notification:new', handleNotificationNew);
    socket.on('notification:deleted', handleNotificationDeleted);

    return () => {
      socket.off('user:deleted', handleUserDeleted);
      socket.off('follow_status_changed', handleFollowStatusChanged);
      socket.off('follow:removed', handleFollowRemoved);
      socket.off('follow_request:cancelled', handleFollowRequestCancelled);
      socket.off('relationship:updated', handleRelationshipUpdated);
      socket.off('notification:new', handleNotificationNew);
      socket.off('notification:deleted', handleNotificationDeleted);
    };
  }, [setNotifications, currentUser]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': 
      case 'reel_like':
      case 'story_like':
      case 'comment_like': // ?? Handle new comment like type
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

      default: return { name: 'notifications', color: COLORS.subtitle };
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
    }
  };

  const handleDeleteNotification = async (notificationId: string, index: number) => {
    try {
      if (!notificationId) return;
      
      // Optimistic removal
      setNotifications(prev => prev.filter((_, i) => i !== index));
      
      // Delete from backend
      await apiClient.delete(`/notifications/${notificationId}`).catch(err => {
        // Revert on error
        fetchNotifications();
      });
    } catch (error) {
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
    const rawPostThumb = item.post?.image || item.post?.image_url || item.post?.thumbnail_url || item.post?.media_urls?.[0] || item.post?.media?.[0]?.url || item.data?.postImage || item.data?.thumbnailUrl || item.data?.mediaUrl || item.data?.image_url;
    
    const resolvePostThumbnail = (url: string | undefined | null) => {
      if (!url) return '';
      let resolved = resolveMediaUrl(url);
      if (!resolved) return '';
      if (resolved.match(/\.(mp4|mov|mkv|webm|avi)(\?.*)?$/i) || resolved.includes('/video/upload/')) {
        if (resolved.includes('cloudinary.com')) {
          return resolved.replace('/video/upload/', '/video/upload/f_jpg,so_0,q_auto,w_300/').replace(/\.(mp4|mov|mkv|webm|avi)(\?.*)?$/i, '.jpg');
        } else {
          return resolved.replace(/\.(mp4|mov|mkv|webm|avi)(\?.*)?$/i, '.jpg');
        }
      }
      return resolved;
    };
    
    const postThumbnail = resolvePostThumbnail(rawPostThumb);
    const postId = item.post?.id || item.post?._id || item.data?.postId || item.data?.reelId;
    const notifId = item.id || item._id;

    const { isFollowing, isPending, isLoading, toggleFollow, acceptFollowRequest, rejectFollowRequest } = useFollowStatus(actorIdStr, {
      isFollowing: !!(item.isFollowing || item.is_following),
      isPending: !!(item.isPending || item.is_pending),
    });
    const isFollowed = isFollowing || isPending;

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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.message}>
                  <Text style={styles.bold}>{actorUsername.replace(/^@/, '')} </Text>
                  {isFollowRequest ? 'requested to follow you' : (
                    item.type === 'follow_accept'
                      ? 'accepted your follow request and started following you'
                      : (item.type === 'mention' && item.count > 1 
                          ? `mentioned you in ${item.count} stories` 
                          : (() => {
                              const raw = item.content || item.message || 'interacted with you';
                              const fullName = actor?.full_name || (item.actor as any)?.full_name || '';
                              const cleanUser = actorUsername.replace(/^@/, '').trim();
                              let clean = raw.trim();

                              if (clean.startsWith('@')) {
                                clean = clean.substring(1).trim();
                              }
                              if (fullName && clean.toLowerCase().startsWith(fullName.toLowerCase())) {
                                clean = clean.substring(fullName.length).trim();
                              }
                              if (cleanUser && clean.toLowerCase().startsWith(cleanUser.toLowerCase())) {
                                clean = clean.substring(cleanUser.length).trim();
                              }
                              if (clean.startsWith('@')) {
                                clean = clean.substring(1).trim();
                              }
                              return clean || raw;
                            })())
                  )}
                </Text>
                {actor?.is_verified && (
                   <VerifiedTick badgeType={actor?.badge_type} size={13} />
                )}
              </View>
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
              <FollowRequestActions
                targetUserId={actorIdStr || ''}
                variant="icon"
                onAcceptSuccess={() => {
                  if (actorIdStr) handleAcceptRequest(actorIdStr, index);
                }}
                onRejectSuccess={() => {
                  if (actorIdStr) handleRejectRequest(actorIdStr, index);
                }}
              />
            ) : canFollowBack && (
              <NotificationFollowButton
                targetUserId={actorIdStr || ''}
                initialState={{ isFollowing: !!(item.isFollowing || item.is_following), isPending: !!(item.isPending || item.is_pending), isFollower: true }}
              />
            )}

            {(!isFollowType && !isFollowRequest && item.type !== 'mention') && (
              postThumbnail ? (
                <TouchableOpacity 
                  style={styles.thumbnailContainer}
                  onPress={() => { 
                    if (item.type?.includes('story') || item.data?.storyId) {
                      const storyUserId = actorIdStr || item.actor_id || item.user_id || currentUser?.id;
                      router.push(`/stories/${storyUserId}`);
                    } else if (item.type?.includes('reel') || item.data?.reelId) {
                      if (postId) router.push(`/reels/${postId}`);
                    } else if (postId) {
                      router.push(`/post/${postId}`);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: resolveMediaUrl(postThumbnail) }} style={styles.postThumbnail} resizeMode="cover" />
                  <View style={[styles.typeBadge, { backgroundColor: icon.color || COLORS.error }]}>
                    {item.type?.includes('comment') || item.type === 'reply' ? (
                      <MessageCircleDashed size={10} color="#FFF" />
                    ) : item.type?.includes('like') ? (
                      <MaterialCommunityIcons name="thumb-up" size={9} color="#FFF" />
                    ) : (
                      <Ionicons name={icon.name as any} size={10} color="#FFF" />
                    )}
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.iconContainer}>
                  {item.type?.includes('comment') || item.type === 'reply' ? (
                    <MessageCircleDashed size={18} color={icon.color} />
                  ) : item.type?.includes('like') ? (
                    <MaterialCommunityIcons name="thumb-up" size={18} color="#FF3040" />
                  ) : (
                    <Ionicons name={icon.name as any} size={20} color={icon.color} />
                  )}
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
        <FastFlashList
          data={notifications}
          keyExtractor={(item: any) => item._id || item.id}
          renderItem={renderNotification}
          estimatedItemSize={70}
          drawDistance={300}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await fetchNotifications(true);
                } catch (err) {
                } finally {
                  setRefreshing(false);
                }
              }} 
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="notifications-off-outline" size={60} color={COLORS.border} />
              <Text style={styles.emptyText}>No activity yet</Text>
            </View>
          }
        />
      )}
      <PerformanceOverlay />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { 
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: verticalScale(6),
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, flex: 1 },
  readAllBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: COLORS.surface, borderRadius: 15 },
  readAllText: { color: COLORS.secondary, fontSize: 13, fontWeight: '700' },
  listContent: { paddingVertical: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
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
    color: '#FFFFFF',
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
