import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Image, TouchableOpacity, Platform, Share, SafeAreaView, StatusBar, Alert } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { Dimensions } from 'react-native';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { socketService } from '@/src/lib/socket';
import * as Haptics from 'expo-haptics';
import { DeviceEventEmitter } from 'react-native';
import { ShareModal } from '@/components/ShareModal';
import { CommentBottomSheet } from '@/components/CommentBottomSheet';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAnonymous = user?.isAnonymousMode;
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [likersByPostId, setLikersByPostId] = useState<Record<string, any[]>>({});
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const initialFetchDone = React.useRef(false);

  const handleImageLoad = useCallback((postId: string, event: any) => {
    const { width, height } = event.nativeEvent.source;
    if (width && height) {
      setImageAspectRatios(prev => ({ ...prev, [postId]: width / height }));
    }
  }, []);

  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [activePostOwnerId, setActivePostOwnerId] = useState<string | null>(null);

  const [selectedPost, setSelectedPost] = useState<{
    id: string,
    content?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video'
  } | null>(null);

  const fetchFeed = async (pageNumber = 1, isRefresh = false) => {
    if (loadingMore || (!hasMore && !isRefresh)) return;

    try {
      if (isRefresh) {
        if (!refreshing) setLoading(true);
        setPosts([]); // Clear posts immediately to avoid clash
        setPage(1);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      const endpoint = isAnonymous ? `/feed/anonymous?page=${pageNumber}&limit=10` : `/feed?page=${pageNumber}&limit=10`;
      const res = await apiClient.get(endpoint);

      if (isAnonymous) {
        console.log('👻 Anonymous Feed Data:', JSON.stringify(res.data, null, 2));
      }

      let newPosts = res.data.posts || res.data.data || (Array.isArray(res.data) ? res.data : []);

      // Fetch user's liked posts to mark them
      if (!isAnonymous && newPosts.length > 0) {
        try {
          const likedRes = await apiClient.get('/posts/user/liked-posts');
          if (likedRes.data?.success && likedRes.data?.likedPostIds) {
            const likedPostIds = new Set(
              likedRes.data.likedPostIds.map((id: any) => id.toString())
            );

            // Mark posts as liked
            newPosts = newPosts.map((post: any) => ({
              ...post,
              isLiked: likedPostIds.has((post._id || post.id).toString())
            }));
          }
        } catch (err) {
          console.error("Error fetching liked posts:", err);
        }
      }

      if (isRefresh) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setHasMore(newPosts.length === 10);
      setPage(pageNumber);

      // Fetch likers for each post
      newPosts.forEach((post: any) => {
        const postId = post._id || post.id;
        if (postId && post.likes_count > 0) {
          fetchLikers(postId);
        }
      });
    } catch (error) {
      console.error("Error fetching feed:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const fetchLikers = async (postId: string) => {
    try {
      const res = await apiClient.get(`/posts/${postId}/likers?limit=5`);
      if (res.data?.success && res.data?.likers) {
        setLikersByPostId(prev => ({
          ...prev,
          [postId]: res.data.likers
        }));
      }
    } catch (error) {
      console.error("Error fetching likers:", error);
    }
  };

  React.useEffect(() => {
    fetchFeed(1, true);
  }, [isAnonymous]);

  // 🚀 REAL-TIME POST UPDATES - Only from other users
  React.useEffect(() => {
    if (!socketService.socket) return;

    const handlePostUpdate = (data: {
      postId: string,
      likesCount?: number,
      userId?: string,
      action?: string
    }) => {
      const currentUserId = (user?.id || user?._id)?.toString();
      const actionUserId = data.userId?.toString();

      // Skip if this is my own action
      if (currentUserId === actionUserId) return;

      setPosts(prev => prev.map(p => {
        if ((p._id || p.id) === data.postId) {
          return {
            ...p,
            likes_count: Math.max(data.likesCount ?? p.likes_count, 0)
          };
        }
        return p;
      }));
    };

    socketService.socket.on('post:updated', handlePostUpdate);

    // ⚡ Listen for LOCAL updates from other screens
    const localSub = DeviceEventEmitter.addListener('post:liked:local', (data: { postId: string, isLiked: boolean, likesCount?: number }) => {
      setPosts(prev => prev.map(p => {
        if ((p._id || p.id) === data.postId) {
          return {
            ...p,
            isLiked: data.isLiked,
            likes_count: data.likesCount !== undefined ? data.likesCount : p.likes_count
          };
        }
        return p;
      }));
    });

    return () => {
      socketService.socket?.off('post:updated', handlePostUpdate);
      localSub.remove();
    };
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed(1, true);
  }, []);

  const handleLike = async (postId: string, isLiked: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Find the post
    const postIndex = posts.findIndex(p => (p._id || p.id) === postId);
    if (postIndex === -1) return;

    const post = posts[postIndex];
    const newIsLiked = !isLiked;
    const newCount = newIsLiked ? (post.likes_count || 0) + 1 : Math.max((post.likes_count || 1) - 1, 0);

    // Save original state
    const originalPost = { ...post };

    // Update UI immediately
    const updatedPosts = [...posts];
    updatedPosts[postIndex] = {
      ...post,
      isLiked: newIsLiked,
      likes_count: newCount
    };
    setPosts(updatedPosts);

    try {
      if (isLiked) {
        await apiClient.delete(`/posts/${postId}/like`);
      } else {
        await apiClient.post(`/posts/${postId}/like`);
      }

      // ⚡ Emit local event for other screens to keep in sync
      DeviceEventEmitter.emit('post:liked:local', {
        postId,
        isLiked: newIsLiked,
        likesCount: newCount
      });

      // ✅ Always refresh likers after like/unlike
      if (newCount > 0) {
        fetchLikers(postId);
      } else {
        setLikersByPostId(prev => ({
          ...prev,
          [postId]: []
        }));
      }
    } catch (error) {
      console.error("Like error:", error);
      // Revert on error
      const revertPosts = [...posts];
      revertPosts[postIndex] = originalPost;
      setPosts(revertPosts);
    }
  };

  const handleBookmark = async (postId: string, isBookmarked: boolean) => {
    // ⚡ Haptic feedback
    Haptics.notificationAsync(isBookmarked ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);

    setPosts(prev => prev.map(p => {
      if (p._id === postId || p.id === postId) return { ...p, isBookmarked: !isBookmarked };
      return p;
    }));
    try {
      await apiClient.post(`/posts/${postId}/bookmark`);
    } catch (error) {
      console.error("Bookmark error:", error);
    }
  };

  const handleShare = async (postId: string, content?: string, mediaUrl?: string, mediaType?: 'image' | 'video') => {
    // ⚡ Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setSelectedPost({ id: postId, content, mediaUrl, mediaType });
    setShareModalVisible(true);
  };

  const handleExternalShare = async (postId: string, content?: string) => {
    try {
      // ⚡ Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const result = await Share.share({
        message: `Check out this post on AnuFy: ${content || ''}`,
        url: `https://anufy.app/post/${postId}`
      });

      if (result.action === Share.sharedAction) {
        // Increment share count in backend
        await apiClient.post(`/posts/${postId}/share`);
      }
    } catch (error) {
      console.error("Share error:", error);
    }
  };
  const handleDeletePost = (postId: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic removal
            setPosts(prev => prev.filter(p => (p._id || p.id) !== postId));
            try {
              await apiClient.delete(`/posts/${postId}`);
            } catch (err) {
              console.error('Delete post error:', err);
              Alert.alert('Error', 'Failed to delete post. Please try again.');
              // Refresh to restore state
              fetchFeed(1, true);
            }
          }
        }
      ]
    );
  };

  const handlePostOptions = (postId: string, isOwn: boolean) => {
    if (isOwn) {
      Alert.alert(
        'Post Options',
        '',
        [
          {
            text: '🗑️  Delete Post',
            style: 'destructive',
            onPress: () => handleDeletePost(postId)
          },
          {
            text: '🔗  Share Externally',
            onPress: () => {
              const item = posts.find(p => (p._id || p.id) === postId);
              handleExternalShare(postId, item?.content || item?.caption);
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } else {
      Alert.alert(
        'Post Options',
        '',
        [
          {
            text: '🔗  Share Externally',
            onPress: () => {
              const item = posts.find(p => (p._id || p.id) === postId);
              handleExternalShare(postId, item?.content || item?.caption);
            }
          },
          {
            text: '🚩  Report Post',
            style: 'destructive',
            onPress: () => Alert.alert('Reported', 'Thank you for reporting this post.')
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  // renderItem is inline in the FlatList

  return (
    <SafeAreaView style={[styles.container, isAnonymous && { backgroundColor: COLORS.black }]}>
      <StatusBar barStyle={isAnonymous ? "light-content" : "dark-content"} />

      <View style={[styles.appHeader, isAnonymous && { backgroundColor: COLORS.black, borderBottomColor: '#1A1A1A' }]}>
        <View style={styles.headerLeftContainer}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={[styles.headerLogo, isAnonymous && { tintColor: '#FFF' }]}
            resizeMode="contain"
          />
        </View>

        {!isAnonymous && (
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/explore')}>
              <Ionicons name="search-outline" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')}>
              <Ionicons name="heart-outline" size={26} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item, index) => item._id || item.id || String(index)}
        renderItem={({ item }) => (
          <View style={[styles.postCard, isAnonymous && { backgroundColor: '#0A0A0A', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }]}>
            <View style={styles.postHeader}>
              <TouchableOpacity style={styles.postUser} onPress={() => router.push(`/user/${item.author?.username || item.user?.username}`)}>
                <Image
                  source={{ uri: resolveAvatarUrl(item.author?.avatar_url || item.author?.avatar || item.user?.avatar_url || item.user?.avatar, item.author?.username || item.user?.username) }}
                  style={[styles.postAvatar, isAnonymous && { borderColor: '#FFF' }]}
                />
                <View>
                  <Text style={[styles.postUsername, isAnonymous && { color: '#FFF' }]}>{item.author?.username || item.user?.username || 'AnuFy_User'}</Text>
                  {item.location?.name && <Text style={[styles.postLocation, isAnonymous && { color: '#888' }]}>{item.location.name}</Text>}
                </View>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(16) }}>
                <TouchableOpacity 
                  onPress={() => handleBookmark(item._id || item.id, !!item.isBookmarked)}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <Ionicons name={item.isBookmarked ? 'bookmark' : 'bookmark-outline'} size={24} color={item.isBookmarked ? COLORS.secondary : COLORS.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const postId = item._id || item.id;
                    const authorId = item.author?._id || item.author?.id || item.user?._id || item.user?.id || item.user_id;
                    const isOwn = !!(user?.id && authorId && (authorId === user.id || authorId?.toString() === user.id?.toString()));
                    handlePostOptions(postId, isOwn);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={isAnonymous ? '#FFF' : COLORS.subtitle} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ position: 'relative' }}>
              {item.media_urls && item.media_urls.length > 0 ? (
                item.media_type === 'video' ? (
                  <Video
                    source={{ uri: resolveMediaUrl(item.media_urls[0]) }}
                    style={styles.postImage}
                    resizeMode={ResizeMode.COVER}
                    isLooping
                    shouldPlay
                    useNativeControls
                  />
                ) : (
                  <Image 
                    source={{ uri: resolveMediaUrl(item.media_urls[0]) }} 
                    style={styles.postImage} 
                    resizeMode="cover" 
                  />
                )
              ) : item.media && item.media.length > 0 ? (
                item.media_type === 'video' ? (
                  <Video
                    source={{ uri: resolveMediaUrl(item.media[0].url) }}
                    style={styles.postImage}
                    resizeMode={ResizeMode.COVER}
                    isLooping
                    shouldPlay
                    useNativeControls
                  />
                ) : (
                  <Image 
                    source={{ uri: resolveMediaUrl(item.media[0].url) }} 
                    style={styles.postImage} 
                    resizeMode="cover" 
                  />
                )
              ) : null}

              <View style={(item.media_urls?.length > 0 || item.media?.length > 0) ? styles.floatingActions : styles.postActions}>
                <View style={styles.leftActions}>
                  <TouchableOpacity 
                    style={styles.actionBtn} 
                    onPress={() => handleLike(item._id || item.id, item.isLiked)}
                    activeOpacity={0.7}
                  >
                    <Ionicons 
                      name={item.isLiked ? "heart" : "heart-outline"} 
                      size={28} 
                      color={item.isLiked ? COLORS.error : '#FFF'} 
                      style={styles.iconShadow}
                    />
                    <Text style={[styles.actionText, { fontSize: moderateFont(15) }]}>{item.likes_count || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setActivePostId(item._id || item.id);
                      setActivePostOwnerId(item.user_id || item.user?.id || item.user?._id);
                      setCommentModalVisible(true);
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={26} color="#FFF" style={styles.iconShadow} />
                    <Text style={[styles.actionText, { fontSize: moderateFont(15) }]}>{item.comments_count || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.actionBtn} 
                    onPress={() => {
                      const mediaUrl = item.media_urls?.[0] || item.media?.[0]?.url;
                      handleShare(item._id || item.id, item.content || item.caption, mediaUrl, item.media_type);
                    }}
                  >
                    <Ionicons name="paper-plane-outline" size={26} color="#FFF" style={styles.iconShadow} />
                  </TouchableOpacity>
                </View>

              </View>
            </View>

            <View style={[styles.postFooter, { paddingTop: verticalScale(6) }]}>
              {/* Show likers inline directly under the media curve */}
              {likersByPostId[item._id || item.id]?.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: verticalScale(6) }}>
                  <Text style={[styles.likersLabel, isAnonymous && { color: '#888' }, { marginBottom: 0, marginRight: scale(8) }]}>Liked by</Text>
                  <View style={styles.likersList}>
                    {likersByPostId[item._id || item.id].slice(0, 3).map((liker: any, idx: number) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => router.push(`/user/${liker.username}`)}
                        style={[styles.likerItem, { paddingVertical: verticalScale(2), paddingHorizontal: scale(8) }]}
                      >
                        <Text style={[styles.likerName, isAnonymous && { color: '#FFF' }]}>
                          {liker.full_name || liker.username}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {likersByPostId[item._id || item.id].length > 3 && (
                      <Text style={[styles.moreLikers, isAnonymous && { color: '#888' }]}>
                        +{likersByPostId[item._id || item.id].length - 3} more
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {(item.content || item.caption) ? (
                <Text style={[styles.captionText, isAnonymous && { color: '#DDD' }, { marginTop: verticalScale(2) }]} numberOfLines={3}>
                  <Text style={[styles.boldText, isAnonymous && { color: '#FFF' }]}>{item.author?.username || item.user?.username} </Text>
                  {item.content || item.caption}
                </Text>
              ) : null}
            </View>
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isAnonymous ? '#FFF' : COLORS.secondary}
            colors={[isAnonymous ? '#FFF' : COLORS.secondary]}
          />
        }
        onEndReached={() => {
          if (hasMore && !loadingMore) {
            fetchFeed(page + 1);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator size="small" color={isAnonymous ? '#FFF' : COLORS.secondary} />
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerNode}>
              <ActivityIndicator size="large" color={isAnonymous ? '#FFF' : COLORS.secondary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={80} color={isAnonymous ? '#404040' : COLORS.border} />
              <Text style={[styles.emptyText, isAnonymous && { color: '#888' }]}>{isAnonymous ? "No ghost stories yet." : "No posts yet. Follow people to see their moments."}</Text>
            </View>
          )
        }
      />

      <ShareModal
        isVisible={shareModalVisible}
        onClose={() => {
          setShareModalVisible(false);
          setSelectedPost(null);
        }}
        postId={selectedPost?.id || ''}
        postContent={selectedPost?.content}
        mediaUrl={selectedPost?.mediaUrl}
        mediaType={selectedPost?.mediaType}
        isShot={false}
      />

      <CommentBottomSheet
        isVisible={commentModalVisible}
        onClose={() => {
          setCommentModalVisible(false);
          setActivePostId(null);
          setActivePostOwnerId(null);
        }}
        postId={activePostId || ''}
        postOwnerId={activePostOwnerId || ''}
        onCommentAdded={(count) => {
          if (activePostId) {
            setPosts(prev => prev.map(p => {
              if ((p._id || p.id) === activePostId) {
                return { ...p, comments_count: (p.comments_count || 0) + count };
              }
              return p;
            }));
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  appHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    paddingBottom: verticalScale(14),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  anonymousBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(15),
    gap: scale(5),
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  anonymousBadgeText: {
    color: COLORS.white,
    fontSize: moderateFont(11),
    fontWeight: 'bold',
  },
  headerLeftContainer: {
    width: scale(140),
    height: verticalScale(42),
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerLogo: {
    width: '100%',
    height: '100%',
    transform: [
      { scale: 2.2 },
      { translateX: scale(-15) } // isko negative me badhaoge (-20, -30) to aur ekdum left jayega, positive (10, 20) karoge toh right aayega!
    ],
  },
  headerIcons: { flexDirection: 'row', gap: scale(18) },
  iconBtn: { position: 'relative' },

  postCard: { backgroundColor: COLORS.white, marginBottom: verticalScale(16) },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(14) },
  postUser: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  postAvatar: { width: moderateScale(42), height: moderateScale(42), borderRadius: moderateScale(21), borderWidth: 1.5, borderColor: COLORS.border },
  postUsername: { fontSize: moderateFont(15), fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  postLocation: { fontSize: moderateFont(12), color: COLORS.subtitle, marginTop: verticalScale(2) },

  postImage: { 
    width: SIZES.width - scale(32), 
    height: (SIZES.width - scale(32)) * 1.25, 
    backgroundColor: COLORS.surface,
    alignSelf: 'center',
    borderRadius: moderateScale(24),
  },

  floatingActions: {
    position: 'absolute',
    bottom: verticalScale(6),
    left: scale(20),
    right: scale(20),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: scale(16), paddingTop: verticalScale(16), paddingBottom: verticalScale(12) },
  leftActions: { flexDirection: 'row', gap: scale(8) },
  rightActions: { flexDirection: 'row', gap: scale(8) },
  
  actionBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: scale(6),
    backgroundColor: 'transparent',
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(6),
  },
  actionBtnNonFloat: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: scale(6),
    paddingHorizontal: scale(6),
  },
  actionText: { 
    color: '#FFF', 
    fontSize: moderateFont(14), 
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  iconShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },

  postFooter: { paddingHorizontal: scale(16), paddingBottom: verticalScale(8), paddingTop: verticalScale(8) },
  captionText: { color: COLORS.text, fontSize: moderateFont(14), lineHeight: moderateFont(22) },
  boldText: { fontWeight: '800', color: COLORS.primary },
  timeAgo: { color: COLORS.subtitle, fontSize: moderateFont(13), marginTop: verticalScale(6) },

  likersContainer: { marginTop: verticalScale(8) },
  likersLabel: { color: COLORS.subtitle, fontSize: moderateFont(12), fontWeight: '600', marginBottom: verticalScale(4) },
  likersList: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  likerItem: { backgroundColor: COLORS.surface, paddingHorizontal: scale(10), paddingVertical: verticalScale(4), borderRadius: moderateScale(12) },
  likerName: { color: COLORS.text, fontSize: moderateFont(12), fontWeight: '500' },
  moreLikers: { color: COLORS.subtitle, fontSize: moderateFont(12), fontWeight: '500', alignSelf: 'center' },

  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyContainer: { alignItems: 'center', marginTop: verticalScale(120), paddingHorizontal: scale(40) },
  emptyText: { color: COLORS.subtitle, marginTop: verticalScale(16), fontSize: moderateFont(16), textAlign: 'center', lineHeight: moderateFont(24) },
  exploreBtn: { marginTop: verticalScale(20), backgroundColor: COLORS.primary, paddingHorizontal: scale(24), paddingVertical: verticalScale(12), borderRadius: moderateScale(25) },
  exploreBtnText: { color: COLORS.text, fontWeight: 'bold', fontSize: moderateFont(15) },
});
