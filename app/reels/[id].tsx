import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, Platform, useWindowDimensions, StatusBar, TextInput, Alert, Modal, Pressable, Keyboard, Animated, Linking, DeviceEventEmitter, ScrollView, RefreshControl, InteractionManager, LayoutAnimation, UIManager } from 'react-native';

const isNewArch = !!((global as any).nativeFabricUIScheduler || (global as any).RN$Bridgeless);
if (Platform.OS === 'android' && !isNewArch && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageCircleDashed, Forward } from 'lucide-react-native';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { FollowButton } from '@/src/components/common/FollowButton';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { socketService } from '@/src/lib/socket';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { STICKERS_BY_CATEGORY } from '@/src/constants/animated-stickers';
import LottieView from 'lottie-react-native';
import { getBaseUrl } from '@/src/api/config';
import { ShareModal } from '@/components/ShareModal';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { SponsoredShotItem } from '@/components/SponsoredShotItem';
import { ALL_EMOJIS } from '@/src/constants/all-emojis';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';

import { useReelsStore } from '@/src/store/reelsStore';

const { width, height } = Dimensions.get('window');
// Instagram-style reels: 9:16 portrait aspect ratio (not zoomed)
const VIDEO_HEIGHT = height;
const AD_INTERVAL = 6;

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

// --- Types ---
interface ShotUser {
  _id?: string;
  id?: string;
  username?: string;
  avatar?: string;
  avatar_url?: string;
  is_verified?: boolean;
  badge_type?: string | null;
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
  thumbnailUrl?: string;
  thumbnail?: string;
  isLiked?: boolean;
  is_liked?: boolean;
  isFollowing?: boolean;
  is_following?: boolean;
  isBookmarked?: boolean;
  is_bookmarked?: boolean;
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
  user_reaction?: string;
  userReaction?: string;
  media_urls?: string[];
  media?: Array<{ url: string }>;
  music?: {
    song_name?: string;
    artist?: string;
    cover_image?: string;
  };
  music_info?: {
    song_name?: string;
    artist?: string;
    cover_image?: string;
  };
}

