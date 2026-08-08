import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Platform, Alert, TouchableOpacity, Pressable, Modal, ActivityIndicator, Dimensions, ImageBackground, ScrollView, TextInput, Keyboard, InteractionManager, KeyboardEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSpring, interpolate, Extrapolation } from 'react-native-reanimated';
import { Gesture, GestureDetector, Swipeable } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useAppTheme, lightColors } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import LottieView from 'lottie-react-native';
import { ANIMATED_STICKERS } from '@/src/constants/animated-stickers';
import { ALL_EMOJIS } from '@/src/constants/all-emojis';
import { getBaseUrl } from '@/src/api/config';
import { useAuthStore } from '@/src/store/authStore';
import { socketService } from '@/src/lib/socket';
import { useCall } from '@/src/context/CallContext';
import { useChatStore } from '@/src/store/chatStore';
import { getChatTheme } from '@/src/constants/chatThemes';
import { resolveMediaUrl, resolveAvatarUrl } from '@/src/utils/imageUtils';
import { scale, verticalScale } from '@/src/utils/responsive';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { getStagedChatAvatar } from '@/src/lib/chatNavigation';
import { mergeMessageHistory, upsertIncomingMessage } from '@/src/lib/chatMessages';
import type { Message as BaseMessage } from '@/src/lib/types';
import * as Notifications from 'expo-notifications';
import { clearConversationNotifications } from '@/src/components/NotificationManager';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { ChatEngine } from '@/src/engines/ChatEngine';
import { InteractionEngine } from '@/src/engines/InteractionEngine';
import { CallEngine } from '@/src/engines/CallEngine';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';
import { ChatMessageBubble } from '@/src/components/chat/ChatMessageBubble';
import { Logger } from '@/src/utils/logger';

// Global cache to avoid double fetching reels/posts metadata in chat bubbles
const shotMetadataCache: Record<string, { username: string; avatar: string; mediaUrl?: string; isDeleted?: boolean }> = {};
// Chat Components
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatInput } from '@/components/chat/ChatInput';
// 🔐 E2E Encryption removed

// Simple inline video player for gallery (replaces missing VideoPlayer component)
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
const VideoGalleryPlayer = ({ uri }: { uri: string }) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '80%' }}
      contentFit="contain"
      nativeControls
    />
  );
};

// Types Based on MongoDB Architecture
interface Reaction {
  user_id: string; // From backend schema
  emoji: string;
}

interface UserDetails {
  _id: string;
  id?: string; // Optional for compatibility
  username: string;
  fullName?: string;
  avatar_url?: string;
  is_online?: boolean;
  is_deactivated?: boolean;
  last_seen?: string;
  lastActive?: string;
  userId?: string; // Optional for compatibility
}

interface Message {
  _id: string;
  id?: string; // Optional for compatibility
  conversation_id: string;
  sender_id: UserDetails;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'location' | 'file' | 'sticker' | 'shot_share' | 'post_share' | 'profile_share';
  media_url?: string;
  author_username?: string;
  author_avatar?: string;
  attachments?: Array<{ url: string; type: string }>;
  is_deleted: boolean;
  deleted_for: string[];
  reactions: Record<string, string>;
  reply_to_id?: Message;
  is_edited: boolean;
  is_pinned: boolean;
  is_forwarded: boolean;
  created_at: string;
  status: 'sent' | 'delivered' | 'read' | 'sending' | 'error';
  delivered_to?: Array<{ user_id: string }>;
  read_by?: Array<{ user_id: string }>;
  tempMessageId?: string; // Added for optimistic UI updates
}

const getEmojiLottieUrl = (emoji: string): string | null => {
  // 1. Check local ANIMATED_STICKERS first
  const localMatch = ANIMATED_STICKERS.find((s: any) => s.emoji === emoji);
  if (localMatch) {
    return localMatch.url;
  }

  // 2. Otherwise dynamically fetch from official Google Noto Emoji CDN
  try {
    const codePoints = Array.from(emoji).map(c => c.codePointAt(0));
    if (codePoints.length === 0 || !codePoints[0]) return null;

    let hex = codePoints[0].toString(16).toLowerCase();

    // Fix standard variation selector mappings for Google Noto Emoji
    if (hex === '2764') {
      hex = '2764_fe0f';
    }

    return `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/lottie.json`;
  } catch (e) {
    return null;
  }
};

const formatRelativeTime = (timeInput: any): string => {
  if (!timeInput) return '';
  const date = new Date(timeInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin}m ago`;
  } else if (diffHr < 24) {
    return `${diffHr}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
};

// ─── Global Styles Fallback for Top-Level Components ────────────────────────
const styles = getStyles(lightColors);

// ─── Premium Voice Message Player ───────────────────────────────────────────
const VoiceMessagePlayer = React.memo(({ url, isMe, colors }: { url: string; isMe: boolean; colors: any }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const soundRef = useRef<any>(null);

  // Waveform animation values
  const wave1 = useSharedValue(0.35);
  const wave2 = useSharedValue(0.6);
  const wave3 = useSharedValue(0.3);
  const wave4 = useSharedValue(0.8);
  const wave5 = useSharedValue(0.45);

  useEffect(() => {
    if (isPlaying) {
      wave1.value = withRepeat(withTiming(1.0, { duration: 300 }), -1, true);
      wave2.value = withRepeat(withTiming(0.9, { duration: 220 }), -1, true);
      wave3.value = withRepeat(withTiming(1.0, { duration: 380 }), -1, true);
      wave4.value = withRepeat(withTiming(0.8, { duration: 260 }), -1, true);
      wave5.value = withRepeat(withTiming(1.0, { duration: 310 }), -1, true);
    } else {
      wave1.value = withTiming(0.35); wave2.value = withTiming(0.35);
      wave3.value = withTiming(0.35); wave4.value = withTiming(0.35);
      wave5.value = withTiming(0.35);
    }
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => { }); }, []);

  const w1s = useAnimatedStyle(() => ({ transform: [{ scaleY: wave1.value }] }));
  const w2s = useAnimatedStyle(() => ({ transform: [{ scaleY: wave2.value }] }));
  const w3s = useAnimatedStyle(() => ({ transform: [{ scaleY: wave3.value }] }));
  const w4s = useAnimatedStyle(() => ({ transform: [{ scaleY: wave4.value }] }));
  const w5s = useAnimatedStyle(() => ({ transform: [{ scaleY: wave5.value }] }));
  const waveStyles = [w1s, w2s, w3s, w4s, w5s, w3s, w1s, w4s, w2s, w5s, w3s, w1s];

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const onPlaybackUpdate = (status: any) => {
    if (!status.isLoaded) return;
    setDuration(status.durationMillis ?? 0);
    setPosition(status.positionMillis ?? 0);
    setIsPlaying(status.isPlaying);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setPosition(0);
      soundRef.current?.setPositionAsync(0).catch(() => { });
    }
  };

  const handlePlay = async () => {
    try {

      // ✅ Always force playback mode before playing
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (!status.isLoaded) {
          // Sound got unloaded — reload it
          soundRef.current = null;
        } else if (status.isPlaying) {
          await soundRef.current.pauseAsync();
          return;
        } else {
          await soundRef.current.playAsync();
          return;
        }
      }

      // Load + play fresh
      setLoading(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, progressUpdateIntervalMillis: 200 },
        onPlaybackUpdate
      );
      soundRef.current = sound;
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setIsPlaying(false);
      Alert.alert('Playback Error', e?.message || 'Could not play voice message.');
    }
  };

  const progress = duration > 0 ? position / duration : 0;
  const accent = isMe ? 'rgba(255,255,255,0.92)' : (colors?.primary || '#A200FF');
  const trackBg = isMe ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)';
  const textColor = isMe ? 'rgba(255,255,255,0.8)' : (colors?.subtitle || '#888');
  const iconColor = isMe ? (colors?.primary || '#A200FF') : '#fff';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 2, minWidth: 190 }}>
      {/* Play / Pause / Loading button */}
      <TouchableOpacity
        onPress={handlePlay}
        disabled={loading}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: accent, justifyContent: 'center', alignItems: 'center' }}
        activeOpacity={0.75}
      >
        {loading
          ? <ActivityIndicator size="small" color={iconColor} />
          : <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={iconColor} style={isPlaying ? {} : { marginLeft: 2 }} />
        }
      </TouchableOpacity>

      {/* Waveform + time */}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 }}>
          {waveStyles.map((ws, i) => (
            <Animated.View
              key={i}
              style={[{
                width: 3,
                height: 16,
                borderRadius: 2,
                backgroundColor: progress > 0 && i / waveStyles.length <= progress ? accent : trackBg,
              }, ws]}
            />
          ))}
        </View>
        <Text style={{ color: textColor, fontSize: 10, letterSpacing: 0.3 }}>
          {duration > 0 ? `${fmt(position)} / ${fmt(duration)}` : '🎤 Voice message'}
        </Text>
      </View>
    </View>
  );
});

const TypingBubble = React.memo(({ isAnonymousChat, avatarUrl, username }: { isAnonymousChat: boolean; avatarUrl?: string; username?: string }) => {
  const dot1 = useSharedValue(0.4);
  const dot2 = useSharedValue(0.4);
  const dot3 = useSharedValue(0.4);

  useEffect(() => {
    const animate = (val: any, delay: number) => {
      val.value = withRepeat(
        withTiming(1, { duration: 500 }),
        -1,
        true
      );
    };
    animate(dot1, 0);
    setTimeout(() => animate(dot2, 0), 200);
    setTimeout(() => animate(dot3, 0), 400);
  }, []);

  const dotStyle1 = useAnimatedStyle(() => ({ opacity: dot1.value, transform: [{ scale: dot1.value }] }));
  const dotStyle2 = useAnimatedStyle(() => ({ opacity: dot2.value, transform: [{ scale: dot2.value }] }));
  const dotStyle3 = useAnimatedStyle(() => ({ opacity: dot3.value, transform: [{ scale: dot3.value }] }));

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Image
          source={{ uri: resolveAvatarUrl(avatarUrl, username, isAnonymousChat) }}
          style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E5E7EB' }}
        />
        <Text style={{ fontSize: 13, fontWeight: '600', color: isAnonymousChat ? '#9CA3AF' : '#6B7280', marginLeft: 2 }}>Typing</Text>
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', marginLeft: 2 }}>
          <Animated.View style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: isAnonymousChat ? '#9CA3AF' : '#8E8E93' }, dotStyle1]} />
          <Animated.View style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: isAnonymousChat ? '#9CA3AF' : '#8E8E93' }, dotStyle2]} />
          <Animated.View style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: isAnonymousChat ? '#9CA3AF' : '#8E8E93' }, dotStyle3]} />
        </View>
      </View>
    </View>
  );
});

