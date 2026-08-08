import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList, Platform, Alert, RefreshControl, StatusBar, Share, DeviceEventEmitter, Modal, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageCircleDashed } from 'lucide-react-native';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore, User } from '@/src/store/authStore';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { FollowButton } from '@/src/components/common/FollowButton';
import * as Haptics from 'expo-haptics';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { socketService } from '@/src/lib/socket';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CommentBottomSheet } from '@/components/CommentBottomSheet';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';

interface PostDetailVideoItemProps {
  uri: string;
  shouldPlay: boolean;
  isMuted: boolean;
  style: any;
  onReady: () => void;
  onLoadStart: () => void;
}

const PostDetailVideoItem = ({ uri, shouldPlay, isMuted, style, onReady, onLoadStart }: PostDetailVideoItemProps) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.muted = isMuted;
  });

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [shouldPlay, player]);

  useEffect(() => {
    onLoadStart();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        onReady();
      }
    });
    return () => sub.remove();
  }, [player, uri]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
    />
  );
};
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { ShareModal } from '@/components/ShareModal';
import { useReelsStore } from '@/src/store/reelsStore';
import { PostOptionsModal } from '@/components/PostOptionsModal';
import { Image } from 'expo-image';

interface Liker {
  _id?: string;
  id?: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  avatar?: string;
  user_reaction?: string;
  reaction?: string;
}

interface Post {
  _id?: string;
  id?: string;
  user_id?: string;
  userId?: string;
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
  is_anonymous?: boolean;
  isAnonymous?: boolean;
  user_reaction?: string;
  created_at?: string;
  createdAt?: string;
  reactionEmoji?: string;
  userReaction?: string;
  music?: { song_name: string; artist?: string };
  music_info?: { song_name: string; artist?: string };
  thumbnail_url?: string;
  video_thumbnail?: string;
  thumbnail?: string;
  likers?: Liker[];
}

// ─── Time ago helper ───
const getTimeAgo = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
};