const formatTime = (millis: number) => {
  if (isNaN(millis) || millis < 0) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const ReelItem = React.memo(({ item, isVisible, isFocused, router, user, setScrollEnabled }: { item: ShotItem, isVisible: boolean, isFocused: boolean, router: any, user: any, setScrollEnabled?: (enabled: boolean) => void }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const editInputRef = useRef<TextInput>(null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const durationRef = useRef(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [scrubX, setScrubX] = useState(0);
  const wasPlayingRef = useRef(true);
  const isScrubbingRef = useRef(false);

  // 🚀 Robust count parsing
  const parseCount = (val: any) => {
    if (val === undefined || val === null) return 0;
    const n = parseInt(String(val), 10);
    return isNaN(n) ? 0 : n;
  };

  // 🔥 OPTIMIZED STATE: Sync shots states perfectly with shots.tsx
  const [isLiked, setIsLiked] = useState(!!(item.isLiked || item.is_liked));
  const [activeEmoji, setActiveEmoji] = useState(item.user_reaction || '❤️');
  const author = useMemo(() => item.user || item.author, [item.user, item.author]);
  const authorId = author?._id || author?.id;
  const { isFollowing, isPending, isLoading, toggleFollow } = useFollowStatus(authorId || '', {
    isFollowing: !!(item.is_following || item.isFollowing || (item as any).is_following_creator || author?.is_following || author?.isFollowing),
  });
  const [likesCount, setLikesCount] = useState(parseCount(item.likesCount ?? item.likes_count ?? (item as any).likes));
  const likesCountRef = useRef(parseCount(item.likesCount ?? item.likes_count ?? (item as any).likes));
  const [commentsCount, setCommentsCount] = useState(parseCount(item.commentsCount ?? item.comments_count ?? (item as any).comments));

  // UI state
  const [showComments, setShowComments] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [showHeart, setShowHeart] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [sharesCount, setSharesCount] = useState(parseCount(item.sharesCount ?? item.shares_count ?? (item as any).shares ?? 0));
  const [bookmarksCount, setBookmarksCount] = useState(parseCount(item.bookmarksCount ?? item.bookmarks_count ?? (item as any).bookmarks ?? 0));
  const [isBookmarked, setIsBookmarked] = useState(!!(item.isBookmarked || item.is_bookmarked));
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingReactionIndex, setEditingReactionIndex] = useState<number | null>(null);
  const [newComment, setNewComment] = useState('');
  const [progress, setProgress] = useState(0);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [reactions, setReactions] = useState(user?.customReactions && user.customReactions.length > 0 ? user.customReactions : ['❤️', '😂', '😮', '😢', '🔥', '👏']);
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
  const [emojiSearch, setEmojiSearch] = useState('');
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState(0);

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

  const isAnonPost = (item as any).is_anonymous === true;

  const canVisitProfile = !isAnonPost && !!author?.username;

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

  // Reset video ready/playing state only when item ID changes
  useEffect(() => {
    setIsVideoReady(false);
    setIsBuffering(false);
    setIsPlaying(true);
  }, [item._id, item.id]);

  // Sync interactive counts and flags when they are updated by parent/events
  useEffect(() => {
    const newCount = parseCount(item.likesCount ?? item.likes_count ?? (item as any).likes);
    likesCountRef.current = newCount;
    setLikesCount(newCount);
    setCommentsCount(parseCount(item.commentsCount ?? item.comments_count ?? (item as any).comments));
    setIsLiked(!!(item.isLiked || item.is_liked));
    setIsBookmarked(!!(item.isBookmarked || item.is_bookmarked));
    setActiveEmoji(item.user_reaction || (item as any).userReaction || (item as any).reactionEmoji || '❤️');

  }, [
    item._id, item.id, item.likesCount, item.likes_count, (item as any).likes,
    item.commentsCount, item.comments_count, (item as any).comments,
    item.isLiked, item.is_liked, item.isBookmarked, item.is_bookmarked,
    item.user_reaction, (item as any).userReaction, (item as any).reactionEmoji,
    item.is_following, item.isFollowing, (item as any).is_following_creator,
    author?.is_following, author?.isFollowing
  ]);

  const videoSource = useMemo(() => {
    let url = item.videoUrl || item.video_url || item.content_url || (item.media_urls && item.media_urls[0]) || (item.media && item.media[0]?.url) || '';
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
  }, [item.videoUrl, item.video_url, item.content_url, item.media_urls, item.media]);

  // 🚀 Resolve Poster Source with Auto-Generated Cloudinary fallback for newly created shots
  const resolvedPosterSource = useMemo(() => {
    const thumb = item.thumbnail_url || item.thumbnail || item.thumbnailUrl;
    if (thumb) return resolveMediaUrl(thumb);

    const videoUrl = item.videoUrl || item.video_url || item.content_url || (item.media_urls && item.media_urls[0]) || (item.media && item.media[0]?.url) || '';
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
  }, [item.thumbnail_url, item.thumbnail, item.thumbnailUrl, item.videoUrl, item.video_url, item.content_url, item.media_urls, item.media]);

  // Initialize expo-video player
  const player = useVideoPlayer(videoSource, p => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25; // 250ms
    p.muted = isMuted;
  });

  // Keep player muted status in sync
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  // Observe timeUpdate and statusChange for buffering/loading states
  useEffect(() => {
    const timeSub = player.addListener('timeUpdate', (event) => {
      if (player.duration > 0 && !isScrubbingRef.current) {
        durationRef.current = player.duration * 1000;
        setProgress(event.currentTime / player.duration);
      }
    });

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'loading') {
        setIsBuffering(true);
        setIsVideoReady(false);
      } else if (status === 'readyToPlay') {
        setIsBuffering(false);
        setIsVideoReady(true);
        if (player.duration > 0) {
          durationRef.current = player.duration * 1000;
        }
      } else if (status === 'error') {
        setIsBuffering(false);
      }
    });

    return () => {
      timeSub.remove();
      statusSub.remove();
    };
  }, [player]);

  // Sync play/pause with visibility, screen focus and state
  useEffect(() => {
    if (isVisible && isFocused && isPlaying) {
      player.play();
      const shotId = item._id || item.id;
      if (shotId) {
        socketService.socket?.emit('shot:view', { shotId: String(shotId) });
      }
    } else {
      player.pause();
    }
  }, [isVisible, isFocused, isPlaying, player, item._id, item.id]);

  const sendReaction = async (emoji: string) => {
    triggerFlyingEmojiAnimation(emoji);
    setIsDisliked(false);
    setShowReactionPicker(false);
    const wasLiked = isLiked;
    setActiveEmoji(emoji);
    setIsLiked(true);
    if (!wasLiked) {
      likesCountRef.current = likesCountRef.current + 1;
      setLikesCount(likesCountRef.current);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shotId = item._id || item.id;
    if (!shotId) return;
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

  const handleFollow = () => {
    if (!authorId || authorId === 'anonymous') return;
    toggleFollow();
  };

  const handleSendComment = () => {
    if (!newComment.trim()) return;
    const shotId = item._id || item.id;
    if (shotId) {
      socketService.socket?.emit('shot:comment', { shotId: String(shotId), text: newComment });
    }
    setNewComment('');
    setCommentsCount(prev => prev + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const animatePlayIcon = () => {
    setShowPlayIcon(true);
    playIconAnim.setValue(0);
    Animated.sequence([
      Animated.timing(playIconAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(playIconAnim, { toValue: 0, duration: 200, delay: 200, useNativeDriver: true }),
    ]).start(() => setShowPlayIcon(false));
  };

  const handleSingleTap = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    animatePlayIcon();
  };

  const handleMute = () => {
    setIsMuted(prev => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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
          if (data.reaction) {
            setActiveEmoji(data.reaction);
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

  const handleMoreMenu = () => {
    setShowMoreMenu(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleReport = () => {
    setShowMoreMenu(false);
    Alert.alert('Report Shot', 'Why are you reporting this?', [
      { text: 'Spam', onPress: () => Alert.alert('Reported', 'Thanks for keeping AnuFy safe!') },
      { text: 'Inappropriate Content', onPress: () => Alert.alert('Reported', 'Thanks for keeping AnuFy safe!') },
      { text: 'Harassment', onPress: () => Alert.alert('Reported', 'Thanks for keeping AnuFy safe!') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleNotInterested = async () => {
    setShowMoreMenu(false);
    const shotId = item._id || item.id;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Got it!', 'We\'ll show you less content like this.');
    try {
      await apiClient.post(`/reels/${String(shotId)}/not-interested`);
    } catch (_) { }
  };

  const handleCopyLink = () => {
    setShowMoreMenu(false);
    const shotId = item._id || item.id;
    const link = `https://anufy.app/shots/${shotId}`;
    Linking.openURL(`https://anufy.app/shots/${shotId}`).catch(() => { });
    Alert.alert('Link Copied', link);
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

  const handleDoubleTap = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < 250) {
      // Double tap detected
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

  const handleTouchStart = (e: any) => {
    setIsScrubbing(true);
    isScrubbingRef.current = true;
    if (setScrollEnabled) {
      setScrollEnabled(false);
    }
    wasPlayingRef.current = isPlaying;
    if (isPlaying) {
      setIsPlaying(false);
    }
    handleTouchMove(e);
  };

  const handleTouchMove = (e: any) => {
    const pageX = e.nativeEvent.pageX;
    const barLeft = 12;
    const barWidth = width - 24;
    const touchX = Math.max(0, Math.min(barWidth, pageX - barLeft));
    const seekRatio = touchX / barWidth;
    const seekSec = seekRatio * player.duration;

    setScrubX(touchX + barLeft);
    setScrubTime(seekSec * 1000);
    setProgress(seekRatio);
  };

  const handleTouchEnd = () => {
    setIsScrubbing(false);
    isScrubbingRef.current = false;
    if (setScrollEnabled) {
      setScrollEnabled(true);
    }
    const finalSeekSec = progress * player.duration;
    if (player.duration > 0) {
      player.currentTime = finalSeekSec;
    }
    if (wasPlayingRef.current) {
      setIsPlaying(true);
    }
  };

  const startEditing = () => {
    setIsEditingMode(true);
    setEditingReactionIndex(0);
  };

  const selectReactionSlot = (idx: number) => {
    setEditingReactionIndex(idx);
  };

  const resetReactions = () => {
    const defaultReactions = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
    setReactions(defaultReactions);
    setCustomReactions(defaultReactions);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const updateReaction = (emoji: string) => {
    if (!emoji || editingReactionIndex === null) return;
    const newReactions = [...reactions];
    const symbol = Array.from(emoji)[0];
    newReactions[editingReactionIndex] = symbol;
    setReactions(newReactions);
    setCustomReactions(newReactions);
    const nextIndex = (editingReactionIndex + 1) % reactions.length;
    setEditingReactionIndex(nextIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.reelContainer, { height: windowHeight }]}>
      {/* Video Container - Actual Aspect Ratio */}
      <View style={styles.videoWrapper}>
        <Pressable
          style={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          onPress={handleDoubleTap}
        >
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />

          {/* High-performance absolute poster overlay */}
          {!isVideoReady && resolvedPosterSource ? (
            <Image
              source={{ uri: resolvedPosterSource }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
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
              <Ionicons name={isPlaying ? "play" : "pause"} size={80} color="rgba(255,255,255,0.7)" />
            </Animated.View>
          )}
        </Pressable>

        {/* Overlay Elements - Positioned on top of video */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomGradient} pointerEvents="none" />



        {/* Interaction Sidebar - Exactly matching shots.tsx */}
        <View style={[styles.interactionSidebar, { bottom: bottomOffset + 30 }]} pointerEvents="box-none">
          {/* User Profile Avatar in place of Mute icon */}
          <View style={styles.sidebarItem}>
            <TouchableOpacity
              onPress={() => author?.username && router.push(`/user/${author.username}`)}
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
                      {emoji === '❤️' ? (
                        <MaterialCommunityIcons name="heart" size={18} color="#FF3040" />
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

          {/* Share */}
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

          {/* More Actions (3 dots) */}
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

        {/* Bottom Info */}
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
                  <TouchableOpacity key={idx} activeOpacity={0.8} style={[styles.reactionPuck, idx === 0 && { marginLeft: 0 }]} onPress={() => sendReaction(emoji)}>
                    {emoji === '❤️' || emoji === '👍' ? (
                      <MaterialCommunityIcons name="thumb-up" size={20} color="#FF3040" />
                    ) : (
                      <Text style={{ fontSize: 19 }}>{emoji}</Text>
                    )}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.plusPuckAction} onPress={startEditing}>
                  <Ionicons name="add" size={18} color="#FFF" />
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
                onPress={() => setShowComments(true)}
                style={styles.commentPlaceholderBar}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MessageCircleDashed size={15} color="rgba(255,255,255,0.75)" />
                  <Text style={styles.commentPlaceholderText}>Add a comment...</Text>
                </View>
                <View style={styles.commentCountBadge}>
                  <Text style={styles.commentCountBadgeText}>{commentsCount > 1000 ? (commentsCount / 1000).toFixed(1) + 'K' : commentsCount}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>



      {/* Customize Reactions UI */}
      {isEditingMode && (
        <>
          <Pressable style={styles.sheetBackdrop} onPress={() => setIsEditingMode(false)} />
          <View style={styles.customiseSheet}>
            <View style={styles.sheetHeaderHandle} />
            <View style={styles.customiseHeader}>
              <TouchableOpacity onPress={() => setIsEditingMode(false)}>
                <Ionicons name="arrow-back" size={28} color="#000" />
              </TouchableOpacity>
              <Text style={styles.customiseTitle}>Customize reactions</Text>
              <View style={styles.customiseActions}>
                <TouchableOpacity onPress={resetReactions} style={{ marginRight: 20 }}>
                  <Ionicons name="refresh-outline" size={26} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsEditingMode(false)}>
                  <Ionicons name="checkmark" size={30} color="#000" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.customiseContent}>
              <View style={styles.largeReactionCapsule}>
                {reactions.map((emoji: string, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => selectReactionSlot(idx)}
                    style={[styles.largeReactionPuck, editingReactionIndex === idx && styles.largePuckActive]}
                  >
                    <Text style={{ fontSize: 20 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.emojiPickerDrawer}>
              {/* Search Bar */}
              <View style={styles.searchBarContainer}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#666" />
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
          </View>
        </>
      )}

      {/* Comment Modal */}
      <Modal visible={showComments} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowComments(false)} />
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Discussion</Text>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <Ionicons name="close" size={24} color="#555" />
              </TouchableOpacity>
            </View>
            <View style={styles.emptyComments}>
              <MaterialCommunityIcons name="comment-multiple-outline" size={48} color="#222" />
              <Text style={styles.emptyText}>Be the first to start the vibe!</Text>
            </View>
            <View style={styles.commentInputRow}>
              <Image source={{ uri: resolveAvatarUrl(user?.avatar, user?.username) }} style={styles.commentAvatar} />
              <View style={styles.commentBar}>
                <TextInput
                  placeholder="Add a thought..."
                  placeholderTextColor="#666"
                  style={styles.inputField}
                  value={newComment}
                  onChangeText={setNewComment}
                  onSubmitEditing={handleSendComment}
                />
                <TouchableOpacity style={styles.sendIcon} onPress={handleSendComment}>
                  <Ionicons name="arrow-up" size={20} color="#000" />
                </TouchableOpacity>
              </View>
            </View>
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
              let music: any = item.music;
              let musicInfo: any = item.music_info;
              if (typeof music === 'string') {
                try { music = JSON.parse(music); } catch (_) {}
              }
              if (typeof musicInfo === 'string') {
                try { musicInfo = JSON.parse(musicInfo); } catch (_) {}
              }
              const songName = music?.song_name || musicInfo?.song_name || music?.title || musicInfo?.title || (item as any).title || "";
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
    </View>
  );
});

export default function ReelDetailScreen() {
  const isFocused = useIsFocused();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useSafeRouter();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { activeReelData, setActiveReelData, preloadedReels } = useReelsStore();
  const hasFetchedRef = useRef(false);

  // 🚀 BACKGROUND PRE-CACHING FOR INSTANT LOAD: Exactly matching shots.tsx
  const cacheRef = useRef<{ data: ShotItem[], timestamp: number }>({ data: [], timestamp: 0 });

  const [reels, setReels] = useState<ShotItem[]>(() => {
    if (preloadedReels && preloadedReels.length > 0) {
      return preloadedReels;
    }
    if (activeReelData && id && String(activeReelData._id || activeReelData.id) === String(id)) {
      return [activeReelData];
    }
    return [];
  });

  const [loading, setLoading] = useState(() => {
    if (preloadedReels && preloadedReels.length > 0) return false;
    return !(activeReelData && id && String(activeReelData._id || activeReelData.id) === String(id));
  });

  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [visibleShotId, setVisibleShotId] = useState<string | null>(() => {
    if (activeReelData && id && String(activeReelData._id || activeReelData.id) === String(id)) {
      return String(activeReelData._id || activeReelData.id);
    }
    return id ? String(id) : null;
  });
  const [listScrollEnabled, setListScrollEnabled] = useState(true);

  // Reset and synchronize state reactively when the route param ID changes or screen recycling occurs
  useEffect(() => {
    if (id) {
      hasFetchedRef.current = false;
      cacheRef.current = { data: [], timestamp: 0 };

      const activeId = activeReelData ? String(activeReelData._id || activeReelData.id) : null;
      if (preloadedReels && preloadedReels.length > 0) {
        setReels(preloadedReels);
        setLoading(false);
        setVisibleShotId(String(id));
      } else if (activeId === String(id)) {
        setReels([activeReelData]);
        setLoading(false);
        setVisibleShotId(activeId);
      } else {
        setReels([]);
        setLoading(true);
        setVisibleShotId(String(id));
      }
      setPage(1);
      setHasMore(true);
      setLoadingMore(false);
    }
  }, [id, preloadedReels]);

  // Sync state reactively with Zustand's activeReelData to prevent any render race conditions!
  useEffect(() => {
    if (activeReelData && id && String(activeReelData._id || activeReelData.id) === String(id)) {
      setReels([activeReelData]);
      setLoading(false);
      setVisibleShotId(String(activeReelData._id || activeReelData.id));
    }
  }, [activeReelData, id]);

  // 🚀 BACKGROUND POSTER PRE-FETCHING: Preloads next 2 reel thumbnails in background for zero-delay scroll!
  useEffect(() => {
    if (!visibleShotId || reels.length === 0) return;
    const currentIndex = reels.findIndex(r => String(r._id || r.id) === visibleShotId);
    if (currentIndex === -1) return;

    const itemsToPreload = reels.slice(currentIndex + 1, currentIndex + 3);
    const urlsToPrefetch: string[] = [];

    itemsToPreload.forEach(item => {
      if (item.isAd || item.is_ad) return;
      const thumb = item.thumbnail_url || item.thumbnailUrl || item.thumbnail || '';
      if (thumb) {
        urlsToPrefetch.push(resolveMediaUrl(thumb));
      }
    });

    if (urlsToPrefetch.length > 0) {
      Image.prefetch(urlsToPrefetch).catch(() => { });
    }
  }, [visibleShotId, reels]);

  const injectAds = useCallback((data: ShotItem[]): ShotItem[] => {
    return data;
  }, []);

  // 🚀 BACKGROUND PRE-CACHING FOR INSTANT LOAD: Exactly matching shots.tsx
  const preloadNextBatch = useCallback(async (nextPage: number) => {
    try {
      const res = await apiClient.get(`/reels?page=${nextPage}&limit=10`);
      const rawData = res.data?.data || res.data?.reels || res.data || [];
      const data = Array.isArray(rawData) ? rawData.filter(Boolean) : [];
      cacheRef.current = { data, timestamp: Date.now() };
    } catch (_) { }
  }, []);

  const fetchInitialReel = async () => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    // 🚀 ULTRA-ADVANCED BYPASS: If we have preloadedReels, we do not need to fetch anything initially!
    if (preloadedReels && preloadedReels.length > 0) {
      setReels(preloadedReels);
      setLoading(false);
      // Set visible shot to the matching id
      const matchingIndex = preloadedReels.findIndex(r => String(r._id || r.id) === String(id));
      if (matchingIndex !== -1) {
        setVisibleShotId(String(preloadedReels[matchingIndex]._id || preloadedReels[matchingIndex].id));
      }
      return;
    }

    // If we already have activeReelData in Zustand matching the current ID, bypass server fetch completely!
    if (activeReelData && id && String(activeReelData._id || activeReelData.id) === String(id)) {
      setReels([activeReelData]);
      setLoading(false);
      fetchMoreReels(1, true);
      return;
    }

    try {
      setLoading(true);
      const res = await apiClient.get(`/reels/${id}`);
      const data = res.data?.data?.reel || res.data?.reel || res.data;
      if (!data) throw new Error('Reel not found');

      setReels([data]);
      setVisibleShotId(String(data._id || data.id));

      // Now fetch the rest of the feed
      fetchMoreReels(1, true);
    } catch (error: any) {
      Alert.alert('Error', 'Could not load the shot');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreReels = async (pageNum = 1, isInitialFetchAfterFirst = false) => {
    if (loadingMore || (!hasMore && !isInitialFetchAfterFirst)) return;
    try {
      setLoadingMore(true);

      let data: ShotItem[] = [];
      if (pageNum > 1 && cacheRef.current.data.length > 0 && Date.now() - cacheRef.current.timestamp < 30000) {
        data = cacheRef.current.data;
        cacheRef.current = { data: [], timestamp: 0 }; // Clear cache after use
      } else {
        const res = await apiClient.get(`/reels?page=${pageNum}&limit=10`);
        const rawData = res.data?.data || res.data?.reels || res.data || [];
        data = Array.isArray(rawData) ? rawData.filter(Boolean) : [];
      }

      // Filter out the initial reel if it exists in the general feed
      const filteredData = data.filter(r => String(r._id || r.id) !== String(id));

      setReels(prev => {
        const existingWithoutAds = prev.filter(r => r && !r.isAd);
        const combined = [...existingWithoutAds, ...filteredData];
        return injectAds(combined);
      });

      setHasMore(data.length >= 10);
      setPage(pageNum);

      // Preload next batch in background for instant caching on subsequent scroll down!
      if (data.length >= 10) {
        preloadNextBatch(pageNum + 1);
      }
    } catch (error) {
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (id) {
      if (activeReelData && String(activeReelData._id || activeReelData.id) === String(id)) {
        // Run instantly for instant caching!
        fetchInitialReel();
      } else {
        // Defer if we need to hit the server
        const task = InteractionManager.runAfterInteractions(() => {
          fetchInitialReel();
        });
        return () => task.cancel();
      }
    }
  }, [id, activeReelData]);

  // 🚀 REAL-TIME UPDATES FOR LIKES/COMMENTS
  useEffect(() => {
    const s = socketService.socket;
    if (!s) return;

    const onShotUpdated = (payload: any) => {
      const shotId = payload.shotId || payload.postId;
      if (!shotId) return;


      setReels((prev) =>
        prev.map((r) => {
          const rid = String(r._id || r.id);
          const sid = String(shotId);

          if (rid !== sid) return r;

          // Update counts
          const updatedReel = {
            ...r,
            likesCount: payload.likesCount ?? r.likesCount ?? r.likes_count,
            likes_count: payload.likesCount ?? r.likes_count,
            commentsCount: payload.commentsCount ?? r.commentsCount ?? r.comments_count,
            comments_count: payload.commentsCount ?? r.comments_count,
          };

          // Only update reaction if it's from current user
          // Convert both to strings for comparison
          const currentUserId = String(user?._id || user?.id || '');
          const payloadUserId = String(payload.userId || '');

          if (currentUserId && payloadUserId && currentUserId === payloadUserId) {
            updatedReel.user_reaction = payload.reaction || updatedReel.user_reaction;
            updatedReel.is_liked = payload.action !== 'unlike';
            updatedReel.isLiked = payload.action !== 'unlike';
          }

          return updatedReel;
        })
      );
    };

    s.on('shot:updated', onShotUpdated);
    s.on('post:updated', onShotUpdated);

    return () => {
      s.off('shot:updated', onShotUpdated);
      s.off('post:updated', onShotUpdated);
    };
  }, [user?._id, user?.id]);

  // 🔄 CROSS-SCREEN SYNC: Listen for likes from feed screen
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('post:liked:local', (data: any) => {

      setReels(prev =>
        prev.map(r => {
          const rid = String(r._id || r.id);
          const postId = String(data.postId);

          if (rid !== postId) return r;

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

          // Update the reel with new like data
          return {
            ...r,
            is_liked: data.isLiked,
            isLiked: data.isLiked,
            likes_count: data.likesCount,
            likesCount: data.likesCount,
            user_reaction: data.isLiked ? (data.reaction || r.user_reaction || '❤️') : null,
            userReaction: data.isLiked ? (data.reaction || (r as any).userReaction || '❤️') : null,
            likers: updatedLikers
          };
        })
      );
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('shot:deleted:local', (data: { shotId: string }) => {
      setReels(prev => {
        const filtered = prev.filter(r => r && String(r._id || r.id) !== String(data.shotId));
        if (filtered.length === 0) {
          router.back();
        }
        return filtered;
      });
    });
    return () => sub.remove();
  }, [router]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const first = viewableItems[0];
      if (first?.item) {
        const sid = first.item._id || first.item.id;
        if (sid) setVisibleShotId(String(sid));
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 0,
  }).current;

  // 🔥 OPTIMIZED: Better memoization key
  const memoizedReels = useMemo(() => reels, [reels]);
  const flashListRef = useRef<any>(null);

  // Scroll to initial reel when data loads
  useEffect(() => {
    if (memoizedReels.length > 0 && !loading) {
      const initialIndex = memoizedReels.findIndex(r => String(r._id || r.id) === String(id));
      if (initialIndex !== -1 && flashListRef.current) {
        // Use setTimeout to wait for the list to render
        setTimeout(() => {
          flashListRef.current.scrollToIndex({
            index: initialIndex,
            animated: false,
          });
        }, 100);
      }
    }
  }, [memoizedReels, loading, id]);

  const topOffset = insets.top > 0 ? insets.top + 10 : 30;

  return (
    <View style={styles.blackBase}>
      <StatusBar barStyle="light-content" translucent />

      {/* Sticky Top gradient & Header Area */}
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={[styles.topGradient, { height: topOffset + 60, position: 'absolute', left: 0, right: 0, top: 0, zIndex: 90 }]} pointerEvents="none" />
      <View style={[styles.reelHeader, { top: topOffset, justifyContent: 'center', position: 'absolute', left: 0, right: 0, zIndex: 100 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.backBtn, { position: 'absolute', left: 20, zIndex: 105 }]}
          onPress={() => {
            if (router.canGoBack && router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)');
            }
          }}
        >
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 }}>Shots</Text>
        <TouchableOpacity 
          style={{ position: 'absolute', right: 20, zIndex: 105, padding: 5 }} 
          onPress={() => router.push('/post-editor')}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlashList<any>
          ref={flashListRef}
          data={memoizedReels}
          keyExtractor={i => i ? String(i._id || i.id) : Math.random().toString()}
          pagingEnabled
          scrollEnabled={listScrollEnabled}
          extraData={{ isFocused, reels, page, hasMore, loadingMore, visibleShotId, listScrollEnabled }}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews={true}
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
          renderItem={({ item }) => {
            if (!item) return null;
            if (item.isAd || item.is_ad) return <SponsoredShotItem ad={item as any} />;
            return (
              <ReelItem
                item={item}
                isVisible={visibleShotId === String(item._id || item.id)}
                isFocused={isFocused}
                router={router}
                user={user}
                setScrollEnabled={setListScrollEnabled}
              />
            );
          }}
          onEndReached={() => {
            if (hasMore && !loadingMore) {
              fetchMoreReels(page + 1);
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
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.4, zIndex: 5 },
  reelHeader: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 20, gap: 12 },
  backBtn: { padding: 5, marginRight: 4 },
  headerProfilePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', padding: 8, paddingHorizontal: 14, borderRadius: 8, flex: 1 },
  pillAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#FFF' },
  pillInfo: { marginLeft: 12, gap: 3, flex: 1 },
  pillUsername: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  headerMusicRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMusicText: { color: '#AAA', fontSize: 11, fontStyle: 'italic', fontWeight: '500', maxWidth: 120 },
  pillFollow: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 6, paddingHorizontal: 20, minWidth: 75, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)' },
  pillFollowText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  interactionSidebar: { position: 'absolute', right: 8, bottom: 160, alignItems: 'center', gap: 16, zIndex: 15 },
  sidebarItem: { alignItems: 'center', gap: 4 },
  sidebarText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
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

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 95 },
  customiseSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.72, backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, zIndex: 100 },
  customiseHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, justifyContent: 'space-between' },
  sheetHeaderHandle: { width: 40, height: 5, backgroundColor: '#DDD', borderRadius: 10, alignSelf: 'center', marginBottom: 15 },
  customiseTitle: { color: '#000', fontSize: 17, fontWeight: '800' },
  customiseActions: { flexDirection: 'row', gap: 15 },
  customiseContent: { alignItems: 'center', paddingHorizontal: 20 },
  largeReactionCapsule: { flexDirection: 'row', backgroundColor: '#F2F2F2', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 40, gap: 6, alignItems: 'center' },
  largeReactionPuck: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  largePuckActive: { borderBottomWidth: 2, borderBottomColor: '#000' },
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
  emojiTabBar: { maxHeight: 48, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0', marginBottom: 4 },
  emojiTabBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  emojiTabBtnActive: { backgroundColor: 'rgba(0,0,0,0.08)' },
  emojiTabIcon: { fontSize: 22 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheetContent: { backgroundColor: '#0A0A0A', height: height * 0.75, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 25 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#222', borderRadius: 10, alignSelf: 'center', marginBottom: 15 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  emptyComments: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.4 },
  emptyText: { color: '#FFF', fontSize: 15 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 20 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 15 },
  commentBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#161616', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 8 },
  inputField: { flex: 1, color: '#FFF', fontSize: 14 },
  sendIcon: { backgroundColor: COLORS.primary, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  muteBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 16, zIndex: 25, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  sidebarMore: { marginTop: 10, opacity: 0.7 },
  moreMenuSheet: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 12 },
  moreMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, gap: 16 },
  moreMenuText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  moreMenuDivider: { height: 0.5, backgroundColor: '#222', marginHorizontal: 24 },
  sponsoredBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sponsoredText: { color: '#FFF', fontSize: 9, fontWeight: '800' as const, textTransform: 'uppercase' as const },

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
});
