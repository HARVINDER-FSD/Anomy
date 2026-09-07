import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, Image, Image as RNImage, TouchableOpacity, Platform, StatusBar, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { socketService } from '@/src/lib/socket';
import * as Haptics from 'expo-haptics';
import { ShareModal } from '@/components/ShareModal';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useIsFocused } from '@react-navigation/native';

interface ProfilePostVideoItemProps {
  uri: string;
  shouldPlay: boolean;
  style: any;
}

const ProfilePostVideoItem = ({ uri, shouldPlay, style }: ProfilePostVideoItemProps) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [shouldPlay, player]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={true}
    />
  );
};


/**
 * SmartPostImageProfile — dynamically reads real image dimensions
 * so photos render at their true aspect ratio without cropping.
 * Clamps ratio: 9:16 (tall portrait) to 1.91:1 (wide landscape).
 */
function SmartPostImageProfile({ uri, style }: { uri: string; style?: any }) {
  const containerWidth = SIZES.width;
  const [imgHeight, setImgHeight] = useState<number>(containerWidth);

  useEffect(() => {
    if (!uri) return;
    RNImage.getSize(
      uri,
      (w, h) => {
        if (!w || !h) return;
        const ratio = Math.min(Math.max(h / w, 0.5625), 1.91);
        setImgHeight(containerWidth * ratio);
      },
      () => {}
    );
  }, [uri, containerWidth]);

  return (
    <Image
      source={{ uri }}
      style={[{ width: containerWidth, height: imgHeight, backgroundColor: '#111' }, style]}
      resizeMode="contain"
    />
  );
}

