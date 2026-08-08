import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions, Platform, useWindowDimensions,
  StatusBar, TextInput, Alert, Modal, Pressable,
  Keyboard, Animated, Linking, DeviceEventEmitter,
  RefreshControl, ScrollView, KeyboardAvoidingView,
  LayoutAnimation, UIManager, BackHandler
} from 'react-native';

const isNewArch = !!((global as any).nativeFabricUIScheduler || (global as any).RN$Bridgeless);
if (Platform.OS === 'android' && !isNewArch && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { FollowButton } from '@/src/components/common/FollowButton';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { TabActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/store/authStore';
import { socketService } from '@/src/lib/socket';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ShareModal } from '@/components/ShareModal';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
import { SponsoredShotItem } from '@/components/SponsoredShotItem';
import { ALL_EMOJIS } from '@/src/constants/all-emojis';

const { width, height } = Dimensions.get('window');
const VIDEO_HEIGHT = height;

const AD_INTERVAL = 6; // Inject ad every 6th item

// --- Types ---
interface ShotUser {
  _id?: string;
  id?: string;
  username?: string;
  avatar?: string;
  avatar_url?: string;
  full_name?: string;
  name?: string;
  is_following?: boolean;
  isFollowing?: boolean;
}

interface ShotItem {
  _id?: string;
  id?: string;
  user?: ShotUser;
  author?: ShotUser;
  videoUrl?: string;
  video_url?: string;
  content_url?: string;
  thumbnail_url?: string;
  thumbnail?: string;
  isLiked?: boolean;
  is_liked?: boolean;
  user_reaction?: string;
  userReaction?: string;
  reactionEmoji?: string;
  isFollowing?: boolean;
  is_following?: boolean;
  is_following_creator?: boolean;
  likesCount?: string | number;
  likes_count?: string | number;
  commentsCount?: string | number;
  comments_count?: string | number;
  sharesCount?: string | number;
  shares_count?: string | number;
  bookmarksCount?: string | number;
  bookmarks_count?: string | number;
  title?: string;
  description?: string;
  caption?: string;
  content?: string;
  is_ad?: boolean;
  isAd?: boolean;
  cta_url?: string;
  cta_text?: string;
  isAuthor?: boolean;
  // 🛡️ WALL: Mode separation
  is_anonymous?: boolean;
  anonymous_persona?: { name?: string; username?: string; avatar?: string };
  isBookmarked?: boolean;
  music?: {
    song_name?: string;
    artist?: string;
    cover_image?: string;
    title?: string;
  };
  music_info?: {
    song_name?: string;
    artist?: string;
    cover_image?: string;
    title?: string;
  };
}

interface WhisperItem {
  _id?: string;
  id?: string;
  user?: { username?: string };
  content?: string;
  timestamp?: string | number | Date;
  created_at?: string | number | Date;
  likes?: number;
  likes_count?: number;
  comments?: number;
  comments_count?: number;
}

// --- Emoji Data ---
const EMOJI_CATEGORIES = [
  { id: 'recent', label: 'Recent', emojis: ['👍', '❤️', '😂', '🔥', '💀', '🤩', '✨', '😎', '🤓', '😇', '🤑', '😢'] }
];

const groupedEmojis = ALL_EMOJIS.reduce((acc, item) => {
  if (!acc[item.category]) {
    acc[item.category] = [];
  }
  acc[item.category].push(item.emoji);
  return acc;
}, {} as Record<string, string[]>);

const STATIC_EMOJI_CATEGORIES = [
  ...Object.entries(groupedEmojis).map(([category, emojis]) => {
    const labelMap: Record<string, string> = {
      Smileys: '😀 Smileys',
      Gestures: '👋 Gestures',
      Animals: '🐶 Animals',
      Food: '🍕 Food',
      Travel: '🚗 Travel',
      Activities: '🎭 Activities',
      Objects: '🔌 Objects',
      Symbols: '💬 Symbols'
    };
    return {
      label: labelMap[category] || category,
      emojis
    };
  })
];

// parseCount outside component - no recreation on every render
const parseCount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? 0 : n;
};



interface ReelVideoPlayerProps {
  videoSource: string;
  isMuted: boolean;
  isPlaying: boolean;
  isVisible: boolean;
  isFocused: boolean;
  item: ShotItem;
  setIsVideoReady: (ready: boolean) => void;
  setIsBuffering: (buffering: boolean) => void;
}

const ReelVideoPlayer = React.memo(({
  videoSource,
  isMuted,
  isPlaying,
  isVisible,
  isFocused,
  item,
  setIsVideoReady,
  setIsBuffering
}: ReelVideoPlayerProps) => {
  const player = useVideoPlayer(videoSource, p => {
    p.loop = true;
    p.muted = isMuted;
    p.timeUpdateEventInterval = 0.5;
  });

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (player.status === 'readyToPlay') {
      setIsBuffering(false);
      setIsVideoReady(true);
    }

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'loading') {
        setIsBuffering(true);
        setIsVideoReady(false);
      } else if (status === 'readyToPlay') {
        setIsBuffering(false);
        setIsVideoReady(true);
      } else if (status === 'error') {
        setIsBuffering(false);
      }
    });

    return () => {
      statusSub.remove();
    };
  }, [player]);

  useEffect(() => {
    if (isVisible && isFocused && isPlaying) {
      // Video is visible — play instantly (already reset to 0 when we last left)
      player.play();
      const shotId = item._id || item.id;
      if (shotId) {
        socketService.socket?.emit('shot:view', { shotId: String(shotId) });
      }
    } else {
      // Video goes hidden — pause AND silently reset to 0
      // User doesn't see this seek, so next visit starts fresh with zero stutter
      player.pause();
      try { player.currentTime = 0; } catch (_) { }
    }
  }, [isVisible, isFocused, isPlaying, player, item._id, item.id]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
    />
  );
});