// ─── Upload Progress Notification Banner ────────────────────────────────────
const UploadProgressBanner = React.memo(({
  visible,
  progress,
  thumbnail,
  mediaType,
  recipientUsername,
  currentAsset,
  totalAssets,
  bannerAnim,
}: {
  visible: boolean;
  progress: number;
  thumbnail: string | null;
  mediaType: 'image' | 'video';
  recipientUsername: string;
  currentAsset: number;
  totalAssets: number;
  bannerAnim: any;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: bannerAnim.value,
    transform: [
      {
        translateY: interpolate(
          bannerAnim.value,
          [0, 1],
          [-80, 10],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  if (!visible && !thumbnail) return null;

  const clampedProgress = Math.min(100, Math.max(0, progress));
  const isMulti = totalAssets > 1;

  return (
    <Animated.View style={[{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 3000,
      marginHorizontal: 10,
      marginTop: 8,
    }, animatedStyle]}>
      <BlurView intensity={60} tint="dark" style={{
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(162,0,255,0.3)',
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 11,
          gap: 12,
          backgroundColor: 'rgba(12,12,20,0.75)',
        }}>
          {/* Thumbnail */}
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 13,
            overflow: 'hidden',
            backgroundColor: '#1a1a2e',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: 'rgba(162,0,255,0.4)',
          }}>
            {thumbnail ? (
              <>
                <Image
                  source={{ uri: thumbnail }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                {/* Video overlay icon */}
                {mediaType === 'video' && (
                  <View style={{
                    ...StyleSheet.absoluteFillObject as any,
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <Ionicons name="videocam" size={18} color="#fff" />
                  </View>
                )}
              </>
            ) : (
              <Ionicons
                name={mediaType === 'video' ? 'videocam' : 'image'}
                size={22}
                color="rgba(162,0,255,0.8)"
              />
            )}
          </View>

          {/* Info + progress bar */}
          <View style={{ flex: 1, gap: 5 }}>
            {/* Title row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.1 }} numberOfLines={1}>
                Sending to @{recipientUsername}
              </Text>
              {isMulti && (
                <Text style={{ color: 'rgba(162,0,255,0.9)', fontSize: 11, fontWeight: '700' }}>
                  {currentAsset}/{totalAssets}
                </Text>
              )}
            </View>

            {/* Progress bar */}
            <View style={{
              height: 5,
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: 5,
              overflow: 'hidden',
            }}>
              <Animated.View style={{
                height: '100%',
                width: `${clampedProgress}%`,
                borderRadius: 5,
                backgroundColor: '#A200FF',
              }} />
            </View>

            {/* Sub label */}
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '500' }}>
              {mediaType === 'video' ? '🎥 Video' : '📸 Photo'}
              {' · '}
              {clampedProgress < 100 ? `${clampedProgress}% uploaded` : 'Processing…'}
            </Text>
          </View>

          {/* Percentage badge */}
          <Text style={{
            color: clampedProgress >= 100 ? '#34C759' : '#A200FF',
            fontSize: 14,
            fontWeight: '900',
            minWidth: 40,
            textAlign: 'right',
          }}>
            {clampedProgress >= 100 ? '✓' : `${clampedProgress}%`}
          </Text>
        </View>
      </BlurView>
    </Animated.View>
  );
});

const SharedPostCard = React.memo(({
  trimmedContent,
  messageType,
  authorUsername,
  authorAvatar,
  mediaUrl,
  handleTap,
  onLongPress
}: any) => {
  const shotId = trimmedContent.split('/').pop() || trimmedContent;
  const isShot = messageType === 'shot_share' || trimmedContent.includes('anufy.app/reels/') || trimmedContent.includes('anufy.app/shots/');

  const cached = shotMetadataCache[shotId];
  const [isDeleted, setIsDeleted] = useState(cached?.isDeleted || false);
  const [fetchedUser, setFetchedUser] = useState<{ username?: string; avatar?: string; mediaUrl?: string } | null>(cached ? {
    username: cached.username,
    avatar: cached.avatar,
    mediaUrl: cached.mediaUrl
  } : null);

  useEffect(() => {
    // Only fetch if not already in cache and missing props
    if ((authorUsername && mediaUrl) || shotMetadataCache[shotId]) {
      return;
    }
    let active = true;
    const checkAvailability = async () => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      try {
        const endpoint = isShot ? `/reels/${shotId}` : `/posts/${shotId}`;
        const res = await apiClient.get(endpoint);
        if (active) {
          const itemData = res.data.data?.post || res.data.data?.reel || res.data.data;
          const author = itemData?.author || itemData?.user;
          const resolvedMedia = itemData?.video_url || itemData?.media_urls?.[0] || itemData?.media_url || itemData?.thumbnail_url || itemData?.thumbnailUrl;
          if (author) {
            const dataToCache = {
              username: author.username,
              avatar: author.avatar_url || author.avatar,
              mediaUrl: resolvedMedia
            };
            shotMetadataCache[shotId] = dataToCache;
            setFetchedUser(dataToCache);
          }
        }
      } catch (err: any) {
        if (active && err.response && (err.response.status === 404 || err.response.status === 403)) {
          shotMetadataCache[shotId] = { username: '', avatar: '', isDeleted: true };
          setIsDeleted(true);
        }
      }
    };
    checkAvailability();
    return () => { active = false; };
  }, [shotId, isShot, authorUsername, authorAvatar, mediaUrl]);

  if (isDeleted) {
    return (
      <View style={{ width: 180, padding: 12, borderRadius: 16, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E', justifyContent: 'center', gap: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255, 59, 48, 0.1)', justifyContent: 'center', alignItems: 'center', alignSelf: 'center' }}>
          <Ionicons name="alert-circle-outline" size={18} color="#FF3B30" />
        </View>
        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>Not Available</Text>
      </View>
    );
  }

  const finalUsername = fetchedUser?.username || authorUsername || '';
  const finalAvatar = fetchedUser?.avatar || authorAvatar;
  const finalMediaUrl = fetchedUser?.mediaUrl || mediaUrl;

  const displayAvatar = resolveAvatarUrl(finalAvatar, finalUsername);
  const displayMedia = resolveMediaUrl(finalMediaUrl);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handleTap}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{ width: scale(175), height: verticalScale(260), borderRadius: 18, overflow: 'hidden', backgroundColor: '#111' }}
    >
      <View style={{ flex: 1, backgroundColor: '#000', position: 'relative' }}>
        {displayMedia ? (
          <Image source={{ uri: displayMedia }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name={isShot ? 'play-circle' : 'image'} size={40} color="rgba(255,255,255,0.3)" />
          </View>
        )}

        {/* Top Header Overlay (Avatar + Username) */}
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 10 }}>
          {displayAvatar ? (
            <Image
              source={{ uri: displayAvatar }}
              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#333', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
              contentFit="cover"
            />
          ) : (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
              <Ionicons name="person" size={12} color="#FFF" />
            </View>
          )}
          <Text
            style={{
              color: '#FFF',
              fontWeight: '600',
              fontSize: 13,
              textShadowColor: 'rgba(0,0,0,0.8)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3
            }}
            numberOfLines={1}
          >
            {finalUsername}
          </Text>
        </View>

        {/* Center Play Button for Shots */}
        {isShot && (
          <View style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -24, marginTop: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
            <Ionicons name="play" size={24} color="#FFF" style={{ marginLeft: 3 }} />
          </View>
        )}

        {/* Bottom Left Play/Reel Icon */}
        {isShot && (
          <View style={{ position: 'absolute', bottom: 12, left: 12, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
            <Ionicons name="play" size={13} color="#000" style={{ marginLeft: 1 }} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const SharedProfileCard = React.memo(({
  trimmedContent,
  messageType,
  authorUsername,
  authorAvatar,
  colors,
  router,
  onLongPress
}: any) => {
  const cleanUrl = trimmedContent.endsWith('/') ? trimmedContent.slice(0, -1) : trimmedContent;
  const sharedUsername = cleanUrl.split('/').pop() || authorUsername || '';
  const [avatar, setAvatar] = useState(authorAvatar || '');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchProfile = async () => {
      const token = useAuthStore.getState().token;
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiClient.get(`/users/username/${sharedUsername}`);
        if (active && res.data) {
          setAvatar(res.data.avatar_url || res.data.avatar || '');
          setFullName(res.data.full_name || res.data.name || '');
          setLoading(false);
        }
      } catch (err) {
        if (active) setLoading(false);
      }
    };
    fetchProfile();
    return () => { active = false; };
  }, [sharedUsername]);

  const displayAvatar = resolveAvatarUrl(avatar, sharedUsername);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={onLongPress}
      delayLongPress={300}
      onPress={() => router.push(`/user/${sharedUsername}` as any)}
      style={{
        width: scale(200),
        padding: 16,
        borderRadius: 18,
        backgroundColor: colors?.surface || lightColors.surface,
        borderWidth: 1,
        borderColor: colors?.border || lightColors.border,
        alignItems: 'center',
        gap: 12
      }}
    >
      <Image
        source={{ uri: displayAvatar }}
        style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#333' }}
        contentFit="cover"
        transition={150}
      />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: colors?.text || lightColors.text, fontWeight: 'bold', fontSize: 15, textAlign: 'center' }} numberOfLines={1}>
          {fullName || sharedUsername}
        </Text>
        <Text style={{ color: colors?.subtitle || lightColors.subtitle, fontSize: 12, textAlign: 'center', marginTop: 2 }}>
          @{sharedUsername}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => router.push(`/user/${sharedUsername}` as any)}
        style={{
          width: '100%',
          paddingVertical: 8,
          backgroundColor: colors?.primary || lightColors.primary,
          borderRadius: 10,
          alignItems: 'center'
        }}
      >
        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>View Profile</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const MessageItem = React.memo(({
  item, isMe, isLatest, isLastOfGroup, isFirstOfGroup, onReply, onLongPress, onSingleTap, handleDoubleTapLike, isJustAdded,
  swipeX, colors, isAnonymousChat, recipient, router, setSelectedGalleryMedia, setGalleryIndex, setGalleryMode,
  getMediaThumbnail, scrollToMessage, highlightedMessageId, user, bubbleUploadProgress, themeId, conversationSettings
}: any) => {
  const theme = getChatTheme(themeId);
  const isMidnight = theme.id === 'midnight';
  const meBubbleColor =
    theme.id === 'sunset' ? '#FF5722' :
      theme.id === 'ocean' ? '#0284C7' :
        theme.id === 'forest' ? '#16A34A' :
          theme.id === 'lavender' ? '#8B5CF6' :
            theme.id === 'midnight' ? '#7C3AED' : '#A200FF';

  const otherBubbleColor = isAnonymousChat
    ? '#F3F4F6'
    : theme.bubbleOther || '#F2F2F7';

  const otherBubbleTextColor = isAnonymousChat
    ? '#000000'
    : (isMidnight ? '#FFF' : '#000000');

  const swipeableRef = useRef<Swipeable>(null);
  const lottieRef = useRef<LottieView>(null);
  const lastTapRef = useRef({ time: 0, id: '' });
  // 🎬 Sticker: auto-play once when just sent, then static. Tap to replay.
  const [stickerPlaying, setStickerPlaying] = React.useState(!!isJustAdded);
  const [lottieFailed, setLottieFailed] = React.useState(false);

  const renderReplyAction = () => (
    <View style={{ width: 60, height: '100%', backgroundColor: 'transparent' }} />
  );

  const animatedBubbleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: swipeX.value }],
    };
  });

  const animatedTimeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(swipeX.value, [-50, 0], [1, 0], Extrapolation.CLAMP);
    const translateX = interpolate(swipeX.value, [-70, 0], [0, 70], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateX }],
    };
  });

  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = () => {
    const now = Date.now();
    const isSameMessage = lastTapRef.current.id === item._id;
    const timeSinceLastTap = isSameMessage ? (now - lastTapRef.current.time) : 9999;
    lastTapRef.current = { time: now, id: item._id };


    if (timeSinceLastTap < 400) {
      // 🚀 Double Tap: ONLY LIKE, BLOCK LOTTIE REPLAY
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      handleDoubleTapLike(item._id);
    } else {
      // 🎬 Single Tap confirmed: Trigger Lottie animation replay
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;

        const trimmed = (item.content || '').trim();
        const isSingleEmoji = trimmed.length <= 8 && /[\p{Emoji_Presentation}\p{Emoji}\u200d\uFE0F]/u.test(trimmed);
        const isSticker = item.message_type === 'sticker' ||
          ANIMATED_STICKERS.find((s: any) => s.emoji === trimmed) ||
          isSingleEmoji;

        if (isSticker) {
          setLottieFailed(false);
          setStickerPlaying(true);
          if (lottieRef.current) {
            lottieRef.current.reset();
            requestAnimationFrame(() => lottieRef.current?.play());
          }
        }

        onSingleTap();
      }, 350);
    }
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderReplyAction}
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
      overshootRight={false}
      onSwipeableWillOpen={(direction) => {
        if (direction === 'right') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onReply(item);
          setTimeout(() => swipeableRef.current?.close(), 0);
        }
      }}
      containerStyle={{
        marginTop: isFirstOfGroup ? 16 : 2,
        paddingBottom: Object.keys(item.reactions || {}).length > 0 ? 10 : 0
      }}
    >
      <Animated.View style={[styles.messageWrapper]}>
        <View style={[styles.messageContainer, isMe ? styles.myMessageContainer : styles.theirMessageContainer]}>
          {!isMe && (
            <View style={{ width: 32, height: 32, marginRight: 10 }}>
              {isLastOfGroup && (() => {
                const isGroup = conversationSettings?.type === 'group';
                const participant = isGroup ? conversationSettings.participants?.find((p: any) =>
                  (p.user?._id || p.user)?.toString() === (item.sender_id?._id || item.sender_id)?.toString()
                ) : null;
                const avatarUri = isAnonymousChat
                  ? (isGroup
                    ? (participant?.ghost_persona?.avatar || resolveAvatarUrl(undefined, participant?.ghost_persona?.name || item.sender_id?.username, true))
                    : (recipient?.avatar_url || resolveAvatarUrl(undefined, recipient?.username, true)))
                  : (item.sender_id?.avatar_url || item.sender_id?.avatar || recipient?.avatar_url || resolveAvatarUrl(undefined, isGroup ? item.sender_id?.username : recipient?.username, false));

                return (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatar}
                    contentFit="cover"
                    transition={120}
                  />
                );
              })()}
            </View>
          )}
          <View style={{ flex: 1, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
            {/* Show Sender Name in Groups */}
            {!isMe && isFirstOfGroup && conversationSettings?.type === 'group' && (
              <Text style={{ fontSize: 11, color: colors?.subtitle || lightColors.subtitle, marginBottom: 2, marginLeft: 4, fontWeight: '600' }}>
                {(() => {
                  const participant = conversationSettings.participants?.find((p: any) =>
                    (p.user?._id || p.user)?.toString() === (item.sender_id?._id || item.sender_id)?.toString()
                  );
                  return (isAnonymousChat && participant?.ghost_persona?.name) ? participant.ghost_persona.name : item.sender_id?.username;
                })()}
              </Text>
            )}
            {/* Reply Card — OUTSIDE bubble, tappable to scroll to original */}
            {item.reply_to_id && typeof item.reply_to_id !== 'string' && !item.reply_to_id.is_deleted && (() => {
              const replyMsg = item.reply_to_id;
              const replyContent = replyMsg.content?.trim() || '';
              const isReplyShot = replyMsg.message_type === 'shot_share' || replyContent.includes('anufy.app/reels/') || replyContent.includes('anufy.app/shots/');
              const isReplyPost = replyMsg.message_type === 'post_share' || replyContent.includes('anufy.app/post/');
              const isReplyMedia = replyMsg.message_type === 'image' || replyMsg.message_type === 'video';
              const isReplyProfile = replyMsg.message_type === 'profile_share' || replyContent.includes('anufy.app/profile/');
              const isReplyCard = isReplyShot || isReplyPost;

              return (
                <View style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                  <Text style={{ color: '#8E8E93', fontSize: 11, marginBottom: 2, marginLeft: 4, fontWeight: '500', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                    {replyMsg.sender_id?.username === user?.username ? 'Replied to you' : `Replied to ${replyMsg.sender_id?.username}`}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      const replyId = typeof item.reply_to_id === 'string' ? item.reply_to_id : item.reply_to_id?._id;
                      if (replyId) scrollToMessage?.(replyId);
                    }}
                    style={[
                      styles.replyCardOuter,
                      {
                        borderLeftWidth: 0,
                        backgroundColor: (isReplyCard || isReplyMedia) ? 'transparent' : (isMe ? 'rgba(162, 0, 255, 0.12)' : '#F2F2F7'),
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        borderRadius: 16,
                        paddingHorizontal: (isReplyCard || isReplyMedia) ? 0 : 12,
                        paddingVertical: (isReplyCard || isReplyMedia) ? 0 : 8,
                        opacity: 1,
                      }
                    ]}
                  >
                    {isReplyCard ? (
                      <View
                        style={{
                          width: 55,
                          height: 82,
                          borderRadius: 8,
                          overflow: 'hidden',
                          backgroundColor: '#111',
                          marginTop: 4,
                          position: 'relative'
                        }}
                      >
                        {replyMsg.media_url ? (
                          <Image
                            source={{ uri: resolveMediaUrl(replyMsg.media_url, true) }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name={isReplyShot ? 'play-circle' : 'image'} size={18} color="rgba(255,255,255,0.3)" />
                          </View>
                        )}

                        {/* Micro Top Header Overlay (Avatar + Username) */}
                        <View style={{ position: 'absolute', top: 4, left: 4, right: 4, flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 10 }}>
                          {replyMsg.author_avatar ? (
                            <Image
                              source={{ uri: resolveAvatarUrl(replyMsg.author_avatar, replyMsg.author_username) }}
                              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#333', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)' }}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)' }}>
                              <Ionicons name="person" size={6} color="#FFF" />
                            </View>
                          )}
                          <Text
                            style={{
                              color: '#FFF',
                              fontWeight: '600',
                              fontSize: 7,
                              textShadowColor: 'rgba(0,0,0,0.8)',
                              textShadowOffset: { width: 0, height: 0.5 },
                              textShadowRadius: 1
                            }}
                            numberOfLines={1}
                          >
                            {replyMsg.author_username || ''}
                          </Text>
                        </View>
                      </View>
                    ) : isReplyMedia ? (
                      <View
                        style={{
                          width: 55,
                          height: 82,
                          borderRadius: 8,
                          overflow: 'hidden',
                          backgroundColor: '#111',
                          marginTop: 4,
                          position: 'relative'
                        }}
                      >
                        {replyMsg.media_url && (
                          <Image
                            source={{ uri: resolveMediaUrl(replyMsg.media_url, true) }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                          />
                        )}
                        {replyMsg.message_type === 'video' && (
                          <View style={{
                            ...StyleSheet.absoluteFillObject as any,
                            backgroundColor: 'rgba(0,0,0,0.35)',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}>
                            <Ionicons name="play-circle" size={20} color="#fff" />
                          </View>
                        )}
                      </View>
                    ) : isReplyProfile ? (
                      (() => {
                        const cleanUrl = replyContent.endsWith('/') ? replyContent.slice(0, -1) : replyContent;
                        const sharedUsername = cleanUrl.split('/').pop() || replyMsg.author_username || '';
                        return (
                          <Text numberOfLines={1} style={{ color: colors.subtitle, fontSize: 13 }}>
                            👤 Profile Card: @{sharedUsername}
                          </Text>
                        );
                      })()
                    ) : (
                      <Text numberOfLines={1} style={{ color: colors.subtitle, fontSize: 13 }}>
                        {replyContent || 'Message'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })()}

            <View style={[
              { position: 'relative', overflow: 'visible', marginBottom: Object.keys(item.reactions || {}).length > 0 ? 12 : 2 },
              // Flash highlight when this message is the scroll target
              highlightedMessageId === item._id && { opacity: 0.6 }
            ]}>
              <Pressable
                style={[
                  styles.bubble,
                  isMe ? styles.myBubble : styles.theirBubble,
                  (() => {
                    const trimmed = item.content?.trim() || '';
                    const isSingleEmoji = trimmed.length <= 8 && /[\p{Emoji_Presentation}\p{Emoji}\u200d\uFE0F]/u.test(trimmed);
                    const isSticker = item.message_type === 'sticker' || (!item.is_deleted && !item.media_url && (ANIMATED_STICKERS.find(s => s.emoji === trimmed) || isSingleEmoji));
                    const isMedia = item.message_type === 'image' || item.message_type === 'video' || isSticker;
                    const isShotLink = trimmed.includes('anufy.app/reels/') || trimmed.includes('anufy.app/shots/');
                    const isPostLink = trimmed.includes('anufy.app/post/');
                    const isShareCard = item.message_type === 'shot_share' || item.message_type === 'post_share' || isShotLink || isPostLink;
                    const isProfileLink = trimmed.includes('anufy.app/profile/');
                    const isProfileShare = item.message_type === 'profile_share' || isProfileLink;

                    return {
                      backgroundColor: (isMedia || isShareCard || isProfileShare) ? 'transparent' : (isMe ? meBubbleColor : otherBubbleColor),
                      paddingHorizontal: (isMedia || isShareCard || isProfileShare) ? 0 : 16,
                      paddingVertical: (isMedia || isSticker || isShareCard || isProfileShare) ? 0 : 12,
                      overflow: 'visible',
                      justifyContent: 'center',
                      alignItems: 'center',
                      minWidth: isSticker ? 55 : 0,
                      minHeight: isSticker ? 55 : 0
                    };
                  })(),
                  isLastOfGroup ? (isMe ? { borderBottomRightRadius: 6, borderBottomLeftRadius: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 } : { borderBottomLeftRadius: 6, borderBottomRightRadius: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }) : { borderRadius: 20 }
                ]}
                onLongPress={onLongPress}
                onPress={handleTap}
                delayLongPress={300}
              >

                {(item.attachments && item.attachments.length > 0) ? (() => {
                  const attachments = item.attachments;
                  const count = attachments.length;

                  return (
                    <View style={{ marginTop: 6 }}>
                      <View style={{ width: scale(280), flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 18, overflow: 'hidden' }}>
                        {attachments.map((media: { url: string, type: string }, idx: number) => (
                          <TouchableOpacity
                            key={idx}
                            activeOpacity={0.9}
                            onPress={() => {
                              setSelectedGalleryMedia(attachments);
                              setGalleryIndex(idx);
                              setGalleryMode(attachments.length > 1 ? 'grid' : 'detail');
                            }}
                            onLongPress={onLongPress}
                            style={{
                              width: count === 1 ? scale(280) : (count === 2 ? scale(139) : (count === 3 && idx === 0 ? scale(280) : scale(139))),
                              height: count === 1 ? verticalScale(280) : verticalScale(139),
                              position: 'relative'
                            }}
                          >
                            <Image
                              source={{ uri: resolveMediaUrl(media.url, true) }}
                              style={{ width: '100%', height: '100%' }}
                              contentFit="cover"
                              transition={150}
                            />
                            {media.type === 'video' && (
                              <View style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -15, marginTop: -15, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="play" size={16} color="white" />
                              </View>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })() : (item.message_type === 'image' || item.message_type === 'video') && item.media_url && (
                  <TouchableOpacity
                    activeOpacity={item.status === 'sending' ? 1 : 0.9}
                    onPress={item.status === 'sending' ? undefined : handleTap}
                    onLongPress={item.status === 'sending' ? undefined : onLongPress}
                  >
                    <Image
                      source={{ uri: resolveMediaUrl(item.media_url, true) }}
                      style={{ width: scale(240), height: verticalScale(240), borderRadius: 18, marginBottom: 0 }}
                      contentFit="cover"
                      transition={150}
                    />
                    {item.message_type === 'video' && item.status !== 'sending' && (
                      <View style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="play" size={24} color="white" />
                      </View>
                    )}

                    {/* ── Real-time Sending Overlay (shown while status='sending') ── */}
                    {item.status === 'sending' && (
                      <View style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        borderRadius: 18,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        {/* Smooth active loading spinner */}
                        <ActivityIndicator size="small" color="#A200FF" style={{ marginBottom: 8 }} />

                        {/* Centered 'Sending' text */}
                        <Text style={{
                          color: '#FFF',
                          fontSize: 14,
                          fontWeight: '700',
                          textAlign: 'center',
                          letterSpacing: 0.5,
                          textShadowColor: 'rgba(0,0,0,0.6)',
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 2,
                        }}>
                          Sending
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {item.message_type === 'audio' && item.media_url && (
                  <VoiceMessagePlayer
                    url={resolveMediaUrl(item.media_url) || item.media_url}
                    isMe={isMe}
                    colors={colors}
                  />
                )}

                {item.message_type === 'sticker' && item.media_url ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleTap}
                    onLongPress={onLongPress}
                    delayLongPress={300}
                    style={{ width: 60, height: 60, justifyContent: 'center', alignItems: 'center', alignSelf: isMe ? 'flex-end' : 'flex-start', marginVertical: 5 }}
                  >
                    {(stickerPlaying && !lottieFailed) ? (
                      <LottieView
                        ref={lottieRef}
                        key={`lottie-${item._id}-${stickerPlaying}`}
                        source={{ uri: item.media_url.startsWith('http') ? item.media_url : `${getBaseUrl(false)}${item.media_url}` }}
                        autoPlay={true}
                        loop={false}
                        style={{ width: 60, height: 60 }}
                        resizeMode="contain"
                        onAnimationFailure={() => {
                          setLottieFailed(true);
                          setStickerPlaying(false);
                        }}
                        onAnimationFinish={() => {
                          requestAnimationFrame(() => setStickerPlaying(false));
                        }}
                      />
                    ) : (
                      <Text style={{ fontSize: 42, textAlign: 'center', lineHeight: 50 }}>
                        {ANIMATED_STICKERS.find((s: any) => s.url === item.media_url)?.emoji || '✨'}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (() => {
                  const trimmedContent = (item.content || '').trim();
                  // Check if it is a single emoji (typically length <= 8 to cover gender/ZWJ combinations)
                  const isSingleEmoji = trimmedContent.length <= 8 && /[\p{Emoji_Presentation}\p{Emoji}\u200d\uFE0F]/u.test(trimmedContent);
                  const isLocalSticker = ANIMATED_STICKERS.some(s => s.emoji === trimmedContent);
                  const dynamicLottieUrl = isSingleEmoji ? getEmojiLottieUrl(trimmedContent) : null;
                  const isShotLink = trimmedContent.includes('anufy.app/reels/') || trimmedContent.includes('anufy.app/shots/');
                  const isPostLink = trimmedContent.includes('anufy.app/post/');
                  const isShareCard = item.message_type === 'shot_share' || item.message_type === 'post_share' || isShotLink || isPostLink;
                  const isProfileLink = trimmedContent.includes('anufy.app/profile/');
                  const isProfileShare = item.message_type === 'profile_share' || isProfileLink;

                  if (dynamicLottieUrl) {
                    const resolvedUri = dynamicLottieUrl.startsWith('http') ? dynamicLottieUrl : `${getBaseUrl(false)}${dynamicLottieUrl}`;
                    return (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleTap}
                        onLongPress={onLongPress}
                        delayLongPress={300}
                        style={{ width: 60, height: 60, justifyContent: 'center', alignItems: 'center', alignSelf: isMe ? 'flex-end' : 'flex-start', marginVertical: 5 }}
                      >
                        {(stickerPlaying && !lottieFailed) ? (
                          <LottieView
                            ref={lottieRef}
                            key={`lottie-match-${item._id}-${stickerPlaying}`}
                            source={{ uri: resolvedUri }}
                            autoPlay={true}
                            loop={false}
                            style={{ width: 60, height: 60 }}
                            resizeMode="contain"
                            onAnimationFailure={() => {
                              setLottieFailed(true);
                              setStickerPlaying(false);
                            }}
                            onAnimationFinish={() => {
                              requestAnimationFrame(() => setStickerPlaying(false));
                            }}
                          />
                        ) : (
                          <Text style={{ fontSize: 42, textAlign: 'center', lineHeight: 50 }}>
                            {trimmedContent}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  }

                  if (isShareCard) {
                    return (
                      <SharedPostCard
                        trimmedContent={trimmedContent}
                        messageType={item.message_type}
                        authorUsername={item.author_username}
                        authorAvatar={item.author_avatar}
                        mediaUrl={item.media_url}
                        handleTap={handleTap}
                        onLongPress={onLongPress}
                      />
                    );
                  }

                  if (isProfileShare) {
                    return (
                      <SharedProfileCard
                        trimmedContent={trimmedContent}
                        messageType={item.message_type}
                        authorUsername={item.author_username}
                        authorAvatar={item.author_avatar}
                        colors={colors}
                        router={router}
                        onLongPress={onLongPress}
                      />
                    );
                  }

                  return (
                    <Text style={{ color: isMe ? '#FFF' : otherBubbleTextColor, fontSize: 16, lineHeight: 22, fontWeight: '500' }}>
                      {item.content}
                    </Text>
                  );
                })()}

              </Pressable>

              {/* Reaction bubble — outside Pressable so it's never clipped */}
              {(() => {
                const reactionsEntries = Object.entries(item.reactions || {});
                if (reactionsEntries.length === 0) return null;
                const counts = reactionsEntries.reduce((acc, [key, val]) => {
                  let emoji = '';
                  if (typeof val === 'string') {
                    emoji = val;
                  } else if (Array.isArray(val) && val.length > 0) {
                    emoji = key;
                  } else if (typeof key === 'string' && key.length <= 4) {
                    emoji = key;
                  }
                  if (emoji) {
                    acc[emoji] = (acc[emoji] || 0) + (Array.isArray(val) ? val.length : 1);
                  }
                  return acc;
                }, {} as Record<string, number>);

                return (
                  <View style={[styles.reactionContainer, isMe ? { right: 8, bottom: -12 } : { left: 42, bottom: -12 }]}>
                    {Object.keys(counts).map((emoji, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.reactionText}>{emoji}</Text>
                        {Object.keys(counts).length === 1 && counts[emoji] > 1 && (
                          <Text style={styles.reactionCount}>{counts[emoji]}</Text>
                        )}
                      </View>
                    ))}
                    {Object.keys(counts).length > 1 && (
                      <Text style={styles.reactionCount}>{reactionsEntries.length}</Text>
                    )}
                  </View>
                );
              })()}
            </View>

            {/* Status indicator (Seen [relative time]) - Only shown on the latest message sent by user if read */}
            {isMe && isLatest && item.status === 'read' && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-end',
                  marginTop: Object.keys(item.reactions || {}).length > 0 ? 16 : 2,
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 10, color: colors?.subtitle || '#8E8E93', fontWeight: '500' }}>
                  {(() => {
                    const currentUserId = user?.id || user?._id;
                    const readTime = item.readAt || (() => {
                      if (item.read_by && Array.isArray(item.read_by)) {
                        const entry = item.read_by.find((r: any) => {
                          const rUid = r.user_id?._id || r.user_id;
                          return rUid && rUid.toString() !== currentUserId?.toString();
                        });
                        return entry?.read_at || entry?.readAt;
                      }
                      return null;
                    })();

                    const relativeStr = readTime ? formatRelativeTime(readTime) : '';
                    return relativeStr ? `Seen ${relativeStr}` : 'Seen';
                  })()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
      <Animated.View style={[styles.slidingTimeContainer, animatedTimeStyle]}>
        <Text style={styles.slidingTimeText}>
          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </Animated.View>
    </Swipeable>
  );
}, (prev, next) => {
  // 🚀 PERFORMANCE: Deep comparison to prevent blinking and optimize scrolling
  const prevReactions = prev.item.reactions || {};
  const nextReactions = next.item.reactions || {};
  const keysPrev = Object.keys(prevReactions);
  const keysNext = Object.keys(nextReactions);
  const reactionsEqual = keysPrev.length === keysNext.length && keysPrev.every(k => prevReactions[k] === nextReactions[k]);

  return (
    prev.item._id === next.item._id &&
    prev.item.status === next.item.status &&
    prev.item.content === next.item.content &&
    prev.item.is_deleted === next.item.is_deleted &&
    prev.item.reply_to_id?._id === next.item.reply_to_id?._id &&
    prev.item.reply_to_id?.is_deleted === next.item.reply_to_id?.is_deleted &&
    prev.item.reply_to_id?.content === next.item.reply_to_id?.content &&
    prev.isLastOfGroup === next.isLastOfGroup &&
    prev.isFirstOfGroup === next.isFirstOfGroup &&
    prev.isLatest === next.isLatest &&
    reactionsEqual &&
    prev.themeId === next.themeId &&
    prev.conversationSettings?.type === next.conversationSettings?.type
  );
});

// ✅ Normalize message IDs to ensure consistency across _id and id fields
const normalizeMessage = (msg: any): Message => {
  if (!msg) return msg;
  const normalized = { ...msg };
  if (msg._id && !msg.id) {
    normalized.id = typeof msg._id === 'string' ? msg._id : msg._id?.toString?.() || msg._id;
  }
  if (msg.id && !msg._id) {
    normalized._id = msg.id;
  }
  return normalized as Message;
};

// ✅ Sort messages ascending: oldest first (top) → newest last (bottom)
const sortMessagesByDate = (msgs: Message[]): Message[] => {
  return [...msgs].sort((a, b) => {
    const rawA = a.created_at || (a as any).createdAt || (a as any).timestamp;
    const rawB = b.created_at || (b as any).createdAt || (b as any).timestamp;
    const aTime = rawA ? (typeof rawA === 'number' ? rawA : new Date(rawA).getTime()) : 0;
    const bTime = rawB ? (typeof rawB === 'number' ? rawB : new Date(rawB).getTime()) : 0;
    const validATime = Number.isFinite(aTime) ? aTime : 0;
    const validBTime = Number.isFinite(bTime) ? bTime : 0;
    if (validATime !== validBTime) {
      return validATime - validBTime; // Oldest first → newest at END of array (bottom of list)
    }
    const idA = (a._id || a.id || '').toString();
    const idB = (b._id || b.id || '').toString();
    return idA.localeCompare(idB);
  });
};

export default function ChatRoomScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const {
    id: rawId,
    recipientId: rawRecipientId,
    username: rawUsername,
    profileImage: rawProfileImage,
    isAnonymousChat: isAnonParamChat,
    isAnonymous: isAnonParamLegacy,
    isOnline: isOnlineParam,
    isDisappearing: isDisappearingParam,
    fromList: rawFromList,
  } = useLocalSearchParams();

  const isAnonParam = isAnonParamChat || isAnonParamLegacy;
  const fromList = (Array.isArray(rawFromList) ? rawFromList[0] : rawFromList) === 'true';

  const id = (Array.isArray(rawId) ? rawId[0] : rawId) || '';
  const recipientId = (Array.isArray(rawRecipientId) ? rawRecipientId[0] : rawRecipientId) === 'undefined' ? '' : (Array.isArray(rawRecipientId) ? rawRecipientId[0] : rawRecipientId);
  const username = (Array.isArray(rawUsername) ? rawUsername[0] : rawUsername) === 'undefined' ? '' : (Array.isArray(rawUsername) ? rawUsername[0] : rawUsername);
  const profileImage = (Array.isArray(rawProfileImage) ? rawProfileImage[0] : rawProfileImage) === 'undefined' ? '' : (Array.isArray(rawProfileImage) ? rawProfileImage[0] : rawProfileImage);

  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const colors = COLORS;
  const user = useAuthStore((state) => state.user);
  const updateBlockedUsers = useAuthStore((state) => state.updateBlockedUsers);
  const setCachedMessages = useChatStore((s: any) => s.setCachedMessages);
  const messagesCache = useChatStore((s: any) => s.messagesCache);

  // 🚀 Store stable user ID to prevent reaction conflicts
  const stableUserId = useRef<string>((user?.id || user?._id)?.toString() || '');

  // 🚀 Log user ID changes to debug reaction issues
  useEffect(() => {
    const userId = (user?.id || user?._id)?.toString();
    if (__DEV__) {
      Logger.debug('ChatUser', `User ID: ${userId || 'none'}`);
    }
    if (userId && userId !== stableUserId.current) {
      stableUserId.current = userId;
    }
  }, [user]);
  // 🚀 Live conversation settings from store (wallpaper + vanish mode)
  const conversationSettings = useChatStore((s: any) =>
    s.conversations?.find((c: any) => (c._id || c.id)?.toString() === (id || 'new'))
  );
  const [chatWallpaper, setChatWallpaper] = useState<string | null>(conversationSettings?.wallpaper_url || null);
  // vanishMode: false | 'on_read' | '24h'
  const [isVanishMode, setIsVanishMode] = useState<false | 'on_read' | '24h'>(
    isDisappearingParam === '24h' ? '24h'
      : isDisappearingParam === 'true' ? 'on_read'
        : conversationSettings?.is_disappearing === '24h' ? '24h'
          : conversationSettings?.is_disappearing ? 'on_read'
            : false
  );

  const conversationId = id || 'new';

  const [messages, setMessages] = useState<Message[]>(() => {
    if (conversationId === 'new') return [];
    const cached = messagesCache?.[conversationId];
    if (cached && cached.length > 0) return cached;
    // 🚀 INSTANT RENDER (0ms): Pre-populate from Zustand store last_message ONLY if it's a valid full message object!
    const storeConv = (useChatStore.getState().conversations || []).find(
      (c: any) => (c._id || c.id)?.toString() === conversationId
    );
    const lm = storeConv?.last_message;
    if (lm && typeof lm === 'object' && (lm.content || lm.media_url || lm.message_type)) {
      return [{
        ...lm,
        _id: (lm._id || lm.id)?.toString?.() || lm._id || 'temp-init',
        conversation_id: conversationId,
        created_at: lm.created_at || lm.createdAt || new Date().toISOString()
      }];
    }
    return [];
  });

  useEffect(() => {
    if (conversationId === 'new') return;
    setCachedMessages(conversationId, messages);
  }, [conversationId, messages, setCachedMessages]);

  const [recipient, setRecipient] = useState<UserDetails | null>(() => {
    const currentUserId = user?.id || user?._id;
    const partner = conversationSettings?.participants?.find((p: any) => {
      const pUserId = p.user?._id || p.user;
      return pUserId && pUserId.toString() !== currentUserId?.toString();
    })?.user;

    const rId = (recipientId || partner?._id || partner || '').toString();
    const isAnon = isAnonParam === 'true' || conversationSettings?.is_anonymous === true;
    const rName = isAnon
      ? (partner?.anonymousPersona?.username || partner?.ghost_persona?.username || partner?.anonymousPersona?.name || partner?.ghost_persona?.name || username || 'Ghost User').toString().replace(/^@/, '')
      : (username || partner?.username || partner?.full_name || 'Chat').toString();
    const stagedAvatar = getStagedChatAvatar(rId);
    const rAvatar = isAnon
      ? (partner?.anonymousPersona?.avatar || partner?.ghost_persona?.avatar || resolveAvatarUrl(undefined, rName, true))
      : (profileImage ? decodeURIComponent(profileImage as string) : resolveAvatarUrl(stagedAvatar || partner?.avatar_url || partner?.avatar, rName, false));

    return {
      _id: rId,
      username: rName,
      avatar_url: rAvatar,
      is_online: isAnon ? false : (partner?.is_online || isOnlineParam === 'true')
    };
  });

  const [newMessage, setNewMessage] = useState('');
  // 🚀 INSTANT OPEN: No spinner if we already have cached messages
  const [loading, setLoading] = useState(() => {
    if (conversationId === 'new') return false;
    return !(messagesCache?.[conversationId]?.length > 0);
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(() => isOnlineParam === 'true');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Use keyboard height to keep input bar visible above keyboard, with safe area insets
  const inputBottomPadding = keyboardHeight > 0
    ? keyboardHeight
    : Platform.select({
      ios: insets.bottom > 20 ? insets.bottom : 20,
      android: insets.bottom > 16 ? insets.bottom : 16,
      default: insets.bottom,
    });
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  // ─── Upload Progress Banner State ───────────────────────────────────────
  const [uploadProgress, setUploadProgress] = useState(0);       // 0-100
  const [uploadThumbnail, setUploadThumbnail] = useState<string | null>(null); // local URI
  const [uploadMediaType, setUploadMediaType] = useState<'image' | 'video'>('image');
  const [uploadCurrentAsset, setUploadCurrentAsset] = useState(1);
  const [uploadTotalAssets, setUploadTotalAssets] = useState(1);
  const uploadBannerAnim = useSharedValue(0); // 0 = hidden, 1 = visible

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [reactionTargetMessage, setReactionTargetMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCustomizeReactionsModal, setShowCustomizeReactionsModal] = useState(false);
  const [isCustomizingTray, setIsCustomizingTray] = useState(false);
  const [customizingEmojiIndex, setCustomizingEmojiIndex] = useState<number | null>(null);
  const [pickerTab, setPickerTab] = useState<'stickers' | 'gifs'>('stickers');
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'Smileys' | 'Gestures' | 'Animals' | 'Food' | 'Travel' | 'Activities' | 'Objects' | 'Symbols'>('Smileys');

  const filteredEmojis = useMemo(() => {
    return ALL_EMOJIS.filter(e => e.category === activeCategory);
  }, [activeCategory]);

  const fetchGiphyGifs = useCallback(async (query: string) => {
    try {
      setLoadingGifs(true);

      const giphyKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY;

      // Giphy v1 API (still works)
      const giphyUrl = giphyKey ? (query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(query)}&limit=20&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=20&rating=g`) : null;

      // Use fetch() directly to avoid any axios interceptors adding auth headers
      const giphyRes = giphyUrl ? await fetch(giphyUrl).then(r => r.json()) : null;

      let combinedGifs: any[] = [];

      // Process GIPHY
      if (giphyRes?.data) {
        giphyRes.data.forEach((item: any) => {
          // 🚀 OPTIMIZATION: We prefer 'fixed_height_downsampled' (~150KB) for fast list load and memory optimization in Metro/Device.
          // And we send 'fixed_height' or 'downsized_medium' (~800KB) for chat bubble, which loads instantly compared to 15-20MB 'original' raw GIFs.
          const previewUrl = item.images?.fixed_height_downsampled?.url || item.images?.fixed_width_downsampled?.url || item.images?.fixed_height_small?.url || item.images?.fixed_height?.url;
          const sendUrl = item.images?.fixed_height?.url || item.images?.downsized_medium?.url || item.images?.original?.url;

          if (sendUrl) {
            combinedGifs.push({
              id: `giphy-${item.id || Math.random().toString()}`,
              url: sendUrl,
              previewUrl: previewUrl || sendUrl
            });
          }
        });
      }

      // Fallback to high-quality beautiful curated GIFs if both APIs failed or returned no results
      if (combinedGifs.length === 0) {
        const fallbacks = [
          { id: 'fb-1', url: 'https://i.giphy.com/media/tJqyalvo9ahykfykAj/giphy.gif', tags: 'hello hi wave greeting welcome hey greeting' },
          { id: 'fb-2', url: 'https://i.giphy.com/media/3o7527pa7qs9kCG78A/giphy.gif', tags: 'laugh lol haha funny smile joke side splitting' },
          { id: 'fb-3', url: 'https://i.giphy.com/media/l0ExdMHUDKqn3WRRS/giphy.gif', tags: 'sad cry heart broken tear weep unhappy upset' },
          { id: 'fb-4', url: 'https://i.giphy.com/media/xT0xezQGU5xCDSK35e/giphy.gif', tags: 'dance party celebrate happy music rhythm groove bounce' },
          { id: 'fb-5', url: 'https://i.giphy.com/media/l41YcGT5ShJa0yBsQ/giphy.gif', tags: 'love heart kiss romantic hug cute adore crush' },
          { id: 'fb-6', url: 'https://i.giphy.com/media/3oKIPnAiaUCoXPJq5W/giphy.gif', tags: 'shock omg wow surprise astonished gasping standard' },
          { id: 'fb-7', url: 'https://i.giphy.com/media/26FPCXyiTfNmjFLgc/giphy.gif', tags: 'ok yes agree thumbs up positive confirm alright' },
          { id: 'fb-8', url: 'https://i.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif', tags: 'no nope disagree reject shake head negative decline' },
          { id: 'fb-9', url: 'https://i.giphy.com/media/1xVbRS6j5PVjlejjt9/giphy.gif', tags: 'angry mad rage furious trigger red hot heated' },
          { id: 'fb-10', url: 'https://i.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif', tags: 'clap bravo cheer well done applause support clap hands' },
          { id: 'fb-11', url: 'https://i.giphy.com/media/l0HlUxUu3CqVAhOWc/giphy.gif', tags: 'bye goodbye wave leave see ya later exit out' },
          { id: 'fb-12', url: 'https://i.giphy.com/media/d1E2VyhFsx54KGqi/giphy.gif', tags: 'sleep tired yawn bed night lazy snooze exhaust' }
        ];

        if (query.trim()) {
          const lowerQ = query.toLowerCase();
          combinedGifs = fallbacks.filter(f => f.tags.includes(lowerQ));
        } else {
          combinedGifs = fallbacks;
        }
      }

      setGifs(combinedGifs);
    } catch (err) {
    } finally {
      setLoadingGifs(false);
    }
  }, []);

  useEffect(() => {
    if (showEmojiPicker && pickerTab === 'gifs') {
      fetchGiphyGifs(gifQuery);
    }
  }, [showEmojiPicker, pickerTab, gifQuery]);

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<any>(null);
  const recordingInProgressRef = useRef(false);
  const pendingStopRef = useRef(false);
  const recordingStartTimeRef = useRef<number>(0);
  const [selectedGalleryMedia, setSelectedGalleryMedia] = useState<{ url: string, type: string }[] | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryMode, setGalleryMode] = useState<'grid' | 'detail'>('grid');
  const flatListRef = useRef<any>(null);
  const inputRef = useRef<TextInput>(null);
  const galleryRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef({ time: 0, id: '' });
  const infoNavLockRef = useRef(false); // prevent double-tap opening chat-info twice
  const isUserNearBottomRef = useRef(true); // Track if user is near bottom for auto-scroll
  const initialScrollDoneRef = useRef(false);
  const { startCall } = useCall();

  // ─── Upload notification & optimistic bubble tracking ───
  const uploadNotifIdRef = useRef<string | null>(null);
  // Per-bubble upload progress: tempId -> 0..100
  const [uploadBubbleProgress, setUploadBubbleProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('media_upload', {
        name: 'Media Upload',
        importance: Notifications.AndroidImportance.LOW,
        vibrationPattern: [0],
        sound: null,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: false,
      }).catch(() => {});
    }
  }, []);

  const showUploadNotif = useCallback(async (
    progress: number,
    thumbnail: string | null,
    recipientName: string,
    current: number,
    total: number,
  ) => {
    try {
      // EXACT UI/UX FROM THE INSTAGRAM REFERENCE:
      // Title is "Message sending..."
      const title = 'Message sending...';
      // Subtitle/Body shows the percentage value alone (e.g. "36%")
      const body = `${Math.min(100, Math.max(0, progress))}%`;

      const notifId = await Notifications.scheduleNotificationAsync({
        identifier: 'anufy_upload_progress',
        content: {
          title,
          body,
          data: {},
          ...(Platform.OS === 'android' ? {
            android: {
              channelId: 'media_upload',
              ongoing: progress < 100,
              progress: {
                max: 100,
                current: Math.min(100, Math.max(0, progress)),
                indeterminate: false,
              },
              smallIcon: 'ic_notification',
              color: '#A200FF',
              ...(thumbnail ? { largeIconUrl: thumbnail } : {}),
            } as any,
          } : {}),
        } as any,
        trigger: null,
      });
      uploadNotifIdRef.current = notifId;
    } catch (_) { }
  }, []);

  const dismissUploadNotif = useCallback(async () => {
    try {
      await Notifications.dismissNotificationAsync('anufy_upload_progress');
      uploadNotifIdRef.current = null;
    } catch (_) { }
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset initialScrollDoneRef when changing conversation
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [conversationId]);

  // 🚀 AUTO SCROLL TO BOTTOM: Scroll to newest (last) message when chat opens or messages load
  useEffect(() => {
    if (messages.length > 0) {
      const performScroll = () => {
        try {
          flatListRef.current?.scrollToEnd({ animated: false });
          initialScrollDoneRef.current = true;
        } catch (_) { }
      };

      requestAnimationFrame(performScroll);
      const timer1 = setTimeout(performScroll, 80);
      const timer2 = setTimeout(performScroll, 200);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [conversationId, messages.length]);

  // 🚀 Track scroll position to determine if user is near bottom
  const handleScroll = useCallback((event: any) => {
    const { nativeEvent } = event;
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    // Consider "near bottom" if within 100 pixels
    isUserNearBottomRef.current = distanceFromBottom < 100;
  }, []);

  // 🚀 INSTANT OPEN: Load from cache immediately — no spinner if cache exists
  const actions = { fetchConv: null as any, fetchMessageHistory: null as any, fetchRecipientDetails: null as any };

  useEffect(() => {
    // First use params for instant header even if no cache
    if (username && profileImage) {
      setRecipient({
        _id: recipientId || 'temp',
        username: username,
        avatar_url: profileImage,
        is_online: isOnlineParam === 'true'
      });
      if (isOnlineParam === 'true') setIsOnline(true);
    }

    if (conversationId === 'new') return;

    // 1. Use cached conversations for instant header
    const cachedConversations = useChatStore.getState().conversations || [];
    const cachedConv = cachedConversations.find((c: any) =>
      (c._id?.toString() === conversationId?.toString()) ||
      (c.id?.toString() === conversationId?.toString())
    );
    if (cachedConv) {
      const currentUserId = user?.id || user?._id;
      const partnerParticipant = cachedConv.participants?.find((p: any) => {
        const pUserId = p.user?._id || p.user;
        return pUserId && pUserId.toString() !== currentUserId?.toString();
      });
      if (partnerParticipant?.user) {
        const partner = partnerParticipant.user;
        const pId = partner._id || partner;
        setPartnerUserId(pId.toString());
        if (cachedConv.is_anonymous) {
          setIsAnonymousChat(true);
          const rawName = (partner.anonymousPersona?.username || partner.ghost_persona?.username || partner.anonymousPersona?.name || partner.ghost_persona?.name || partner.username || 'Ghost User').replace(/^@/, '');
          const anonAvatar = partner.anonymousPersona?.avatar || partner.ghost_persona?.avatar || resolveAvatarUrl(undefined, rawName, true);
          setRecipient({
            _id: pId.toString(),
            username: rawName,
            avatar_url: anonAvatar
          });
        } else {
          setRecipient({
            _id: pId.toString(),
            username: partner.username,
            avatar_url: resolveAvatarUrl(partner.avatar_url || partner.avatar, partner.username, false),
            is_online: partner.is_online
          });
          if (partner.is_online === true) setIsOnline(true);
        }
      }
      if (cachedConv.is_disappearing !== undefined) {
        setIsVanishMode(
          cachedConv.is_disappearing === '24h' ? '24h'
            : cachedConv.is_disappearing ? 'on_read'
              : false
        );
      }
    }

    // 2. Load cached messages instantly & trace performance
    performanceEngine.startScreenTrace('ChatScreen');
    const cached: Message[] = messagesCache?.[conversationId] || [];
    const cacheHit = cached.length > 0;
    performanceEngine.trackCacheAccess('Chat', cacheHit);
    if (cacheHit) {
      setMessages(cached);
    }
    performanceEngine.endScreenTrace('ChatScreen', cacheHit);

    // 3. Fetch fresh data in background — skip redundant work when opened from list
    const hasInstantContext = !!(messagesCache?.[conversationId]?.length || username || profileImage);
    const cachedLen = messagesCache?.[conversationId]?.length || 0;
    const timer = setTimeout(() => {
      if (!fromList || !cachedConv) {
        actions.fetchConv?.();
      }
      if (cachedLen > 3) {
        setTimeout(() => actions.fetchMessageHistory?.(), 600);
      } else {
        actions.fetchMessageHistory?.();
      }
      if (!fromList || !recipientId || !username) {
        actions.fetchRecipientDetails?.();
      }
    }, hasInstantContext ? 0 : 80);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user?.id, user?._id, username, profileImage, isOnlineParam, recipientId]);


  // Clean up recording when component unmounts
  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => { });
      }
    };
  }, [recording]);

  const markAsRead = useCallback(async () => {
    if (conversationId && conversationId !== 'new') {
      try {
        await apiClient.post(`/chat/conversations/${conversationId}/read`);
        // 🔔 Auto-clear system notifications for this chat room
        clearConversationNotifications(conversationId);

        const currentUserId = (user?.id || user?._id)?.toString();
        useChatStore.getState().setConversations(
          (useChatStore.getState().conversations || []).map((c: any) => {
            const cid = (c._id || c.id)?.toString();
            if (cid === conversationId?.toString()) {
              const unreadCounts = { ...(c.unread_counts || {}) };
              if (currentUserId) unreadCounts[currentUserId] = 0;
              return { ...c, unread_count: 0, unread_counts: unreadCounts };
            }
            return c;
          })
        );
      } catch (e) {
      }
    }
  }, [conversationId, user?.id, user?._id]);

  useFocusEffect(
    useCallback(() => {
      markAsRead();
      return () => {
        // Stop recording when losing focus
        if (isRecording) {
          stopRecording();
        }
      };
    }, [markAsRead, isRecording])
  );

  // Scroll to a message by its ID (for reply tap)
  const scrollToMessage = useCallback((messageId: string) => {
    // messages array is inverted — index 0 = newest
    const index = messages.findIndex(m => m._id?.toString() === messageId?.toString());
    if (index === -1) return;
    try {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      // Highlight briefly
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 1500);
    } catch (_) { }
  }, [messages]);

  // Instagram Swipe Timing Shared Value
  const swipeX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Only allow swiping left (negative X)
      if (event.translationX < 0) {
        // Limit swipe distance to 70px
        swipeX.value = Math.max(event.translationX, -70);
      } else {
        swipeX.value = 0;
      }
    })
    .onEnd(() => {
      swipeX.value = withSpring(0, { damping: 20, stiffness: 150 });
    });

  const [isAnonymousChat, setIsAnonymousChat] = useState(
    isAnonParam === 'true' || !!conversationSettings?.is_anonymous
  );

  // 🔐 E2E Encryption state (Disabled)
  const e2eEnabled = false;
  const peerPublicKeyRef = useRef<string | null>(null);
  const [isSkipping, setIsSkipping] = useState(false);
  const [partnerUserId, setPartnerUserId] = useState<string | null>(recipientId || null);

  // ✅ Keep partnerUserId in sync with recipientId if it changes
  useEffect(() => {
    if (recipientId && !partnerUserId) {
      setPartnerUserId(recipientId);
    }
  }, [recipientId]);

  const targetRecipientId = (partnerUserId || recipient?._id || recipientId) as string;
  const isBlocked = user?.blocked_users?.some(id => id.toString() === targetRecipientId?.toString());

  useEffect(() => {
    const timer = setTimeout(() => {
      apiClient.get('/users/me')
        .then(res => {
          if (res.data && res.data.blocked_users) {
            const latestUser = useAuthStore.getState().user;
            if (latestUser) {
              useAuthStore.getState().setAuth({ ...latestUser, blocked_users: res.data.blocked_users }, useAuthStore.getState().token || '');
            }
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Removed spammy useEffect

  // ─── HANDLERS DEFINED AT TOP LEVEL ──────────────────────────────────────

  const fetchConv = useCallback(async () => {
    if (conversationId === 'new') return;
    try {
      const res = await apiClient.get(`/chat/conversations/${conversationId}`);
      const isConvAnon = !!res.data.is_anonymous;
      const isUserAnon = !!user?.isAnonymousMode;

      // 🛡️ IRONCLAD MODE WALL: Block rendering and redirect if chatroom mode does not match active user mode
      if (isUserAnon !== isConvAnon) {
        router.replace('/(tabs)/messages' as any);
        return;
      }

      setIsAnonymousChat(isConvAnon);

      const currentUserId = user?.id || user?._id;
      const partnerParticipant = res.data.participants.find((p: any) => {
        const pUserId = p.user?._id || p.user;
        return pUserId && pUserId.toString() !== currentUserId?.toString();
      });

      const partner = partnerParticipant?.user;
      if (partner) {
        const pId = partner._id || partner;
        setPartnerUserId(pId.toString());
        if (res.data.is_anonymous) {
          setIsAnonymousChat(true);
          const rawName = (partner.anonymousPersona?.name || partner.anonymousPersona?.username || partner.ghost_persona?.name || partner.ghost_persona?.username || partner.username || 'Ghost User').replace(/^@/, '');
          const anonAvatar = partner.anonymousPersona?.avatar || partner.ghost_persona?.avatar || resolveAvatarUrl(undefined, rawName, true);
          setRecipient({
            _id: pId.toString(),
            username: rawName,
            avatar_url: anonAvatar
          });
        } else if (!res.data.is_anonymous) {
          // It's a normal chat, populate the recipient state from the conversation details
          setRecipient({
            _id: pId.toString(),
            username: partner.username,
            avatar_url: resolveAvatarUrl(partner.avatar_url || partner.avatar, partner.username, false),
            is_online: partner.is_online
          });
          if (partner.is_online === true) setIsOnline(true);
        }
      }
    } catch (err) {  }
  }, [conversationId, user?.id, user?._id]);

  const fetchMessageHistory = useCallback(async () => {
    if (conversationId === 'new') return;
    const cachedCount = useChatStore.getState().messagesCache?.[conversationId]?.length || 0;
    if (cachedCount <= 1) setLoading(true);
    try {
      const response = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
      if (response.data) {
        const raw = Array.isArray(response.data) ? response.data : [];
        // 🔐 E2E: Decrypt messages if encryption is enabled
        const decrypted = await Promise.all(raw.map(async (msg: any) => {
          // 🚀 NORMALIZE: Ensure fields match our Message interface
          if (!msg.media_url && msg.mediaUrl) msg.media_url = msg.mediaUrl;
          if (!msg.author_username && msg.authorUsername) msg.author_username = msg.authorUsername;
          if (!msg.author_avatar && msg.authorAvatar) msg.author_avatar = msg.authorAvatar;
          if (!msg.message_type && msg.type) msg.message_type = msg.type;

          return msg;
        }));
        setMessages((prev) => mergeMessageHistory(prev, decrypted));
      }
    } catch (_error) {
    } finally {
      setLoading(false);
    }
  }, [conversationId, setCachedMessages]);

  const loadMoreMessages = useCallback(async () => {
    if (conversationId === 'new' || loadingMore || !hasMore || messages.length === 0) return;
    try {
      setLoadingMore(true);
      // Backend uses created_at as the `before` cursor (date-based, not ID-based)
      const oldestMessage = messages[messages.length - 1];
      const oldestDate = oldestMessage.created_at;
      if (!oldestDate) {
        setHasMore(false);
        return;
      }

      const response = await apiClient.get(`/chat/conversations/${conversationId}/messages?limit=20&before=${encodeURIComponent(oldestDate)}`);
      if (response.data) {
        const raw = Array.isArray(response.data) ? response.data : [];
        if (raw.length === 0) {
          setHasMore(false);
          return;
        }

        const normalized = raw.map((msg: any) => {
          if (!msg.media_url && msg.mediaUrl) msg.media_url = msg.mediaUrl;
          if (!msg.author_username && msg.authorUsername) msg.author_username = msg.authorUsername;
          if (!msg.author_avatar && msg.authorAvatar) msg.author_avatar = msg.authorAvatar;
          if (!msg.message_type && msg.type) msg.message_type = msg.type;
          return msg;
        });

        setMessages((prev) => mergeMessageHistory(prev, normalized));
        if (raw.length < 20) {
          setHasMore(false);
        }
      }
    } catch (error) {
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore, hasMore, messages]);

  const fetchRecipientDetails = useCallback(async () => {
    if (isAnonymousChat || isAnonParam === 'true' || recipientId === 'anonymous') return;
    if (fromList && recipientId && username) return;

    try {
      let rId = recipientId as string;
      if (rId === 'anonymous') return;
      const currentUserId = user?.id || user?._id;

      if (!rId && conversationId !== 'new') {
        const res = await apiClient.get(`/chat/conversations/${conversationId}`);
        if (res.data?.is_anonymous) return;
        const partnerParticipant = res.data.participants.find((p: any) => {
          const pUserId = p.user?._id || p.user;
          return pUserId && pUserId.toString() !== currentUserId?.toString();
        });
        if (partnerParticipant) {
          const p = partnerParticipant.user;
          rId = (p?._id || p).toString();
        }
      }

      if (rId && rId !== 'undefined' && rId !== 'null' && rId !== 'anonymous') {
        const userRes = await apiClient.get(`/users/${rId}`);
        if (userRes.data) {
          const normalized = {
            ...userRes.data,
            _id: userRes.data._id || userRes.data.id || rId
          };
          setRecipient(normalized);
          setPartnerUserId(normalized._id);
          setIsOnline(!!userRes.data?.is_online);
          // Re-query live status via socket in case it changed
          socketService.queryOnlineStatus(normalized._id);
        }
      } else if (username && username !== 'undefined') {
        // 🚀 NEW: Try to fetch by username if ID is missing (e.g. from profile navigation)
        const userRes = await apiClient.get(`/users/${username}`);
        if (userRes.data) {
          const normalized = {
            ...userRes.data,
            _id: userRes.data._id || userRes.data.id
          };
          setRecipient(normalized);
          if (normalized._id) setPartnerUserId(normalized._id);
          setIsOnline(!!userRes.data?.is_online);
          // Re-query live status via socket in case it changed
          if (normalized._id) socketService.queryOnlineStatus(normalized._id);
        }
      }
    } catch (error) {
    }
  }, [isAnonymousChat, isAnonParam, fromList, recipientId, conversationId, user?.id, user?._id, username]);

  actions.fetchConv = fetchConv;
  actions.fetchMessageHistory = fetchMessageHistory;
  actions.fetchRecipientDetails = fetchRecipientDetails;

  // Reset infinite scroll state whenever the conversation changes
  useEffect(() => {
    setHasMore(true);
    setLoadingMore(false);
  }, [conversationId]);

  const onMessageReceived = useCallback(async (message: Message) => {
    // 🛡️ SECURITY: Only process messages for the current conversation
    const msgConvId = message.conversation_id?.toString();
    const currentConvId = conversationId?.toString();

    if (msgConvId !== currentConvId) {
      return;
    }

    const normalizedMsg = normalizeMessage(message);
    const incoming: any = { ...normalizedMsg, _id: normalizedMsg._id?.toString?.() || normalizedMsg._id };
    if (!incoming.media_url && incoming.mediaUrl) incoming.media_url = incoming.mediaUrl;
    if (!incoming.author_username && incoming.authorUsername) incoming.author_username = incoming.authorUsername;
    if (!incoming.author_avatar && incoming.authorAvatar) incoming.author_avatar = incoming.authorAvatar;
    if (!incoming.message_type && incoming.type) incoming.message_type = incoming.type;

    const msgId = incoming._id?.toString?.() || incoming._id;
    const clientId = incoming.client_message_id || incoming.tempMessageId;

    setMessages((prev) => {
      // ✅ CRITICAL FIX: Skip duplicate messages inside state updater to prevent race conditions
      const isDuplicate = prev.some(m => {
        const mId = m._id?.toString?.() || m._id || m.id;
        if (msgId && mId === msgId) return true; // Same _id
        if (clientId && ((m as any).client_message_id === clientId || m.tempMessageId === clientId)) return true;
        return false;
      });

      if (isDuplicate) {
        return prev;
      }

      return sortMessagesByDate(upsertIncomingMessage(prev, incoming, (user?.id || user?._id)?.toString()));
    });

    // Auto scroll to bottom/latest when any new message is received
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });

    const isMe = (message.sender_id?._id || message.sender_id)?.toString() === (user?.id || user?._id)?.toString();
    if (!isMe) {
      // ✅ ACCURACY: Mark as 'read' AND 'delivered' immediately for partner messages
      socketService.markRead({ chatId: conversationId, messageIds: [msgId], status: 'delivered' });
      socketService.markRead({ chatId: conversationId, messageIds: [msgId], status: 'read' });
      markAsRead();

      // 🔥 VANISH MODE: Auto-delete based on mode
      if (isVanishMode === 'on_read') {
        setTimeout(() => {
          setMessages(prev => prev.filter(m => (m._id?.toString?.() || m._id) !== msgId));
          socketService.deleteMessage({ messageId: msgId, deleteType: 'everyone', chatId: conversationId });
        }, 3000);
      } else if (isVanishMode === '24h') {
        setTimeout(() => {
          setMessages(prev => prev.filter(m => (m._id?.toString?.() || m._id) !== msgId));
          socketService.deleteMessage({ messageId: msgId, deleteType: 'everyone', chatId: conversationId });
        }, 24 * 60 * 60 * 1000);
      }
    } else {
    }
  }, [conversationId, user?.id, user?._id, isVanishMode]);

  const onMessageDeleted = useCallback(({ messageId, type }: { messageId: string; type: 'me' | 'everyone' }) => {
    setMessages(prev =>
      prev
        .filter(m => m._id !== messageId)
        .map(m => {
          if (m.reply_to_id) {
            const replyMsg = m.reply_to_id;
            const replyId = typeof replyMsg === 'string' ? replyMsg : replyMsg._id;
            if (replyId === messageId) {
              return {
                ...m,
                reply_to_id: {
                  ...replyMsg,
                  is_deleted: true
                }
              };
            }
          }
          return m;
        })
    );
  }, []);

  const onReplyReferenceUpdated = useCallback(({ messageId }: { messageId: string }) => {
    setMessages(prev => prev.map(m => {
      if (m.reply_to_id) {
        const replyMsg = m.reply_to_id;
        const replyId = typeof replyMsg === 'string' ? replyMsg : replyMsg._id;
        if (replyId === messageId) {
          return {
            ...m,
            reply_to_id: {
              ...replyMsg,
              is_deleted: true
            }
          };
        }
      }
      return m;
    }));
  }, []);

  const onMessageEdited = useCallback(({ messageId, content }: { messageId: string; content: string }) => {
    setMessages(prev => prev.map(m => m._id === messageId ? { ...m, content, is_edited: true } : m));
  }, []);

  // 🚀 Debounce reaction updates to prevent rapid overwrites
  const reactionUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReactionStateRef = useRef<Record<string, any>>({});

  const onReactionsUpdated = useCallback((data: { messageId: string, reactions: any }) => {
    if (!data?.messageId) return;

    const messageId = data.messageId.toString();

    // Standardize reaction keys to string user IDs
    const normalizedReactions: Record<string, string> = {};
    if (data.reactions && typeof data.reactions === 'object') {
      Object.entries(data.reactions).forEach(([k, v]) => {
        if (typeof v === 'string') {
          normalizedReactions[k.toString()] = v;
        }
      });
    }

    setMessages(prev => {
      return prev.map(m => {
        const mId = (m._id || m.id)?.toString();
        if (mId === messageId) {
          return { ...m, reactions: normalizedReactions };
        }
        return m;
      });
    });

    // 🚀 Sync to Zustand messagesCache so room re-entry displays fresh reactions immediately
    if (conversationId && conversationId !== 'new') {
      const currentCache = useChatStore.getState().messagesCache?.[conversationId] || [];
      const updatedCache = currentCache.map((m: any) => {
        const mId = (m._id || m.id)?.toString();
        if (mId === messageId) {
          return { ...m, reactions: normalizedReactions };
        }
        return m;
      });
      useChatStore.getState().setCachedMessages(conversationId, updatedCache);
    }
  }, [conversationId]);

  const onMessageSent = useCallback(({ tempMessageId, messageId, created_at }: any) => {
    if (!tempMessageId || !messageId) return;
    const realId = messageId.toString();
    const tempId = tempMessageId.toString();

    setMessages(prev => prev.map(m => {
      const mTempId = (m.tempMessageId || (m as any).client_message_id)?.toString();
      const mId = (m._id || m.id)?.toString();
      if (mTempId === tempId || mId === tempId) {
        return {
          ...m,
          _id: realId,
          id: realId,
          tempMessageId: undefined,
          status: 'sent',
          created_at: created_at || m.created_at
        };
      }
      return m;
    }));
  }, []);

  const onChatRequest = useCallback(({ conversationId: convId, requestId }: any) => {
    if ((convId || '').toString() === conversationId) {
      useChatStore.getState().setConversations(
        (useChatStore.getState().conversations || []).map((c: any) =>
          (c._id || c.id)?.toString() === convId
            ? { ...c, message_request_id: requestId, is_request: true }
            : c
        )
      );
    }
  }, [conversationId]);

  const onTyping = useCallback(({ userId: typingUserId, isTyping: t }: any) => {
    if (typingUserId !== user?.id) setIsTyping(t);
  }, [user?.id]);

  const onUserOnline = useCallback(({ userId: onlineId }: { userId: string }) => {
    if (onlineId === recipientId || onlineId === recipient?._id) setIsOnline(true);
  }, [recipientId, recipient?._id]);

  const onUserOffline = useCallback(({ userId: offlineId }: { userId: string }) => {
    if (offlineId === recipientId || offlineId === recipient?._id) setIsOnline(false);
  }, [recipientId, recipient?._id]);

  const onUserStatusResult = useCallback(({ userId: uid, isOnline: online }: { userId: string; isOnline: boolean }) => {
    if (uid === recipientId || uid === recipient?._id) setIsOnline(online);
  }, [recipientId, recipient?._id]);

  const onUserDeleted = useCallback(({ userId: uid }: { userId: string }) => {
    if (uid === recipientId || uid === recipient?._id) {
      setRecipient(prev => prev ? { ...prev, is_deleted_user: true, username: '', fullName: '', full_name: '' } as any : null);
    }
  }, [recipientId, recipient?._id]);

  const onStatusUpdated = useCallback(({ messageIds, status }: any) => {
    const nowStr = new Date().toISOString();
    setMessages(prev => prev.map(m => {
      const mId = m._id?.toString?.() || m._id || m.id;
      return (messageIds || []).some((id: string) => id.toString() === mId?.toString())
        ? { ...m, status, readAt: nowStr }
        : m;
    }));
  }, []);

  const onMessagesRead = useCallback(({ conversationId: readConvId, readBy, readAt }: any) => {
    if (readConvId?.toString() === conversationId?.toString()) {
      const currentUserId = (user?.id || user?._id)?.toString();
      if (readBy?.toString() !== currentUserId) {
        const nowStr = readAt || new Date().toISOString();
        setMessages(prev => prev.map(m => {
          const isMyMessage = (m.sender_id?._id || m.sender_id)?.toString() === currentUserId;
          if (isMyMessage) {
            return { ...m, status: 'read', readAt: nowStr };
          }
          return m;
        }));
      }
    }
  }, [conversationId, user?.id, user?._id]);

  const onChatIdAssigned = useCallback(({ oldId, newId }: { oldId: string; newId: string }) => {
    if (oldId === 'new' && conversationId === 'new') {
      router.setParams({ id: newId });
      // Update local message list to reflect the new conversation ID
      setMessages(prev => prev.map(m => ({ ...m, conversation_id: newId })));
    }
  }, [conversationId, router]);

  const onSocketError = useCallback((error: any) => {
    // Only log critical errors, not benign server messages
    // Benign errors include: access control rejections, invalid chat IDs, resource not found
    // These are expected and don't warrant user-facing alerts
    const msg = error?.message || '';
    const isBenignError = 
      msg.includes('Access denied') || 
      msg.includes('Invalid chat') || 
      msg.includes('not found') ||
      msg.includes('Unauthorized') ||
      msg.includes('Authentication error');
    
    if (!isBenignError) {
      // Only log truly unexpected errors; don't spam user with alerts for permission/validation errors
    }
  }, []);

  const onMessagePinned = useCallback(({ messageId, isPinned }: any) => {
    setMessages(prev => prev.map(m => m._id === messageId ? { ...m, is_pinned: isPinned } : m));
  }, []);

  const onReconnect = useCallback(() => {
    socketService.joinRoom(conversationId);
    const tid = (recipientId as string) || recipient?._id;
    if (tid) socketService.socket?.emit('user:status', { targetUserId: tid });
  }, [conversationId, recipientId, recipient?._id]);

  // INITIALIZE SOCKET after first paint so navigation feels instant
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let detachListeners: ((s: any) => void) | null = null;
    let onFirstConnect: (() => void) | null = null;

    const onAnonymousSkipped = (data: { conversationId: string }) => {
      if (String(data.conversationId) === String(conversationId)) {
        // removeConversation automatically stamps lastSkipTs — MessagesScreen will suppress reload
        useChatStore.getState().removeConversation(conversationId);
        Alert.alert(
          'Chat Ended',
          'This anonymous chat has been ended.',
          [
            {
              text: 'OK',
              onPress: () => {
                router.replace('/(tabs)/messages');
              }
            }
          ],
          { cancelable: false }
        );
      }
    };

    const setupSocket = () => {
      if (cancelled) return;

      const currentSocket = socketService.socket;
      const token = useAuthStore.getState().token;
      if (token && !currentSocket?.connected) {
        socketService.connect(token);
      }

      socketService.joinRoom(conversationId);

      const targetId = (recipientId as string) || recipient?._id;
      if (targetId) {
        socketService.queryOnlineStatus(targetId);
      }

      const attachListeners = (s: any) => {
        if (!s) return;
        // Always remove first to prevent listener stacking (causes message duplication)
        s.off('message:received', onMessageReceived);
        s.off('message:sent', onMessageSent);
        s.off('chat:is_request', onChatRequest);
        s.off('anonymous:skipped', onAnonymousSkipped);
        s.off('message:deleted', onMessageDeleted);
        s.off('reply_reference_updated', onReplyReferenceUpdated);
        s.off('message:edited', onMessageEdited);
        s.off('message:reactions_updated', onReactionsUpdated);
        s.off('chat:typing', onTyping);
        s.off('user:online', onUserOnline);
        s.off('user:offline', onUserOffline);
        s.off('user:status_result', onUserStatusResult);
        s.off('user:deleted', onUserDeleted);
        s.off('message:status_updated', onStatusUpdated);
        s.off('messages:read', onMessagesRead);
        s.off('message:pinned', onMessagePinned);
        s.off('chat:id_assigned', onChatIdAssigned);
        s.off('error', onSocketError);
        s.off('connect', onReconnect);
        // Now attach fresh
        s.on('message:received', onMessageReceived);
        s.on('message:sent', onMessageSent);
        s.on('chat:is_request', onChatRequest);
        s.on('anonymous:skipped', onAnonymousSkipped);
        s.on('message:deleted', onMessageDeleted);
        s.on('reply_reference_updated', onReplyReferenceUpdated);
        s.on('message:edited', onMessageEdited);
        s.on('message:reactions_updated', onReactionsUpdated);
        s.on('chat:typing', onTyping);
        s.on('user:online', onUserOnline);
        s.on('user:offline', onUserOffline);
        s.on('user:status_result', onUserStatusResult);
        s.on('user:deleted', onUserDeleted);
        s.on('message:status_updated', onStatusUpdated);
        s.on('messages:read', onMessagesRead);
        s.on('message:pinned', onMessagePinned);
        s.on('chat:id_assigned', onChatIdAssigned);
        s.on('error', onSocketError);
        s.on('connect', onReconnect);
        s.on('chat:settings_updated', (data: any) => {
          if (data.is_disappearing !== undefined) {
            setIsVanishMode(
              data.is_disappearing === '24h' ? '24h'
                : data.is_disappearing ? 'on_read'
                  : false
            );
          }
          if (data.wallpaper_url !== undefined) setChatWallpaper(data.wallpaper_url || null);

          useChatStore.getState().setConversations(
            useChatStore.getState().conversations.map((c: any) =>
              (c._id || c.id)?.toString() === conversationId ? { ...c, ...data } : c
            )
          );
        });
      };

      detachListeners = (s: any) => {
        if (!s) return;
        s.off('message:received', onMessageReceived);
        s.off('message:new', onMessageReceived);
        s.off('message:sent', onMessageSent);
        s.off('chat:is_request', onChatRequest);
        s.off('anonymous:skipped', onAnonymousSkipped);
        s.off('chat:settings_updated');
        s.off('message:deleted', onMessageDeleted);
        s.off('reply_reference_updated', onReplyReferenceUpdated);
        s.off('message:edited', onMessageEdited);
        s.off('message:reactions_updated', onReactionsUpdated);
        s.off('chat:typing', onTyping);
        s.off('user:online', onUserOnline);
        s.off('user:offline', onUserOffline);
        s.off('user:status_result', onUserStatusResult);
        s.off('user:deleted', onUserDeleted);
        s.off('message:status_updated', onStatusUpdated);
        s.off('messages:read', onMessagesRead);
        s.off('message:pinned', onMessagePinned);
        s.off('chat:id_assigned', onChatIdAssigned);
        s.off('error', onSocketError);
        s.off('connect', onReconnect);
      };

      if (currentSocket?.connected) {
        attachListeners(currentSocket);
      } else {
        onFirstConnect = () => {
          attachListeners(socketService.socket!);
        };
        socketService.socket?.once('connect', onFirstConnect);
      }
    };

    const interactionTask = InteractionManager.runAfterInteractions(setupSocket);

    return () => {
      cancelled = true;
      interactionTask.cancel();
      socketService.leaveRoom(conversationId);
      const currentSocket = socketService.socket;
      if (onFirstConnect) {
        currentSocket?.off('connect', onFirstConnect);
      }
      if (currentSocket && detachListeners) {
        detachListeners(currentSocket);
      }
    };
  }, [
    conversationId,
    user?.id,
    recipientId,
    username,
    recipient?._id,
    // NOTE: Callback functions (onMessageReceived, onMessageSent, etc.) are intentionally
    // NOT included here. Including them causes the useEffect to re-run on every message,
    // re-attaching socket listeners and causing duplicate message delivery.
    // All callbacks use setMessages(prev => ...) pattern so they're safe without stale deps.
  ]);

  // ✅ ACCURACY: Mark as read every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!user || !conversationId || conversationId === 'new') return;

      apiClient.post(`/chat/conversations/${conversationId}/read`)
        .then(() => {
          socketService.markRead({ chatId: conversationId, status: 'read' });
        })
        .catch(() => {});

      // 🚀 INSTANT WALLPAPER: Sync from store every time screen comes into focus
      // This handles the case when user sets wallpaper in chat-info and comes back
      const latest = useChatStore.getState().conversations?.find(
        (c: any) => (c._id || c.id)?.toString() === conversationId
      );
      if (latest) {
        setChatWallpaper(latest.wallpaper_url || null);
        setIsVanishMode(
          latest.is_disappearing === '24h' ? '24h'
            : latest.is_disappearing ? 'on_read'
              : false
        );
      }

      // 🚀 SCROLL TO LAST MESSAGE: Only scroll if user was near bottom when leaving
      if (isUserNearBottomRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 150);
        });
      }
    }, [conversationId, user?.id])
  );

  // UPLOAD MEDIA SYSTEM
  const getMediaThumbnail = (url: string, type: string) => {
    const resolved = resolveMediaUrl(url);
    if (type !== 'video') return resolved;
    // Simple Cloudinary hack: replace extension with .jpg for video thumbnail
    return resolved.replace(/\.[^/.]+$/, ".jpg");
  };

  const handleVideoCall = () => {
    const rId = targetRecipientId;
    const rName = recipient?.username || (username as string) || 'User';
    const rAvatar = recipient?.avatar_url || (profileImage ? decodeURIComponent(profileImage as string) : '');


    if (rId && rId !== 'undefined' && rId !== 'null') {
      CallEngine.startCall(rId, rName, rAvatar, 'video');
      startCall(rId, rName, rAvatar, true);
    } else {
      Alert.alert('Error', 'User not found to start call. Please wait for the chat to load.');
    }
  };

  const handleVoiceCall = () => {
    const rId = targetRecipientId;
    const rName = recipient?.username || (username as string) || 'User';
    const rAvatar = recipient?.avatar_url || (profileImage ? decodeURIComponent(profileImage as string) : '');


    if (rId && rId !== 'undefined' && rId !== 'null') {
      CallEngine.startCall(rId, rName, rAvatar, 'voice');
      startCall(rId, rName, rAvatar, false);
    } else {
      Alert.alert('Error', 'User not found to start call. Please wait for the chat to load.');
    }
  };

  const uploadToCloudinary = async (
    fileUri: string,
    resourceType: 'image' | 'video' = 'image',
    onProgress?: (percent: number) => void
  ): Promise<string | null> => {
    try {
      // 1. Get Signature/Config from Backend
      const configRes = await apiClient.post('/upload', { folder: 'chat_media', resource_type: resourceType });
      const { cloudName, apiKey, timestamp, signature, publicId } = configRes.data;

      // 2. Form Data for Cloudinary
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        type: resourceType === 'video' ? 'video/mp4' : 'image/jpeg',
        name: resourceType === 'video' ? 'upload.mp4' : 'upload.jpg',
      } as any);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);
      formData.append('public_id', publicId);
      formData.append('folder', 'chat_media');
      formData.append('resource_type', resourceType);

      // 3. Direct upload to Cloudinary with real-time progress
      const uploadRes = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && progressEvent.total > 0) {
              const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
              onProgress?.(percent);
            }
          },
        }
      );

      return uploadRes.data.secure_url;
    } catch (error) {
      return null;
    }
  };

  const handleMediaPick = async (useCamera = false) => {
    try {
      const permissionResult = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert('Permission Denied', 'AnuFy needs permission to access your media.');
        return;
      }

      const pickerResult = useCamera
        ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.7,
          allowsEditing: true
        })
        : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.7,
          allowsMultipleSelection: true,
          selectionLimit: 10
        });

      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        setIsSendingMedia(true);
        const assets = pickerResult.assets;
        const total = assets.length;
        const myUserId = user?.id || user?._id || '';
        const myUsername = user?.username || 'me';
        const myAvatar = (user as any)?.avatar_url || '';

        // ── 1. Show in-app banner immediately ──
        const firstAsset = assets[0];
        setUploadThumbnail(firstAsset.uri);
        setUploadMediaType(firstAsset.type === 'video' ? 'video' : 'image');
        setUploadTotalAssets(total);
        setUploadCurrentAsset(1);
        setUploadProgress(0);
        uploadBannerAnim.value = withSpring(1, { damping: 18, stiffness: 160 });

        // ── 2. Build optimistic message bubbles instantly (local URI) ──
        const tempIds: string[] = assets.map(() => `temp-${uuidv4()}`);
        const nowIso = new Date().toISOString();

        // Insert a single optimistic message per asset into messages list
        const optimisticMessages: Message[] = assets.map((asset, i) => ({
          _id: tempIds[i],
          conversation_id: conversationId,
          sender_id: {
            _id: myUserId,
            username: myUsername,
            avatar_url: myAvatar,
          } as UserDetails,
          content: asset.type === 'video' ? 'Sent a video' : 'Sent an image',
          message_type: asset.type === 'video' ? 'video' : 'image',
          media_url: asset.uri,          // local URI — shown immediately
          is_deleted: false,
          deleted_for: [],
          reactions: {},
          is_edited: false,
          is_pinned: false,
          is_forwarded: false,
          created_at: nowIso,
          status: 'sending',             // marks as uploading
        }));

        // Prepend to messages (list is inverted)
        setMessages(prev => [...optimisticMessages.reverse(), ...prev]);

        // Multi-phase scroll for ultra-responsive bottom lock on media sending
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
          }, 100);
        });

        // Init progress tracking for each bubble
        const initialProgress: Record<string, number> = {};
        tempIds.forEach(id => { initialProgress[id] = 0; });
        setUploadBubbleProgress(initialProgress);

        // ── 3. Show system notification ──
        await showUploadNotif(0, firstAsset.uri, recipient?.username || (username as string) || 'them', 1, total);

        // ── 4. Upload each asset and track progress ──
        const uploadedAttachments: Array<{ url: string, type: 'image' | 'video', tempId: string }> = [];
        let lastNotifProgress = 0;

        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          const tempId = tempIds[i];

          setUploadCurrentAsset(i + 1);
          setUploadThumbnail(asset.uri);
          setUploadMediaType(asset.type === 'video' ? 'video' : 'image');
          setUploadProgress(0);

          const fileUrl = await uploadToCloudinary(
            asset.uri,
            asset.type === 'video' ? 'video' : 'image',
            (percent) => {
              // Update in-app banner
              setUploadProgress(percent);

              // Update per-bubble progress ring
              setUploadBubbleProgress(prev => ({ ...prev, [tempId]: percent }));

              // Throttle system notification updates (every 5%)
              if (Math.abs(percent - lastNotifProgress) >= 5 || percent >= 100) {
                lastNotifProgress = percent;
                showUploadNotif(
                  percent,
                  asset.uri,
                  recipient?.username || (username as string) || 'them',
                  i + 1,
                  total,
                );
              }
            }
          );

          if (fileUrl) {
            uploadedAttachments.push({
              url: fileUrl,
              type: asset.type === 'video' ? 'video' : 'image',
              tempId,
            });

            // ── 5. Swap optimistic bubble: local URI → CDN URL, mark as 'sent' ──
            setMessages(prev => prev.map(m =>
              m._id === tempId
                ? { ...m, media_url: fileUrl, status: 'sent' }
                : m
            ));

            // Clear this bubble's progress spinner
            setUploadBubbleProgress(prev => {
              const next = { ...prev };
              delete next[tempId];
              return next;
            });
          } else {
            // Upload failed — mark bubble as error
            setMessages(prev => prev.map(m =>
              m._id === tempId ? { ...m, status: 'error' } : m
            ));
          }
        }

        // ── 6. Send to socket (full attachments list) ──
        if (uploadedAttachments.length > 0) {
          socketService.sendMessage({
            chatId: conversationId,
            recipientId: targetRecipientId,
            content: uploadedAttachments.length > 1 ? `Sent ${uploadedAttachments.length} items` : (uploadedAttachments[0].type === 'video' ? 'Sent a video' : 'Sent an image'),
            type: uploadedAttachments.length > 1 ? 'image' : uploadedAttachments[0].type,
            mediaUrl: uploadedAttachments[0].url,
            attachments: uploadedAttachments.map(a => ({ url: a.url, type: a.type })),
            tempMessageId: uploadedAttachments[0].tempId, // 🚀 Prevents double/duplicate bubbles upon server response
          });
        }
      }
    } catch (err: any) {
      Alert.alert('Error', 'Could not open media library. Please check your permissions.');
    } finally {
      setIsSendingMedia(false);
      // Dismiss system notification after a short delay
      setTimeout(() => dismissUploadNotif(), 800);
      // Animate banner out then clear state
      uploadBannerAnim.value = withTiming(0, { duration: 400 });
      setTimeout(() => {
        setUploadThumbnail(null);
        setUploadProgress(0);
      }, 450);
    }
  };


  const handleImagePaste = async (event: any) => {
    const { uri, link } = event.nativeEvent;
    const mediaUri = uri || link;
    if (!mediaUri) return;

    try {
      setIsSendingMedia(true);
      const fileUrl = await uploadToCloudinary(mediaUri, 'image');
      if (fileUrl) {
        socketService.sendMessage({
          chatId: conversationId,
          recipientId: targetRecipientId,
          content: 'Sent a GIF',
          type: 'image',
          mediaUrl: fileUrl,
          attachments: [{ url: fileUrl, type: 'image' }]
        });
      }
    } catch (error) {
      Alert.alert('Upload Error', 'Could not upload keyboard GIF.');
    } finally {
      setIsSendingMedia(false);
    }
  };

  // MEDIA DOWNLOAD SYSTEM
  const handleDownloadMedia = async (url: string) => {
    try {
      // ✅ Request writeOnly permission to avoid issues with READ_MEDIA_AUDIO on Android
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'AnuFy needs permission to save media to your gallery.');
        return;
      }

      Alert.alert('Downloading...', 'Your media is being saved to the gallery.');

      const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
      const tmpDir = Platform.OS === 'ios' ? `${require('expo-constants').default.expoConfig?.extra?.tmpDir || ''}` : '';
      const fileUri = `file://${tmpDir}${Date.now()}.${extension}`;
      const downloadRes = await FileSystem.downloadAsync(url, fileUri);

      if (downloadRes.status === 200) {
        await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
        Alert.alert('Success', 'Media saved to gallery! ✅');
      } else {
        throw new Error('Download failed');
      }
    } catch (err) {
      Alert.alert('Error', 'Could not download media. Please try again.');
    }
  };

  // VOICE RECORDING SYSTEM
  const startRecording = async () => {
    if (recordingInProgressRef.current) return;
    recordingInProgressRef.current = true;
    pendingStopRef.current = false;
    recordingStartTimeRef.current = Date.now(); // Set start time right away
    setIsRecording(true); // Set UI to recording state right away!

    let newRecordingObj: any = null;

    try {

      const { Audio } = require('expo-av');

      // First, try to unload any existing recording
      try {
        if (recording) {
          await recording.stopAndUnloadAsync();
        }
      } catch (e) {
      }

      // Request permissions
      const permission = await Audio.requestPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'AnuFy needs microphone permission to record voice messages.');
        return;
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      // Create recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      newRecordingObj = newRecording;
      setRecording(newRecording);
    } catch (err: any) {
      setRecording(null);
      setIsRecording(false);
      Alert.alert('Recording Error', `Could not start voice recording: ${err?.message || 'Unknown error'}`);
    } finally {
      recordingInProgressRef.current = false;
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        // If we created a recording, use that, otherwise just reset
        if (newRecordingObj) {
          setRecording(newRecordingObj);
          await stopRecording();
        } else {
          setIsRecording(false);
          // Reset audio mode
          try {
            const { Audio } = require('expo-av');
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: false,
              playsInSilentModeIOS: true,
              shouldDuckAndroid: false,
              playThroughEarpieceAndroid: false,
              staysActiveInBackground: false,
            });
          } catch (_) { }
        }
      }
    }
  };

  const stopRecording = async () => {

    if (recordingInProgressRef.current) {
      pendingStopRef.current = true;
      return;
    }

    if (!recording) {
      // Check if we were supposed to record something
      const recordingDuration = Date.now() - recordingStartTimeRef.current;
      if (recordingDuration < 300) {
        setIsRecording(false);
        // Reset audio mode
        try {
          const { Audio } = require('expo-av');
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
            staysActiveInBackground: false,
          });
        } catch (_) { }
        return;
      }
      // If we were recording for longer but don't have a recording object, just reset
      setIsRecording(false);
      return;
    }

    // Check recording duration
    const recordingDuration = Date.now() - recordingStartTimeRef.current;

    // Minimum recording duration: 300ms
    if (recordingDuration < 300) {
      setIsRecording(false);

      try {
        // Only try to unload if we actually have a recording
        const status = await recording.getStatusAsync();
        if (status.isLoaded) {
          await recording.stopAndUnloadAsync();
        }
      } catch (e) {
      }

      setRecording(null);

      // Reset audio mode
      try {
        const { Audio } = require('expo-av');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });
      } catch (_) { }
      return;
    }

    setIsRecording(false);
    let uri: string | null = null;

    try {
      uri = recording.getURI();
    } catch (_) { }

    try {
      const status = await recording.getStatusAsync();
      if (status.isLoaded) {
        await recording.stopAndUnloadAsync();
      }
    } catch (err) {
    }

    // Reset audio mode back to playback
    try {
      const { Audio } = require('expo-av');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });
    } catch (_) { }

    setRecording(null);

    if (uri) {
      sendVoiceMessage(uri);
    }
  };

  const sendVoiceMessage = async (uri: string) => {
    try {
      setIsSendingMedia(true);
      let secureUrl: string | null = null;

      // ✅ Step 1: Try server-signed Cloudinary upload
      try {
        const configRes = await apiClient.post('/upload', { folder: 'chat_audio' });
        const { cloudName, apiKey, timestamp, signature, publicId } = configRes.data;

        const formData = new FormData();
        formData.append('file', { uri, type: 'audio/m4a', name: 'voice_message.m4a' } as any);
        formData.append('api_key', apiKey);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        formData.append('public_id', publicId);

        const uploadRes = await axios.post(
          `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        secureUrl = uploadRes.data.secure_url || null;
      } catch (signedErr: any) {
        // ✅ Step 2: Fallback — unsigned Cloudinary upload
        const CLOUD_NAME = 'dskwivk8p';
        const UPLOAD_PRESET = 'profilePicsUnsigned';

        const fallbackForm = new FormData();
        fallbackForm.append('file', { uri, type: 'audio/m4a', name: 'voice_message.m4a' } as any);
        fallbackForm.append('upload_preset', UPLOAD_PRESET);
        fallbackForm.append('resource_type', 'video');
        fallbackForm.append('folder', 'chat_audio');

        const fallbackRes = await axios.post(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
          fallbackForm,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        secureUrl = fallbackRes.data.secure_url || null;
      }


      // ✅ Step 3: Send via socket
      if (secureUrl) {
        socketService.sendMessage({
          chatId: conversationId,
          recipientId: targetRecipientId,
          content: 'Voice message',
          type: 'audio',
          mediaUrl: secureUrl,
        });
      } else {
        Alert.alert('Upload Error', 'Voice message recorded but upload failed. Please try again.');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || error?.message || 'Unknown error';
      Alert.alert('Voice Message Error', `Could not send voice message.\n${msg}`);
    } finally {
      setIsSendingMedia(false);
    }
  };

  // 1. MESSAGING SYSTEM (Send/Reply/Edit)
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    // 🚀 INSTANT UI CLEAR: Remove input and reply context immediately for "Lightning Speed"
    const content = newMessage.trim();
    const currentReplyingTo = replyingTo;
    const isEditing = !!editingMessage;
    const currentEditingMsg = editingMessage;

    setNewMessage('');
    setReplyingTo(null);
    setEditingMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    socketService.sendTypingStatus({ chatId: conversationId, isTyping: false });

    if (!socketService.socket?.connected) {
      const token = useAuthStore.getState().token;
      if (token) {
        socketService.connect(token);
        socketService.joinRoom(conversationId);
      }
      Alert.alert('Connecting...', 'Reconnecting to server. Please try again in a moment.');
      return;
    }

    if (isEditing && currentEditingMsg) {
      socketService.editMessage({ messageId: currentEditingMsg._id, newContent: content, chatId: conversationId });
    } else {
      const tempMessageId = uuidv4();
      const now = new Date().toISOString();

      // 🚀 Check if content is ONLY one of our animated stickers
      const stickerMatch = ANIMATED_STICKERS.find(s => s.emoji === content);
      const isSticker = !!stickerMatch;

      // 🎬 Detect shot/post links for card rendering
      let finalType: Message['message_type'] = isSticker ? 'sticker' : 'text';
      if (content.includes('anufy.app/reels/') || content.includes('anufy.app/shots/')) {
        finalType = 'shot_share';
      } else if (content.includes('anufy.app/post/')) {
        finalType = 'post_share';
      }

      const optimisticMessage: Message = {
        _id: tempMessageId,
        conversation_id: conversationId,
        sender_id: {
          _id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
        },
        content: content,
        message_type: finalType,
        media_url: stickerMatch?.url,
        reply_to_id: currentReplyingTo as any, // 🚀 Add reply context to optimistic message
        is_deleted: false,
        deleted_for: [],
        reactions: {},
        is_edited: false,
        is_pinned: false,
        is_forwarded: false,
        created_at: now,
        status: 'sending',
      };

      setMessages(prev => sortMessagesByDate(upsertIncomingMessage(prev, optimisticMessage, (user?.id || user?._id)?.toString())));

      // Multi-phase scroll for ultra-responsive bottom lock
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 100);
      });

      const msgPayload = {
        chatId: conversationId,
        recipientId: targetRecipientId,
        content: content,
        type: finalType,
        mediaUrl: stickerMatch?.url,
        replyTo: currentReplyingTo?._id,
        tempMessageId: tempMessageId,
        isVanish: isVanishMode, // 🔥 Vanish mode flag
      };



      // 🚀 Single socket emission via socketService
      socketService.sendMessage(msgPayload);
    }

    socketService.sendTypingStatus({ chatId: conversationId, isTyping: false });
  };

  const handleTextChange = (text: string) => {
    setNewMessage(text);
    if (!socketService.socket?.connected) return;

    socketService.sendTypingStatus({ chatId: conversationId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketService.sendTypingStatus({ chatId: conversationId, isTyping: false });
    }, 2000);
  };

  // 2. REACTIONS & LIKES
  const handleReaction = (emoji: string) => {
    if (!selectedMessage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const myUserId = stableUserId.current;
    const messageId = selectedMessage._id?.toString();

    if (myUserId && messageId) {
      const currentReactions = selectedMessage.reactions || {};
      const hasMyReaction = currentReactions[myUserId] === emoji;

      // 🚀 Optimistic update
      setMessages(prev => prev.map(msg => {
        if (msg._id?.toString() !== messageId) return msg;
        const newReactions = { ...(msg.reactions || {}) };
        if (hasMyReaction) {
          delete newReactions[myUserId];
        } else {
          newReactions[myUserId] = emoji;
        }
        return { ...msg, reactions: newReactions };
      }));

      // 🚀 Send to backend (backend handles toggle)
      socketService.reactToMessage({ messageId: selectedMessage._id, emoji, chatId: conversationId });
    }

    setSelectedMessage(null);
  };

  const handleDoubleTapLike = useCallback((messageId: string) => {
    if (!messageId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const myUserId = stableUserId.current;
    if (!myUserId) return;

    // 🚀 Optimistic update
    setMessages(prev => prev.map(msg => {
      const mId = (msg._id || msg.id)?.toString();
      if (mId !== messageId.toString()) return msg;
      const currentReactions = { ...(msg.reactions || {}) };
      const hasMyReaction = currentReactions[myUserId] === '❤️';
      if (hasMyReaction) {
        delete currentReactions[myUserId];
      } else {
        currentReactions[myUserId] = '❤️';
      }
      return { ...msg, reactions: currentReactions };
    }));

    // 🚀 Direct single-emission reaction via socketService
    socketService.reactToMessage({ messageId, emoji: '❤️', chatId: conversationId });
  }, [conversationId]);

  const handlePin = () => {
    if (!selectedMessage) return;

    const messageId = selectedMessage._id;
    const newPinnedState = !selectedMessage.is_pinned;

    // 🚀 Optimistic update
    setMessages(prev => prev.map(msg => {
      if (msg._id?.toString() !== messageId?.toString()) return msg;
      return { ...msg, is_pinned: newPinnedState };
    }));

    socketService.pinMessage({ messageId, chatId: conversationId, isPinned: newPinnedState });
    setSelectedMessage(null);
  };

  const handleForward = () => {
    setSelectedMessage(null);
    router.push('/chat' as any);
  };

  // 3. ACTIONS & DELETIONS
  const handleDeleteMessage = () => {
    if (!selectedMessage) return;

    const messageId = selectedMessage._id;
    const isMe = selectedMessage.sender_id?._id?.toString() === user?.id?.toString() ||
      selectedMessage.sender_id?.toString() === user?.id?.toString() ||
      selectedMessage.sender_id?._id?.toString() === user?._id?.toString() ||
      selectedMessage.sender_id?.toString() === user?._id?.toString();

    // OPTIMISTIC UPDATE: Update UI immediately
    setMessages(prev => {
      if (isMe) {
        const nextMessages = prev.map(m => m._id === messageId ? { ...m, is_deleted: true } : m);
        return nextMessages.map(m => {
          if (m.reply_to_id) {
            const replyMsg = m.reply_to_id;
            const replyId = typeof replyMsg === 'string' ? replyMsg : replyMsg._id;
            if (replyId === messageId) {
              return {
                ...m,
                reply_to_id: {
                  ...replyMsg,
                  is_deleted: true
                }
              };
            }
          }
          return m;
        });
      } else {
        return prev.filter(m => m._id !== messageId);
      }
    });

    socketService.deleteMessage({
      messageId,
      deleteType: isMe ? 'everyone' : 'me',
      chatId: conversationId
    });
    setSelectedMessage(null);
  };

  const handleCopy = () => {
    if (selectedMessage) {
      // Copy to clipboard silently
      try {
        const Clipboard = require('@react-native-clipboard/clipboard').default;
        Clipboard.setString(selectedMessage.content);
      } catch (_) { }
      setSelectedMessage(null);
    }
  };

  const handleReply = useCallback((message: Message) => {
    setReplyingTo(message);
    setNewMessage('');
    // 🚀 Lightning Speed: Focus input immediately on reply
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleEdit = useCallback(() => {
    if (!selectedMessage) return;

    const myUserId = (user?.id || user?._id)?.toString();
    const senderId = (selectedMessage.sender_id?._id || selectedMessage.sender_id)?.toString();

    if (senderId === myUserId) {
      setEditingMessage(selectedMessage);
      setNewMessage(selectedMessage.content);
      setSelectedMessage(null);
      // 🚀 Focus input immediately
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [selectedMessage, user?.id, user?._id]);

  const handleUnblockUser = useCallback(async () => {
    if (!targetRecipientId) return;

    setShowHeaderMenu(false);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await apiClient.post(`/users/unblock-user`, { userId: targetRecipientId });
      updateBlockedUsers(targetRecipientId, false);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [targetRecipientId, updateBlockedUsers]);

  const handleBlockUser = useCallback(async () => {
    if (!targetRecipientId) return;

    setShowHeaderMenu(false);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await apiClient.post(`/users/block-user`, { userId: targetRecipientId });
      updateBlockedUsers(targetRecipientId, true);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [targetRecipientId, updateBlockedUsers]);

  const handleBlockToggle = useCallback(() => {
    if (isBlocked) {
      handleUnblockUser();
    } else {
      handleBlockUser();
    }
  }, [isBlocked, handleUnblockUser, handleBlockUser]);

  // UI RENDERING - Duplicate MessageItem removed (was causing blinking on re-render)
  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const myIdStr = (user?.id || user?._id)?.toString();
    const getSenderId = (msg: any) => {
      if (!msg) return '';
      const s = msg.sender_id;
      if (!s) return '';
      if (typeof s === 'string') return s;
      return (s._id || s.id || '').toString();
    };

    const currentSenderId = getSenderId(item);
    const isMe = !!(myIdStr && currentSenderId && currentSenderId === myIdStr);

    const isFirstOfGroup = index === messages.length - 1 || getSenderId(messages[index + 1]) !== currentSenderId;
    const isLastOfGroup = index === 0 || getSenderId(messages[index - 1]) !== currentSenderId;

    if (item.is_deleted || item.deleted_for?.includes(user?.id || '')) {
      return null;
    }

    const handleSingleTap = () => {
      // ✅ SCROLL TO REPLY: If this message is a reply, scroll to original
      if (item.reply_to_id) {
        const replyId = typeof item.reply_to_id === 'string' ? item.reply_to_id : item.reply_to_id?._id;
        if (replyId) {
          scrollToMessage?.(replyId);
          return;
        }
      }

      // For image/video messages: open in media gallery
      if ((item.message_type === 'image' || item.message_type === 'video') && item.media_url) {
        setSelectedGalleryMedia([{ url: item.media_url, type: item.message_type }]);
        setGalleryIndex(0);
        setGalleryMode('detail');
        return;
      }

      // For shot/post share cards: single tap navigates to the shot/post
      const trimmed = item.content?.trim() || '';
      const isShotLink = trimmed.includes('anufy.app/reels/') || trimmed.includes('anufy.app/shots/');
      const isPostLink = trimmed.includes('anufy.app/post/');
      const isShareCard = item.message_type === 'shot_share' || item.message_type === 'post_share' || isShotLink || isPostLink;

      if (isShareCard) {
        const shotId = trimmed.split('/').pop() || trimmed;
        const isShot = item.message_type === 'shot_share' || isShotLink;
        router.push((isShot ? `/reels/${shotId}` : `/post/${shotId}`) as any);
      }
    };

    return (
      <MessageItem
        item={item}
        isMe={isMe}
        user={user}
        isLatest={index === 0}
        isLastOfGroup={isLastOfGroup}
        isFirstOfGroup={isFirstOfGroup}
        onReply={handleReply}
        onLongPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Keyboard.dismiss();
          setSelectedMessage(item);
        }}
        onSingleTap={handleSingleTap}
        handleDoubleTapLike={handleDoubleTapLike}
        isJustAdded={
          isMe
            ? (!!item.created_at && (new Date().getTime() - new Date(item.created_at).getTime() < 15000))
            : (
                (!item.status || item.status !== 'read') ||
                (index === 0) ||
                (!!item.created_at && (new Date().getTime() - new Date(item.created_at).getTime() < 120000))
              )
        }
        swipeX={swipeX}
        colors={colors}
        isAnonymousChat={isAnonymousChat}
        recipient={recipient}
        router={router}
        setSelectedGalleryMedia={setSelectedGalleryMedia}
        setGalleryIndex={setGalleryIndex}
        setGalleryMode={setGalleryMode}
        getMediaThumbnail={getMediaThumbnail}
        scrollToMessage={scrollToMessage}
        highlightedMessageId={highlightedMessageId}
        bubbleUploadProgress={uploadBubbleProgress[item._id] ?? null}
        themeId={conversationSettings?.theme_id || 'default'}
        conversationSettings={conversationSettings}
      />
    );
  }, [messages, user?.id, user?._id, handleReply, handleDoubleTapLike, swipeX, colors, isAnonymousChat, recipient, router, setSelectedGalleryMedia, setGalleryIndex, setGalleryMode, getMediaThumbnail, scrollToMessage, highlightedMessageId, uploadBubbleProgress]);

  const currentTheme = getChatTheme(conversationSettings?.theme_id || 'default');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ChatHeader
        title={conversationSettings?.type === 'group' ? (conversationSettings.name || 'Group Chat') : (recipient?.is_deactivated ? 'Deactivated Account' : (recipient?.username ? recipient.username.replace(/^@/, '') : (username ? String(username).replace(/^@/, '') : '')))}
        avatar={conversationSettings?.type === 'group' ? 'https://api.dicebear.com/7.x/identicon/png?seed=Group' : (recipient?.is_deactivated ? undefined : (recipient?.avatar_url || (profileImage ? decodeURIComponent(profileImage as string) : undefined)))}
        isOnline={conversationSettings?.type === 'group' ? false : (recipient?.is_deactivated ? false : (isOnline || recipient?.is_online || false))}
        lastSeen={recipient?.is_deactivated ? undefined : (recipient?.last_seen || recipient?.lastActive || undefined)}
        isAnonymous={!!isAnonymousChat}
        isDisappearing={isVanishMode !== false}
        isDeletedUser={conversationSettings?.type !== 'group' && ((recipient as any)?.is_deleted_user || (!recipient?.username && !(recipient as any)?.full_name && !(recipient as any)?.fullName))}
        headerBg={colors.background}
        headerTint={colors.text}
        onBack={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/messages' as any);
          }
        }}
        isNewThread={conversationId === 'new'}
        onInfo={() => {
          if (recipient?.is_deactivated) return;
          if (conversationId === 'new') return;
          if (infoNavLockRef.current) return;
          infoNavLockRef.current = true;
          setTimeout(() => { infoNavLockRef.current = false; }, 1000);
          router.push({
            pathname: '/chat-info/[id]',
            params: {
              id: conversationId,
              initialTitle: recipient?.username || username as string || 'Chat',
              initialAvatar: recipient?.avatar_url || (profileImage ? decodeURIComponent(profileImage as string) : ''),
            }
          } as any);
        }}
        onAudioCall={recipient?.is_deactivated ? undefined : handleVoiceCall}
        onVideoCall={recipient?.is_deactivated ? undefined : handleVideoCall}
        onMore={recipient?.is_deactivated ? undefined : () => setShowHeaderMenu(true)}
      />

      {/* Blocked User Banner */}
      {isBlocked && (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban-outline" size={16} color="#FFF" />
          <Text style={styles.blockedBannerText}>You have blocked this user</Text>
          <TouchableOpacity onPress={handleBlockToggle} style={styles.unblockBtn}>
            <Text style={styles.unblockBtnText}>Unblock</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Header More Menu Modal */}
      <Modal transparent visible={showHeaderMenu} animationType="fade" onRequestClose={() => setShowHeaderMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHeaderMenu(false)}>
          <View style={styles.menuContent}>
            {isAnonymousChat && (
              <TouchableOpacity style={styles.menuItem} onPress={async () => {
                setShowHeaderMenu(false);
                const convId = conversationId?.toString();
                if (!convId) return;
                // Remove locally — instant, no spinner
                // removeConversation automatically stamps lastSkipTs
                useChatStore.getState().removeConversation(convId);
                try {
                  await apiClient.post('/chat/anonymous/end', { conversationId: convId });
                  router.replace('/(tabs)/messages');
                } catch (e) {
                }
              }}>
                <Text style={[styles.menuText, { color: '#FF9800' }]}>Skip Chat</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleBlockToggle}>
              <Text style={[styles.menuText, { color: isBlocked ? colors.primary : "#FF3B30" }]}>
                {isBlocked ? 'Unblock User' : 'Block User'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={async () => {
              setShowHeaderMenu(false);
              if (!partnerUserId) return;
              try {
                await apiClient.post('/chat/anonymous/report', {
                  reportedUserId: partnerUserId,
                  conversationId,
                  reason: 'Reported via chat menu'
                });
                router.back();
              } catch {  }
            }}>
              <Text style={[styles.menuText, { color: '#FF3B30' }]}>Report Ghost</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={async () => {
              setShowHeaderMenu(false);
              try {
                await apiClient.delete(`/chat/conversations/${conversationId}/clear`);
                useChatStore.getState().removeConversation(conversationId);
                setMessages([]);
                router.replace('/(tabs)/messages');
              } catch (error) {
                Alert.alert('Error', 'Could not clear chat');
              }
            }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Clear Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => setShowHeaderMenu(false)}>
              <Text style={[styles.menuText, { color: colors.subtitle }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <GestureDetector gesture={panGesture}>
        <View style={{ flex: 1 }}>
          {/* 🖼️ Wallpaper background */}
          {chatWallpaper ? (
            <ImageBackground
              source={{ uri: chatWallpaper }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={0}
            />
          ) : null}
          <FastFlashList
            ref={flatListRef as any}
            style={{ flex: 1 }}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item: any) => (item?._id || item?.id || item?.tempId || Math.random()).toString()}
            inverted={false}
            estimatedItemSize={75}
            getItemType={(item: any) => (item?.media_url || item?.mediaUrl) ? 'media' : (item?.audio_url || item?.audioUrl) ? 'audio' : 'text'}
            drawDistance={300}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={isTyping ? (
              <TypingBubble isAnonymousChat={isAnonymousChat} avatarUrl={recipient?.avatar_url} username={recipient?.username} />
            ) : null}
            ListFooterComponent={loadingMore ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null}
            onEndReached={loadMoreMessages}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (!initialScrollDoneRef.current || isUserNearBottomRef.current) {
                flatListRef.current?.scrollToEnd({ animated: false });
                initialScrollDoneRef.current = true;
              }
            }}
          />
          <PerformanceOverlay />

          {recipient?.is_deactivated ? (
            <View style={{
              padding: 16,
              backgroundColor: isAnonymousChat ? '#222' : 'rgba(0, 0, 0, 0.05)',
              alignItems: 'center',
              justifyContent: 'center',
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: isAnonymousChat ? '#333' : '#E5E7EB',
              paddingBottom: Math.max(insets.bottom, keyboardHeight > 0 ? 8 : 24),
            }}>
              <Text style={{
                color: isAnonymousChat ? '#9CA3AF' : '#6B7280',
                fontSize: 14,
                fontWeight: '600',
              }}>
                You cannot message a deactivated account.
              </Text>
            </View>
          ) : (
            <View style={{ paddingBottom: inputBottomPadding }}>
              <ChatInput
                ref={inputRef}
                input={newMessage}
                onChangeText={handleTextChange}
                onSend={handleSendMessage}
                onAttach={isAnonymousChat ? () => { } : () => handleMediaPick(false)}
                onEmojiPress={() => setShowEmojiPicker(!showEmojiPicker)}
                showEmojiPicker={showEmojiPicker}
                isAnonymousChat={isAnonymousChat}
                uploading={isSendingMedia}
                editingMessage={editingMessage as any}
                replyingMessage={replyingTo as any}
                onCancelAction={() => {
                  setEditingMessage(null);
                  setReplyingTo(null);
                  setNewMessage('');
                }}
                inputBottomPad={0}
                isKeyboardOpen={keyboardHeight > 0}
                onImageChange={handleImagePaste}
                onGallery={() => handleMediaPick(false)}
                onCamera={() => handleMediaPick(true)}
                onVoiceStart={startRecording}
                onVoiceEnd={stopRecording}
                isRecording={isRecording}
              />
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Message Options Modal */}
      {selectedMessage && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
          <Pressable style={styles.optionsModalOverlay} onPress={() => setSelectedMessage(null)}>
            <View style={styles.modalContent}>
              {/* Reactions Bar - Premium Style */}
              <View style={styles.reactionBarModern}>
                {(user?.customReactions || ['👍', '❤️', '😂', '😲', '😢', '😡', '🔥', '👏']).map(emoji => (
                  <TouchableOpacity key={emoji} style={styles.reactionItemModern} onPress={() => handleReaction(emoji)}>
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.reactionItemModern, { justifyContent: 'center', alignItems: 'center', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.05)' }]}
                  onPress={() => {
                    setReactionTargetMessage(selectedMessage);
                    setPickerTab('stickers');
                    setCustomizingEmojiIndex(null);
                    setIsCustomizingTray(false);
                    setShowEmojiPicker(true);
                    setSelectedMessage(null);
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.actionList}>
                <TouchableOpacity style={styles.actionItem} onPress={() => handleReply(selectedMessage!)}>
                  <Ionicons name="arrow-undo-outline" size={18} color={colors.text} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>Reply</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={handleCopy}>
                  <Ionicons name="copy-outline" size={18} color={colors.text} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>Copy Text</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={handlePin}>
                  <Ionicons name={selectedMessage.is_pinned ? "pin" : "pin-outline"} size={18} color={colors.text} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>{selectedMessage.is_pinned ? 'Unpin' : 'Pin'}</Text>
                </TouchableOpacity>

                {selectedMessage.sender_id?._id === user?.id && !selectedMessage.is_deleted && (
                  <>
                    <TouchableOpacity style={styles.actionItem} onPress={handleEdit}>
                      <Ionicons name="create-outline" size={18} color={colors.text} />
                      <Text style={[styles.actionLabel, { color: colors.text }]}>Edit Message</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={[styles.actionItem, { borderBottomWidth: 0 }]} onPress={handleDeleteMessage}>
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  <Text style={[styles.actionLabel, { color: '#FF3B30' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Emoji Picker Modal */}
      {/* Premium GIF and Sticker Picker Sheet */}
      {showEmojiPicker && (
        <Modal transparent visible animationType="slide" onRequestClose={() => { setShowEmojiPicker(false); setReactionTargetMessage(null); }}>
          <Pressable style={styles.modalOverlay} onPress={() => { setShowEmojiPicker(false); setReactionTargetMessage(null); }}>
            <View style={[styles.emojiSheet, { backgroundColor: colors.surface, zIndex: 999 }]} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHandle} />

              {/* Customize Reactions Tray inside Emoji Sheet */}
              {reactionTargetMessage && (
                <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)', width: '100%' }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.subtitle || '#8E8E93', marginBottom: 8 }}>
                    Customize Quick Reactions (Tap a slot to replace)
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    {(user?.customReactions || ['👍', '❤️', '😂', '😲', '😢', '😡', '🔥', '👏']).map((emoji, index) => {
                      const isSelected = customizingEmojiIndex === index;
                      return (
                        <TouchableOpacity
                          key={index}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: isSelected ? (colors.primary || '#A200FF') : 'rgba(255,255,255,0.08)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? '#fff' : 'rgba(255,255,255,0.15)',
                          }}
                          onPress={() => {
                            if (isSelected) {
                              setCustomizingEmojiIndex(null);
                              setIsCustomizingTray(false);
                            } else {
                              setCustomizingEmojiIndex(index);
                              setIsCustomizingTray(true);
                            }
                          }}
                        >
                          <Text style={{ fontSize: 18 }}>{emoji}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Tabs header */}
              <View style={styles.pickerTabs}>
                <TouchableOpacity
                  style={[styles.pickerTabBtn, pickerTab === 'stickers' && styles.pickerTabBtnActive]}
                  onPress={() => setPickerTab('stickers')}
                >
                  <Text style={[styles.pickerTabTxt, pickerTab === 'stickers' && styles.pickerTabTxtActive]}>Emojis</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickerTabBtn, pickerTab === 'gifs' && styles.pickerTabBtnActive]}
                  onPress={() => setPickerTab('gifs')}
                >
                  <Text style={[styles.pickerTabTxt, pickerTab === 'gifs' && styles.pickerTabTxtActive]}>GIFs</Text>
                </TouchableOpacity>
              </View>

              {pickerTab === 'stickers' && (
                <View style={{ marginBottom: 12 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 15 }}>
                    {(['Smileys', 'Gestures', 'Animals', 'Food', 'Travel', 'Activities', 'Objects', 'Symbols'] as const).map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.categoryChip,
                          activeCategory === cat && { backgroundColor: colors.primary }
                        ]}
                        onPress={() => setActiveCategory(cat)}
                      >
                        <Text style={[
                          styles.categoryChipTxt,
                          activeCategory === cat && { color: '#FFF', fontWeight: 'bold' }
                        ]}>
                          {cat === 'Smileys' ? '😀 Smileys' :
                            cat === 'Gestures' ? '👍 Hands' :
                              cat === 'Animals' ? '🐱 Animals' :
                                cat === 'Food' ? '🍔 Food' :
                                  cat === 'Travel' ? '🚗 Travel' :
                                    cat === 'Activities' ? '⚽ Sports' :
                                      cat === 'Objects' ? '💡 Objects' :
                                        '💖 Symbols'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {pickerTab === 'gifs' && (
                <View style={styles.gifSearchBox}>
                  <TextInput
                    style={styles.gifSearchInput}
                    placeholder="Search GIPHY & Tenor..."
                    placeholderTextColor="#8E8E93"
                    value={gifQuery}
                    onChangeText={setGifQuery}
                  />
                  {gifQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setGifQuery('')} style={{ paddingHorizontal: 6 }}>
                      <Ionicons name="close-circle" size={18} color="#8E8E93" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={{ flex: 1, paddingBottom: 20, zIndex: 1000 }}>
                {pickerTab === 'stickers' ? (
                  <FlatList
                    key="stickers-flatlist"
                    data={filteredEmojis}
                    numColumns={5}
                    keyExtractor={(_, index) => index.toString()}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={25}
                    maxToRenderPerBatch={25}
                    windowSize={5}
                    renderItem={({ item: sticker }) => (
                      <TouchableOpacity
                        style={styles.emojiCell}
                        onPress={async () => {
                          if (isCustomizingTray && customizingEmojiIndex !== null) {
                            const currentTray = [...(user?.customReactions || ['👍', '❤️', '😂', '😲', '😢', '😡'])];
                            currentTray[customizingEmojiIndex] = sticker.emoji;
                            await useAuthStore.getState().setCustomReactions(currentTray);
                            setCustomizingEmojiIndex(null);
                            setIsCustomizingTray(false);
                          } else if (reactionTargetMessage) {
                            socketService.reactToMessage({
                              messageId: reactionTargetMessage._id,
                              emoji: sticker.emoji,
                              chatId: conversationId
                            });
                            setReactionTargetMessage(null);
                          } else {
                            setNewMessage(prev => prev + sticker.emoji);
                          }
                          setShowEmojiPicker(false);
                        }}
                      >
                        <Text style={{ fontSize: 32 }}>{sticker.emoji}</Text>
                      </TouchableOpacity>
                    )}
                    contentContainerStyle={{ paddingHorizontal: 10 }}
                  />
                ) : loadingGifs ? (
                  <View style={styles.gifsLoading}>
                    <ActivityIndicator size="large" color={colors.primary} />
                  </View>
                ) : (
                  <FlatList
                    key="gifs-flatlist"
                    data={gifs}
                    numColumns={3}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item: gif }) => {
                      const gifUrl = gif.url;
                      const previewUrl = gif.previewUrl || gifUrl;
                      return (
                        <TouchableOpacity
                          style={styles.gifCell}
                          onPress={() => {
                            if (gifUrl) {
                              socketService.sendMessage({
                                chatId: conversationId,
                                recipientId: targetRecipientId,
                                content: 'Sent a GIF',
                                type: 'image',
                                mediaUrl: gifUrl,
                                attachments: [{ url: gifUrl, type: 'image' }]
                              });
                              setShowEmojiPicker(false);
                            }
                          }}
                        >
                          {previewUrl ? (
                            <Image
                              source={{ uri: previewUrl }}
                              style={styles.gifImg}
                              contentFit="cover"
                            />
                          ) : null}
                        </TouchableOpacity>
                      );
                    }}
                    contentContainerStyle={{ paddingHorizontal: 5 }}
                    ListEmptyComponent={
                      <View style={styles.gifsLoading}>
                        <Text style={{ color: '#8E8E93' }}>No GIFs found.</Text>
                      </View>
                    }
                  />
                )}
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
      {/* 🚀 FULL SCREEN MEDIA GALLERY MODAL */}
      <Modal
        visible={!!selectedGalleryMedia}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedGalleryMedia(null)}
      >
        <View style={styles.galleryOverlay}>
          <SafeAreaView style={styles.gallerySafe}>
            {/* Header */}
            <BlurView intensity={80} tint="dark" style={styles.galleryHeader}>
              <View style={styles.headerSide}>
                {galleryMode === 'detail' && selectedGalleryMedia && selectedGalleryMedia.length > 1 && (
                  <TouchableOpacity
                    onPress={() => setGalleryMode('grid')}
                    style={styles.galleryIconBtn}
                  >
                    <Ionicons name="grid-outline" size={24} color="white" />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.galleryTitle}>
                {galleryMode === 'detail' ? `${galleryIndex + 1} / ${selectedGalleryMedia?.length}` : 'All Media'}
              </Text>

              <View style={[styles.headerSide, { flexDirection: 'row', justifyContent: 'flex-end' }]}>
                {galleryMode === 'detail' && selectedGalleryMedia && (
                  <TouchableOpacity
                    onPress={() => handleDownloadMedia(selectedGalleryMedia[galleryIndex].url)}
                    style={styles.galleryIconBtn}
                  >
                    <Ionicons name="download-outline" size={24} color="white" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setSelectedGalleryMedia(null)} style={styles.galleryIconBtn}>
                  <Ionicons name="close" size={28} color="white" />
                </TouchableOpacity>
              </View>
            </BlurView>

            {/* Content */}
            <View style={styles.galleryContent}>
              {selectedGalleryMedia && galleryMode === 'grid' ? (
                <ScrollView contentContainerStyle={styles.galleryGridContent}>
                  {selectedGalleryMedia.map((media, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.galleryGridItem}
                      onPress={() => { setGalleryIndex(idx); setGalleryMode('detail'); }}
                    >
                      <Image source={{ uri: media.url }} style={{ width: '100%', height: '100%' }} />
                      {media.type === 'video' && (
                        <View style={styles.gridPlayOverlay}>
                          <Ionicons name="play" size={24} color="white" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : selectedGalleryMedia && (
                <FlatList
                  ref={galleryRef}
                  data={selectedGalleryMedia}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  initialScrollIndex={galleryIndex}
                  getItemLayout={(_, index) => ({
                    length: Dimensions.get('window').width,
                    offset: Dimensions.get('window').width * index,
                    index,
                  })}
                  onMomentumScrollEnd={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
                    setGalleryIndex(index);
                  }}
                  renderItem={({ item: media }) => (
                    <View style={{ width: Dimensions.get('window').width, height: '100%', justifyContent: 'center' }}>
                      {media.type === 'video' ? (
                        <VideoGalleryPlayer uri={resolveMediaUrl(media.url)} />
                      ) : (
                        <Image
                          source={{ uri: resolveMediaUrl(media.url) }}
                          style={{ width: '100%', height: '80%' }}
                          contentFit="contain"
                          transition={200}
                        />
                      )}
                    </View>
                  )}
                  keyExtractor={(_, i) => i.toString()}
                />
              )}
            </View>

            {/* Thumbnails Strip */}
            {selectedGalleryMedia && selectedGalleryMedia.length > 1 && galleryMode === 'detail' && (
              <BlurView intensity={60} tint="dark" style={styles.thumbStrip}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                  {selectedGalleryMedia.map((m, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        setGalleryIndex(i);
                        galleryRef.current?.scrollToIndex({ index: i, animated: true });
                      }}
                      style={[styles.thumbItem, galleryIndex === i && styles.thumbActive]}
                    >
                      <Image
                        source={{ uri: getMediaThumbnail(m.url, m.type) }}
                        style={styles.thumbImg}
                        contentFit="cover"
                      />
                      {m.type === 'video' && <View style={styles.thumbPlayIcon}><Ionicons name="play" size={10} color="white" /></View>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </BlurView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStyles(COLORS: any) {
  return StyleSheet.create({
    container: { flex: 1 },
    anonymousBanner: {
      paddingVertical: 8,
      backgroundColor: '#000',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.secondary,
    },
    anonymousBannerText: {
      color: '#fff',
      fontSize: 12,
    },
    listContent: { paddingHorizontal: 16, paddingVertical: 10 },
    messageWrapper: { flexDirection: 'row', width: '100%', alignItems: 'center', paddingVertical: 2, marginBottom: 0 },
    slidingTimeContainer: { width: 70, position: 'absolute', right: -70, alignItems: 'center', justifyContent: 'center' },
    slidingTimeText: { fontSize: 11, color: '#8E8E93', fontWeight: '500' },
    messageContainer: { flexDirection: 'row', alignItems: 'flex-end', width: '100%' },
    myMessageContainer: { justifyContent: 'flex-end' },
    theirMessageContainer: { justifyContent: 'flex-start' },
    avatar: { width: 32, height: 32, borderRadius: 16 },
    bubble: { maxWidth: '85%', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 22, position: 'relative' },
    myBubble: { borderBottomRightRadius: 4 },
    theirBubble: { borderBottomLeftRadius: 4 },
    replyQuote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 8, opacity: 0.8 },
    replyCardOuter: {
      borderLeftWidth: 3,
      paddingLeft: 8,
      paddingVertical: 6,
      paddingRight: 10,
      marginBottom: 4,
      backgroundColor: 'rgba(0,0,0,0.05)',
      borderRadius: 8,
      maxWidth: '82%',
    },
    metaData: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, gap: 4, paddingHorizontal: 4 },
    statusContainer: { marginLeft: 2 },
    metaText: { fontSize: 11, color: '#8E8E93', fontWeight: '500' },
    reactionContainer: {
      position: 'absolute',
      flexDirection: 'row',
      backgroundColor: COLORS.background,
      borderRadius: 14,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignItems: 'center',
      zIndex: 100,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.06)',
      gap: 3,
      // Add micro shadow for premium feel
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 1.5,
      elevation: 2,
    },
    reactionText: { fontSize: 10.5 },
    reactionCount: { fontSize: 8.5, color: '#666666', marginLeft: 1.5, fontWeight: '700' },
    indicatorBar: { flexDirection: 'row', padding: 10, borderTopWidth: 1, alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
    optionsModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
    modalContent: {
      width: '85%',
      backgroundColor: COLORS.background,
      borderRadius: 20,
      padding: 14,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8
    },
    reactionBarModern: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    reactionItemModern: { padding: 2 },
    actionList: { gap: 2 },
    actionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)', gap: 10 },
    actionLabel: { fontSize: 14.5, fontWeight: '500' },

    categoryChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.05)',
      marginRight: 8,
    },
    categoryChipTxt: {
      fontSize: 13,
      color: '#8E8E93',
    },
    emojiSheet: { width: '100%', height: '55%', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingTop: 10 },
    pickerTabs: {
      flexDirection: 'row',
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.05)',
      borderRadius: 20,
      padding: 3,
      marginBottom: 12,
      width: '80%',
    },
    pickerTabBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 18,
    },
    pickerTabBtnActive: {
      backgroundColor: COLORS.background,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 3,
    },
    pickerTabTxt: {
      fontSize: 14,
      color: '#8E8E93',
      fontWeight: '600',
    },
    pickerTabTxtActive: {
      color: COLORS.text,
    },
    gifSearchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.05)',
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 12,
      height: 40,
    },
    gifSearchInput: {
      flex: 1,
      height: '100%',
      fontSize: 14,
      color: COLORS.text,
    },
    gifsLoading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
    },
    gifCell: {
      flex: 1,
      aspectRatio: 1.5,
      margin: 4,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: 'rgba(0,0,0,0.05)',
    },
    gifImg: {
      width: '100%',
      height: '100%',
    },
    blockedBanner: {
      backgroundColor: '#FF3B30',
      paddingVertical: 10,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    blockedBannerText: {
      color: '#FFF',
      fontSize: 14,
      fontWeight: '600',
    },
    unblockBtn: {
      backgroundColor: COLORS.background,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    unblockBtnText: {
      color: '#FF3B30',
      fontSize: 13,
      fontWeight: '700',
    },
    sheetHandle: { width: 40, height: 5, backgroundColor: '#DDD', borderRadius: 3, alignSelf: 'center', marginBottom: 15 },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    emojiCell: { padding: 10, width: (Dimensions.get('window').width - 60) / 5, alignItems: 'center', justifyContent: 'center' },

    menuContent: { width: scale(220), position: 'absolute', top: 60, right: 20, backgroundColor: COLORS.surface, borderRadius: 16, padding: 8, elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
    menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    menuText: { fontSize: 15, fontWeight: '500', color: COLORS.text },
    typingBubbleContainer: {
      paddingVertical: 10,
      alignItems: 'flex-start',
      width: '100%',
    },
    typingBubble: {
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: 20,
      marginLeft: 8,
      borderBottomLeftRadius: 4,
    },
    uploadOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
    },
    // Upload Progress Banner
    uploadBanner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 3000,
      marginHorizontal: 10,
      borderRadius: 20,
      overflow: 'hidden',
    },
    uploadBannerInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
      backgroundColor: 'rgba(20,20,30,0.92)',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(162,0,255,0.35)',
    },
    uploadBannerThumb: {
      width: 46,
      height: 46,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: '#1a1a2e',
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadBannerInfo: {
      flex: 1,
      gap: 6,
    },
    uploadBannerTitle: {
      color: '#FFF',
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    uploadBannerSub: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: 11,
      fontWeight: '500',
    },
    uploadBannerTrack: {
      height: 4,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 4,
      overflow: 'hidden',
    },
    uploadBannerFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: '#A200FF',
    },
    uploadBannerPct: {
      color: '#A200FF',
      fontSize: 13,
      fontWeight: '800',
      minWidth: 38,
      textAlign: 'right',
    },
    galleryOverlay: {
      flex: 1,
      backgroundColor: '#000',
    },
    gallerySafe: {
      flex: 1,
    },
    galleryHeader: {
      height: 60,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 15,
      zIndex: 10,
      overflow: 'hidden'
    },
    headerSide: {
      width: 90,
      flexDirection: 'row',
      alignItems: 'center',
    },
    galleryIconBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    galleryTitle: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    galleryContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    thumbStrip: {
      height: 100,
      paddingVertical: 10,
    },
    thumbItem: {
      width: 60,
      height: 60,
      borderRadius: 8,
      marginRight: 10,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    thumbActive: {
      borderColor: COLORS.primary,
    },
    thumbImg: {
      width: '100%',
      height: '100%',
    },
    thumbPlayIcon: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginLeft: -7,
      marginTop: -7,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center'
    },
    galleryGridContent: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 10,
      gap: 10
    },
    galleryGridItem: {
      width: (Dimensions.get('window').width - 40) / 3,
      height: (Dimensions.get('window').width - 40) / 3,
      borderRadius: 8,
      overflow: 'hidden'
    },
    gridPlayOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center'
    },
  });
}