export default function PostDetailsScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const params = useLocalSearchParams();
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const initialDataString = Array.isArray(params.initialData) ? params.initialData[0] : params.initialData;

  const router = useSafeRouter();
  const { user } = useAuthStore();

  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [activePostOwnerId, setActivePostOwnerId] = useState<string | null>(null);

  const initialData = useMemo<Post | null>(() => {
    if (!initialDataString) return null;
    try {
      const parsed = JSON.parse(initialDataString);
      return parsed;
    } catch (e) {
      return null;
    }
  }, [initialDataString]);

  const [posts, setPosts] = useState<Post[]>(initialData ? [initialData] : []);
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [likersByPostId, setLikersByPostId] = useState<Record<string, Liker[]>>({});
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<{
    id: string,
    content?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video',
    authorUsername?: string,
    authorAvatar?: string
  } | null>(null);
  const [reactingToPost, setReactingToPost] = useState<string | null>(null);
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [isFeedMuted, setIsFeedMuted] = useState(true);
  const [readyVideos, setReadyVideos] = useState<Record<string, boolean>>({});
  const [likersModalPostId, setLikersModalPostId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState<{ [key: string]: boolean }>({});

  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [optionsPostId, setOptionsPostId] = useState('');
  const [optionsIsOwn, setOptionsIsOwn] = useState(false);
  const [optionsPostData, setOptionsPostData] = useState<any>(null);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const first = viewableItems[0];
      if (first?.item) {
        const id = first.item._id || first.item.id;
        if (id) setActiveVideoId(String(id));
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  useEffect(() => {
    if (posts.length > 0) {
      const newReactions: Record<string, string> = {};
      posts.forEach(p => {
        const reaction = p.user_reaction || p.reactionEmoji || p.userReaction;
        if (reaction) {
          newReactions[(p._id || p.id) as string] = reaction;
        }
      });
      if (Object.keys(newReactions).length > 0) {
        setUserReactions(prev => ({ ...prev, ...newReactions }));
      }
    }
  }, [posts]);

  // Fetch saved posts to update isBookmarked immediately
  useEffect(() => {
    if (!postId) return;

    const checkSaved = async () => {
      try {
        const savedRes = await apiClient.get('/posts/saved');
        if (savedRes.data?.success && savedRes.data?.posts) {
          const savedIds = new Set(
            savedRes.data.posts.map((p: any) => (p._id || p.id).toString())
          );
          setPosts(prev => {
            if (prev.length === 0) return prev;

            // Update all posts' isBookmarked status
            return prev.map(p => ({
              ...p,
              isBookmarked: (p._id || p.id) ? savedIds.has((p._id || p.id)!.toString()) : false
            }));
          });
        }
      } catch {
      }
    };

    checkSaved();
  }, [postId]);

  useEffect(() => {
    if (postId) {
      loadInitialPost();
    }
  }, [postId]);

  const loadInitialPost = async () => {
    try {
      let postData: Post | null = initialData;
      let isLiked: boolean = false;
      let isBookmarked: boolean = false;

      // ⚡ Search in-memory Zustand stores if initialData is not passed
      if (!postData && postId) {
        try {
          const { useBootstrapStore } = await import('@/src/store/bootstrapStore');
          const bState = useBootstrapStore.getState();
          const pStr = postId.toString();
          const found = (bState.normalData?.feed || []).find((p: any) => (p._id || p.id)?.toString() === pStr) ||
                        (bState.anonymousData?.feed || []).find((p: any) => (p._id || p.id)?.toString() === pStr);

          if (found) {
            postData = found as Post;
          } else {
            const { useMultiScreenStore } = await import('@/src/store/multiScreenStore');
            const mState = useMultiScreenStore.getState();
            const gridFound = (mState.explore?.data?.exploreGrid || []).find((p: any) => (p._id || p.id)?.toString() === pStr) ||
                              (mState.profile?.data?.userPosts || []).find((p: any) => (p._id || p.id)?.toString() === pStr);
            if (gridFound) postData = gridFound as Post;
          }
        } catch {}
      }

      if (postData) {
        // 🚀 INSTANT DISPLAY (<10ms): Use cached postData immediately
        isLiked = postData.is_liked || postData.isLiked || false;
        isBookmarked = postData.is_bookmarked || postData.isBookmarked || false;
        setPosts([{ ...postData, isLiked, isBookmarked }]);
        setLoading(false);

        // Silent background sync
        Promise.all([
          apiClient.get('/posts/user/liked-posts'),
          apiClient.get('/posts/saved')
        ]).then(([likedRes, savedRes]) => {
          let updatedIsLiked = isLiked;
          let updatedIsBookmarked = isBookmarked;

          if (likedRes.data?.success && likedRes.data?.likedPostIds) {
            const likedSet = new Set(
              likedRes.data.likedPostIds.map((id: any) => id.toString())
            );
            updatedIsLiked = likedSet.has((postData?._id || postData?._id || postData?.id)?.toString() || '');
          }

          if (savedRes.data?.success && savedRes.data?.posts) {
            const savedIds = new Set(
              savedRes.data.posts.map((p: any) => (p._id || p.id).toString())
            );
            updatedIsBookmarked = savedIds.has((postData?._id || postData?.id)?.toString() || '');
          }

          setPosts(prev => prev.map(p => ({
            ...p,
            isLiked: updatedIsLiked,
            isBookmarked: updatedIsBookmarked
          })));
        }).catch(() => {});
      } else {
        // Fallback: Fetch single post from API and display IMMEDIATELY
        setLoading(true);
        const res = await apiClient.get(`/posts/${postId}`);
        const fetched: any = res.data?.data?.post || res.data?.data || res.data?.post;
        if (!fetched) throw new Error('Post not found');

        const activePost: Post = fetched as Post;
        postData = activePost;
        isLiked = !!(activePost.is_liked || activePost.isLiked);
        isBookmarked = !!(activePost.is_bookmarked || activePost.isBookmarked);

        // Render immediately
        setPosts([{ ...activePost, isLiked, isBookmarked }]);
        setLoading(false);

        // Silent background check
        Promise.all([
          apiClient.get('/posts/user/liked-posts'),
          apiClient.get('/posts/saved')
        ]).then(([likedRes, savedRes]) => {
          let updatedIsLiked = isLiked;
          let updatedIsBookmarked = isBookmarked;

          if (likedRes.data?.success && likedRes.data?.likedPostIds) {
            const likedSet = new Set(
              likedRes.data.likedPostIds.map((id: any) => id.toString())
            );
            updatedIsLiked = likedSet.has((activePost._id || activePost.id)?.toString() || '');
          }

          if (savedRes.data?.success && savedRes.data?.posts) {
            const savedIds = new Set(
              savedRes.data.posts.map((p: any) => (p._id || p.id).toString())
            );
            updatedIsBookmarked = savedIds.has((activePost._id || activePost.id)?.toString() || '');
          }

          setPosts(prev => prev.map(p => ({
            ...p,
            isLiked: updatedIsLiked,
            isBookmarked: updatedIsBookmarked
          })));
        }).catch(() => {});
      }

      if (!postData) return;

      const formattedPost: Post = {
        ...postData,
        isLiked,
        isBookmarked,
        likes_count: postData.likes_count || 0
      };

      if (!initialData) {
        setPosts([formattedPost]);
      }

      const pid = postData?._id || postData?.id;
      if (pid) {
        if (postData?.likers && Array.isArray(postData.likers)) {
          setLikersByPostId(prev => ({ ...prev, [pid]: postData.likers as Liker[] }));
        } else if (formattedPost.likes_count > 0) {
          // Fetch likers in background without blocking
          setTimeout(() => fetchLikers(pid), 0);
        }
      }

      const authorId = postData.user?.id || postData.user?._id || postData.author?.id || postData.author?._id;
      if (authorId) {
        // Fetch user posts in background without blocking
        setTimeout(() => fetchUserPosts(authorId, 1, true), 0);
      }
    } catch (error) {
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

      const filteredPosts = newPosts.filter((p) => (p._id || p.id) !== postId);

      try {
        const [likedRes, savedRes] = await Promise.all([
          apiClient.get('/posts/user/liked-posts'),
          apiClient.get('/posts/saved')
        ]);

        if (likedRes.data?.success && likedRes.data?.likedPostIds && savedRes.data?.success && savedRes.data?.posts) {
          const likedSet = new Set(
            likedRes.data.likedPostIds.map((id: any) => id.toString())
          );
          const savedIds = new Set(
            savedRes.data.posts.map((p: any) => (p._id || p.id).toString())
          );
          newPosts = filteredPosts.map((p) => ({
            ...p,
            isLiked: likedSet.has((p._id || p.id)?.toString() || ''),
            isBookmarked: savedIds.has((p._id || p.id)?.toString() || ''),
            likes_count: p.likes_count || 0
          }));
        } else if (likedRes.data?.success && likedRes.data?.likedPostIds) {
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

      newPosts.forEach((p) => {
        const pid = p._id || p.id;
        const likersList = p.likers;
        if (pid) {
          if (likersList && Array.isArray(likersList)) {
            setLikersByPostId(prev => ({ ...prev, [pid]: likersList }));
          } else if (p.likes_count > 0) {
            fetchLikers(pid);
          }
        }
      });
    } catch (error) {
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
    }
  };

  const handleLike = async (pid: string, isLiked: boolean, reaction?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const postIndex = posts.findIndex(p => (p._id || p.id) === pid);
    if (postIndex === -1) return;

    const post = posts[postIndex];
    const isChangingReaction = reaction && isLiked;
    const newIsLiked = isChangingReaction ? true : !isLiked;

    let newCount = post.likes_count || 0;
    if (!isChangingReaction) {
      newCount = newIsLiked ? newCount + 1 : Math.max(newCount - 1, 0);
    }

    const originalPost = { ...post };

    const updatedPosts = [...posts];
    updatedPosts[postIndex] = {
      ...post,
      isLiked: newIsLiked,
      likes_count: newCount
    };
    setPosts(updatedPosts);

    if (reaction) {
      setUserReactions(prev => ({ ...prev, [pid]: reaction }));
    } else if (!newIsLiked) {
      setUserReactions(prev => {
        const copy = { ...prev };
        delete copy[pid];
        return copy;
      });
    }

    try {
      if (isChangingReaction) {
        await apiClient.post(`/posts/${pid}/like`, { reaction });
      } else if (isLiked) {
        await apiClient.delete(`/posts/${pid}/like`);
      } else {
        await apiClient.post(`/posts/${pid}/like`, { reaction: reaction || '❤️' });
      }

      DeviceEventEmitter.emit('post:liked:local', {
        postId: pid,
        isLiked: newIsLiked,
        likesCount: newCount,
        reaction: newIsLiked ? (reaction || '❤️') : undefined
      });

      if (newCount > 0) {
        fetchLikers(pid);
      } else {
        setLikersByPostId(prev => ({ ...prev, [pid]: [] }));
      }
    } catch (error) {
      const revertPosts = [...posts];
      revertPosts[postIndex] = originalPost;
      setPosts(revertPosts);
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
      setPosts(prev => prev.map(p => {
        if ((p._id || p.id) === pid) {
          return { ...p, isBookmarked: isBookmarked };
        }
        return p;
      }));
    }
  };

  useEffect(() => {
    const likeSub = DeviceEventEmitter.addListener('post:liked:local', (data: { postId: string, isLiked: boolean, likesCount?: number, reaction?: string }) => {
      if (data.reaction) {
        setUserReactions(prev => ({ ...prev, [data.postId]: data.reaction as string }));
      } else if (data.isLiked === false) {
        setUserReactions(prev => {
          const updated = { ...prev };
          delete updated[data.postId];
          return updated;
        });
      }

      setLikersByPostId(prev => {
        const currentLikers = prev[data.postId];
        if (currentLikers === undefined) return prev;
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) return prev;
        let updatedLikers = [...currentLikers];
        const myLikerIndex = updatedLikers.findIndex((l: any) => String(l.user_id) === String(currentUser._id || currentUser.id) || String(l._id) === String(currentUser._id || currentUser.id));
        if (data.isLiked) {
          const newLikerObj = {
            _id: currentUser._id || currentUser.id,
            user_id: currentUser._id || currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            reaction: data.reaction || '❤️'
          };
          if (myLikerIndex > -1) {
            updatedLikers[myLikerIndex] = newLikerObj;
          } else {
            updatedLikers.unshift(newLikerObj);
          }
        } else {
          if (myLikerIndex > -1) {
            updatedLikers.splice(myLikerIndex, 1);
          }
        }
        return {
          ...prev,
          [data.postId]: updatedLikers
        };
      });
      setPosts(prev => prev.map(p => {
        if ((p._id || p.id) === data.postId) {
          const currentUser = useAuthStore.getState().user;
          let updatedLikers = p.likers ? [...p.likers] : [];
          if (currentUser) {
            const myLikerIndex = updatedLikers.findIndex((l: any) => String(l.user_id) === String(currentUser._id || currentUser.id) || String(l._id) === String(currentUser._id || currentUser.id));
            if (data.isLiked) {
              const newLikerObj = {
                _id: currentUser._id || currentUser.id,
                user_id: currentUser._id || currentUser.id,
                username: currentUser.username,
                avatar: currentUser.avatar,
                reaction: data.reaction || '❤️'
              };
              if (myLikerIndex > -1) {
                updatedLikers[myLikerIndex] = newLikerObj;
              } else {
                updatedLikers.unshift(newLikerObj);
              }
            } else {
              if (myLikerIndex > -1) {
                updatedLikers.splice(myLikerIndex, 1);
              }
            }
          }
          return {
            ...p,
            isLiked: data.isLiked,
            likes_count: data.likesCount !== undefined ? data.likesCount : p.likes_count,
            user_reaction: data.reaction || p.user_reaction,
            likers: updatedLikers,
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

  const handleShare = async (pid: string, content?: string, mediaUrl?: string, mediaType?: 'image' | 'video', authorUsername?: string, authorAvatar?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedPost({ id: pid, content, mediaUrl, mediaType, authorUsername, authorAvatar });
    setShareModalVisible(true);
  };

  const handleExternalShare = async (pid: string, content?: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await Share.share({
        message: `Check out this post on AnuFy: ${content || ''}`,
        url: `https://anufy.app/post/${pid}`
      });

      if (result.action === Share.sharedAction) {
        await apiClient.post(`/posts/${pid}/share`);
      }
    } catch (error) {
    }
  };

  const handleDeletePost = (pid: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setPosts(prev => prev.filter(p => (p._id || p.id) !== pid));
            DeviceEventEmitter.emit('post:deleted:local', { postId: pid });
            try {
              await apiClient.delete(`/posts/${pid}`);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete post. Please try again.');
              loadInitialPost();
            }
          }
        }
      ]
    );
  };

  const handlePostOptions = (pid: string, isOwn: boolean) => {
    const postData = posts.find(p => (p._id || p.id) === pid);
    setOptionsPostId(pid);
    setOptionsIsOwn(isOwn);
    setOptionsPostData(postData);
    setOptionsModalVisible(true);
  };

  const renderPost = ({ item }: { item: Post }) => {
    const pid = (item._id || item.id) as string;
    const author = item.author || item.user;
    const authorId = item.user_id || item.userId || author?._id || author?.id;
    const isOwn = !!(user?.id && authorId && (authorId === user.id || authorId?.toString() === user.id?.toString()));
    const postIsAnon = item.is_anonymous || item.isAnonymous;

    const displayUsername = postIsAnon
      ? (isOwn ? 'You (Ghost)' : 'Anonymous Ghost')
      : (author?.username || 'AnuFy_User');

    const displayAvatar = resolveAvatarUrl(
      author?.avatar_url || author?.avatar,
      author?.username
    );

    const { isFollowing, isPending, isLoading, toggleFollow } = useFollowStatus(authorId || '', {
      isFollowing: !!((item as any).is_following || (item as any).isFollowing),
    });
    const isFollowingActive = isFollowing || isPending;

    const mediaUrl = item.media_urls?.[0] || item.media?.[0]?.url;
    const resolvedMedia = resolveMediaUrl(mediaUrl);
    const isVideo = item.media_type === 'video';
    const thumbnailUrl = item.thumbnail_url || item.video_thumbnail || item.thumbnail || mediaUrl;
    const resolvedThumb = resolveMediaUrl(thumbnailUrl);

    return (
      <View>
        <View style={[styles.postCard, postIsAnon && { backgroundColor: '#0A0A0A' }]}>
          <View style={styles.postHeader}>
          <TouchableOpacity
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: verticalScale(2) }}
            disabled={postIsAnon && !isOwn}
            onPress={() => router.push(`/user/${author?.username}`)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={{ uri: displayAvatar }}
                style={[styles.postAvatar, postIsAnon && { borderColor: '#FFF' }]}
                contentFit="cover"
                cachePolicy="disk"
                transition={150}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: scale(6) }}>
                <Text style={[styles.postUsername, postIsAnon && { color: '#FFF' }]}>{displayUsername}</Text>
                {!postIsAnon && author?.is_verified && (
                  <View style={{ marginLeft: 2 }}>
                    <VerifiedTick badgeType={author?.badge_type} size={14} />
                  </View>
                )}

                {!isOwn && !postIsAnon && (
                  <FollowButton
                    targetUserId={authorId || ''}
                    onToggle={toggleFollow}
                    isLoading={isLoading}
                    variant="transparent"
                    size="sm"
                    style={styles.followButtonHeader}
                    textStyle={styles.followButtonHeaderText}
                  />
                )}
              </View>
            </View>
            
            <View style={{ marginTop: verticalScale(2) }}>
              {item.location?.name && <Text style={[styles.postLocation, postIsAnon && { color: '#888' }]}>{item.location.name}</Text>}

              {(item.music?.song_name || item.music_info?.song_name) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4), marginTop: verticalScale(2) }}>
                  <Ionicons name="musical-notes" size={11} color={COLORS.primary} />
                  <Text style={[styles.musicInfoText, postIsAnon && { color: '#888' }]} numberOfLines={1}>
                    {item.music?.song_name || item.music_info?.song_name} {(item.music?.artist || item.music_info?.artist) ? `- ${item.music?.artist || item.music_info?.artist}` : ''}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
            <TouchableOpacity
              onPress={() => handleBookmark(pid, !!item.isBookmarked)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons
                name={item.isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={item.isBookmarked ? COLORS.secondary : (postIsAnon ? '#FFF' : COLORS.text)}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handlePostOptions(pid, isOwn)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={postIsAnon ? '#FFF' : COLORS.subtitle} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (isVideo) {
              const videoPosts = posts.filter(p => p.media_type === 'video');
              const currentIdx = videoPosts.findIndex(p => (p._id || p.id) === pid);
              const formattedVideoList = videoPosts.map(p => {
                const innerId = p._id || p.id;
                const mUrl = p.media_urls?.[0] || p.media?.[0]?.url;
                const tUrl = p.thumbnail_url || p.video_thumbnail || p.thumbnail;
                const react = userReactions[innerId as string] || p.user_reaction || p.userReaction;
                const liked = !!(react || p.isLiked);
                return {
                  ...p,
                  id: String(innerId),
                  _id: String(innerId),
                  isLiked: liked,
                  is_liked: liked,
                  user_reaction: react,
                  userReaction: react,
                  videoUrl: resolveMediaUrl(mUrl),
                  video_url: resolveMediaUrl(mUrl),
                  thumbnail_url: resolveMediaUrl(tUrl),
                  thumbnail: resolveMediaUrl(tUrl),
                  author: p.author || p.user
                };
              });

              const targetList = [
                ...formattedVideoList.slice(currentIdx),
                ...formattedVideoList.slice(0, currentIdx)
              ];

              useReelsStore.getState().setActiveReelData(targetList[0]);
              useReelsStore.getState().setPreloadedReels(targetList);

              router.push(`/reels/${pid}`);
            }
          }}
          onLongPress={() => handlePostOptions(pid, isOwn)}
          style={{ position: 'relative' }}
        >
          {resolvedMedia && (
            isVideo ? (
              <View style={styles.postImage}>
                <PostDetailVideoItem
                  uri={resolvedMedia}
                  shouldPlay={activeVideoId === String(pid)}
                  isMuted={isFeedMuted}
                  style={StyleSheet.absoluteFill}
                  onReady={() => {
                    setReadyVideos(prev => ({ ...prev, [pid]: true }));
                  }}
                  onLoadStart={() => {
                    setReadyVideos(prev => ({ ...prev, [pid]: false }));
                  }}
                />
                {(!readyVideos[pid] || activeVideoId !== String(pid)) && (
                  <Image
                    source={{ uri: resolvedThumb }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="disk"
                    transition={150}
                  />
                )}
              </View>
            ) : (
              <Image
                source={{ uri: resolvedMedia }}
                style={styles.postImage}
                contentFit="cover"
                cachePolicy="disk"
                transition={200}
              />
            )
          )}

          {isVideo && (
            <TouchableOpacity
              style={styles.globalMuteButton}
              onPress={(e) => {
                e.stopPropagation();
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsFeedMuted(!isFeedMuted);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isFeedMuted ? "volume-mute" : "volume-high"}
                size={18}
                color="#FFF"
              />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <View style={styles.actionPillContainer}>
          <TouchableOpacity
            style={styles.pillActionBtn}
            onPress={() => handleLike(pid, !!item.isLiked)}
            activeOpacity={0.7}
          >
            {userReactions[pid] ? (
              <Text style={{ fontSize: 18 }}>{userReactions[pid]}</Text>
            ) : (
              <Ionicons
                name={item.isLiked ? 'heart' : 'heart-outline'}
                size={24}
                color={item.isLiked ? COLORS.error : (postIsAnon ? '#FFF' : COLORS.text)}
              />
            )}
            <Text style={[styles.pillActionText, { color: postIsAnon ? '#FFF' : COLORS.text }]}>
              {Math.max(item.likes_count || 0, likersByPostId[pid]?.length || item.likers?.length || 0)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pillActionBtn, { paddingLeft: 0 }]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setReactingToPost(reactingToPost === pid ? null : pid);
            }}
          >
            <MaterialCommunityIcons
              name={reactingToPost === pid ? 'emoticon' : 'emoticon-outline'}
              size={24}
              color={reactingToPost === pid ? COLORS.primary : (postIsAnon ? '#FFF' : COLORS.text)}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pillActionBtn}
            onPress={() => {
              setActivePostId(pid);
              setActivePostOwnerId(authorId || null);
              setCommentModalVisible(true);
            }}
          >
            <MessageCircleDashed size={22} color={postIsAnon ? '#FFF' : COLORS.text} />
            <Text style={[styles.pillActionText, { color: postIsAnon ? '#FFF' : COLORS.text }]}>
              {item.comments_count || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pillActionBtn}
            onPress={() => handleShare(
              pid,
              item.content || item.caption,
              mediaUrl,
              item.media_type as any,
              author?.username,
              author?.avatar_url || author?.avatar
            )}
          >
            <Ionicons name="arrow-redo-outline" size={22} color={postIsAnon ? '#FFF' : COLORS.text} />
          </TouchableOpacity>

          {postIsAnon && !isOwn && (
            <TouchableOpacity
              style={styles.pillActionBtn}
              onPress={() => {
                router.push({
                  pathname: '/chat/new',
                  params: {
                    recipientId: String(authorId),
                    username: displayUsername,
                    isAnonymousChat: 'true',
                  },
                } as any);
              }}
            >
              <MessageCircleDashed size={22} color="#FF69B4" />
              <Text style={[styles.pillActionText, { color: '#FF69B4' }]}>DM</Text>
            </TouchableOpacity>
          )}
        </View>

        {reactingToPost === pid && (
          <>
            <Pressable
              style={styles.backdrop}
              onPress={() => setReactingToPost(null)}
            />
            <View style={[styles.reactionBarContainer, { zIndex: 100 }]}>
              {['❤️', '😂', '😮', '😢', '🔥', '👏'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleLike(pid, !!item.isLiked, emoji);
                    setReactingToPost(null);
                  }}
                  style={styles.reactionEmojiBtn}
                  activeOpacity={0.6}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Likers & Timeago (INSIDE Card) */}
        <View style={{ paddingHorizontal: scale(16), paddingTop: verticalScale(2), paddingBottom: verticalScale(8) }}>
          {(() => {
            const likers = likersByPostId[pid] !== undefined ? likersByPostId[pid] : item.likers;
            if (!likers || likers.length === 0 || postIsAnon) return null;
            const shown = likers.slice(0, 2);
            const extraCount = likers.length - 2;

            // Calculate top 3 reactions from likers list
            const counts: { [emoji: string]: number } = {};
            likers.forEach((l: any) => {
              const r = l.reaction || '❤️';
              counts[r] = (counts[r] || 0) + 1;
            });
            const topReactions = Object.keys(counts)
              .sort((a, b) => counts[b] - counts[a])
              .slice(0, 3);

            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: verticalScale(2) }}>
                <TouchableOpacity onPress={() => setLikersModalPostId(pid)}>
                  <Text style={[styles.likersLabel, { marginBottom: 0, marginRight: scale(4) }]}>Liked by</Text>
                </TouchableOpacity>
                {topReactions.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: scale(6) }}>
                    {topReactions.map((emoji, idx) => (
                      <View 
                        key={emoji} 
                        style={{ 
                          width: scale(16), 
                          height: scale(16), 
                          borderRadius: scale(8), 
                          backgroundColor: COLORS.surface, 
                          justifyContent: 'center', 
                          alignItems: 'center',
                          marginLeft: idx === 0 ? 0 : -scale(5),
                          zIndex: 10 - idx,
                          borderWidth: 1,
                          borderColor: COLORS.background
                        }}
                      >
                        <Text style={{ fontSize: moderateFont(9), lineHeight: moderateFont(11) }}>{emoji}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {shown.map((liker: any, idx: number) => (
                  <React.Fragment key={idx}>
                    <TouchableOpacity
                      onPress={() => router.push(`/user/${liker.username}`)}
                      style={styles.likerItem}
                    >
                      <Text style={styles.likerName}>{liker.username || liker.full_name}</Text>
                    </TouchableOpacity>
                    {idx < shown.length - 1 && extraCount <= 0 && (
                      <Text style={styles.likersAnd}> & </Text>
                    )}
                    {idx < shown.length - 1 && extraCount > 0 && (
                      <Text style={styles.likersComma}>, </Text>
                    )}
                  </React.Fragment>
                ))}
                {extraCount > 0 && (
                  <>
                    <Text style={styles.likersAnd}> and </Text>
                    <TouchableOpacity onPress={() => setLikersModalPostId(pid)}>
                      <Text style={styles.moreLikers}>{extraCount} more</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })()}

          {/* Caption Inside Card */}
          {(item.content || item.caption || (item as any).title) ? (
            <TouchableOpacity
              onPress={() => setIsCaptionExpanded(prev => ({ ...prev, [pid]: !prev[pid] }))}
              activeOpacity={0.7}
            >
              <Text 
                style={[
                  styles.captionText, 
                  postIsAnon && { color: '#333' }
                ]}
                numberOfLines={isCaptionExpanded[pid] ? undefined : 1}
              >
                <Text style={[styles.boldText, postIsAnon && { color: '#000' }]}>
                  {displayUsername}{' '}
                </Text>
                {item.content || item.caption || (item as any).title}
              </Text>
            </TouchableOpacity>
          ) : null}

          {item.created_at && (
            <Text style={styles.timeAgo}>
              {getTimeAgo(item.created_at)}
            </Text>
          )}
        </View>
      </View>
    </View>
    );
  };

  const mainPostIsAnonymous = posts[0]?.is_anonymous || posts[0]?.isAnonymous || false;

  return (
    <SafeAreaView style={[styles.container, mainPostIsAnonymous && { backgroundColor: COLORS.black }]}>
      <StatusBar barStyle={mainPostIsAnonymous ? "light-content" : "dark-content"} />
      <View style={[styles.header, mainPostIsAnonymous && { backgroundColor: COLORS.black, borderBottomColor: '#1A1A1A' }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={mainPostIsAnonymous ? '#FFF' : COLORS.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, mainPostIsAnonymous && { color: '#FFF' }]}>Posts</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item, index) => (item._id || item.id || String(index)) as string}
        renderItem={renderPost}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={() => {
          const firstPost = posts[0];
          const authorId = firstPost?.author?._id || firstPost?.author?.id || firstPost?.user?._id || firstPost?.user?.id;
          if (authorId) fetchUserPosts(String(authorId), page + 1);
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={mainPostIsAnonymous ? '#FFF' : COLORS.secondary} style={{ margin: 20 }} /> : null}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerNode}>
              <ActivityIndicator size="large" color={mainPostIsAnonymous ? '#FFF' : COLORS.secondary} />
            </View>
          ) : null
        }
      />

      <Modal
        visible={!!likersModalPostId}
        transparent
        animationType="slide"
        onRequestClose={() => setLikersModalPostId(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLikersModalPostId(null)}
        >
          <View style={styles.likersModalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.likersModalTitle}>Liked by</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {(() => {
                const modalPost = posts.find(p => (p._id || p.id) === likersModalPostId);
                const likersList = likersModalPostId
                  ? (likersByPostId[likersModalPostId] !== undefined
                    ? likersByPostId[likersModalPostId]
                    : modalPost?.likers ?? [])
                  : [];
                return likersList.map((liker: any, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.likersModalRow}
                    onPress={() => {
                      setLikersModalPostId(null);
                      router.push(`/user/${liker.username}`);
                    }}
                  >
                    <Image
                      source={{ uri: resolveAvatarUrl(liker.avatar || liker.avatar_url || liker.avatarUrl || liker.profile_picture || liker.profilePicture) }}
                      style={styles.likersModalAvatar}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.likersModalUsername}>{liker.username || liker.full_name}</Text>
                      {liker.full_name ? <Text style={styles.likersModalFullname}>{liker.full_name}</Text> : null}
                    </View>
                    {(liker.reaction === '❤️' || liker.reaction === '👍' || !liker.reaction) ? (
                      <MaterialCommunityIcons name="thumb-up" size={22} color="#FF3040" />
                    ) : (
                      <Text style={{ fontSize: 22 }}>{liker.reaction}</Text>
                    )}
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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
        authorUsername={selectedPost?.authorUsername}
        authorAvatar={selectedPost?.authorAvatar}
      />

      <PostOptionsModal
        isVisible={optionsModalVisible}
        onClose={() => setOptionsModalVisible(false)}
        postId={optionsPostId}
        isOwner={optionsIsOwn}
        isPinnedInitial={optionsPostData?.is_pinned}
        commentsDisabledInitial={optionsPostData?.comments_disabled}
        hideLikeCountInitial={optionsPostData?.hide_like_count}
        onDeletePost={handleDeletePost}
        onPinToggle={(postId, pinned) => {
          setPosts(prev => prev.map(p => {
            if ((p._id || p.id) === postId) {
              return { ...p, is_pinned: pinned };
            }
            return p;
          }));
        }}
        onCommentsToggle={(postId, disabled) => {
          setPosts(prev => prev.map(p => {
            if ((p._id || p.id) === postId) {
              return { ...p, comments_disabled: disabled };
            }
            return p;
          }));
        }}
        onLikesToggle={(postId, hidden) => {
          setPosts(prev => prev.map(p => {
            if ((p._id || p.id) === postId) {
              return { ...p, hide_like_count: hidden };
            }
            return p;
          }));
        }}
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
        onCommentAdded={(count: number) => {
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

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    paddingBottom: verticalScale(14),
    backgroundColor: COLORS.background,
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text },
  postCard: {
    backgroundColor: COLORS.background,
    marginBottom: 0,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: moderateScale(16), paddingRight: moderateScale(6), paddingVertical: moderateScale(8) },
  postUser: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  postAvatar: { width: moderateScale(30), height: moderateScale(30), borderRadius: moderateScale(15), borderWidth: 1.5, borderColor: COLORS.border },
  postUsername: { fontSize: moderateFont(14), fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  followButtonHeader: {
    marginLeft: scale(10),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    backgroundColor: 'transparent',
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: '#CCC',
  },
  followButtonHeaderText: {
    color: COLORS.text,
    fontSize: moderateFont(12),
    fontWeight: '600',
  },
  postLocation: { fontSize: moderateFont(12), color: COLORS.subtitle, marginTop: verticalScale(2) },
  musicInfoText: {
    fontSize: moderateFont(11),
    color: COLORS.subtitle,
    fontWeight: '400',
    maxWidth: scale(200),
  },
  postImage: {
    width: SIZES.width,
    height: SIZES.width * 1.25,
    backgroundColor: COLORS.surface,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  globalMuteButton: {
    position: 'absolute',
    bottom: 8,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  actionPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    marginTop: verticalScale(8),
    marginLeft: scale(16),
    gap: scale(16),
  },
  pillActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(4),
  },
  pillDivider: {
    width: 0,
  },
  pillActionText: {
    fontSize: moderateFont(14),
    fontWeight: '700',
  },
  reactionBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: moderateScale(24),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    marginTop: verticalScale(-2),
    marginLeft: scale(16),
    gap: scale(12),
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F0EFF5',
  },
  reactionEmojiBtn: {
    padding: scale(2),
  },
  backdrop: {
    position: 'absolute',
    top: -SIZES.height,
    bottom: -SIZES.height,
    left: -SIZES.width,
    right: -SIZES.width,
    backgroundColor: 'transparent',
    zIndex: 99,
  },
  postFooter: { paddingHorizontal: scale(16), paddingBottom: verticalScale(8), paddingTop: 0, marginBottom: 0 },
  captionText: {
    fontSize: moderateFont(14),
    color: COLORS.text,
    lineHeight: moderateScale(20),
  },
  boldText: {
    fontWeight: '700',
    color: COLORS.text,
  },
  boldUsername: { fontWeight: '800', color: '#3B2E7A', fontSize: moderateFont(14) },
  timeAgo: { color: COLORS.subtitle, fontSize: moderateFont(13), marginTop: verticalScale(-3) },

  likersContainer: { marginTop: verticalScale(8) },
  likersLabel: { color: COLORS.subtitle, fontSize: moderateFont(13), fontWeight: '500' },
  likersList: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(4) },
  likerItem: { paddingVertical: verticalScale(1) },
  likerName: { color: COLORS.text, fontSize: moderateFont(13), fontWeight: '700' },
  likersAnd: { color: COLORS.subtitle, fontSize: moderateFont(13), fontWeight: '400', alignSelf: 'center' },
  likersComma: { color: COLORS.subtitle, fontSize: moderateFont(13), fontWeight: '400', alignSelf: 'center' },
  moreLikers: { color: COLORS.primary, fontSize: moderateFont(13), fontWeight: '700', alignSelf: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  likersModalSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), paddingTop: verticalScale(12), paddingHorizontal: scale(20), maxHeight: '75%' },
  modalHandle: { width: scale(40), height: verticalScale(4), backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: verticalScale(16) },
  likersModalTitle: { fontSize: moderateFont(17), fontWeight: '700', color: COLORS.text, marginBottom: verticalScale(16) },
  likersModalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(8), gap: scale(10) },
  likersModalAvatar: { width: moderateScale(36), height: moderateScale(36), borderRadius: moderateScale(18), backgroundColor: COLORS.surface },
  likersModalUsername: { fontSize: moderateFont(12), fontWeight: '700', color: COLORS.text },
  likersModalFullname: { fontSize: moderateFont(11), color: COLORS.subtitle, marginTop: verticalScale(1) },

  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
});