// --- Reel Component (Normal Mode) ---
const ReelItem = React.memo(({ item, isVisible, shouldRenderVideo = true, isFocused, router, user, setScrollEnabled }: { item: ShotItem, isVisible: boolean, shouldRenderVideo?: boolean, isFocused: boolean, router: any, user: any, setScrollEnabled?: (enabled: boolean) => void }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const editInputRef = useRef<TextInput>(null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);

  // 🔥 OPTIMIZED STATE: Minimal state for instant rendering
  const [isLiked, setIsLiked] = useState(!!(item.isLiked || item.is_liked));
  const [activeEmoji, setActiveEmoji] = useState(
    item.user_reaction || item.userReaction || item.reactionEmoji || '❤️'
  );
  const author = useMemo(() => item.user || item.author, [item.user, item.author]);
  const authorId = author?._id || author?.id;
  const { isFollowing, isPending, isLoading, toggleFollow } = useFollowStatus(authorId || '', {
    isFollowing: !!(item.is_following || item.isFollowing || item.is_following_creator || author?.is_following || author?.isFollowing),
  });
  const [likesCount, setLikesCount] = useState(parseCount(item.likesCount ?? item.likes_count ?? (item as any).likes));
  const likesCountRef = useRef(parseCount(item.likesCount ?? item.likes_count ?? (item as any).likes));
  const commentsCount_ = parseCount(item.commentsCount ?? item.comments_count ?? (item as any).comments);
  const [commentsCount, setCommentsCount] = useState(commentsCount_);

  // UI state - only essential
  const [showComments, setShowComments] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [showHeart, setShowHeart] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [sharesCount, setSharesCount] = useState(parseCount(item.sharesCount ?? item.shares_count ?? (item as any).shares ?? 0));
  const [bookmarksCount, setBookmarksCount] = useState(parseCount(item.bookmarksCount ?? item.bookmarks_count ?? (item as any).bookmarks ?? 0));
  const [isBookmarked, setIsBookmarked] = useState(!!item.isBookmarked);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingReactionIndex, setEditingReactionIndex] = useState<number | null>(null);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentPage, setCommentPage] = useState(1);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [reactions, setReactions] = useState(user?.customReactions && user.customReactions.length > 0 ? user.customReactions : ['❤️', '😂', '😮', '😢', '🔥', '👏']);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState(0);
  const [isDisliked, setIsDisliked] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);

  // Floating Flying Emoji Animation State
  const [flyingEmoji, setFlyingEmoji] = useState<string | null>(null);
  const flyingAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flyingScale = useRef(new Animated.Value(0.6)).current;
  const flyingOpacity = useRef(new Animated.Value(0)).current;

  const triggerFlyingEmojiAnimation = useCallback((emoji: string) => {
    setFlyingEmoji(emoji);
    flyingAnim.setValue({ x: 0, y: 0 });
    flyingScale.setValue(0.6);
    flyingOpacity.setValue(1);

    Animated.parallel([
      Animated.timing(flyingAnim, {
        toValue: { x: windowWidth * 0.55, y: -160 },
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.spring(flyingScale, { toValue: 1.4, friction: 4, useNativeDriver: true }),
        Animated.timing(flyingScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
      Animated.timing(flyingOpacity, {
        toValue: 0,
        duration: 400,
        delay: 50,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFlyingEmoji(null);
    });
  }, [windowWidth, flyingAnim, flyingScale, flyingOpacity]);

  const toggleCaptionExpansion = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsCaptionExpanded(!isCaptionExpanded);
  };

  const playIconAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === 'ios' ? Math.min(insets.bottom, 20) : (insets.bottom > 0 ? Math.min(insets.bottom, 14) : 4);
  const bottomOffset = 52 + safeBottom + 10;
  const topOffset = insets.top > 0 ? insets.top + 10 : 30;
  const setCustomReactions = useAuthStore(s => s.setCustomReactions);

  const isOwnShot = useMemo(() => {
    return !!item.isAuthor || (user && author && (String(author._id || author.id) === String(user._id || user.id)));
  }, [item.isAuthor, user, author]);
  // 🛡️ WALL: If post is anonymous, use ghost identity — never show real username
  const isAnonPost = item.is_anonymous === true;

  const displayAuthorUsername = isAnonPost
    ? (author?.username || 'anonymous')
    : (isOwnShot ? (user?.username || author?.username || 'anufy_user') : (author?.username || 'anufy_user'));

  const displayAuthorAvatar = isAnonPost
    ? (author?.avatar_url || author?.avatar)
    : (isOwnShot ? (user?.avatar_url || user?.avatar || author?.avatar_url || author?.avatar) : (author?.avatar_url || author?.avatar));

  const avatarTimestamp = useMemo(() => Date.now(), [user?.avatar_url, user?.avatar]);

  const resolvedAvatarSource = useMemo(() => {
    let rawAvatar = displayAuthorAvatar;
    if (isOwnShot && rawAvatar && !rawAvatar.includes('ui-avatars.com') && !rawAvatar.startsWith('data:')) {
      rawAvatar = rawAvatar.includes('?') ? `${rawAvatar}&_t=${avatarTimestamp}` : `${rawAvatar}?_t=${avatarTimestamp}`;
    }
    return resolveAvatarUrl(rawAvatar, displayAuthorUsername);
  }, [displayAuthorAvatar, isOwnShot, avatarTimestamp, displayAuthorUsername]);

  const canVisitProfile = !isAnonPost && !!author?.username;

  // Sync interactive counts and flags when they are updated by parent/events
  useEffect(() => {
    const newCount = parseCount(item.likesCount ?? item.likes_count ?? (item as any).likes);
    likesCountRef.current = newCount;
    setLikesCount(newCount);
    setCommentsCount(parseCount(item.commentsCount ?? item.comments_count ?? (item as any).comments));
    setIsLiked(!!(item.isLiked || item.is_liked));
    setActiveEmoji(item.user_reaction || item.userReaction || item.reactionEmoji || '❤️');

    setIsBookmarked(!!item.isBookmarked);
  }, [
    item._id, item.id, item.likesCount, item.likes_count, (item as any).likes,
    item.commentsCount, item.comments_count, (item as any).comments,
    item.isLiked, item.is_liked, item.isBookmarked, (item as any).is_bookmarked,
    item.user_reaction, (item as any).userReaction, (item as any).reactionEmoji,
    item.is_following, (item as any).isFollowing, (item as any).is_following_creator,
    author?.is_following, (author as any)?.isFollowing
  ]);

  // 🚀 Optimize Video Source for Lightning Speed (Forces hardware-accelerated H.264 MP4 format with width limit to prevent stuttering/lagging)
  const videoSource = useMemo(() => {
    let url = item.videoUrl || item.video_url || item.content_url || '';
    if (!url) return 'https://assets.mixkit.co/videos/preview/mixkit-spinning-around-the-earth-in-space-4034-large.mp4';

    if (url.includes('cloudinary.com')) {
      const uploadIndex = url.indexOf('/upload/');
      if (uploadIndex !== -1) {
        const beforeUpload = url.substring(0, uploadIndex + 8);
        const afterUpload = url.substring(uploadIndex + 8);
        const versionMatch = afterUpload.match(/v\d+\//);
        if (versionMatch && versionMatch.index !== undefined) {
          const versionPart = afterUpload.substring(versionMatch.index);
          url = `${beforeUpload}f_mp4,q_auto,vc_h264,w_720,c_limit/${versionPart}`;
        } else {
          url = url.replace('/upload/', '/upload/f_mp4,q_auto,vc_h264,w_720,c_limit/');
        }
      }
    }
    return resolveMediaUrl(url);
  }, [item.videoUrl, item.video_url, item.content_url]);

  // 🚀 Resolve Poster Source with Auto-Generated Cloudinary fallback for newly created shots
  const resolvedPosterSource = useMemo(() => {
    const thumb = item.thumbnail_url || item.thumbnail || (item as any).thumbnailUrl;
    if (thumb) return resolveMediaUrl(thumb);

    const videoUrl = item.videoUrl || item.video_url || item.content_url || '';
    if (videoUrl && videoUrl.includes('cloudinary.com')) {
      let thumbUrl = videoUrl.replace(/\.[^/.]+$/, '.jpg');
      const uploadIndex = thumbUrl.indexOf('/upload/');
      if (uploadIndex !== -1) {
        const beforeUpload = thumbUrl.substring(0, uploadIndex + 8);
        const afterUpload = thumbUrl.substring(uploadIndex + 8);
        const versionMatch = afterUpload.match(/v\d+\//);
        if (versionMatch && versionMatch.index !== undefined) {
          const versionPart = afterUpload.substring(versionMatch.index);
          thumbUrl = `${beforeUpload}f_auto,q_auto,w_720,so_0,c_limit/${versionPart}`;
        } else {
          thumbUrl = thumbUrl.replace('/upload/', '/upload/f_auto,q_auto,w_720,so_0,c_limit/');
        }
      }
      return resolveMediaUrl(thumbUrl);
    }
    return '';
  }, [item.thumbnail_url, item.thumbnail, (item as any).thumbnailUrl, item.videoUrl, item.video_url, item.content_url]);

  useEffect(() => {
    if (isEditingMode) {
      setTimeout(() => editInputRef.current?.focus(), 150);
    }
  }, [isEditingMode, editingReactionIndex]);

  // Auto-play on focus/scroll back
  useEffect(() => {
    if (isVisible) {
      setIsPlaying(true);
    }
  }, [isVisible]);

  useEffect(() => {
    const localSub = DeviceEventEmitter.addListener(
      'post:liked:local',
      (data: { postId: string; isLiked: boolean; likesCount?: number; reaction?: string }) => {
        if (String(data.postId) === String(item._id || item.id)) {
          setIsLiked(data.isLiked);
          if (data.likesCount !== undefined) {
            likesCountRef.current = data.likesCount;
            setLikesCount(data.likesCount);
          }
          if (data.isLiked) {
            setActiveEmoji(data.reaction || '❤️');
          } else {
            setActiveEmoji('❤️');
          }
        }
      }
    );

    const bookmarkSub = DeviceEventEmitter.addListener(
      'post:bookmarked:local',
      (data: { postId: string; isBookmarked: boolean }) => {
        if (String(data.postId) === String(item._id || item.id)) {
          setIsBookmarked(data.isBookmarked);
          setBookmarksCount(prev => data.isBookmarked ? prev + 1 : Math.max(0, prev - 1));
        }
      }
    );

    return () => {
      localSub.remove();
      bookmarkSub.remove();
    };
  }, [item._id, item.id]);

  const updateReaction = useCallback((emoji: string) => {
    if (!emoji || editingReactionIndex === null) return;
    const newReactions = [...reactions];
    const symbol = Array.from(emoji)[0];
    newReactions[editingReactionIndex] = symbol;
    setReactions(newReactions);
    setCustomReactions(newReactions);
    const nextIndex = (editingReactionIndex + 1) % reactions.length;
    setEditingReactionIndex(nextIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [editingReactionIndex, reactions, setCustomReactions]);

  const startEditing = useCallback(() => {
    setIsEditingMode(true);
    setEditingReactionIndex(0);
  }, []);

  const selectReactionSlot = useCallback((idx: number) => {
    setEditingReactionIndex(idx);
    editInputRef.current?.focus();
  }, []);

  const resetReactions = useCallback(() => {
    const defaultReactions = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
    setReactions(defaultReactions);
    setCustomReactions(defaultReactions);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [setCustomReactions]);

  const finishEditing = useCallback(() => {
    setIsEditingMode(false);
    setEditingReactionIndex(null);
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const sendReaction = async (emoji: string) => {
    triggerFlyingEmojiAnimation(emoji);
    setIsDisliked(false);
    setShowReactionPicker(false);
    const wasLiked = isLiked;
    setActiveEmoji(emoji);
    setIsLiked(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shotId = item._id || item.id;
    if (!shotId) return;
    if (!wasLiked) {
      likesCountRef.current = likesCountRef.current + 1;
      setLikesCount(likesCountRef.current);
    }
    DeviceEventEmitter.emit('post:liked:local', {
      postId: shotId, isLiked: true,
      likesCount: likesCountRef.current, reaction: emoji
    });
    try {
      const res = await apiClient.post(`/reels/${String(shotId)}/like`, { reaction: emoji });
      if (res.data?.likesCount !== undefined) {
        likesCountRef.current = res.data.likesCount;
        setLikesCount(res.data.likesCount);
      }
    } catch (err: any) {
      setIsLiked(wasLiked);
      if (!wasLiked) {
        likesCountRef.current = Math.max(0, likesCountRef.current - 1);
        setLikesCount(likesCountRef.current);
        DeviceEventEmitter.emit('post:liked:local', { postId: shotId, isLiked: wasLiked, likesCount: likesCountRef.current });
      }
    }
    socketService.socket?.emit('shot:react', { shotId: String(shotId), emoji });
  };

  const toggleLike = async () => {
    setIsDisliked(false);
    setShowReactionPicker(false);
    if (isLiked) {
      setIsLiked(false);
      likesCountRef.current = Math.max(0, likesCountRef.current - 1);
      setLikesCount(likesCountRef.current);
      const shotId = item._id || item.id;
      if (!shotId) return;
      DeviceEventEmitter.emit('post:liked:local', { postId: shotId, isLiked: false, likesCount: likesCountRef.current, reaction: null });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const res = await apiClient.delete(`/reels/${String(shotId)}/like`);
        if (res.data?.likesCount !== undefined) {
          likesCountRef.current = res.data.likesCount;
          setLikesCount(res.data.likesCount);
        }
      } catch (err: any) {
        setIsLiked(true);
        likesCountRef.current = likesCountRef.current + 1;
        setLikesCount(likesCountRef.current);
        DeviceEventEmitter.emit('post:liked:local', { postId: shotId, isLiked: true, likesCount: likesCountRef.current });
      }
      socketService.socket?.emit('shot:unreact', { shotId: String(shotId) });
    } else {
      await sendReaction(activeEmoji);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const toggleDislike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsDisliked(prev => {
      const next = !prev;
      if (next && isLiked) {
        toggleLike();
      }
      return next;
    });
  }, [isLiked, toggleLike]);

  const handleFollow = useCallback(() => {
    if (!authorId || authorId === 'anonymous') return;
    toggleFollow();
  }, [authorId, toggleFollow]);

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    const shotId = item._id || item.id;
    if (!shotId) return;
    const text = newComment.trim();
    setNewComment('');
    setCommentsCount(prev => prev + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Optimistic add
    const tempComment = {
      _id: `temp_${Date.now()}`,
      content: text,
      user: { username: user?.username, avatar_url: user?.avatar_url || user?.avatar },
      created_at: new Date().toISOString(),
    };
    setComments(prev => [tempComment, ...prev]);

    try {
      await apiClient.post(`/reels/${String(shotId)}/comments`, { content: text });
      socketService.socket?.emit('shot:comment', { shotId: String(shotId), text });
    } catch (err) {
      setCommentsCount(prev => Math.max(0, prev - 1));
      setComments(prev => prev.filter(c => c._id !== tempComment._id));
    }
  };

  const fetchComments = useCallback(async (page = 1) => {
    const shotId = item._id || item.id;
    if (!shotId) return;
    setCommentsLoading(true);
    try {
      const res = await apiClient.get(`/reels/${String(shotId)}/comments?page=${page}&limit=20`);
      const data = res.data?.data?.comments || res.data?.comments || res.data?.data || [];
      if (page === 1) {
        setComments(Array.isArray(data) ? data : []);
      } else {
        setComments(prev => [...prev, ...(Array.isArray(data) ? data : [])]);
      }
      setHasMoreComments(data.length >= 20);
      setCommentPage(page);
    } catch (err) {
    } finally {
      setCommentsLoading(false);
    }
  }, [item._id, item.id]);

  const handleOpenComments = () => {
    setShowComments(true);
    if (comments.length === 0) fetchComments(1);
  };

  const handleBookmark = async () => {
    const shotId = item._id || item.id;
    if (!shotId) return;
    const newState = !isBookmarked;
    setIsBookmarked(newState);
    setBookmarksCount(prev => newState ? prev + 1 : Math.max(0, prev - 1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (newState) {
        await apiClient.post(`/reels/${String(shotId)}/bookmark`);
      } else {
        await apiClient.delete(`/reels/${String(shotId)}/bookmark`);
      }
      DeviceEventEmitter.emit('post:bookmarked:local', { postId: shotId, isBookmarked: newState });
    } catch (err) {
      setIsBookmarked(!newState); // revert
      setBookmarksCount(prev => !newState ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  const handleMute = () => {
    setIsMuted(prev => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleMoreMenu = () => {
    setShowMoreMenu(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleReport = async () => {
    setShowMoreMenu(false);
    const shotId = item._id || item.id;
    try {
      await apiClient.post(`/reels/${String(shotId)}/report`, { reason: 'Inappropriate content' });
    } catch (_) { }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleNotInterested = async () => {
    setShowMoreMenu(false);
    const shotId = item._id || item.id;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await apiClient.post(`/reels/${String(shotId)}/not-interested`);
    } catch (_) { }
  };

  const handleCopyLink = () => {
    setShowMoreMenu(false);
    const shotId = item._id || item.id;
    Linking.openURL(`https://anufy.app/shots/${shotId}`).catch(() => { });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = () => {
    setShowMoreMenu(false);
    const shotId = item._id || item.id;
    if (!shotId) return;

    Alert.alert(
      "Delete Shot",
      "Are you sure you want to permanently delete this shot?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              DeviceEventEmitter.emit('shot:deleted:local', { shotId: String(shotId) });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await apiClient.delete(`/reels/${String(shotId)}`);
            } catch (err) {
              Alert.alert("Error", "Failed to delete shot. Please try again.");
            }
          }
        }
      ]
    );
  };

  const animateHeart = () => {
    setShowHeart(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 200,
        delay: 500,
        useNativeDriver: true,
      }),
    ]).start(() => setShowHeart(false));
  };

  const animatePlayIcon = useCallback(() => {
    setShowPlayIcon(true);
    playIconAnim.setValue(0);
    Animated.sequence([
      Animated.timing(playIconAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(playIconAnim, { toValue: 0, duration: 200, delay: 200, useNativeDriver: true }),
    ]).start(() => setShowPlayIcon(false));
  }, [playIconAnim]);

  const handleSingleTap = useCallback(() => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    animatePlayIcon();
  }, [isPlaying, animatePlayIcon]);

  const handleDoubleTap = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < 250) {
      // Double tap detected - send reaction
      lastTapRef.current = 0;
      sendReaction(activeEmoji);

      setShowHeart(true);
      heartScale.setValue(0);
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 0, duration: 200, delay: 500, useNativeDriver: true }),
      ]).start(() => setShowHeart(false));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      // Potential first tap
      lastTapRef.current = now;
      // Wait for possible second tap
      setTimeout(() => {
        if (lastTapRef.current === now) {
          // No second tap happened, it's a single tap
          handleSingleTap();
          lastTapRef.current = 0;
        }
      }, 250);
    }
  };


  return (
    <View style={[styles.reelContainer, { height: windowHeight }]}>
      <View style={styles.videoWrapper}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDoubleTap}>
          {shouldRenderVideo && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <ReelVideoPlayer
                videoSource={videoSource}
                isMuted={isMuted}
                isPlaying={isPlaying}
                isVisible={isVisible}
                isFocused={isFocused}
                item={item}
                setIsVideoReady={setIsVideoReady}
                setIsBuffering={setIsBuffering}
              />
            </View>
          )}

          {/* Zero-black-screen high-performance cached poster overlay */}
          {(!isVideoReady || !isVisible) && resolvedPosterSource ? (
            <Image
              source={{ uri: resolvedPosterSource }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              cachePolicy="disk"
              transition={150}
            />
          ) : null}

          {showHeart && (
            <Animated.View style={[styles.centeredHeart, { transform: [{ scale: heartScale }] }]}>
              {activeEmoji === '❤️' ? (
                <MaterialCommunityIcons name="heart" size={100} color="#FF3040" />
              ) : (
                <Text style={{ fontSize: 100 }}>{activeEmoji}</Text>
              )}
            </Animated.View>
          )}
          {showPlayIcon && (
            <Animated.View style={[styles.centeredHeart, { opacity: playIconAnim }]}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={isPlaying ? "play" : "pause"} size={26} color="rgba(255,255,255,0.95)" />
              </View>
            </Animated.View>
          )}
        </Pressable>
      </View>

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomGradient} pointerEvents="none" />


      {/* Modern Interaction Sidebar */}
      <View style={[styles.interactionSidebar, { bottom: bottomOffset + 30 }]} pointerEvents="box-none">
        {/* User Profile Avatar in place of Mute icon */}
        <View style={styles.sidebarItem}>
          <TouchableOpacity
            onPress={() => canVisitProfile && router.push(`/user/${author.username}`)}
            activeOpacity={0.8}
            style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' }}
          >
            <Image
              source={{ uri: resolvedAvatarSource }}
              placeholder={require('../../assets/images/Profile_avatar_placeholder_large.png')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          </TouchableOpacity>
        </View>

        {/* Upvote, Reaction & Downvote Sidebar Group */}
        <View style={[styles.sidebarItem, { zIndex: 100 }]}>
          {showReactionPicker && (
            <View style={styles.sidebarReactionPopover}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4, gap: 6 }}>
                {reactions.map((emoji: string, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.8}
                    style={styles.popoverReactionPuck}
                    onPress={() => sendReaction(emoji)}
                  >
                    {emoji === '❤️' || emoji === '👍' ? (
                      <MaterialCommunityIcons name="thumb-up" size={18} color="#FF3040" />
                    ) : (
                      <Text style={{ fontSize: 18 }}>{emoji}</Text>
                    )}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.popoverPlusPuck}
                  onPress={() => {
                    setShowReactionPicker(false);
                    startEditing();
                  }}
                >
                  <Ionicons name="add" size={14} color="#FFF" />
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            onPress={toggleLike}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowReactionPicker(prev => !prev);
            }}
            activeOpacity={0.7}
            style={styles.likeBtnContainer}
          >
            {isLiked ? (
              <View style={styles.activeReactionWrapper}>
                {activeEmoji === '❤️' || activeEmoji === '👍' ? (
                  <MaterialCommunityIcons name="thumb-up" size={32} color="#FF3040" />
                ) : (
                  <Text style={styles.activeReactionEmoji}>{activeEmoji}</Text>
                )}
              </View>
            ) : (
              <MaterialCommunityIcons name="thumb-up-outline" size={32} color="#FFF" />
            )}
          </TouchableOpacity>

          <Text style={styles.sidebarText}>{likesCount > 1000 ? (likesCount / 1000).toFixed(1) + 'K' : likesCount}</Text>

          <TouchableOpacity
            onPress={toggleDislike}
            activeOpacity={0.7}
            style={{ marginTop: 6 }}
          >
            <MaterialCommunityIcons name={isDisliked ? "thumb-down" : "thumb-down-outline"} size={32} color={isDisliked ? "#FF3040" : "#FFF"} />
          </TouchableOpacity>
        </View>

        <View style={styles.sidebarItem}>
          <TouchableOpacity onPress={() => { setShareModalVisible(true); setSharesCount(prev => prev + 1); }}>
            <Ionicons name="arrow-redo-outline" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.sidebarText}>
            {parseCount(item.sharesCount ?? item.shares_count ?? (item as any).shares ?? 0)}
          </Text>
        </View>

        {/* Music Cover Box in place of Save button */}
        <View style={styles.sidebarItem}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={styles.musicDiscWrapper}
          >
            {(item.music?.cover_image || item.music_info?.cover_image) ? (
              <Image
                source={{ uri: resolveMediaUrl(item.music?.cover_image || item.music_info?.cover_image) }}
                style={styles.musicDiscImage}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="musical-notes" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.sidebarMore} onPress={handleMoreMenu}>
          <MaterialCommunityIcons name="dots-vertical" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Flying Emoji Animation towards Up Arrow */}
      {flyingEmoji && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: bottomOffset + 35,
            left: 24,
            zIndex: 99,
            transform: [
              { translateX: flyingAnim.x },
              { translateY: flyingAnim.y },
              { scale: flyingScale },
            ],
            opacity: flyingOpacity,
          }}
        >
          {flyingEmoji === '❤️' ? (
            <MaterialCommunityIcons name="heart" size={32} color="#FF3040" />
          ) : (
            <Text style={{ fontSize: 30 }}>{flyingEmoji}</Text>
          )}
        </Animated.View>
      )}

      {/* Advanced Bottom Dashboard */}
      {!isEditingMode && (
        <View style={[styles.bottomInfoFlow, { bottom: bottomOffset + 5, maxWidth: Math.min(windowWidth * 0.78, 420) }]} pointerEvents="box-none">
          <View style={styles.reactionCapsuleContainer} pointerEvents="box-none">
            {/* Username & Follow Button inline */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, paddingLeft: 0 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => canVisitProfile && router.push(`/user/${author.username}`)}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 18 }}>{displayAuthorUsername}</Text>
              </TouchableOpacity>

              {!isOwnShot && !isAnonPost && (
                <FollowButton
                  targetUserId={authorId || ''}
                  onToggle={toggleFollow}
                  isLoading={isLoading}
                  variant="transparent"
                  size="sm"
                  style={styles.followBtnInlineReel}
                  textStyle={styles.followBtnTextInlineReel}
                />
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginLeft: -3 }} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 0 }} scrollEnabled={false} pointerEvents="box-none">
              {reactions.map((emoji: string, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.8}
                  style={[styles.reactionPuck, idx === 0 && { marginLeft: 0 }]}
                  onPress={() => sendReaction(emoji)}
                >
                  {emoji === '❤️' || emoji === '👍' ? (
                    <MaterialCommunityIcons name="thumb-up" size={20} color="#FF3040" />
                  ) : (
                    <Text style={{ fontSize: 19 }}>{emoji}</Text>
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.plusPuckAction}
                onPress={startEditing}
              >
                <Ionicons name="add" size={14} color="#FFF" />
              </TouchableOpacity>
            </ScrollView>

            {/* Bio/caption below username */}
            {(item.caption || item.description || item.title || item.content) ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={toggleCaptionExpansion}
                style={{ marginTop: 4, width: '100%' }}
              >
                <Text
                  style={styles.bottomCaption}
                  numberOfLines={isCaptionExpanded ? undefined : 1}
                  ellipsizeMode="tail"
                >
                  {item.caption || item.description || item.title || item.content}
                </Text>
                {!isCaptionExpanded && ((item.caption || item.description || item.title || item.content)?.length || 0) > 30 && (
                  <Text style={{ fontWeight: '800', color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 }}>more</Text>
                )}
              </TouchableOpacity>
            ) : null}

            {/* Comment Placeholder Bar below description */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleOpenComments}
              style={styles.commentPlaceholderBar}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="chatbubble-outline" size={15} color="rgba(255,255,255,0.75)" />
                <Text style={styles.commentPlaceholderText}>Add a comment...</Text>
              </View>
              <View style={styles.commentCountBadge}>
                <Text style={styles.commentCountBadgeText}>{commentsCount > 1000 ? (commentsCount / 1000).toFixed(1) + 'K' : commentsCount}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {item.is_ad && (
            <TouchableOpacity
              style={styles.adCtaBtn}
              onPress={() => item.cta_url && Linking.openURL(item.cta_url)}
            >
              <Text style={styles.adCtaText}>{item.cta_text || 'LEARN MORE'}</Text>
              <Ionicons name="open-outline" size={14} color="#000" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          )}
        </View>
      )}



      {/* Customize Reactions - Modal (outside FlashList to prevent scroll passthrough) */}
      <Modal visible={isEditingMode} animationType="slide" transparent statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {/* Backdrop - only above the sheet */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={finishEditing} />

          {/* Sheet - stops tap propagation to backdrop */}
          <Pressable style={styles.customiseSheet} onPress={() => { }}>
            <View style={styles.sheetHeaderHandle} />
            <View style={styles.customiseHeader}>
              <TouchableOpacity onPress={finishEditing}>
                <Ionicons name="arrow-back" size={28} color="#000" />
              </TouchableOpacity>
              <Text style={styles.customiseTitle}>Customize reactions</Text>
              <View style={styles.customiseActions}>
                <TouchableOpacity onPress={resetReactions} style={{ marginRight: 20 }}>
                  <Ionicons name="refresh-outline" size={26} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity onPress={finishEditing}>
                  <Ionicons name="checkmark" size={30} color="#000" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Reaction Slots */}
            <View style={styles.customiseContent}>
              <View style={styles.largeReactionCapsule}>
                {reactions.map((emoji: string, idx: number) => (
                  <View key={idx} style={{ alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => selectReactionSlot(idx)}
                      style={[
                        styles.largeReactionPuck,
                        editingReactionIndex === idx && styles.largePuckActive
                      ]}
                    >
                      <Text style={{ fontSize: idx === 0 ? 26 : 20 }}>{emoji}</Text>
                    </TouchableOpacity>
                    {editingReactionIndex === idx && (
                      <View style={styles.activeDot} />
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Emoji Picker Drawer */}
            <View style={styles.emojiPickerDrawer}>
              {/* Search Bar */}
              <View style={styles.searchBarContainer}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#999" />
                  <TextInput
                    placeholder="Search emoji..."
                    placeholderTextColor="#666"
                    style={styles.searchText}
                    onChangeText={(text) => setEmojiSearch(text)}
                    value={emojiSearch}
                  />
                  {emojiSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setEmojiSearch('')}>
                      <Ionicons name="close-circle" size={16} color="#555" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Category Tab Bar */}
              {emojiSearch.trim().length === 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.emojiTabBar}
                  contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
                  keyboardShouldPersistTaps="always"
                >
                  {STATIC_EMOJI_CATEGORIES.map((cat, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => setSelectedEmojiCategory(idx)}
                      activeOpacity={0.7}
                      style={[
                        styles.emojiTabBtn,
                        selectedEmojiCategory === idx && styles.emojiTabBtnActive
                      ]}
                    >
                      <Text style={styles.emojiTabIcon}>{cat.emojis[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Emoji Grid */}
              <ScrollView
                style={styles.emojiList}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="always"
              >
                {emojiSearch.trim().length > 0 ? (
                  <View style={styles.emojiSection}>
                    <Text style={styles.sectionHeader}>
                      {STATIC_EMOJI_CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(emojiSearch)).length} results
                    </Text>
                    <View style={styles.emojiGrid}>
                      {STATIC_EMOJI_CATEGORIES.flatMap(c => c.emojis)
                        .filter(e => e.includes(emojiSearch))
                        .map((emoji, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={styles.emojiItem}
                            onPress={() => { updateReaction(emoji); setEmojiSearch(''); }}
                          >
                            <Text style={styles.emojiItemText}>{emoji}</Text>
                          </TouchableOpacity>
                        ))
                      }
                    </View>
                  </View>
                ) : (
                  <View style={styles.emojiSection}>
                    <Text style={styles.sectionHeader}>
                      {STATIC_EMOJI_CATEGORIES[selectedEmojiCategory]?.label} · {STATIC_EMOJI_CATEGORIES[selectedEmojiCategory]?.emojis.length}
                    </Text>
                    <View style={styles.emojiGrid}>
                      {STATIC_EMOJI_CATEGORIES[selectedEmojiCategory]?.emojis.map((emoji, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.emojiItem}
                          onPress={() => updateReaction(emoji)}
                        >
                          <Text style={styles.emojiItemText}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                <View style={{ height: 30 }} />
              </ScrollView>
            </View>
          </Pressable>
        </View>
      </Modal>

      {/* Real Comments Sheet */}
      <Modal visible={showComments} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowComments(false)} />
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Comments {commentsCount > 0 ? `(${commentsCount})` : ''}</Text>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <Ionicons name="close" size={24} color="#555" />
              </TouchableOpacity>
            </View>

            {/* Comments List */}
            {commentsLoading && comments.length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <MaterialCommunityIcons name="comment-multiple-outline" size={48} color="#222" />
                <Text style={styles.emptyText}>Be the first to start the vibe!</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
                onScroll={({ nativeEvent }) => {
                  const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                  if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50) {
                    if (hasMoreComments && !commentsLoading) fetchComments(commentPage + 1);
                  }
                }}
                scrollEventThrottle={400}
              >
                {comments.map((comment: any, idx: number) => (
                  <View key={comment._id || idx} style={styles.commentRow}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#222', overflow: 'hidden', marginRight: 10 }}>
                      <Image
                        source={{ uri: resolveAvatarUrl(comment.user?.avatar_url || comment.user?.avatar, comment.user?.username) }}
                        style={{ width: 34, height: 34, borderRadius: 17 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.commentUsername}>{comment.user?.username || 'user'}</Text>
                      <Text style={styles.commentText}>{comment.content || comment.text}</Text>
                      <Text style={styles.commentTime}>
                        {comment.created_at ? new Date(comment.created_at).toLocaleDateString() : ''}
                      </Text>
                    </View>
                  </View>
                ))}
                {commentsLoading && <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 10 }} />}
              </ScrollView>
            )}

            {/* Comment Input */}
            <View style={styles.commentInputRow}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#222', overflow: 'hidden' }}>
                <Image
                  source={{ uri: resolveAvatarUrl(user?.avatar_url || user?.avatar, user?.username) }}
                  style={styles.commentAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              </View>
              <View style={styles.commentBar}>
                <TextInput
                  placeholder="Add a thought..."
                  placeholderTextColor="#666"
                  style={styles.inputField}
                  value={newComment}
                  onChangeText={setNewComment}
                  onSubmitEditing={handleSendComment}
                  returnKeyType="send"
                />
                <TouchableOpacity style={styles.sendIcon} onPress={handleSendComment}>
                  <Ionicons name="arrow-up" size={20} color="#000" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* More Menu Modal */}
      <Modal visible={showMoreMenu} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowMoreMenu(false)} />
          <View style={styles.moreMenuSheet}>
            <View style={styles.sheetHandle} />

            {isOwnShot ? (
              <>
                <TouchableOpacity style={styles.moreMenuItem} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={22} color="#FF4444" />
                  <Text style={[styles.moreMenuText, { color: '#FF4444' }]}>Delete Shot</Text>
                </TouchableOpacity>
                <View style={styles.moreMenuDivider} />
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.moreMenuItem} onPress={handleReport}>
                  <Ionicons name="flag-outline" size={22} color="#FF4444" />
                  <Text style={[styles.moreMenuText, { color: '#FF4444' }]}>Report</Text>
                </TouchableOpacity>
                <View style={styles.moreMenuDivider} />
                <TouchableOpacity style={styles.moreMenuItem} onPress={handleNotInterested}>
                  <Ionicons name="eye-off-outline" size={22} color="#FFF" />
                  <Text style={styles.moreMenuText}>Not Interested</Text>
                </TouchableOpacity>
                <View style={styles.moreMenuDivider} />
              </>
            )}

            {/* Save / Bookmark Option */}
            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); handleBookmark(); }}>
              <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={isBookmarked ? COLORS.primary : '#FFF'} />
              <Text style={[styles.moreMenuText, isBookmarked && { color: COLORS.primary }]}>
                {isBookmarked ? 'Saved to Bookmarks' : 'Save Shot'}
              </Text>
            </TouchableOpacity>
            <View style={styles.moreMenuDivider} />

            {/* Music Info with Cover Thumbnail */}
            {(() => {
              let music = item.music;
              let musicInfo = item.music_info;
              if (typeof music === 'string') {
                try { music = JSON.parse(music); } catch (_) { }
              }
              if (typeof musicInfo === 'string') {
                try { musicInfo = JSON.parse(musicInfo); } catch (_) { }
              }
              const songName = music?.song_name || musicInfo?.song_name || music?.title || musicInfo?.title || item.title || "";
              const artist = music?.artist || musicInfo?.artist || "";
              const coverImage = music?.cover_image || musicInfo?.cover_image || "";

              return (
                <View style={[styles.moreMenuItem, { paddingVertical: 8 }]}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, overflow: 'hidden', marginRight: 12, backgroundColor: '#222', borderWidth: 1, borderColor: '#444' }}>
                    <Image
                      source={
                        coverImage
                          ? { uri: String(coverImage) }
                          : resolvedAvatarSource as any
                      }
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moreMenuText, { fontWeight: 'bold' }]} numberOfLines={1}>
                      {songName || "Original Sound"}
                    </Text>
                    <Text style={{ color: '#888', fontSize: 12 }} numberOfLines={1}>
                      {artist || displayAuthorUsername}
                    </Text>
                  </View>
                </View>
              );
            })()}
            <View style={styles.moreMenuDivider} />

            <TouchableOpacity style={styles.moreMenuItem} onPress={handleCopyLink}>
              <Ionicons name="link-outline" size={22} color="#FFF" />
              <Text style={styles.moreMenuText}>Copy Link</Text>
            </TouchableOpacity>
            <View style={styles.moreMenuDivider} />
            <TouchableOpacity style={styles.moreMenuItem} onPress={() => setShowMoreMenu(false)}>
              <Ionicons name="close-outline" size={22} color="#888" />
              <Text style={[styles.moreMenuText, { color: '#888' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ShareModal
        isVisible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        postId={String(item._id || item.id || '')}
        postContent={item.caption || item.description || item.content}
        mediaUrl={item.thumbnail_url || item.thumbnail || item.videoUrl || item.video_url || item.content_url}
        mediaType="video"
        isShot={true}
        authorUsername={author?.username}
        authorAvatar={author?.avatar || author?.avatar_url}
      />
    </View>
  );
});

