import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Platform, Share, Alert, Modal, ScrollView, Pressable, PanResponder, Image as RNImage } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, createVideoPlayer } from 'expo-video';
import { useAuthStore } from '@/src/store/authStore';
import { DeleteEngine } from '@/src/engines/DeleteEngine';
import { FollowButton } from '@/src/components/common/FollowButton';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';

/**
 * SmartPostImage — dynamically reads real image dimensions so photos
 * render at their true aspect ratio without cropping or top/bottom cuts.
 * Clamps ratio between 0.75 (3:4 portrait) and 1.91 (16:9 landscape).
 */
function SmartPostImage({ uri, style }: { uri: string; style?: any }) {
  const [aspectRatio, setAspectRatio] = useState<number>(1);

  useEffect(() => {
    if (!uri) return;
    RNImage.getSize(
      uri,
      (w, h) => {
        if (!w || !h) return;
        const rawRatio = w / h;
        const clampedRatio = Math.min(Math.max(rawRatio, 0.75), 1.91);
        setAspectRatio(clampedRatio);
      },
      () => {}
    );
  }, [uri]);

  return (
    <Image
      source={{ uri }}
      onLoad={(evt) => {
        const { width, height } = evt?.source || {};
        if (width && height) {
          const rawRatio = width / height;
          const clampedRatio = Math.min(Math.max(rawRatio, 0.75), 1.91);
          setAspectRatio(clampedRatio);
        }
      }}
      style={[
        style,
        {
          width: '100%',
          aspectRatio: aspectRatio,
        },
      ]}
      contentFit="cover"
      cachePolicy="disk"
      transition={200}
    />
  );
}

interface HomeFeedVideoItemProps {
  uri: string;
  shouldPlay: boolean;
  isMuted: boolean;
  style: any;
  onReady: () => void;
  onLoadStart: () => void;
}

const HomeFeedVideoItem = ({ uri, shouldPlay, isMuted, style, onReady, onLoadStart }: HomeFeedVideoItemProps) => {
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
      key={uri}
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
    />
  );
};
import { useNotificationStore } from '@/src/store/notificationStore';
import { useFeedStore } from '@/src/store/feedStore';
import { apiClient } from '@/src/api/client';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageCircleDashed, Forward } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/src/theme/colors';
import { Dimensions } from 'react-native';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { socketService } from '@/src/lib/socket';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { DeviceEventEmitter } from 'react-native';
import { ShareModal } from '@/components/ShareModal';
import { CommentBottomSheet } from '@/components/CommentBottomSheet';
import { useReelsStore } from '@/src/store/reelsStore';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { ActiveGhostRoomsModal } from '@/components/profile/ActiveGhostRoomsModal';
import { PostOptionsModal } from '@/components/PostOptionsModal';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';

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

// ─── Inline Follow Button (uses useFollowStatus hook for Zustand + Socket sync) ───
interface PostAuthorFollowButtonProps {
  authorId: string;
  initialFollowing?: boolean;
  styles: any;
  COLORS: any;
}
const PostAuthorFollowButton: React.FC<PostAuthorFollowButtonProps> = ({ authorId, initialFollowing }) => {
  const { isFollowing, toggleFollow, isLoading } = useFollowStatus(authorId, { isFollowing: initialFollowing });

  return (
    <FollowButton
      targetUserId={authorId}
      onToggle={toggleFollow}
      isLoading={isLoading}
      variant="primary"
      size="sm"
      style={[
        { marginLeft: scale(4), borderRadius: moderateScale(8) },
        isFollowing ? {
          backgroundColor: '#F3F4F6',
          borderWidth: 1,
          borderColor: '#E5E7EB'
        } : {
          borderRadius: moderateScale(8)
        }
      ]}
      textStyle={[
        { fontSize: moderateFont(12), fontWeight: '600' },
        isFollowing ? { color: '#374151' } : {}
      ]}
    />
  );
};

interface SuggestedUserCardProps {
  sugUser: any;
  styles: any;
  COLORS: any;
  onNavigateProfile: (username: string) => void;
}
const SuggestedUserCard: React.FC<SuggestedUserCardProps> = ({ sugUser, styles, COLORS, onNavigateProfile }) => {
  const uid = sugUser._id || sugUser.id;
  const { toggleFollow, isLoading } = useFollowStatus(uid, { isFollowing: !!sugUser.is_following });
  return (
    <View style={{
      width: scale(140),
      backgroundColor: COLORS.surface,
      padding: moderateScale(12),
      borderRadius: moderateScale(16),
      alignItems: 'center',
      borderWidth: 1,
      borderColor: COLORS.border,
    }}>
      <TouchableOpacity onPress={() => onNavigateProfile(sugUser.username)}>
        <Image
          source={{ uri: resolveAvatarUrl(sugUser.avatar || sugUser.avatar_url || sugUser.profileImage, sugUser.username) }}
          style={{
            width: scale(56),
            height: scale(56),
            borderRadius: scale(28),
            borderWidth: 1.5,
            borderColor: COLORS.primary,
            marginBottom: verticalScale(8)
          }}
          contentFit="cover"
        />
      </TouchableOpacity>
      <Text style={{ fontSize: moderateFont(13), fontWeight: '700', color: COLORS.text, textAlign: 'center', width: '100%' }} numberOfLines={1}>
        {sugUser.name || sugUser.full_name || sugUser.username}
      </Text>
      <Text style={{ fontSize: moderateFont(11), color: COLORS.subtitle, marginBottom: verticalScale(10), textAlign: 'center', width: '100%' }} numberOfLines={1}>
        @{sugUser.username}
      </Text>
      <FollowButton
        targetUserId={uid}
        onToggle={toggleFollow}
        isLoading={isLoading}
        variant="primary"
        size="md"
        style={{ width: '100%', borderRadius: moderateScale(20), paddingVertical: verticalScale(6) }}
        textStyle={{ fontSize: moderateFont(12) }}
      />
    </View>
  );
};