export default function ProfilePostFeedScreen() {
  const isFocused = useIsFocused();
  const { userId, username, initialPostId } = useLocalSearchParams();
  const router = useSafeRouter();
  const user = useAuthStore((s) => s.user);
  const isAnonymous = user?.isAnonymousMode;
  
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [visibleVideoId, setVisibleVideoId] = useState<string | null>(null);
  
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<{ 
    id: string, 
    content?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video'
  } | null>(null);

  const flashListRef = useRef<any>(null);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const first = viewableItems[0];
      if (first?.item) {
        const id = first.item._id || first.item.id;
        if (id) setVisibleVideoId(String(id));
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const fetchUserPosts = async (pageNum = 1, isRefresh = false) => {
    if (!userId) return;
    try {
      const res = await apiClient.get(`/users/${userId}/posts?page=${pageNum}&limit=10`);
      const newPosts = res.data.posts || res.data.data || [];
      
      if (isRefresh) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      
      if (newPosts.length < 10) {
        setHasMore(false);
      }
    } catch (error) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUserPosts(1, true);
  }, [userId]);

  // 🚀 REAL-TIME POST UPDATES
  useEffect(() => {
    if (!socketService.socket) return;

    const handlePostUpdate = (data: { 
      postId: string, 
      likesCount?: number, 
      commentsCount?: number, 
      sharesCount?: number,
      bookmarkCount?: number,
      userId?: string,
      action?: string 
    }) => {
      setPosts(prev => prev.map(p => {
        const id = p._id || p.id;
        if (id === data.postId) {
          const currentUserId = (user?.id || user?._id)?.toString();
          const actionUserId = data.userId?.toString();
          const isMe = currentUserId && actionUserId && currentUserId === actionUserId;
          
          let newIsLiked = p.isLiked;
          if (!isMe) {
            if (data.action === 'like') newIsLiked = true;
            if (data.action === 'unlike') newIsLiked = false;
          }

          return {
            ...p,
            likes_count: data.likesCount !== undefined ? data.likesCount : p.likes_count,
            comments_count: data.commentsCount !== undefined ? data.commentsCount : p.comments_count,
            shares_count: data.sharesCount !== undefined ? data.sharesCount : p.shares_count,
            isLiked: newIsLiked
          };
        }
        return p;
      }));
    };

    const handlePostDeleted = (data: { postId: string }) => {
      if (!data?.postId) return;
      setPosts(prev => prev.filter(p => {
        const id = String(p._id || p.id);
        return id !== String(data.postId);
      }));
    };

    socketService.socket.on('post:updated', handlePostUpdate);
    socketService.socket.on('post:deleted', handlePostDeleted);
    return () => {
      socketService.socket?.off('post:updated', handlePostUpdate);
      socketService.socket?.off('post:deleted', handlePostDeleted);
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    setHasMore(true);
    fetchUserPosts(1, true);
  }, [userId]);

  // Re-fetch when screen comes into focus (e.g. after deleting a post and navigating back)
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!isFocused) return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return; // skip first mount — initial fetchUserPosts above already handles it
    }
    // Refetch fresh list on re-focus
    setPage(1);
    setHasMore(true);
    fetchUserPosts(1, true);
  }, [isFocused]);

  const loadMore = () => {
    if (hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchUserPosts(nextPage);
    }
  };

  const handleLike = async (postId: string, isLiked: boolean) => {
    // ⚡ Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setPosts(prev => prev.map(p => {
       const id = p._id || p.id;
       if (id === postId) {
          return {
             ...p,
             isLiked: !isLiked,
             likes_count: isLiked ? (p.likes_count || 1) - 1 : (p.likes_count || 0) + 1
          };
       }
       return p;
    }));

    try {
      if (isLiked) {
        await apiClient.delete(`/posts/${postId}/like`);
      } else {
        await apiClient.post(`/posts/${postId}/like`);
      }
    } catch (error) {
    }
  };

  const handleBookmark = async (postId: string, isBookmarked: boolean) => {
    // ⚡ Haptic feedback
    Haptics.notificationAsync(isBookmarked ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);

    setPosts(prev => prev.map(p => {
       const id = p._id || p.id;
       if (id === postId) return { ...p, isBookmarked: !isBookmarked };
       return p;
    }));
    try {
      await apiClient.post(`/posts/${postId}/bookmark`);
    } catch (error) {
    }
  };

  const handleShare = async (postId: string, content?: string, mediaUrl?: string, mediaType?: 'image' | 'video') => {
    // ⚡ Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    setSelectedPost({ id: postId, content, mediaUrl, mediaType });
    setShareModalVisible(true);
  };

  const renderPost = ({ item }: { item: any }) => {
    const postId = item._id || item.id;
    const isVisible = String(postId) === visibleVideoId;
    const shouldPlayVideo = isVisible && isFocused;

    return (
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
        </View>

        {item.media_urls && item.media_urls.length > 0 ? (
          item.media_type === 'video' ? (
            <ProfilePostVideoItem
              uri={resolveMediaUrl(item.media_urls[0])}
              shouldPlay={shouldPlayVideo}
              style={styles.postImage}
            />
          ) : (
            <SmartPostImageProfile uri={resolveMediaUrl(item.media_urls[0])} style={{ borderRadius: 0 }} />
          )
        ) : null}

        <View style={styles.postActions}>
          <View style={styles.leftActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleLike(postId, item.isLiked)}>
              <Ionicons 
                name={item.isLiked ? 'heart' : 'heart-outline'} 
                size={28} 
                color={item.isLiked ? COLORS.error : (isAnonymous ? '#FFF' : COLORS.text)} 
              />
              <Text style={[styles.actionText, isAnonymous && { color: '#FFF' }]}>{item.likes_count || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/post/${postId}`)}>
              <Ionicons name="chatbubble-outline" size={26} color={isAnonymous ? '#FFF' : COLORS.text} />
              <Text style={[styles.actionText, isAnonymous && { color: '#FFF' }]}>{item.comments_count || 0}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rightActions}>
            <TouchableOpacity 
              style={{ marginRight: scale(15) }} 
              onPress={() => {
                const mediaUrl = item.media_urls?.[0] || item.media?.[0]?.url;
                handleShare(postId, item.content || item.caption, mediaUrl, item.media_type);
              }}
            >
              <MaterialCommunityIcons name="arrow-u-right-top" size={26} color={isAnonymous ? '#FFF' : COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleBookmark(postId, item.isBookmarked)}>
              <Ionicons name={item.isBookmarked ? 'bookmark' : 'bookmark-outline'} size={26} color={item.isBookmarked ? (isAnonymous ? '#FFF' : COLORS.secondary) : (isAnonymous ? '#FFF' : COLORS.text)} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.postFooter}>
          {(item.content || item.caption) ? (
            <Text style={[styles.captionText, isAnonymous && { color: '#DDD' }]} numberOfLines={3}>
              <Text style={[styles.boldText, isAnonymous && { color: '#FFF' }]}>{item.author?.username || item.user?.username} </Text>
              {item.content || item.caption}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  // Initial scroll to the clicked post
  const getItemLayout = (_: any, index: number) => ({
    length: SIZES.width * 1.5, // Rough estimate of post height
    offset: SIZES.width * 1.5 * index,
    index,
  });

  useEffect(() => {
    if (posts.length > 0 && initialPostId) {
      const index = posts.findIndex(p => (p._id || p.id) === initialPostId);
      if (index !== -1) {
        setTimeout(() => {
          flashListRef.current?.scrollToIndex({ index, animated: false });
        }, 100);
      }
    }
  }, [posts.length, initialPostId]);

  const renderPostItem = useCallback(({ item }: { item: any }) => renderPost({ item }), [renderPost]);

  return (
    <SafeAreaView style={[styles.container, isAnonymous && { backgroundColor: COLORS.black }]}>
      <StatusBar barStyle={isAnonymous ? "light-content" : "dark-content"} />
      
      <View style={[styles.appHeader, isAnonymous && { backgroundColor: COLORS.black, borderBottomColor: '#1A1A1A' }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color={isAnonymous ? '#FFF' : COLORS.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isAnonymous && { color: '#FFF' }]}>
          {username ? `${username}'s Posts` : 'Posts'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <FlashList<any>
        ref={flashListRef}
        data={posts}
        keyExtractor={(item, index) => item._id || item.id || String(index)}
        renderItem={renderPostItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor={isAnonymous ? '#FFF' : COLORS.secondary} 
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerNode}>
              <ActivityIndicator size="large" color={isAnonymous ? '#FFF' : COLORS.secondary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, isAnonymous && { color: '#888' }]}>No posts found.</Text>
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
  backBtn: { padding: 5 },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text },
  
  postCard: { backgroundColor: COLORS.white, marginBottom: verticalScale(8) },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: moderateScale(12) },
  postUser: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  postAvatar: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(19), borderWidth: 1.5, borderColor: COLORS.primary },
  postUsername: { fontSize: moderateFont(15), fontWeight: 'bold', color: COLORS.text },
  postLocation: { fontSize: moderateFont(12), color: COLORS.subtitle },
  
  postImage: { width: SIZES.width, height: SIZES.width, backgroundColor: COLORS.surface },
  
  postActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: scale(16), paddingTop: verticalScale(12), paddingBottom: verticalScale(8) },
  leftActions: { flexDirection: 'row', gap: scale(20) },
  rightActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  actionText: { color: COLORS.text, fontSize: moderateFont(15), fontWeight: '700' },
  
  postFooter: { paddingHorizontal: scale(16), paddingBottom: verticalScale(12) },
  captionText: { color: COLORS.text, fontSize: moderateFont(14), lineHeight: moderateFont(20) },
  boldText: { fontWeight: '700' },

  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyContainer: { alignItems: 'center', marginTop: verticalScale(120), paddingHorizontal: scale(40) },
  emptyText: { color: COLORS.subtitle, marginTop: verticalScale(16), fontSize: moderateFont(16), textAlign: 'center' },
});