// --- Anonymous Categories ---
const GHOST_CATEGORIES = [
  { id: 'anime', label: 'Anime', icon: 'television-play' },
  { id: 'friends', label: 'Friends', icon: 'account-group' },
  { id: 'sports', label: 'Sports', icon: 'soccer' },
  { id: 'politics', label: 'Politics', icon: 'bank' },
  { id: 'movies_series', label: 'Movies & Series', icon: 'movie-open' },
  { id: 'adult', label: 'Adult 18+', icon: 'fire' },
];

// 🚀 INSTANT PRE-CACHING: Module-level cache for instant 0ms mount across navigation
let globalShotsCache: { data: ShotItem[]; timestamp: number } = { data: [], timestamp: 0 };

export default function ShotsScreen() {
  const isFocused = useIsFocused();
  const router = useSafeRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  // 🔙 HARDWARE BACK BUTTON: Always go to Home tab, never let tab history go to explore
  useEffect(() => {
    if (!isFocused) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.dispatch(TabActions.jumpTo('index'));
      return true; // Prevent default back behavior
    });
    return () => backHandler.remove();
  }, [isFocused, navigation]);

  // Initialize with cached data if available for instant 0ms render
  const [reels, setReels] = useState<ShotItem[]>(() => globalShotsCache.data || []);
  const [loading, setLoading] = useState<boolean>(() => globalShotsCache.data.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [visibleShotId, setVisibleShotId] = useState<string | null>(() => {
    if (globalShotsCache.data.length > 0) {
      const first = globalShotsCache.data[0];
      return String(first._id || first.id || '');
    }
    return null;
  });
  const [listScrollEnabled, setListScrollEnabled] = useState(true);
  const [lastLoadTime, setLastLoadTime] = useState<number>(() => globalShotsCache.timestamp || 0);
  const DATA_FRESHNESS_MS = 30000; // Consider data fresh for 30 seconds

  const preloadQueueRef = useRef<Set<string>>(new Set());
  // 🛡️ LOCAL OVERRIDES: Persists user reactions/counts across feed refreshes
  const localOverridesRef = useRef<Record<string, { isLiked: boolean; likesCount: number; reaction: string | undefined }>>({});

  // Merge local overrides into fresh server data so likes/reactions survive refresh
  const mergeOverrides = useCallback((items: ShotItem[]): ShotItem[] => {
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
        user_reaction: override.reaction || undefined,
      };
    });
  }, []);

  const injectAds = useCallback((data: ShotItem[]): ShotItem[] => {
    if (data.length === 0) return data;
    const result: ShotItem[] = [];
    data.forEach((item, index) => {
      result.push(item);
      if (index > 0 && (index + 1) % AD_INTERVAL === 0) {
        result.push({
          id: `ad_${item._id || item.id}_${index}`,
          _id: `ad_${item._id || item.id}_${index}`,
          isAd: true,
          is_ad: true,
          title: 'Sponsored Ad',
          caption: 'Tired of ads? Get AnuFy Premium for an ad-free experience, custom themes, and badges! 🚀',
          cta_text: 'Learn More',
          cta_url: 'https://anufy.app/premium'
        } as ShotItem);
      }
    });
    return result;
  }, []);

  // 🚀 INSTANT LOADING: Preload next batch in background
  const preloadNextBatch = useCallback(async (nextPage: number) => {
    try {
      const res = await apiClient.get(`/reels?page=${nextPage}&limit=10`);
      const rawData = res.data?.data || res.data?.reels || res.data || [];
      const data = Array.isArray(rawData) ? rawData.filter(Boolean) : [];
      if (data.length > 0) {
        // Preload next batch silently in memory
      }
    } catch (_) { }
  }, []);

  const fetchReels = useCallback(async (pageNum = 1, isRefresh = false, forceRefresh = false) => {
    const now = Date.now();
    const cacheHit = globalShotsCache.data.length > 0;
    performanceEngine.startScreenTrace('ShotsScreen');
    performanceEngine.trackCacheAccess('Feed', cacheHit);
    performanceEngine.endScreenTrace('ShotsScreen', cacheHit);

    if (isRefresh) {
      setLoadingMore(false);
    } else if (!forceRefresh && pageNum === 1 && !loading && lastLoadTime > 0 && (now - lastLoadTime) < DATA_FRESHNESS_MS && reels.length > 0) {
      return;
    }

    if (!isRefresh && (loadingMore || (!hasMore && pageNum > 1))) return;

    try {
      if (isRefresh) {
        setPage(1);
        setHasMore(true);
        setRefreshing(true);
      } else if (pageNum > 1) {
        setLoadingMore(true);
      } else if (reels.length === 0) {
        setLoading(true);
      }

      let data: ShotItem[] = [];

      // 🚀 HARD REFRESH OR FORCE REFRESH: ALWAYS bypass cache and fetch fresh from API
      if (!isRefresh && !forceRefresh && pageNum === 1 && globalShotsCache.data.length > 0 && (now - globalShotsCache.timestamp) < 30000) {
        data = globalShotsCache.data;
      } else {
        const endpoint = pageNum === 1 ? '/bootstrap/reels' : `/reels?page=${pageNum}&limit=10`;
        const res = await apiClient.get(endpoint);
        const rawData = res.data?.data?.reels || res.data?.reels || res.data?.data || res.data || [];
        data = Array.isArray(rawData) ? rawData.filter(Boolean) : [];
      }

      const newReels = data;

      if (pageNum === 1) {
        if (newReels.length > 0) {
          globalShotsCache = { data: newReels, timestamp: Date.now() };
        }
        const mergedData = mergeOverrides(injectAds(newReels));
        setReels(mergedData);
        if (mergedData.length > 0) {
          const firstId = mergedData[0]._id || mergedData[0].id;
          if (firstId) setVisibleShotId(String(firstId));
        }
        setLastLoadTime(now);
      } else {
        setReels(prev => {
          const existingWithoutAds = prev.filter(r => r && !r.isAd);
          return injectAds([...existingWithoutAds, ...mergeOverrides(newReels)]);
        });
      }

      // Fetch saved reels in background — only on first page load to avoid repeated heavy setState
      if (pageNum === 1) {
        const token = useAuthStore.getState().token;
        if (token) {
          apiClient.get('/reels/saved').then(savedRes => {
            const savedReels = savedRes?.data?.reels || savedRes?.data?.data || [];
            if (!savedReels.length) return;
            const savedReelIds = new Set(savedReels.map((r: any) => String(r._id || r.id)));
            setReels(prev => prev.map(reel => {
              if (!reel) return reel;
              const reelId = String(reel._id || reel.id);
              if (savedReelIds.has(reelId) === reel.isBookmarked) return reel; // skip if unchanged
              return { ...reel, isBookmarked: savedReelIds.has(reelId) };
            }));
          }).catch(() => { /* silent */ });
        }
      }

      setHasMore(newReels.length >= 10);
      setPage(pageNum);

      if (newReels.length >= 10) {
        preloadNextBatch(pageNum + 1);
      }
    } catch (error) {
    } finally {
      setLoading(false);
      setLoadingMore(false);
      if (isRefresh) {
        // Guarantee native RefreshControl spinner completes animation cycle (~400ms) to prevent freezing
        setTimeout(() => {
          setRefreshing(false);
        }, 400);
      } else {
        setRefreshing(false);
      }
    }
  }, [hasMore, loadingMore, injectAds, mergeOverrides, preloadNextBatch, loading, lastLoadTime, reels.length]);

  const isAnonymous = user?.isAnonymousMode;
  const lastModeRef = useRef<boolean | undefined>(isAnonymous);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!user || !isFocused) return;
    const hasCache = reels.length > 0 || (globalShotsCache?.data && globalShotsCache.data.length > 0);
    performanceEngine.startScreenTrace('ShotsScreen');
    performanceEngine.trackCacheAccess('Feed', hasCache);
    performanceEngine.endScreenTrace('ShotsScreen', hasCache);

    if (isFetchingRef.current) return;

    if (reels.length === 0) {
      isFetchingRef.current = true;
      fetchReels(1, false, true).finally(() => { isFetchingRef.current = false; });
    } else {
      // Background refresh if stale
      const now = Date.now();
      if (!lastLoadTime || (now - lastLoadTime) > DATA_FRESHNESS_MS) {
        fetchReels(1, false, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, user, lastLoadTime]);

  // 🛡️ When mode switches, clear cache and reload
  useEffect(() => {
    if (!user) return;
    if (lastModeRef.current !== isAnonymous) {
      lastModeRef.current = isAnonymous;
      setReels([]);
      setPage(1);
      setHasMore(true);
      setVisibleShotId(null);
      setLastLoadTime(0);
      globalShotsCache = { data: [], timestamp: 0 };
      fetchReels(1, true, true);
    }
  }, [isAnonymous, user]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('mode_switched', () => {
      setReels([]);
      setPage(1);
      setHasMore(true);
      setVisibleShotId(null);
      setLastLoadTime(0);
      globalShotsCache = { data: [], timestamp: 0 };
      fetchReels(1, true, true);
    });
    return () => sub.remove();
  }, [fetchReels]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('post:liked:local', (data: any) => {
      setReels(prev =>
        prev.map(r => {
          if (r && String(r._id || r.id) === String(data.postId)) {
            const count = data.likesCount !== undefined ? data.likesCount : (r.likes_count ?? r.likesCount ?? 0);
            // ✅ Persist override so it survives feed refresh
            localOverridesRef.current[String(data.postId)] = {
              isLiked: data.isLiked,
              likesCount: count,
              reaction: data.isLiked ? (data.reaction || r.user_reaction || '❤️') : null,
            };
            const currentUser = useAuthStore.getState().user;
            let updatedLikers = (r as any).likers ? [...(r as any).likers] : [];
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
              ...r,
              isLiked: data.isLiked,
              is_liked: data.isLiked,
              likes_count: count,
              likesCount: count,
              user_reaction: data.reaction || r.user_reaction,
              likers: updatedLikers
            };
          }
          return r;
        })
      );
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reels && reels.length > 0 && visibleShotId == null) {
      const firstId = reels[0]?._id || reels[0]?.id;
      if (firstId) setVisibleShotId(String(firstId));
    }
  }, [reels, visibleShotId]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const first = viewableItems[0];
      if (first?.item) {
        const id = first.item._id || first.item.id;
        if (id) setVisibleShotId(String(id));
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 200,
  }).current;

  useEffect(() => {
    const s = socketService.socket;
    if (!s) return;
    const onShotUpdated = (payload: any) => {
      const shotId = payload.shotId || payload.postId;
      if (!shotId) return;

      const currentUserId = String(user?._id || user?.id || '');
      const payloadUserId = String(payload.userId || '');
      const isMyAction = !!(currentUserId && payloadUserId && currentUserId === payloadUserId);

      setReels((prev) =>
        prev.map((r) => {
          const id = r._id || r.id;
          if (String(id) !== String(shotId)) return r;

          return {
            ...r,
            likesCount: payload.likesCount ?? r.likesCount ?? r.likes_count,
            likes_count: payload.likesCount ?? r.likes_count,
            commentsCount: payload.commentsCount ?? r.commentsCount ?? r.comments_count,
            comments_count: payload.commentsCount ?? r.comments_count,
            user_reaction: isMyAction ? (payload.reaction || r.user_reaction) : r.user_reaction,
            is_liked: isMyAction ? (payload.action !== 'unlike' && !!payload.reaction) : r.is_liked,
            isLiked: isMyAction ? (payload.action !== 'unlike' && !!payload.reaction) : r.isLiked
          };
        })
      );
    };
    s.on('shot:updated', onShotUpdated);
    s.on('post:updated', onShotUpdated);
    return () => {
      s.off('shot:updated', onShotUpdated);
      s.off('post:updated', onShotUpdated);
    };
  }, []);

  const topOffset = insets.top > 0 ? insets.top + 10 : 30;

  const visibleIndex = useMemo(() => {
    if (!visibleShotId || !reels.length) return 0;
    const idx = reels.findIndex(r => r && String(r._id || r.id) === visibleShotId);
    return idx >= 0 ? idx : 0;
  }, [visibleShotId, reels]);

  return (
    <View style={styles.blackBase}>
      <StatusBar barStyle="light-content" translucent />

      {/* Sticky Top gradient & Header Area */}
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={[styles.topGradient, { height: topOffset + 60, position: 'absolute', left: 0, right: 0, top: 0, zIndex: 90 }]} pointerEvents="none" />
      <View style={[styles.reelHeader, { top: topOffset, justifyContent: 'center', position: 'absolute', left: 0, right: 0, zIndex: 100 }]} pointerEvents="box-none">
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={[styles.backBtn, { position: 'absolute', left: 12, zIndex: 200 }]}
          onPress={() => {
            navigation.dispatch(TabActions.jumpTo('index'));
          }}
        >
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 }}>Shots</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={{ position: 'absolute', right: 12, zIndex: 200, padding: 5 }}
          onPress={() => router.push('/post-editor')}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>


      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.primary} /></View>
      ) : reels.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchReels(1, true);
              }}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >
          <View style={styles.emptyContainer}>
            <Ionicons name="videocam-outline" size={80} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyTitle}>No Shots Yet</Text>
            <Text style={styles.emptySubtitle}>Be the first to share a moment with the AnuFy community!</Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/create')}>
              <Text style={styles.createBtnText}>Create Shot</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <FlashList<any>
          data={reels}
          keyExtractor={i => i ? String(i._id || i.id) : 'unknown'}
          pagingEnabled
          scrollEnabled={listScrollEnabled}
          extraData={visibleShotId}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews={false}
          drawDistance={height * 3}
          decelerationRate={0.85}
          disableIntervalMomentum={true}
          scrollEventThrottle={8}
          snapToInterval={height}
          snapToAlignment="start"
          scrollsToTop={false}
          overrideItemLayout={(layout: any) => {
            layout.size = height;
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchReels(1, true);
              }}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          renderItem={({ item, index }) => {
            if (!item) return null;
            if (item.isAd || item.is_ad) {
              return <SponsoredShotItem ad={item as any} />;
            }
            const isPreloadTarget = Math.abs(index - visibleIndex) <= 2;
            return (
              <ReelItem
                item={item}
                isVisible={visibleShotId === String(item._id || item.id)}
                shouldRenderVideo={isPreloadTarget}
                isFocused={isFocused}
                router={router}
                user={user}
                setScrollEnabled={setListScrollEnabled}
              />
            );
          }}
          onEndReached={() => {
            if (hasMore && !loadingMore) {
              fetchReels(page + 1);
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ height: height, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
        />
      )}
      <PerformanceOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  blackBase: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  reelContainer: { width, height, backgroundColor: '#000' },
  videoWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  centeredHeart: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.4 },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, zIndex: 5 },
  muteBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 16, zIndex: 25, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },

  // Header Pill Design
  reelHeader: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 20, gap: 12 },
  backBtn: { padding: 5, marginRight: 4 },
  headerProfilePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', padding: 8, paddingHorizontal: 14, borderRadius: 8, flex: 1, marginLeft: 0 },
  pillAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#FFF' },
  pillInfo: { marginLeft: 12, gap: 3, flex: 1 },
  pillUsername: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  headerMusicRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMusicText: { color: '#AAA', fontSize: 11, fontStyle: 'italic', fontWeight: '500', maxWidth: 120 },
  pillFollow: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 6, paddingHorizontal: 20, minWidth: 75, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)' },
  pillFollowText: { color: '#FFF', fontSize: 13, fontWeight: '900' },

  // Modern Sidebar
  interactionSidebar: { position: 'absolute', right: 8, bottom: 120, alignItems: 'center', gap: 16, zIndex: 15 },
  sidebarItem: { alignItems: 'center', gap: 4 },
  sidebarText: { color: '#FFF', fontSize: 11, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 3 },
  sidebarMore: { marginTop: 8, opacity: 0.7 },
  likeBtnContainer: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeReactionWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiOutlineFrame: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFF',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeReactionEmoji: {
    fontSize: 18,
  },
  // Advanced Bottom Dashboard (Bottom-Left for smooth scrolling)
  bottomInfoFlow: {
    position: 'absolute',
    left: 8,
    zIndex: 40,
    alignItems: 'flex-start',
    maxWidth: width * 0.82,
  },
  reactionCapsuleContainer: { maxWidth: width * 0.85, justifyContent: 'center' },
  reactionPuck: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginHorizontal: 1 },
  plusPuckAction: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginLeft: 3, marginRight: 1 },

  followBtnInlineReel: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnActiveInlineReel: {
    backgroundColor: COLORS.primary,
  },
  followingBtnInlineReel: {
    backgroundColor: 'transparent',
    borderWidth: 1.2,
    borderColor: '#FFF',
  },
  followBtnTextInlineReel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  followingBtnTextInlineReel: {
    color: '#FFF',
  },
  musicDiscWrapper: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  musicDiscImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },

  // Profile Section on Bottom
  bottomProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  bottomAvatarWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: '#FFF',
  },
  bottomAvatar: {
    width: '100%',
    height: '100%',
  },
  bottomUsername: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  bottomFollowBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  bottomFollowBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  bottomCaption: {
    color: '#FFF',
    fontSize: 13,
    marginTop: 0,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    maxWidth: width * 0.75,
  },
  bottomMusicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  bottomMusicText: {
    color: '#EAEAEA',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: width * 0.6,
  },

  // Video Duration Progress Bar
  progressBarTouchArea: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 40,
    justifyContent: 'center',
    zIndex: 100,
  },
  progressBarBackground: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 1.5
  },

  // Customise Sheet (Instagram-like Half-Screen)
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 95 },
  customiseSheet: { height: height * 0.78, backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  sheetHeaderHandle: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  customiseHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, justifyContent: 'space-between', marginBottom: 15 },
  customiseTitle: { color: '#000', fontSize: 17, fontWeight: '800' },
  customiseActions: { flexDirection: 'row', alignItems: 'center' },
  customiseContent: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginBottom: 10 },
  largeReactionCapsule: { flexDirection: 'row', backgroundColor: '#F2F2F2', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 40, gap: 6, marginBottom: 15, alignItems: 'center' },
  largeReactionPuck: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  largePuckActive: { backgroundColor: 'transparent' },
  activeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#000', marginTop: 2 },
  customiseTip: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 4 },
  doubleTapInfo: { color: '#AAA', fontSize: 11, textAlign: 'center' },

  // Emoji Picker within Sheet
  emojiPickerDrawer: { flex: 1, backgroundColor: '#F8F8F8', borderTopLeftRadius: 25, borderTopRightRadius: 25, marginTop: 5, zIndex: 110 },
  searchBarContainer: { padding: 12, zIndex: 115 },
  searchBar: { backgroundColor: '#EFEFEF', borderRadius: 25, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#D0D0D0' },
  searchText: { color: '#333', fontSize: 13, flex: 1 },
  emojiList: { flex: 1, zIndex: 120 },
  emojiSection: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { color: '#555', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  emojiItem: { width: (width - 80) / 8, aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  emojiItemText: { fontSize: 30 },
  // Category Tab Bar
  emojiTabBar: { maxHeight: 48, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0', marginBottom: 4 },
  emojiTabBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  emojiTabBtnActive: { backgroundColor: 'rgba(0,0,0,0.08)' },
  emojiTabIcon: { fontSize: 22 },
  pickerTabs: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#E0E0E0', backgroundColor: '#FFF' },

  metaData: { width: width * 0.85, alignItems: 'center', gap: 6 },
  userCaption: { color: '#FFF', fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  tickerFrame: { maxWidth: width * 0.6 },
  musicText: { color: '#CCC', fontSize: 12, fontStyle: 'italic', fontWeight: '600' },

  // Comment Sheet Premium
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheetContent: { backgroundColor: '#0A0A0A', height: height * 0.75, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 25 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#222', borderRadius: 10, alignSelf: 'center', marginBottom: 15 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  emptyComments: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.4, gap: 15 },
  emptyText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 20 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 15 },
  commentBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#161616', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 8 },
  inputField: { flex: 1, color: '#FFF', fontSize: 14 },
  sendIcon: { backgroundColor: COLORS.primary, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  // Share Sheet Design
  shareUserItem: { alignItems: 'center', marginRight: 20, width: 70 },
  shareAvatar: { width: 60, height: 60, borderRadius: 30, marginBottom: 8, borderWidth: 1, borderColor: '#222' },
  shareUsername: { color: '#888', fontSize: 11, fontWeight: '600' },
  sendBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 5 },
  sendBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  shareOptionsRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 25 },
  shareOptionBtn: { alignItems: 'center', gap: 10 },
  shareIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  shareOptionLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },

  // Ad Styles
  sponsoredBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sponsoredText: { color: '#FFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  adCtaBtn: { backgroundColor: '#FFF', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25, marginBottom: 15, flexDirection: 'row', alignItems: 'center' },
  adCtaText: { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  // Empty State Styles
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 20 },
  emptySubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 16, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  createBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30, marginTop: 30 },
  createBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  // Comment Row
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#1A1A1A' },
  commentUsername: { color: '#FFF', fontWeight: '700', fontSize: 13, marginBottom: 3 },
  commentText: { color: '#CCC', fontSize: 14, lineHeight: 20 },
  commentTime: { color: '#555', fontSize: 11, marginTop: 4 },

  // More Menu
  moreMenuSheet: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 12 },
  moreMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, gap: 16 },
  moreMenuText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  moreMenuDivider: { height: 0.5, backgroundColor: '#222', marginHorizontal: 24 },

  scrubTooltip: {
    position: 'absolute',
    width: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  scrubTooltipText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scrubTooltipArrow: {
    position: 'absolute',
    bottom: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderLeftColor: 'transparent',
    borderRightWidth: 5,
    borderRightColor: 'transparent',
    borderTopWidth: 5,
    borderTopColor: 'rgba(0, 0, 0, 0.85)',
    alignSelf: 'center',
  },
  sidebarReactionPopover: {
    position: 'absolute',
    right: 52,
    top: -6,
    backgroundColor: 'rgba(20, 20, 20, 0.94)',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 200,
  },
  popoverReactionPuck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popoverPlusPuck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentPlaceholderBar: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '94%',
  },
  commentPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontWeight: '500',
  },
  commentCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  commentCountBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