export default function HomeScreen() {
  const COLORS = useAppTheme();
  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);
  const router = useRouter();
  const { user, token } = useAuthStore();
  const isAnonymous = user?.isAnonymousMode;
  const { unreadNotificationsCount } = useNotificationStore();

  // 🚀 Feed cache for instant toggle
  const cachedPosts = useFeedStore((s) => s.cachedPosts) || [];
  const setCachedPosts = useFeedStore((s) => s.setCachedPosts);
  const cachedAnonymousPosts = useFeedStore((s) => s.cachedAnonymousPosts) || [];
  const setCachedAnonymousPosts = useFeedStore((s) => s.setCachedAnonymousPosts);

  const [posts, setPosts] = useState<any[]>(() => isAnonymous ? cachedAnonymousPosts : cachedPosts);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(posts.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [likersByPostId, setLikersByPostId] = useState<Record<string, any[]>>({});
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const initialFetchDone = React.useRef(false);
  const isFirstMount = useRef(true);
  const hasFetchedOnMount = useRef(false);
  // 🛡️ STALE FETCH GUARD: Each fetch gets a unique ID.
  // If mode switches mid-flight, the old fetch's ID won't match activeFetchId and results are dropped.
  const activeFetchId = useRef(0);
  // 🛡️ Track the authoritative mode at all times (ref = no closure staleness)
  const activeModeRef = useRef(!!isAnonymous);

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
    mediaType?: 'image' | 'video',
    authorUsername?: string,
    authorAvatar?: string
  } | null>(null);

  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [optionsPostId, setOptionsPostId] = useState('');
  const [optionsIsOwn, setOptionsIsOwn] = useState(false);
  const [optionsPostData, setOptionsPostData] = useState<any>(null);

  const [reactingToPost, setReactingToPost] = useState<string | null>(null);
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [isFeedMuted, setIsFeedMuted] = useState(true);
  const [readyVideos, setReadyVideos] = useState<Record<string, boolean>>({});
  const [likersModalPostId, setLikersModalPostId] = useState<string | null>(null);
  const [isGhostRoomsModalVisible, setIsGhostRoomsModalVisible] = useState(false);
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});
  const [reportedPosts, setReportedPosts] = useState<Record<string, boolean>>({});

  // 🛡️ LOCAL OVERRIDES: Persist reaction/like state across feed refreshes
  const localOverridesRef = React.useRef<Record<string, { isLiked: boolean; likesCount: number; reaction: string | null }>>({});
  const mergePostOverrides = React.useCallback((items: any[]): any[] => {
    return items.map(item => {
      const id = String(item._id || item.id);
      const override = localOverridesRef.current[id];
      if (!override) return item;
      return {
        ...item,
        isLiked: override.isLiked,
        is_liked: override.isLiked,
        likes_count: override.likesCount,
        likesCount: override.likesCount,
        user_reaction: override.reaction,
      };
    });
  }, []);

  React.useEffect(() => {
    if (posts.length > 0) {
      const newReactions: Record<string, string> = {};
      posts.forEach(p => {
        const reaction = p.user_reaction || p.reactionEmoji || p.userReaction;
        if (reaction) {
          newReactions[p._id || p.id] = reaction;
        }
      });
      if (Object.keys(newReactions).length > 0) {
        setUserReactions(prev => ({ ...prev, ...newReactions }));
      }
    }
  }, [posts]);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('post:deleted:local', (data: { postId: string }) => {
      const targetId = String(data.postId);
      setPosts(prev => (prev || []).filter(p => String(p._id || p.id) !== targetId));
      useFeedStore.getState().deletePostFromCache(targetId);
    });
    const reportSub = DeviceEventEmitter.addListener('post:reported:local', (data: { postId: string }) => {
      setReportedPosts(prev => ({ ...prev, [data.postId]: true }));
    });
    return () => {
      sub.remove();
      reportSub.remove();
    };
  }, []);

  // 🚀 REAL-TIME SYNCHRONIZATION: Listen for real-time posts from followed/other users instantly!
  React.useEffect(() => {
    const s = socketService.socket;
    if (!s) return;

    const onPostCreatedBroadcast = (payload: any) => {
      const newPost = payload.post;
      if (!newPost) return;

      const postIsAnon = !!payload.isAnonymous;
      // Guarantee alignment with current user mode (Ghost vs Normal)
      if (postIsAnon !== !!isAnonymous) return;

      setPosts(prev => {
        const safePrev = prev || [];
        // Prevent duplicate injections
        if (safePrev.some(p => String(p._id || p.id) === String(newPost._id || newPost.id))) {
          return safePrev;
        }
        return [newPost, ...safePrev];
      });
    };

    const onPostDeletedBroadcast = (payload: { postId: string }) => {
      if (!payload?.postId) return;
      const targetId = String(payload.postId);
      setPosts(prev => (prev || []).filter(p => String(p._id || p.id) !== targetId));
      useFeedStore.getState().deletePostFromCache(targetId);
    };

    s.on('post:broadcast', onPostCreatedBroadcast);
    s.on('post:created', onPostCreatedBroadcast);
    s.on('post:create', onPostCreatedBroadcast);
    s.on('post:new', onPostCreatedBroadcast);
    s.on('post:deleted', onPostDeletedBroadcast);
    return () => {
      s.off('post:broadcast', onPostCreatedBroadcast);
      s.off('post:created', onPostCreatedBroadcast);
      s.off('post:create', onPostCreatedBroadcast);
      s.off('post:new', onPostCreatedBroadcast);
      s.off('post:deleted', onPostDeletedBroadcast);
    };
  }, [isAnonymous]);

  const isFocused = useIsFocused();
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [musicInfoPost, setMusicInfoPost] = useState<{
    songName: string;
    artist: string;
    coverImage?: string;
    postId: string;
  } | null>(null);

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

  // Auto-activate first post on mount so sound/video is ready immediately
  useEffect(() => {
    if (!activeVideoId && posts && posts.length > 0) {
      const firstId = posts[0]._id || posts[0].id;
      if (firstId) setActiveVideoId(String(firstId));
    }
  }, [posts, activeVideoId]);

  // ── 🎵 Single Global Feed Audio Controller (Powered by expo-video, 1 instance for active post) ──
  const feedPlayerRef = useRef<any>(null);
  const feedAudioReqId = useRef(0);

  const currentActivePost = posts.find(p => String(p._id || p.id) === String(activeVideoId)) || (posts.length > 0 ? posts[0] : null);
  const activePostMusic = currentActivePost?.music || currentActivePost?.music_info;
  const activeMusicUrl =
    activePostMusic?.preview_url ||
    activePostMusic?.previewUrl ||
    activePostMusic?.audio_url ||
    activePostMusic?.url ||
    currentActivePost?.preview_url ||
    currentActivePost?.previewUrl;
  const activeSongName =
    activePostMusic?.song_name ||
    activePostMusic?.songTitle ||
    currentActivePost?.song_name;
  const activeArtist =
    activePostMusic?.artist ||
    activePostMusic?.artist_name ||
    currentActivePost?.artist;

  const currentFeedAudioUrl = useRef<string | null>(null);

  useEffect(() => {
    feedAudioReqId.current += 1;
    const reqId = feedAudioReqId.current;

    const cleanupPlayer = () => {
      if (feedPlayerRef.current) {
        try {
          feedPlayerRef.current.pause();
        } catch (_) {}
        feedPlayerRef.current = null;
        currentFeedAudioUrl.current = null;
      }
    };

    if (!isFocused || isFeedMuted || (!activeMusicUrl && !activeSongName)) {
      cleanupPlayer();
      return;
    }

    const resolveAndPlay = async () => {
      let finalUrl = activeMusicUrl;
      if (!finalUrl && activeSongName) {
        try {
          const query = `${activeSongName} ${activeArtist || ''}`.trim();
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`);
          const data = await res.json();
          if (data?.results?.[0]?.previewUrl) {
            finalUrl = data.results[0].previewUrl;
          }
        } catch (_) {}
      }

      if (reqId !== feedAudioReqId.current || !finalUrl) {
        return;
      }

      if (feedPlayerRef.current && currentFeedAudioUrl.current === finalUrl) {
        try { feedPlayerRef.current.play(); } catch (_) {}
        return;
      }

      cleanupPlayer();

      try {
        const resolved = resolveMediaUrl(finalUrl);
        currentFeedAudioUrl.current = finalUrl;
        const player = createVideoPlayer(resolved);
        try {
          (player as any).keepScreenOnWhilePlaying = false;
        } catch (_) {}
        player.loop = true;
        player.muted = false;
        player.volume = 1.0;
        feedPlayerRef.current = player;
        player.play();
      } catch (err) {}
    };

    void resolveAndPlay();

    return () => {
      feedAudioReqId.current += 1;
      cleanupPlayer();
    };
  }, [isFocused, isFeedMuted, activeVideoId, activeMusicUrl, activeSongName, activeArtist]);

  const fetchFeedRef = useRef<any>(null);

  const fetchFeed = async (isRefresh = false, forceMode?: boolean) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      return;
    }
    if (loadingMore || (!hasMore && !isRefresh)) return;

    // 🛡️ Capture the mode at call time and assign a unique fetch ID
    const currentMode = forceMode !== undefined ? forceMode : !!activeModeRef.current;
    const fetchId = ++activeFetchId.current;

    try {
      if (isRefresh) {
        const cache = (currentMode ? useFeedStore.getState().cachedAnonymousPosts : useFeedStore.getState().cachedPosts) || [];
        if (cache.length === 0 && (!posts || posts.length === 0)) {
          if (!refreshing) setLoading(true);
        }
        setPage(1);
        cursorRef.current = null;
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      const currentPage = isRefresh ? 1 : page;
      const cursorParam = cursorRef.current ? `&cursor=${cursorRef.current}` : '';
      const endpoint = currentMode
        ? `/feed/anonymous?page=${currentPage}&limit=10${cursorParam}`
        : `/feed?page=${currentPage}&limit=10${cursorParam}`;
      const res = await apiClient.get(endpoint);

      // 🛡️ STALE FETCH GUARD: If mode changed while we were waiting for the API,
      // discard these results entirely — they belong to the wrong mode.
      if (fetchId !== activeFetchId.current) {
        return;
      }

      if (currentMode) {
      }

      let newPosts = res.data.posts || res.data.data || (Array.isArray(res.data) ? res.data : []);

      // 🛡️ WALL: Strict mode filter — double check even if fetchId matches
      if (currentMode) {
        newPosts = newPosts.filter((p: any) => p.is_anonymous === true);
      } else {
        newPosts = newPosts.filter((p: any) => p.is_anonymous !== true);
      }

      newPosts = newPosts.map((post: any) => ({
        ...post,
        isLiked: !!(post.is_liked || post.isLiked),
        isBookmarked: !!(post.is_bookmarked || post.isBookmarked)
      }));

      // Fetch suggested users once per refresh
      if (isRefresh && !currentMode) {
        try {
          const suggRes = await apiClient.get('/users/suggestions?limit=10');
          if (fetchId !== activeFetchId.current) return;
          if (suggRes.data?.data) setSuggestedUsers(suggRes.data.data);
          else if (suggRes.data?.users) setSuggestedUsers(suggRes.data.users);
          else if (Array.isArray(suggRes.data)) setSuggestedUsers(suggRes.data);
        } catch (err) {
        }
      }

      if (isRefresh) {
        // 🛡️ PRESERVE LOCAL NEWLY CREATED POSTS: Don't lose local posts created recently
        const now = Date.now();
        const localCache = (currentMode ? useFeedStore.getState().cachedAnonymousPosts : useFeedStore.getState().cachedPosts) || [];
        const recentLocalPosts = localCache.filter((p: any) => {
          const postTime = new Date(p.createdAt || p.created_at || Date.now()).getTime();
          const isRecent = (now - postTime) < 180000; // created within last 3 minutes
          return isRecent;
        });

        const mergedPosts = newPosts.map((mp: any) => {
          const mpId = String(mp._id || mp.id);
          const localMatch = localCache.find((lp: any) => String(lp._id || lp.id) === mpId);
          if (localMatch) {
            return {
              ...localMatch,
              ...mp,
              music: mp.music || mp.music_info || localMatch.music || localMatch.music_info,
              music_info: mp.music || mp.music_info || localMatch.music || localMatch.music_info,
            };
          }
          return mp;
        });

        recentLocalPosts.forEach((lp: any) => {
          const lpId = String(lp._id || lp.id);
          if (!mergedPosts.some((mp: any) => String(mp._id || mp.id) === lpId)) {
            mergedPosts.unshift(lp);
          }
        });

        const finalPosts = mergePostOverrides(mergedPosts);
        setPosts(finalPosts);
        if (currentMode) {
          setCachedAnonymousPosts(finalPosts);
        } else {
          setCachedPosts(finalPosts);
        }
      } else {
        setPosts(prev => {
          const safePrev = prev || [];
          const newFiltered = newPosts.filter((np: any) => {
            const npId = (np._id || np.id)?.toString();
            return !safePrev.some(p => (p._id || p.id)?.toString() === npId);
          });
          return [...safePrev, ...mergePostOverrides(newFiltered)];
        });
      }

      setHasMore(newPosts.length === 10);
      setPage(prev => isRefresh ? 2 : prev + 1);

      // Update cursor for next fetch (use the created_at timestamp of the last post)
      if (newPosts.length > 0) {
        const lastPost = newPosts[newPosts.length - 1];
        const lastTimestamp = new Date(lastPost.created_at).getTime();
        cursorRef.current = lastTimestamp.toString();
      }

      // Populate likers from post objects into state cleanly
      const newLikersMap: Record<string, any[]> = {};
      newPosts.forEach((post: any) => {
        const postId = post._id || post.id;
        const postLikers = post.likers || post.liked_by || post.likedBy || post.likedByUsers;
        if (postId && postLikers && Array.isArray(postLikers) && postLikers.length > 0) {
          newLikersMap[postId] = postLikers;
        }
      });
      if (Object.keys(newLikersMap).length > 0) {
        setLikersByPostId((prev) => ({ ...prev, ...newLikersMap }));
      }
    } catch (error: any) {
      console.warn('❌ FETCH FEED ERROR:', error?.message || error, error?.response?.status);
    } finally {
      // Only update loading state if this fetch is still the active one
      if (fetchId === activeFetchId.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  };

  fetchFeedRef.current = fetchFeed;

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
    }
  };

  React.useEffect(() => {
    const currentToken = useAuthStore.getState().token || token;
    if (!user || !currentToken) return;
    if (isFirstMount.current) {
      isFirstMount.current = false;
      const cached = isAnonymous ? cachedAnonymousPosts : cachedPosts;
      if (cached.length > 0) {
        setPosts(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      hasFetchedOnMount.current = true;
      fetchFeedRef.current?.(true, !!isAnonymous);
    }
  }, [user, token, isAnonymous]);

  // 🚀 SYNC CACHE ON FOCUS: Always keep feed fresh on screen focus
  useFocusEffect(
    useCallback(() => {
      const currentToken = useAuthStore.getState().token || token;
      if (!currentToken) return;

      // 🛡️ Always sync activeModeRef with current authStore state on screen focus
      const currentMode = !!useAuthStore.getState().user?.isAnonymousMode;
      activeModeRef.current = currentMode;

      const currentCache = (currentMode ? useFeedStore.getState().cachedAnonymousPosts : useFeedStore.getState().cachedPosts) || [];
      const hasCache = currentCache.length > 0;
      performanceEngine.startScreenTrace('HomeFeed');
      performanceEngine.trackCacheAccess('Feed', hasCache);
      performanceEngine.endScreenTrace('HomeFeed', hasCache);

      if (hasCache) {
        setPosts(prev => {
          if (prev && prev.length > 0) {
            return prev.map(p => {
              const cacheMatch = currentCache.find((cp: any) => String(cp._id || cp.id) === String(p._id || p.id));
              return {
                ...(cacheMatch || {}),
                ...p,
                music: p.music || p.music_info || cacheMatch?.music || cacheMatch?.music_info,
                music_info: p.music || p.music_info || cacheMatch?.music || cacheMatch?.music_info,
              };
            });
          }
          return currentCache;
        });
        setLoading(false);
      } else {
        setLoading(true);
      }
      fetchFeedRef.current?.(true, currentMode);
    }, [token])
  );

  // 🚀 INSTANT TOGGLE: mode_switched = instant cache swap + background refresh
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('mode_switched', ({ isAnonymous: newMode }) => {
      // 🛡️ Update the mode ref FIRST — this invalidates all in-flight fetches from the old mode
      const isAnon = !!newMode;
      activeModeRef.current = isAnon;
      // Bump fetchId so any in-flight fetch from the old mode is discarded when it resolves
      activeFetchId.current++;

      const cached = (isAnon ? useFeedStore.getState().cachedAnonymousPosts : useFeedStore.getState().cachedPosts) || [];
      if (cached.length > 0) {
        setPosts(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setLikersByPostId({});
      setPage(1);
      setHasMore(true);
      cursorRef.current = null;
      fetchFeedRef.current?.(true, isAnon);
    });
    return () => sub.remove();
  }, []);

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
      // Don't update from socket if WE triggered it — handleLike already did optimistic + API update
      // Only apply socket updates from OTHER users liking our posts
      if (currentUserId === actionUserId) return;

      setPosts(prev => (prev || []).map(p => {
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
    const localSub = DeviceEventEmitter.addListener('post:liked:local', (data: { postId: string, isLiked: boolean, likesCount?: number, reaction?: string }) => {
      // ✅ Update local overrides cache so likes survive refreshes
      const targetPost = posts.find(p => String(p._id || p.id) === String(data.postId));
      const count = data.likesCount !== undefined ? data.likesCount : (targetPost?.likes_count ?? targetPost?.likesCount ?? 0);
      localOverridesRef.current[String(data.postId)] = {
        isLiked: data.isLiked,
        likesCount: count,
        reaction: data.isLiked ? (data.reaction || targetPost?.user_reaction || '❤️') : null,
      };

      if (data.reaction) {
        setUserReactions(prev => ({ ...prev, [data.postId]: data.reaction as string }));
      } else if (data.isLiked === false) {
        // If unreacted/unliked, remove reaction
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
      setPosts(prev => {
        const currentUser = useAuthStore.getState().user;
        const applyReaction = (p: any) => {
          const count = data.likesCount !== undefined ? data.likesCount : (p.likes_count ?? p.likesCount ?? 0);
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
            is_liked: data.isLiked,
            likes_count: count,
            likesCount: count,
            user_reaction: data.isLiked ? (data.reaction || p.user_reaction) : null,
            userReaction: data.isLiked ? (data.reaction || p.userReaction) : null,
            likers: updatedLikers,
          };
        };

        const updated = prev.map(p => {
          if (String(p._id || p.id) === String(data.postId)) {
            return applyReaction(p);
          }
          return p;
        });

        // Sync with useFeedStore cache
        setTimeout(() => {
          if (isAnonymous) {
            const currentAnon = useFeedStore.getState().cachedAnonymousPosts || [];
            const updatedAnon = currentAnon.map((p: any) => {
              if (String(p._id || p.id) === String(data.postId)) {
                return applyReaction(p);
              }
              return p;
            });
            useFeedStore.getState().setCachedAnonymousPosts(updatedAnon);
          } else {
            const currentNormal = useFeedStore.getState().cachedPosts || [];
            const updatedNormal = currentNormal.map((p: any) => {
              if (String(p._id || p.id) === String(data.postId)) {
                return applyReaction(p);
              }
              return p;
            });
            useFeedStore.getState().setCachedPosts(updatedNormal);
          }
        }, 0);

        return updated;
      });
    });

    const bookmarkLocalSub = DeviceEventEmitter.addListener('post:bookmarked:local', (data: { postId: string, isBookmarked: boolean }) => {
      setPosts(prev => {
        const safePrev = prev || [];
        return safePrev.map(p => {
          if (String(p._id || p.id) === String(data.postId)) {
            return { ...p, isBookmarked: data.isBookmarked };
          }
          return p;
        });
      });
    });

    return () => {
      if (socketService.socket) {
        socketService.socket.off('post:updated', handlePostUpdate);
      }
      localSub.remove();
      bookmarkLocalSub.remove();
    };
  }, [user]);

  // Always keep fetchFeedRef up-to-date with latest fetchFeed function
  fetchFeedRef.current = fetchFeed;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchFeed(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 400);
  }, [fetchFeed]);



  const handleLike = async (postId: string, isLiked: boolean, reaction?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Find the post — use String() to handle both ObjectId and string postIds
    const postIndex = posts.findIndex(p => String(p._id || p.id) === String(postId));
    if (postIndex === -1) return;

    const post = posts[postIndex];
    const isChangingReaction = reaction && isLiked;
    const newIsLiked = isChangingReaction ? true : !isLiked;

    // Calculate new like count
    let newCount = post.likes_count || 0;
    if (!isChangingReaction) {
      newCount = newIsLiked ? newCount + 1 : Math.max(newCount - 1, 0);
    }

    // Save original state
    const originalPost = { ...post };

    // Update UI immediately — reset reactions if unliking
    const updatedPosts = [...posts];
    updatedPosts[postIndex] = {
      ...post,
      isLiked: newIsLiked,
      is_liked: newIsLiked,
      likes_count: newCount,
      user_reaction: newIsLiked ? (reaction || post.user_reaction) : null,
      userReaction: newIsLiked ? (reaction || post.userReaction) : null
    };
    setPosts(updatedPosts);

    // ✅ Immediately update userReactions state
    if (reaction && newIsLiked) {
      setUserReactions(prev => ({ ...prev, [postId]: reaction }));
    } else if (!newIsLiked) {
      // Remove reaction immediately on unlike
      setUserReactions(prev => {
        const copy = { ...prev };
        delete copy[postId];
        return copy;
      });
    }

    // ✅ Immediately persist override so it survives feed refresh
    localOverridesRef.current[String(postId)] = {
      isLiked: newIsLiked,
      likesCount: newCount,
      reaction: newIsLiked ? (reaction || post.user_reaction || '❤️') : null,
    };

    try {
      const isReel = post.type === 'reel';
      const routePrefix = isReel ? 'reels' : 'posts';

      let apiRes: any;
      if (isChangingReaction) {
        apiRes = await apiClient.post(`/${routePrefix}/${postId}/like`, { reaction });
      } else if (isLiked) {
        apiRes = await apiClient.delete(`/${routePrefix}/${postId}/like`);
      } else {
        apiRes = await apiClient.post(`/${routePrefix}/${postId}/like`, { reaction: reaction || '❤️' });
      }

      // ✅ Use actual count from backend (source of truth)
      const actualCount = apiRes?.data?.likesCount ?? apiRes?.likesCount ?? newCount;
      const finalLikedStatus = apiRes?.data?.liked ?? apiRes?.liked ?? newIsLiked;

      // Update with actual count and status from backend
      setPosts(prev => (prev || []).map(p => {
        if (String(p._id || p.id) === String(postId)) {
          return {
            ...p,
            likes_count: actualCount,
            likesCount: actualCount,
            isLiked: finalLikedStatus,
            is_liked: finalLikedStatus,
            user_reaction: finalLikedStatus ? (reaction || p.user_reaction) : null,
            userReaction: finalLikedStatus ? (reaction || p.userReaction) : null
          };
        }
        return p;
      }));

      // ⚡ Emit local event for other screens to keep in sync
      DeviceEventEmitter.emit('post:liked:local', {
        postId,
        isLiked: finalLikedStatus,
        likesCount: actualCount,
        reaction: finalLikedStatus ? (reaction || '❤️') : null
      });

      // ✅ Update localOverridesRef with final server values
      localOverridesRef.current[String(postId)] = {
        isLiked: finalLikedStatus,
        likesCount: actualCount,
        reaction: finalLikedStatus ? (reaction || post.user_reaction || '❤️') : null,
      };

      // ✅ Always refresh likers after like/unlike
      if (actualCount > 0) {
        fetchLikers(postId);
      } else {
        setLikersByPostId(prev => ({
          ...prev,
          [postId]: []
        }));
      }
    } catch (error) {
      // Revert on error
      const revertPosts = [...posts];
      revertPosts[postIndex] = originalPost;
      setPosts(revertPosts);
    }
  };

  const handleBookmark = async (postId: string, isBookmarked: boolean) => {
    // ⚡ Haptic feedback
    Haptics.notificationAsync(isBookmarked ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);

    const newIsBookmarked = !isBookmarked;
    setPosts(prev => (prev || []).map(p => {
      if (p._id === postId || p.id === postId) return { ...p, isBookmarked: newIsBookmarked };
      return p;
    }));
    try {
      const postIndex = (posts || []).findIndex(p => (p._id || p.id) === postId);
      const post = postIndex !== -1 ? posts[postIndex] : null;
      const isReel = post?.type === 'reel';

      if (isReel) {
        if (newIsBookmarked) {
          await apiClient.post(`/reels/${postId}/bookmark`);
        } else {
          await apiClient.delete(`/reels/${postId}/bookmark`);
        }
      } else {
        await apiClient.post(`/posts/${postId}/bookmark`);
      }

      DeviceEventEmitter.emit('post:bookmarked:local', {
        postId,
        isBookmarked: newIsBookmarked
      });
    } catch (error) {
      // Revert on error
      setPosts(prev => (prev || []).map(p => {
        if (p._id === postId || p.id === postId) return { ...p, isBookmarked: isBookmarked };
        return p;
      }));
    }
  };

  const handleShare = async (postId: string, content?: string, mediaUrl?: string, mediaType?: 'image' | 'video', authorUsername?: string, authorAvatar?: string) => {
    // ⚡ Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setSelectedPost({ id: postId, content, mediaUrl, mediaType, authorUsername, authorAvatar });
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
    }
  };
  const handleDeletePost = async (postId: string) => {
    const targetId = String(postId);
    // 🚀 Zero-latency atomic purge across all caches
    DeleteEngine.purgePostFromAllCaches(targetId);
    setPosts(prev => (prev || []).filter(p => String(p._id || p.id) !== targetId));

    try {
      await apiClient.delete(`/posts/${targetId}`);
    } catch (err) {
      fetchFeedRef.current?.(true);
    }
  };

  const handlePostOptions = (postId: string, isOwn: boolean) => {
    const postData = (posts || []).find(p => (p._id || p.id) === postId);
    setOptionsPostId(postId);
    setOptionsIsOwn(isOwn);
    setOptionsPostData(postData);
    setOptionsModalVisible(true);
  };

  // 🚀 Instagram-style Horizontal Swipe Navigation (Capture-phase for FlatList touch override)
  const homePanResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture horizontal swipe even when touching over FlatList post cards
        return Math.abs(gestureState.dx) > 35 && Math.abs(gestureState.dy) < 25;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -60) {
          // Swipe Right-to-Left -> Open Messages Inbox Tab
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/(tabs)/messages');
        } else if (gestureState.dx > 60) {
          // Swipe Left-to-Right -> Open Create Story / Camera Screen
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/create-story');
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style={COLORS.background === '#121212' ? 'light' : 'dark'} />

      <View style={styles.appHeader}>
        <View style={styles.headerLeftContainer}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.headerLogo}
            contentFit="contain"
            tintColor={COLORS.background === '#121212' ? COLORS.text : undefined}
          />
        </View>

        {isAnonymous ? (
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setIsGhostRoomsModalVisible(true)}>
              <Ionicons name="chatbubbles-outline" size={26} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.navigate('/(tabs)/explore')}>
              <Ionicons name="search-outline" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')}>
              <Ionicons name="notifications-outline" size={26} color={COLORS.text} />
              {unreadNotificationsCount > 0 && (
                <View style={styles.headerBadge} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {(() => {
        const FlashListAny = FlashList as any;
        return (
          <FlashListAny
            data={posts}
            keyExtractor={(item: any, index: number) => item._id || item.id || String(index)}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            extraData={{ userReactions, reactingToPost, isFeedMuted, posts, readyVideos, activeVideoId }}
            renderItem={({ item, index }: { item: any, index: number }) => {
              const postId = item._id || item.id;
              const authorId = item.user_id || item.userId || item.author?._id || item.author?.id || item.user?._id || item.user?.id;
              const isOwn = !!(user?.id && authorId && (authorId === user.id || authorId?.toString() === user.id?.toString()));
              const displayUsername = isAnonymous
                ? (isOwn ? 'You (Ghost)' : 'Anonymous Ghost')
                : (item.author?.username || item.user?.username || 'AnuFy_User');
              const displayAvatar = resolveAvatarUrl(
                item.author?.avatar_url || item.author?.avatar || item.user?.avatar_url || item.user?.avatar,
                item.author?.username || item.user?.username
              );

              let parsedMusic = item.music || {};
              let parsedMusicInfo = item.music_info || {};
              if (typeof parsedMusic === 'string') {
                try { parsedMusic = JSON.parse(parsedMusic); } catch (_) { }
              }
              if (typeof parsedMusicInfo === 'string') {
                try { parsedMusicInfo = JSON.parse(parsedMusicInfo); } catch (_) { }
              }

              const songName =
                parsedMusic?.song_name ||
                parsedMusicInfo?.song_name ||
                parsedMusic?.songTitle ||
                parsedMusicInfo?.songTitle ||
                parsedMusic?.name ||
                parsedMusicInfo?.name ||
                item.song_name ||
                item.songTitle ||
                item.music_title;

              const songArtist =
                parsedMusic?.artist ||
                parsedMusicInfo?.artist ||
                parsedMusic?.artist_name ||
                parsedMusicInfo?.artist_name ||
                parsedMusic?.singer ||
                parsedMusicInfo?.singer ||
                item.artist ||
                item.singer;

              const postAudioUrl =
                parsedMusic?.preview_url ||
                parsedMusicInfo?.preview_url ||
                parsedMusic?.previewUrl ||
                parsedMusicInfo?.previewUrl ||
                parsedMusic?.audio_url ||
                parsedMusicInfo?.audio_url ||
                parsedMusic?.audioUrl ||
                parsedMusicInfo?.audioUrl ||
                parsedMusic?.url ||
                parsedMusicInfo?.url ||
                parsedMusic?.uri ||
                parsedMusicInfo?.uri ||
                item.preview_url ||
                item.previewUrl ||
                item.music_url ||
                item.audio_url ||
                item.audioUrl;

              const hasMusicMetadata = !!(
                songName ||
                songArtist ||
                postAudioUrl
              );

              const isThisPostActive = isFocused && (activeVideoId === String(postId) || (!activeVideoId && index === 0));

              const shouldShowSuggestion = !isAnonymous && index > 0 && (index + 1) % 6 === 0 && suggestedUsers.length > 0;
              const suggestionIndex = Math.floor((index + 1) / 6) - 1;
              const suggestionUser = suggestedUsers[suggestionIndex % suggestedUsers.length];

              if (reportedPosts[postId]) {
                return (
                  <View style={[styles.postCard, { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }]}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <Ionicons name="checkmark" size={28} color="#FFF" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 }}>Thanks for reporting this post</Text>
                    <Text style={{ fontSize: 14, color: COLORS.subtitle, textAlign: 'center', marginHorizontal: 30, marginBottom: 20 }}>
                      Your feedback is important in helping us keep the AnuFy community safe.
                    </Text>
                    <TouchableOpacity onPress={() => setReportedPosts(prev => ({ ...prev, [postId]: false }))}>
                      <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 15 }}>Show Post</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              return (
                <View>
                  <View style={styles.postCard}>
                    {/* Card Header (Restored!) */}
                    <View style={styles.postHeader}>
                      <TouchableOpacity
                        style={{ flexDirection: 'column', alignItems: 'flex-start', gap: verticalScale(2) }}
                        disabled={isAnonymous && !isOwn}
                        onPress={() => {
                          const uname = item.author?.username || item.user?.username;
                          if (uname) router.push(`/user/${uname}`);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Image
                            source={{ uri: displayAvatar }}
                            style={styles.postAvatar}
                            contentFit="cover"
                            cachePolicy="disk"
                            transition={150}
                          />
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: scale(6), gap: scale(6) }}>
                            <Text style={styles.postUsername}>{displayUsername}</Text>
                            {/* Follow / Following Button Inline (uses centralised hook) */}
                            {!isOwn && !isAnonymous && (
                              <PostAuthorFollowButton
                                authorId={String(authorId)}
                                initialFollowing={!!(item.author?.is_following || item.user?.is_following || item.is_following)}
                                styles={styles}
                                COLORS={COLORS}
                              />
                            )}
                          </View>
                        </View>

                        <View style={{ marginTop: verticalScale(2) }}>
                          {item.location?.name && <Text style={styles.postLocation}>{item.location.name}</Text>}
                        </View>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
                        <TouchableOpacity
                          onPress={() => handleBookmark(postId, !!item.isBookmarked)}
                          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        >
                          <Ionicons name={item.isBookmarked ? 'bookmark' : 'bookmark-outline'} size={24} color={item.isBookmarked ? COLORS.secondary : COLORS.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handlePostOptions(postId, isOwn)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color={COLORS.subtitle} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Media Container with touch interactions */}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (item.media_type === 'video') {
                          const mediaUrl = item.media_urls?.[0] || item.media?.[0]?.url;
                          const thumbnailUrl = item.thumbnail_url || item.video_thumbnail || item.thumbnail;

                          // 🚀 ULTRA-ADVANCED TRANSITION: Filter all video posts from current index onward
                          const videoPosts = posts.filter(p => p.media_type === 'video');
                          const currentIdx = videoPosts.findIndex(p => (p._id || p.id) === postId);

                          const formattedVideoList = videoPosts.map(p => {
                            const pid = p._id || p.id;
                            const mUrl = p.media_urls?.[0] || p.media?.[0]?.url;
                            const tUrl = p.thumbnail_url || p.video_thumbnail || p.thumbnail;
                            const react = userReactions[pid] || p.user_reaction || p.userReaction;
                            const liked = !!(react || p.isLiked);

                            // Safe parse music strings to send objects to Reels Store
                            let parsedMusic = p.music;
                            let parsedMusicInfo = p.music_info;
                            if (typeof parsedMusic === 'string') {
                              try { parsedMusic = JSON.parse(parsedMusic); } catch (_) { }
                            }
                            if (typeof parsedMusicInfo === 'string') {
                              try { parsedMusicInfo = JSON.parse(parsedMusicInfo); } catch (_) { }
                            }

                            return {
                              ...p,
                              id: String(pid),
                              _id: String(pid),
                              isLiked: liked,
                              is_liked: liked,
                              user_reaction: react,
                              userReaction: react,
                              music: parsedMusic || null,
                              music_info: parsedMusicInfo || parsedMusic || null,
                              videoUrl: resolveMediaUrl(mUrl),
                              video_url: resolveMediaUrl(mUrl),
                              thumbnail_url: resolveMediaUrl(tUrl),
                              thumbnail: resolveMediaUrl(tUrl),
                              author: p.author || p.user
                            };
                          });

                          // Re-order the list so that the tapped video is the first item!
                          const targetList = [
                            ...formattedVideoList.slice(currentIdx),
                            ...formattedVideoList.slice(0, currentIdx)
                          ];

                          useReelsStore.getState().setActiveReelData(targetList[0]);
                          useReelsStore.getState().setPreloadedReels(targetList);

                          router.push(`/reels/${postId}`);
                        }
                      }}
                      onLongPress={() => handlePostOptions(postId, isOwn)}
                      style={{ position: 'relative' }}
                    >
                      {(() => {
                        const mediaUrl = item.media_urls?.[0] || item.media?.[0]?.url;
                        const resolvedMedia = resolveMediaUrl(mediaUrl);
                        const isVideo = item.media_type === 'video';

                        const thumbnailUrl = item.thumbnail_url || item.video_thumbnail || item.thumbnail || mediaUrl;
                        const resolvedThumb = resolveMediaUrl(thumbnailUrl);

                        if (!resolvedMedia) return null;

                        if (isVideo) {
                          return (
                            <View style={styles.postImage}>
                              <HomeFeedVideoItem
                                uri={resolvedMedia}
                                shouldPlay={isThisPostActive}
                                isMuted={(postAudioUrl || hasMusicMetadata) ? true : (isFeedMuted || !isThisPostActive)}
                                style={StyleSheet.absoluteFill}
                                onReady={() => {
                                  setReadyVideos(prev => ({ ...prev, [postId]: true }));
                                }}
                                onLoadStart={() => {
                                  setReadyVideos(prev => ({ ...prev, [postId]: false }));
                                }}
                              />

                              {/* High-performance cached poster overlay */}
                              {(!readyVideos[postId] || !isThisPostActive) && (
                                <Image
                                  source={{ uri: resolvedThumb }}
                                  style={StyleSheet.absoluteFill}
                                  contentFit="cover"
                                  cachePolicy="disk"
                                  transition={150}
                                />
                              )}
                            </View>
                          );
                        } else {
                          return (
                            <SmartPostImage
                              uri={resolvedMedia}
                              style={styles.postImage}
                            />
                          );
                        }
                      })()}

                      {/* Global Mute / Music Toggle Button (Like Instagram) */}
                      {(item.media_type === 'video' || !!postAudioUrl || hasMusicMetadata) && (
                        <TouchableOpacity
                          style={styles.globalMuteButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (activeVideoId !== String(postId)) {
                              setActiveVideoId(String(postId));
                              setIsFeedMuted(false);
                            } else {
                              setIsFeedMuted(prev => !prev);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={(isFeedMuted || !isThisPostActive) ? "volume-mute" : (postAudioUrl || hasMusicMetadata ? "musical-notes" : "volume-high")}
                            size={16}
                            color="#FFF"
                          />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>

                    {/* Action Row Container */}
                    <View style={styles.actionRowContainer}>
                      <View style={styles.actionPillContainer}>
                          <TouchableOpacity
                            style={styles.pillActionBtn}
                            onPress={() => handleLike(postId, !!(item.isLiked || item.is_liked))}
                            onLongPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              setReactingToPost(reactingToPost === postId ? null : postId);
                            }}
                            delayLongPress={300}
                            activeOpacity={0.7}
                          >
                            {(() => {
                              const reaction = userReactions[postId] || item.user_reaction || item.userReaction;
                              const isLiked = !!(item.isLiked || item.is_liked || reaction);
                              const isEmojiReaction = reaction && reaction !== '❤️' && reaction !== '👍';

                              if (isEmojiReaction) {
                                return <Text style={{ fontSize: 20 }}>{reaction}</Text>;
                              }
                              return (
                                <MaterialCommunityIcons
                                  name={isLiked ? "thumb-up" : "thumb-up-outline"}
                                  size={25}
                                  color={isLiked ? "#FF3040" : COLORS.text}
                                />
                              );
                            })()}
                            {/* Show count: always to owner, to others only if not hidden */}
                            {(isOwn || !item.hide_like_count) && (
                              <Text style={styles.pillActionText}>
                                {item.likes_count ?? item.likesCount ?? 0}
                              </Text>
                            )}
                          </TouchableOpacity>

                        {/* Comment Button */}
                        {!item.comments_disabled && (
                          <TouchableOpacity
                            style={styles.pillActionBtn}
                            onPress={() => {
                              setActivePostId(postId);
                              setActivePostOwnerId(authorId);
                              setCommentModalVisible(true);
                            }}
                            activeOpacity={0.7}
                          >
                            <MessageCircleDashed size={22} color={COLORS.text} />
                            <Text style={styles.pillActionText}>
                              {item.comments_count || 0}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Share Button */}
                        <TouchableOpacity
                          style={styles.pillActionBtn}
                          onPress={() => {
                            const mediaUrl = item.media_urls?.[0] || item.media?.[0]?.url;
                            handleShare(
                              postId,
                              item.content || item.caption,
                              mediaUrl,
                              item.media_type,
                              item.author?.username || item.user?.username,
                              item.author?.avatar_url || item.author?.avatar || item.user?.avatar_url || item.user?.avatar
                            );
                          }}
                          activeOpacity={0.7}
                        >
                          <Forward size={22} color={COLORS.text} />
                        </TouchableOpacity>

                        {/* DM Author option for Anonymous Mode */}
                        {isAnonymous && !isOwn && (
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
                            activeOpacity={0.7}
                          >
                            <MessageCircleDashed size={19} color="#FF69B4" />
                            <Text style={[styles.pillActionText, { color: '#FF69B4' }]}>DM</Text>
                          </TouchableOpacity>
                        )}
                      </View>{/* end actionPillContainer */}

                      {/* 🎵 Music Album Cover / Square Box Thumbnail on Right Corner */}
                      {(() => {
                        if (!hasMusicMetadata) return null;

                        const coverImage = parsedMusic?.cover_image || parsedMusicInfo?.cover_image || parsedMusic?.cover_url || parsedMusicInfo?.cover_url || (item as any).music_cover;
                        const avatarUrl = item.author?.avatar_url || item.author?.avatar || item.user?.avatar_url || item.user?.avatar;
                        const finalUrl = coverImage || avatarUrl;

                        return (
                          <TouchableOpacity
                            style={styles.musicSquareBox}
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              if (activeVideoId !== String(postId)) {
                                setActiveVideoId(String(postId));
                                setIsFeedMuted(false);
                              } else if (isFeedMuted) {
                                setIsFeedMuted(false);
                              }
                              setMusicInfoPost({
                                songName: songName || 'Original Audio',
                                artist: songArtist || displayUsername || 'AnuFy Creator',
                                coverImage: finalUrl,
                                postId: String(postId),
                              });
                            }}
                            activeOpacity={0.8}
                          >
                            <Image
                              source={{ uri: resolveMediaUrl(finalUrl) }}
                              style={styles.musicSquareImage}
                              contentFit="cover"
                            />
                            <View style={[styles.musicSquareBadge, { backgroundColor: (isFeedMuted || !isThisPostActive) ? 'rgba(0,0,0,0.7)' : '#9333EA' }]}>
                              <Ionicons name={(isFeedMuted || !isThisPostActive) ? "volume-mute" : "musical-notes"} size={9} color="#FFFFFF" />
                            </View>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>{/* end actionRowContainer */}

                    {/* Reaction Emojis Selector Bar */}
                    {reactingToPost === postId && (
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
                                const postIndex = posts.findIndex(p => (p._id || p.id) === postId);
                                if (postIndex !== -1) {
                                  const post = posts[postIndex];
                                  handleLike(postId, !!post.isLiked, emoji);
                                }
                                setReactingToPost(null);
                              }}
                              style={styles.reactionEmojiBtn}
                              activeOpacity={0.6}
                            >
                              {emoji === '❤️' ? (
                                <MaterialCommunityIcons name="thumb-up" size={22} color="#FF3040" style={{ marginTop: 2 }} />
                              ) : (
                                <Text style={{ fontSize: 22 }}>{emoji}</Text>
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}
                    {/* Likers, Caption & Timeago (INSIDE Card) */}
                    <View style={{ paddingHorizontal: scale(16), paddingTop: verticalScale(1), paddingBottom: verticalScale(4) }}>
                      {(() => {
                        const postIsAnon = !!(item.is_anonymous || item.isAnonymous);
                        const effectiveLikers = (likersByPostId[postId] && likersByPostId[postId].length > 0)
                          ? likersByPostId[postId]
                          : (item.likers || item.likedBy || item.liked_by || item.likedByUsers || []);
                        const totalLikes = item.likes_count ?? item.likesCount ?? effectiveLikers.length;

                        if (totalLikes <= 0) return null;

                        if (postIsAnon || effectiveLikers.length === 0) {
                          return (
                            <Text style={styles.likersLabel}>
                              Liked by {totalLikes} {totalLikes === 1 ? 'person' : 'people'}
                            </Text>
                          );
                        }

                        const shown = effectiveLikers.slice(0, 2);
                        const extraCount = Math.max(0, totalLikes - shown.length);

                        // Calculate top 3 reactions from likers list
                        const counts: { [emoji: string]: number } = {};
                        effectiveLikers.forEach((l: any) => {
                          const r = l.reaction || '👍';
                          counts[r] = (counts[r] || 0) + 1;
                        });
                        const topReactions = Object.keys(counts)
                          .sort((a, b) => counts[b] - counts[a])
                          .slice(0, 3);

                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: verticalScale(2) }}>
                            <TouchableOpacity onPress={() => setLikersModalPostId(postId)}>
                              <Text style={[styles.likersLabel, { marginBottom: 0, marginRight: scale(4) }]}>Liked by</Text>
                            </TouchableOpacity>
                            {topReactions.length > 0 && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: scale(6) }}>
                                {topReactions.map((emoji, idx) => (
                                  <View
                                    key={emoji + idx}
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
                                    {emoji === '❤️' || emoji === '👍' ? (
                                      <MaterialCommunityIcons name="thumb-up" size={10} color="#FF3040" />
                                    ) : (
                                      <Text style={{ fontSize: moderateFont(9), lineHeight: moderateFont(11) }}>{emoji}</Text>
                                    )}
                                  </View>
                                ))}
                              </View>
                            )}
                            {shown.map((liker: any, idx: number) => (
                              <React.Fragment key={idx}>
                                <TouchableOpacity onPress={() => router.push(`/user/${liker.username}`)}
                                  style={styles.likerItem}>
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
                                <TouchableOpacity onPress={() => setLikersModalPostId(postId)}>
                                  <Text style={styles.moreLikers}>{extraCount} more</Text>
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        );
                      })()}

                      {/* Caption here */}
                      {item.content || item.caption ? (() => {
                        const fullCaption = item.content || item.caption || '';
                        const isLong = fullCaption.length > 35;
                        const isExpanded = !!expandedCaptions[postId];
                        return (
                          <TouchableOpacity
                            onPress={() => {
                              setExpandedCaptions(prev => ({
                                ...prev,
                                [postId]: !prev[postId]
                              }));
                            }}
                            activeOpacity={0.7}
                            style={{ marginTop: verticalScale(4) }}
                          >
                            <Text style={styles.captionText}>
                              {!isExpanded && isLong ? (
                                <>
                                  {fullCaption.slice(0, 35).trim()}
                                  <Text style={{ fontWeight: 'bold', color: COLORS.subtitle }}>...more</Text>
                                </>
                              ) : (
                                <>
                                  {fullCaption}
                                  {isLong && (
                                    <Text style={{ fontWeight: 'bold', color: COLORS.subtitle }}> less</Text>
                                  )}
                                </>
                              )}
                            </Text>
                          </TouchableOpacity>
                        );
                      })() : null}

                      {/* Time here */}
                      {item.created_at && (
                        <Text style={styles.timeAgo}>
                          {getTimeAgo(item.created_at)}
                        </Text>
                      )}
                    </View>
                  </View>
                  {(index === 9 || index === 24) && suggestedUsers.length > 0 && (
                    <View style={styles.suggestionContainer}>
                      <Text style={styles.suggestionTitle}>Suggested for you</Text>
                      <FlatList
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        data={suggestedUsers}
                        keyExtractor={(item: any, idx: number) => (item._id || item.id || idx).toString()}
                        contentContainerStyle={{ gap: scale(12), paddingRight: scale(16) }}
                        renderItem={({ item: sugUser }) => {
                          return (
                            <SuggestedUserCard
                              sugUser={sugUser}
                              styles={styles}
                              COLORS={COLORS}
                              onNavigateProfile={(username) => router.push(`/user/${username}`)}
                            />
                          );
                        }}
                      />
                    </View>
                  )}
                </View>
              );
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.secondary}
                colors={[COLORS.secondary]}
              />
            }
            onEndReached={() => {
              if (hasMore && !loadingMore) {
                fetchFeedRef.current?.(false);
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 20 }}>
                  <ActivityIndicator size="small" color={COLORS.secondary} />
                </View>
              ) : null
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              loading ? (
                <View style={styles.centerNode}>
                  <ActivityIndicator size="large" color={COLORS.secondary} />
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="images-outline" size={80} color={COLORS.border} />
                  <Text style={styles.emptyText}>{isAnonymous ? "No ghost stories yet." : "No posts yet. Follow people to see their moments."}</Text>
                </View>
              )
            }
          />
        );
      })()}

      {/* Likers Full List Modal */}
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

      <CommentBottomSheet
        isVisible={commentModalVisible}
        onClose={() => {
          setCommentModalVisible(false);
          setActivePostId(null);
          setActivePostOwnerId(null);
        }}
        postId={activePostId || ''}
        postOwnerId={activePostOwnerId || ''}
        commentsDisabled={posts.find(p => (p._id || p.id) === activePostId)?.comments_disabled === true}
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
      <PostOptionsModal
        isVisible={optionsModalVisible}
        onClose={() => setOptionsModalVisible(false)}
        postId={optionsPostId}
        isOwner={optionsIsOwn}
        isPinnedInitial={optionsPostData?.is_pinned}
        commentsDisabledInitial={optionsPostData?.comments_disabled}
        hideLikeCountInitial={optionsPostData?.hide_like_count}
        itemType={optionsPostData?.type === 'reel' ? 'reel' : 'post'}
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
          setPosts(prev => (prev || []).map(p => {
            if (String(p._id || p.id) === String(postId)) {
              return { ...p, comments_disabled: disabled };
            }
            return p;
          }));
          // Also update the cached posts in the store
          if (isAnonymous) {
            setCachedAnonymousPosts(prev => (prev || []).map(p => {
              if (String(p._id || p.id) === String(postId)) {
                return { ...p, comments_disabled: disabled };
              }
              return p;
            }));
          } else {
            setCachedPosts(prev => (prev || []).map(p => {
              if (String(p._id || p.id) === String(postId)) {
                return { ...p, comments_disabled: disabled };
              }
              return p;
            }));
          }
        }}
        onLikesToggle={(postId, hidden) => {
          setPosts(prev => (prev || []).map(p => {
            if (String(p._id || p.id) === String(postId)) {
              return { ...p, hide_like_count: hidden };
            }
            return p;
          }));
          // Also update the cached posts in the store
          if (isAnonymous) {
            setCachedAnonymousPosts(prev => (prev || []).map(p => {
              if (String(p._id || p.id) === String(postId)) {
                return { ...p, hide_like_count: hidden };
              }
              return p;
            }));
          } else {
            setCachedPosts(prev => (prev || []).map(p => {
              if (String(p._id || p.id) === String(postId)) {
                return { ...p, hide_like_count: hidden };
              }
              return p;
            }));
          }
        }}
      />
      <ActiveGhostRoomsModal
        isVisible={isGhostRoomsModalVisible}
        onClose={() => setIsGhostRoomsModalVisible(false)}
      />

      {/* 🎵 Instagram-style Music Details Bottom Sheet Modal */}
      <Modal
        visible={!!musicInfoPost}
        transparent
        animationType="slide"
        onRequestClose={() => setMusicInfoPost(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}
          onPress={() => setMusicInfoPost(null)}
        >
          <Pressable
            style={{
              backgroundColor: '#18181B',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: Platform.OS === 'ios' ? 40 : 28,
              borderTopWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Grab Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginBottom: 18 }} />

            {/* Song Cover & Details */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <Image
                source={{ uri: resolveMediaUrl(musicInfoPost?.coverImage) }}
                style={{ width: 68, height: 68, borderRadius: 12, backgroundColor: '#27272A' }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons name="musical-notes" size={16} color="#A855F7" />
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }} numberOfLines={1}>
                    {musicInfoPost?.songName || 'Original Audio'}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#A1A1AA', fontWeight: '500' }} numberOfLines={1}>
                  {musicInfoPost?.artist || 'Unknown Artist'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isFeedMuted ? '#EF4444' : '#22C55E' }} />
                  <Text style={{ fontSize: 11, color: isFeedMuted ? '#F87171' : '#4ADE80', fontWeight: '600' }}>
                    {isFeedMuted ? 'Muted' : 'Playing Now'}
                  </Text>
                </View>
              </View>

              {/* Play / Mute Toggle Button in Modal */}
              <TouchableOpacity
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: '#27272A',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsFeedMuted(prev => !prev);
                }}
              >
                <Ionicons
                  name={isFeedMuted ? "volume-mute" : "musical-notes"}
                  size={20}
                  color={isFeedMuted ? '#FFF' : '#A855F7'}
                />
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: '#9333EA',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const sName = musicInfoPost?.songName || '';
                  const sArt = musicInfoPost?.artist || '';
                  setMusicInfoPost(null);
                  router.push(`/post-editor?songName=${encodeURIComponent(sName)}&artist=${encodeURIComponent(sArt)}`);
                }}
              >
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Use this Audio</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  height: 44,
                  paddingHorizontal: 18,
                  borderRadius: 12,
                  backgroundColor: '#27272A',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => setMusicInfoPost(null)}
              >
                <Text style={{ color: '#A1A1AA', fontWeight: '600', fontSize: 14 }}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <PerformanceOverlay />
    </SafeAreaView>
  );
}
const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: moderateScale(16),
    paddingTop: verticalScale(6),
    paddingBottom: verticalScale(10),
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
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
    width: moderateScale(130),
    height: moderateScale(38),
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  headerLogo: {
    width: moderateScale(130),
    height: moderateScale(38),
    transform: [
      { scale: 2.1 },
      { translateX: moderateScale(-14) }
    ],
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(16),
  },
  iconBtn: {
    position: 'relative',
    padding: moderateScale(4),
  },
  headerBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#FF3B30',
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    borderWidth: 1,
    borderColor: COLORS.background,
  },

  postCard: {
    backgroundColor: COLORS.background,
    marginTop: verticalScale(0),
    borderWidth: 0,
    borderRadius: 0,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    overflow: 'hidden',
    paddingBottom: 0,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: moderateScale(16), paddingRight: moderateScale(6), paddingVertical: moderateScale(4) },

  followBtnInline: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: scale(8),
  },
  followBtnActiveInline: {
    backgroundColor: COLORS.primary,
  },
  followingBtnInline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  followBtnTextInline: {
    fontSize: moderateFont(12),
    fontWeight: '800',
    color: '#FFFFFF',
  },
  followingBtnTextInline: {
    color: COLORS.subtitle,
  },
  postUser: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  postAvatar: { width: moderateScale(30), height: moderateScale(30), borderRadius: moderateScale(15), borderWidth: 1.5, borderColor: COLORS.border },
  postUsername: { fontSize: moderateFont(14), fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  postLocation: { fontSize: moderateFont(12), color: COLORS.subtitle, marginTop: verticalScale(2) },
  musicInfoText: {
    fontSize: moderateFont(10),
    color: COLORS.subtitle,
    fontWeight: '400',
    fontStyle: 'italic',
    maxWidth: scale(180),
  },

  postImage: {
    width: '100%',
    maxHeight: 560,
    backgroundColor: COLORS.surface,
    alignSelf: 'center',
    marginTop: 0,
    overflow: 'hidden',
  },
  suggestionContainer: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(16),
    backgroundColor: COLORS.surface,
    marginBottom: verticalScale(24),
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  suggestionTitle: {
    fontSize: moderateFont(14),
    fontWeight: '700',
    color: COLORS.subtitle,
    marginBottom: verticalScale(12),
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: moderateScale(12),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestionAvatar: {
    width: moderateScale(56),
    height: moderateScale(56),
    borderRadius: moderateScale(28),
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  suggestionInfo: {
    flex: 1,
    marginLeft: scale(12),
    marginRight: scale(8),
  },
  suggestionName: {
    fontSize: moderateFont(15),
    fontWeight: '700',
    color: COLORS.text,
  },
  suggestionUsername: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle,
    marginTop: verticalScale(2),
  },
  suggestionBio: {
    fontSize: moderateFont(12),
    color: COLORS.text,
    marginTop: verticalScale(4),
    opacity: 0.8,
  },
  suggestionFollowBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
  },
  suggestionFollowText: {
    color: COLORS.white,
    fontSize: moderateFont(13),
    fontWeight: '700',
  },
  globalMuteButton: {
    position: 'absolute',
    bottom: verticalScale(8),
    right: scale(4),
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: scale(8),
    borderRadius: 20,
    zIndex: 10,
  },

  actionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: verticalScale(1),
    paddingRight: scale(4),
  },

  actionPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    marginTop: verticalScale(6),
    marginLeft: scale(4),
    gap: scale(14),
  },
  pillActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingVertical: verticalScale(2),
  },
  pillActionText: {
    fontSize: moderateFont(14),
    fontWeight: '600',
    color: COLORS.text,
  },
  reactionBarContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
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

  musicSquareBox: {
    width: scale(25),
    height: scale(25),
    borderRadius: moderateScale(5),
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  musicSquareImage: {
    width: '100%',
    height: '100%',
  },
  musicSquareBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 1,
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

  postFooter: { paddingHorizontal: scale(16), paddingBottom: 0, paddingTop: 0, marginBottom: 0 },
  captionText: { color: COLORS.text, fontSize: moderateFont(14), lineHeight: moderateFont(22) },
  boldText: { fontWeight: '800', color: COLORS.primary },
  boldUsername: { fontWeight: '800', color: '#3B2E7A', fontSize: moderateFont(14) },
  timeAgo: { color: COLORS.subtitle, fontSize: moderateFont(13), marginTop: verticalScale(2) },

  likersContainer: { marginTop: verticalScale(8) },
  likersLabel: { color: COLORS.subtitle, fontSize: moderateFont(13), fontWeight: '500' },
  likersList: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(4) },
  likerItem: { paddingVertical: verticalScale(1) },
  likerName: { color: COLORS.text, fontSize: moderateFont(13), fontWeight: '700' },
  likersAnd: { color: COLORS.subtitle, fontSize: moderateFont(13), fontWeight: '400', alignSelf: 'center' },
  likersComma: { color: COLORS.subtitle, fontSize: moderateFont(13), fontWeight: '400', alignSelf: 'center' },
  moreLikers: { color: COLORS.primary, fontSize: moderateFont(13), fontWeight: '700', alignSelf: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  likersModalSheet: { backgroundColor: COLORS.background, borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), paddingTop: verticalScale(12), paddingHorizontal: scale(20), maxHeight: '75%' },
  modalHandle: { width: scale(40), height: verticalScale(4), backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: verticalScale(16) },
  likersModalTitle: { fontSize: moderateFont(17), fontWeight: '700', color: COLORS.text, marginBottom: verticalScale(16) },
  likersModalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(8), gap: scale(10) },
  likersModalAvatar: { width: moderateScale(36), height: moderateScale(36), borderRadius: moderateScale(18), backgroundColor: COLORS.surface },
  likersModalUsername: { fontSize: moderateFont(12), fontWeight: '700', color: COLORS.text },
  likersModalFullname: { fontSize: moderateFont(11), color: COLORS.subtitle, marginTop: verticalScale(1) },

  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyContainer: { alignItems: 'center', marginTop: verticalScale(120), paddingHorizontal: scale(40) },
  emptyText: { color: COLORS.subtitle, marginTop: verticalScale(16), fontSize: moderateFont(16), textAlign: 'center', lineHeight: moderateFont(24) },
  exploreBtn: { marginTop: verticalScale(20), backgroundColor: COLORS.primary, paddingHorizontal: scale(24), paddingVertical: verticalScale(12), borderRadius: moderateScale(25) },
  exploreBtnText: { color: COLORS.text, fontWeight: 'bold', fontSize: moderateFont(15) },
});
