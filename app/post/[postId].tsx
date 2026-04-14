import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, SafeAreaView, ActivityIndicator, TextInput, FlatList, KeyboardAvoidingView, Platform, Alert, RefreshControl, StatusBar, Share, DeviceEventEmitter } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore, User } from '@/src/store/authStore';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import * as Haptics from 'expo-haptics';
import { socketService } from '@/src/lib/socket';
import { Video, ResizeMode } from 'expo-av';
import { CommentBottomSheet } from '@/components/CommentBottomSheet';

interface Liker {
  _id?: string;
  id?: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  avatar?: string;
}

interface Post {
  _id?: string;
  id?: string;
  author?: User;
  user?: User;
  content?: string;
  caption?: string;
  media_urls?: string[];
  media?: Array<{ url: string }>;
  media_type?: 'image' | 'video' | 'carousel' | 'text';
  location?: { name: string };
  likes_count: number;
  comments_count: number;
  shares_count?: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  is_liked?: boolean;
  is_bookmarked?: boolean;
}

export default function PostDetailsScreen() {
  const params = useLocalSearchParams();
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const initialDataString = Array.isArray(params.initialData) ? params.initialData[0] : params.initialData;
  
  const router = useRouter();
  const { user } = useAuthStore();
  
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  
  const initialData = useMemo<Post | null>(() => {
    if (!initialDataString) return null;
    try {
      const parsed = JSON.parse(initialDataString);
      return parsed;
    } catch (e) {
      console.error('Error parsing initialData:', e);
      return null;
    }
  }, [initialDataString]);

  const [posts, setPosts] = useState<Post[]>(initialData ? [initialData] : []);
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [likersByPostId, setLikersByPostId] = useState<Record<string, Liker[]>>({});

  // Fetch initial post and then more posts from the same user
  useEffect(() => {
    if (postId) {
      loadInitialPost();
    }
  }, [postId]);

  const loadInitialPost = async () => {
    try {
      if (!initialData) setLoading(true);
      
      const res = await apiClient.get(`/posts/${postId}`);
      const postData = res.data.data.post;

      // ✅ Also check liked-posts API for correct isLiked state
      let isLiked = postData.is_liked || false;
      try {
        const likedRes = await apiClient.get('/posts/user/liked-posts');
        if (likedRes.data?.success && likedRes.data?.likedPostIds) {
          const likedSet = new Set(
            likedRes.data.likedPostIds.map((id: any) => id.toString())
          );
          isLiked = likedSet.has((postData._id || postData.id).toString());
        }
      } catch { /* use is_liked fallback */ }

      const formattedPost: Post = {
        ...postData,
        isLiked,
        likes_count: postData.likes_count || 0
      };

      setPosts([formattedPost]);
      if (formattedPost.likes_count > 0) fetchLikers(postData._id || postData.id);
      
      // After initial post, load more from same user
      const authorId = postData.user?.id || postData.user?._id || postData.author?.id || postData.author?._id;
      if (authorId) {
        fetchUserPosts(authorId, 1, true);
      }
    } catch (error) {
      console.error('Error loading initial post:', error);
      if (!initialData) {
        Alert.alert('Error', 'Could not load post');
        router.back();
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPosts = async (userId: string, pageNum: number, isInitial = false) => {
    if (loadingMore || (!hasMore && !isInitial)) return;
    
    setLoadingMore(true);
    try {
      const res = await apiClient.get(`/users/${userId}/posts?page=${pageNum}&limit=10`);
      let newPosts: Post[] = res.data.data || [];
      
      // Filter out the current post to avoid duplicates
      const filteredPosts = newPosts.filter((p) => (p._id || p.id) !== postId);

      // ✅ Fetch user's liked posts to mark isLiked correctly
      try {
        const likedRes = await apiClient.get('/posts/user/liked-posts');
        if (likedRes.data?.success && likedRes.data?.likedPostIds) {
          const likedSet = new Set(
            likedRes.data.likedPostIds.map((id: any) => id.toString())
          );
          newPosts = filteredPosts.map((p) => ({
            ...p,
            isLiked: likedSet.has((p._id || p.id)?.toString() || ''),
            likes_count: p.likes_count || 0
          }));
        } else {
          newPosts = filteredPosts.map((p) => ({
            ...p,
            isLiked: p.is_liked || false,
            likes_count: p.likes_count || 0
          }));
        }
      } catch {
        newPosts = filteredPosts.map((p) => ({
          ...p,
          isLiked: p.is_liked || false,
          likes_count: p.likes_count || 0
        }));
      }
      
      if (isInitial) {
        setPosts(prev => [prev[0], ...newPosts]);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setHasMore(filteredPosts.length === 10);
      setPage(pageNum);

      // Fetch likers for new posts
      newPosts.forEach((p) => {
        const pid = p._id || p.id;
        if (pid && p.likes_count > 0) fetchLikers(pid);
      });
    } catch (error) {
      console.error('Error fetching more posts:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchLikers = async (pid: string) => {
    try {
      const res = await apiClient.get(`/posts/${pid}/likers?limit=5`);
      if (res.data?.success && res.data?.likers) {
        setLikersByPostId(prev => ({ ...prev, [pid]: res.data.likers }));
      }
    } catch (error) {
      console.error('Error fetching likers:', error);
    }
  };

  const handleLike = async (pid: string, isLiked: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const newIsLiked = !isLiked;
    const newCount = isLiked ? Math.max((posts.find(p => (p._id || p.id) === pid)?.likes_count || 1) - 1, 0) : (posts.find(p => (p._id || p.id) === pid)?.likes_count || 0) + 1;

    setPosts(prev => prev.map(p => {
      if ((p._id || p.id) === pid) {
        return { ...p, isLiked: newIsLiked, likes_count: newCount };
      }
      return p;
    }));

    try {
      if (isLiked) {
        await apiClient.delete(`/posts/${pid}/like`);
      } else {
        await apiClient.post(`/posts/${pid}/like`);
      }
      
      // ⚡ Emit local event for other screens to keep in sync
      DeviceEventEmitter.emit('post:liked:local', { 
        postId: pid, 
        isLiked: newIsLiked,
        likesCount: newCount
      });

      if (newCount > 0) {
        fetchLikers(pid);
      } else {
        setLikersByPostId(prev => ({ ...prev, [pid]: [] }));
      }
    } catch (error) {
      console.error('Like error:', error);
    }
  };

  const handleBookmark = async (pid: string, isBookmarked: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const newIsBookmarked = !isBookmarked;
    setPosts(prev => prev.map(p => {
      if ((p._id || p.id) === pid) {
        return { ...p, isBookmarked: newIsBookmarked };
      }
      return p;
    }));

    try {
      await apiClient.post(`/posts/${pid}/bookmark`);
      
      DeviceEventEmitter.emit('post:bookmarked:local', { 
        postId: pid, 
        isBookmarked: newIsBookmarked 
      });
    } catch (error) {
      console.error('Bookmark error:', error);
      // Rollback
      setPosts(prev => prev.map(p => {
        if ((p._id || p.id) === pid) {
          return { ...p, isBookmarked: isBookmarked };
        }
        return p;
      }));
    }
  };

  useEffect(() => {
    // ⚡ Listen for LOCAL updates from other screens
    const likeSub = DeviceEventEmitter.addListener('post:liked:local', (data: { postId: string, isLiked: boolean, likesCount?: number }) => {
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

    const bookmarkSub = DeviceEventEmitter.addListener('post:bookmarked:local', (data: { postId: string, isBookmarked: boolean }) => {
      setPosts(prev => prev.map(p => {
        if ((p._id || p.id) === data.postId) {
          return {
            ...p,
            isBookmarked: data.isBookmarked
          };
        }
        return p;
      }));
    });

    return () => {
      likeSub.remove();
      bookmarkSub.remove();
    };
  }, []);

  const handleShare = async (pid: string, content?: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await Share.share({
        message: `Check out this post on AnuFy: ${content || ''}`,
        url: `https://anufy.app/post/${pid}`
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const renderPost = ({ item }: { item: Post }) => {
    const pid = (item._id || item.id) as string;
    const author = item.author || item.user;
    const mediaUrl = item.media_urls?.[0] || item.media?.[0]?.url;

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <TouchableOpacity style={styles.postUser} onPress={() => router.push(`/user/${author?.username}`)}>
            <Image 
              source={{ uri: resolveAvatarUrl(author?.avatar_url || author?.avatar, author?.username) }} 
              style={styles.postAvatar} 
            />
            <View>
              <Text style={styles.postUsername}>{author?.username || 'AnuFy_User'}</Text>
              {item.location?.name && <Text style={styles.postLocation}>{item.location.name}</Text>}
            </View>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(16) }}>
            <TouchableOpacity 
              onPress={() => handleBookmark(pid, !!item.isBookmarked)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name={item.isBookmarked ? 'bookmark' : 'bookmark-outline'} size={24} color={item.isBookmarked ? COLORS.secondary : COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {}}>
              <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.subtitle} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ position: 'relative' }}>
          {mediaUrl && (
            item.media_type === 'video' ? (
              <Video
                source={{ uri: resolveMediaUrl(mediaUrl) }}
                style={styles.postImage}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay
                useNativeControls
              />
            ) : (
              <Image 
                source={{ uri: resolveMediaUrl(mediaUrl) }} 
                style={styles.postImage} 
                resizeMode="cover" 
              />
            )
          )}

          <View style={mediaUrl ? styles.floatingActions : styles.postActions}>
            <View style={styles.leftActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleLike(pid, !!item.isLiked)}>
                <Ionicons 
                  name={item.isLiked ? "heart" : "heart-outline"} 
                  size={28} 
                  color={item.isLiked ? COLORS.error : '#FFF'} 
                  style={styles.iconShadow}
                />
                <Text style={[styles.actionText, { fontSize: moderateFont(15) }]}>{item.likes_count || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentModalVisible(true)}>
                <Ionicons name="chatbubble-outline" size={26} color="#FFF" style={styles.iconShadow} />
                <Text style={[styles.actionText, { fontSize: moderateFont(15) }]}>{item.comments_count || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionBtn} 
                onPress={() => handleShare(pid, item.content || item.caption)}
              >
                <Ionicons name="paper-plane-outline" size={26} color="#FFF" style={styles.iconShadow} />
              </TouchableOpacity>
            </View>

          </View>
        </View>

        <View style={[styles.postFooter, { paddingTop: verticalScale(6) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: scale(4) }}>
            
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {likersByPostId[pid]?.length > 0 && (
                <>
                  <Text style={[styles.likersLabel, { marginBottom: 0, marginRight: scale(8) }]}>Liked by</Text>
                  <View style={styles.likersList}>
                    {likersByPostId[pid].slice(0, 3).map((liker, idx) => (
                      <TouchableOpacity 
                        key={idx}
                        onPress={() => router.push(`/user/${liker.username}`)}
                        style={[styles.likerItem, { paddingVertical: verticalScale(2), paddingHorizontal: scale(8) }]}
                      >
                        <Text style={styles.likerName}>{liker.full_name || liker.username}</Text>
                      </TouchableOpacity>
                    ))}
                    {likersByPostId[pid].length > 3 && (
                       <Text style={styles.moreLikers}>
                         +{likersByPostId[pid].length - 3} more
                       </Text>
                    )}
                  </View>
                </>
              )}
            </View>



          </View>

          {(item.content || item.caption) ? (
            <Text style={[styles.captionText, { marginTop: verticalScale(8) }]} numberOfLines={3}>
              <Text style={styles.boldText}>{author?.username} </Text>
              {item.content || item.caption}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Posts</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item, index) => (item._id || item.id || String(index)) as string}
        renderItem={renderPost}
        onEndReached={() => {
          const firstPost = posts[0];
          const authorId = firstPost?.author?._id || firstPost?.author?.id || firstPost?.user?._id || firstPost?.user?.id;
          if (authorId) fetchUserPosts(authorId, page + 1);
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={COLORS.secondary} style={{ margin: 20 }} /> : null}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerNode}>
              <ActivityIndicator size="large" color={COLORS.secondary} />
            </View>
          ) : null
        }
      />

      <CommentBottomSheet
        isVisible={commentModalVisible}
        onClose={() => setCommentModalVisible(false)}
        postId={postId as string}
        postOwnerId={(posts.find(p => (p._id || p.id) === postId)?.user?.id || posts.find(p => (p._id || p.id) === postId)?.author?.id) as string}
        onCommentAdded={(count: number) => {
          setPosts(prev => prev.map(p => {
            if ((p._id || p.id) === postId) {
              return { ...p, comments_count: (p.comments_count || 0) + count };
            }
            return p;
          }));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    paddingBottom: verticalScale(14),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text },
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
  leftActions: { flexDirection: 'row', gap: scale(12) },
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
    marginTop: verticalScale(10),
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

  postFooter: { paddingHorizontal: scale(16), paddingBottom: verticalScale(16) },
  captionText: { color: COLORS.text, fontSize: moderateFont(14), lineHeight: moderateFont(22) },
  boldText: { fontWeight: '800', color: COLORS.primary },
  likersContainer: { marginTop: verticalScale(1) },
  likersLabel: { color: COLORS.subtitle, fontSize: moderateFont(12), fontWeight: '600', marginBottom: verticalScale(4) },
  likersList: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  likerItem: { backgroundColor: COLORS.surface, paddingHorizontal: scale(10), paddingVertical: verticalScale(4), borderRadius: moderateScale(12) },
  likerName: { color: COLORS.text, fontSize: moderateFont(12), fontWeight: '500' },
  moreLikers: { color: COLORS.subtitle, fontSize: moderateFont(12), fontWeight: '500', alignSelf: 'center' },
  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
});
