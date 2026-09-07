import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  PanResponder,
  Animated,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { FlashList } from '@shopify/flash-list';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

// Store & Theme & Socket Engine Imports
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { socketService } from '@/src/lib/socket';
import { useChatStore } from '@/src/store/chatStore';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { ANIMATED_STICKERS } from '@/src/constants/animated-stickers';
import { clearConversationNotifications } from '@/src/components/NotificationManager';
import {
  SMILEYS_EMOJIS,
  ANIMALS_EMOJIS,
  FOOD_EMOJIS,
  TRAVEL_EMOJIS,
  ACTIVITIES_EMOJIS,
  OBJECTS_EMOJIS,
  SYMBOLS_EMOJIS,
  POPULAR_REACTION_EMOJIS,
  ALL_EMOJI_LIST,
} from '@/src/constants/all-emojis';

const DEFAULT_QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '🔥'];

// Helper to format relative time nicely
const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ------------------------------------------------------------
// INLINE AUDIO VOICE NOTE PLAYER COMPONENT
// ------------------------------------------------------------
function InlineAudioPlayer({ uri, isMe }: { uri: string; isMe: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const toggleSpeed = async () => {
    const nextSpeed = playbackSpeed === 1 ? 1.5 : (playbackSpeed === 1.5 ? 2 : 1);
    setPlaybackSpeed(nextSpeed);
    if (sound) {
      try {
        await sound.setRateAsync(nextSpeed, true);
      } catch (e) { }
    }
  };

  const handlePlayPause = async () => {
    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: resolveMediaUrl(uri) },
          { shouldPlay: true, rate: playbackSpeed },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (e) { }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis || 0);
      setDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying || false);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <View style={[styles.audioBubbleContainer, { backgroundColor: isMe ? 'rgba(255,255,255,0.18)' : '#E2E8F0' }]}>
      <TouchableOpacity style={styles.audioPlayBtn} onPress={handlePlayPause}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={isMe ? '#FFFFFF' : '#4F46E5'} />
      </TouchableOpacity>
      <View style={styles.audioProgressTrack}>
        <View style={[styles.audioProgressFill, { width: `${progressPercent}%`, backgroundColor: isMe ? '#FFFFFF' : '#4F46E5' }]} />
      </View>
      <TouchableOpacity style={styles.speedBtn} onPress={toggleSpeed}>
        <Text style={[styles.speedText, { color: isMe ? '#FFFFFF' : '#4F46E5' }]}>{playbackSpeed}x</Text>
      </TouchableOpacity>
    </View>
  );
}

// Helper lookup map to find exact emoji character from sticker url
const STICKER_EMOJI_MAP: { [key: string]: string } = {};
ANIMATED_STICKERS.forEach(s => {
  if (s.url && s.emoji) STICKER_EMOJI_MAP[s.url] = s.emoji;
});

function getEmojiForUrl(url: string): string {
  if (!url) return '😀';
  if (STICKER_EMOJI_MAP[url]) return STICKER_EMOJI_MAP[url];
  const match = ANIMATED_STICKERS.find(s => s.url === url || url.includes(s.url));
  return match?.emoji || '😀';
}

// ------------------------------------------------------------
// SMART LOTTIE STICKER COMPONENT (GOLDEN RULE PLAYBACK)
// ------------------------------------------------------------
function SmartLottieSticker({ uri, isNewMsg, onLongPress }: { uri: string; isNewMsg?: boolean; onLongPress?: () => void }) {
  const [isPlaying, setIsPlaying] = useState(!!isNewMsg);
  const [hasError, setHasError] = useState(false);
  const emojiChar = getEmojiForUrl(uri);

  const handleManualPlay = () => {
    setIsPlaying(true);
  };

  const handleAnimationFinish = () => {
    setIsPlaying(false);
  };

  if (hasError || !isPlaying) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={handleManualPlay} onLongPress={onLongPress} style={{ padding: 2 }}>
        <Text style={{ fontSize: 32 }}>{emojiChar}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handleManualPlay} onLongPress={onLongPress}>
      <LottieView
        source={{ uri: resolveMediaUrl(uri) }}
        autoPlay
        loop={false}
        onAnimationFinish={handleAnimationFinish}
        onAnimationFailure={() => setHasError(true)}
        style={styles.stickerLottie}
      />
    </TouchableOpacity>
  );
}

// ------------------------------------------------------------
// 1:1 INSTAGRAM SWIPEABLE MESSAGE ROW (SWIPE TO REPLY & TIMESTAMPS)
// ------------------------------------------------------------
const SwipeableMessageRow = React.memo(({
  msg,
  index,
  isMe,
  myId,
  isLastMsg,
  partnerAvatarUrl,
  globalSwipeAnim,
  onReply,
  onDoubleTap,
  onLongPress,
  isDeleted,
  reactionList,
  theme,
  router,
}: any) => {
  const isSticker = msg.message_type === 'sticker' || msg.message_type === 'gif' || (!!msg.media_url && (msg.media_url.includes('.gif') || msg.media_url.includes('giphy.com') || msg.media_url.includes('tenor.com')));
  const rowSwipeX = useRef(new Animated.Value(0)).current;
  const replyTriggeredRef = useRef(false);
  const lastTapRef = useRef<number>(0);
  const singleTapTimerRef = useRef<any>(null);

  // Message Bubble handles Both Left & Right Swipe to Reply (Priority Capture!)
  const bubblePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture horizontal swipe before parent chatAreaPanResponder can steal it!
        return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderTerminationRequest: () => false, // Do not let parent steal the gesture!
      onPanResponderMove: (_, gestureState) => {
        const clampedX = Math.max(-65, Math.min(65, gestureState.dx));
        rowSwipeX.setValue(clampedX);
        if (Math.abs(gestureState.dx) > 30 && !replyTriggeredRef.current) {
          replyTriggeredRef.current = true;
        }
      },
      onPanResponderRelease: () => {
        if (replyTriggeredRef.current) {
          onReply(msg);
          replyTriggeredRef.current = false;
        }
        Animated.spring(rowSwipeX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
      onPanResponderTerminate: () => {
        replyTriggeredRef.current = false;
        Animated.spring(rowSwipeX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const leftReplyOpacity = rowSwipeX.interpolate({
    inputRange: [0, 15, 35],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  const rightReplyOpacity = rowSwipeX.interpolate({
    inputRange: [-35, -15, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const replyScale = rowSwipeX.interpolate({
    inputRange: [-40, 0, 40],
    outputRange: [1.15, 0.5, 1.15],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.bubbleRowAnimated,
        { transform: [{ translateX: globalSwipeAnim }] },
        isMe ? styles.bubbleRowRight : styles.bubbleRowLeft,
      ]}
    >
      {/* Partner circular avatar on the left for incoming messages */}
      {!isMe && !isSticker && (
        <View style={styles.partnerAvatarCol}>
          <Image source={{ uri: partnerAvatarUrl }} style={styles.bubblePartnerAvatar} />
        </View>
      )}

      {/* Swipeable Message Bubble (Left or Right Swipe = Reply) */}
      <Animated.View
        style={[
          styles.bubbleWrapper,
          isMe ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft,
          { transform: [{ translateX: rowSwipeX }] },
        ]}
        {...bubblePanResponder.panHandlers}
      >
        {/* Reply Arrow Icon on the left (appears on Right-Swipe) */}
        <Animated.View
          style={[
            styles.swipeReplyIconWrapLeft,
            { opacity: leftReplyOpacity, transform: [{ scale: replyScale }] },
          ]}
          pointerEvents="none"
        >
          <View style={styles.swipeReplyCircle}>
            <Ionicons name="arrow-undo" size={15} color="#64748B" />
          </View>
        </Animated.View>

        {/* Reply Arrow Icon on the right (appears on Left-Swipe) */}
        <Animated.View
          style={[
            styles.swipeReplyIconWrapRight,
            { opacity: rightReplyOpacity, transform: [{ scale: replyScale }] },
          ]}
          pointerEvents="none"
        >
          <View style={styles.swipeReplyCircle}>
            <Ionicons name="arrow-undo" size={15} color="#64748B" />
          </View>
        </Animated.View>

        <Pressable
          onPress={() => {
            const now = Date.now();
            const DOUBLE_TAP_DELAY = 280;

            if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
              // 💥 Double Tap Detected! Cancel pending single tap & toggle ❤️ like
              if (singleTapTimerRef.current) {
                clearTimeout(singleTapTimerRef.current);
                singleTapTimerRef.current = null;
              }
              lastTapRef.current = 0;
              onDoubleTap(msg);
            } else {
              lastTapRef.current = now;
              if (msg.message_type === 'post_share' || msg.message_type === 'shot_share') {
                // Delay single-tap navigation slightly so double-tap can be captured
                singleTapTimerRef.current = setTimeout(() => {
                  const postId = msg.content?.split('/').pop();
                  if (postId) {
                    router.push(msg.message_type === 'shot_share' ? `/reels/${postId}` : `/post/${postId}` as any);
                  }
                }, DOUBLE_TAP_DELAY);
              } else {
                // For normal bubbles, record tap
                setTimeout(() => {
                  if (lastTapRef.current === now) {
                    lastTapRef.current = 0;
                  }
                }, DOUBLE_TAP_DELAY);
              }
            }
          }}
          onLongPress={() => onLongPress(msg)}
          delayLongPress={220}
        >
          {/* ── Shared Post / Reel Card — Clean Instagram Style ── */}
          {(msg.message_type === 'post_share' || msg.message_type === 'shot_share') ? (
            <View style={styles.sharedContentCard}>
              {/* Author header row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.25)' }}>
                <Image
                  source={{ uri: resolveAvatarUrl(msg.author_avatar || msg.authorAvatar) }}
                  style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#CBD5E1' }}
                />
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                  {msg.author_username || msg.authorUsername || 'AnuFi User'}
                </Text>
              </View>
              {/* Full Thumbnail */}
              <View style={styles.sharedCardThumbWrap}>
                {msg.media_url ? (
                  <Image
                    source={{ uri: resolveMediaUrl(msg.media_url) }}
                    style={styles.sharedCardThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.sharedCardThumb, { backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name={msg.message_type === 'shot_share' ? 'film-outline' : 'image-outline'} size={36} color="rgba(255,255,255,0.3)" />
                  </View>
                )}
                {/* Reel play button in center */}
                {msg.message_type === 'shot_share' && (
                  <View style={[styles.sharedCardPlayOverlay, { backgroundColor: 'transparent' }]}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="play" size={24} color="#FFFFFF" />
                    </View>
                  </View>
                )}
              </View>
              {/* Footer: caption + tap hint */}
              <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 7 }}>
                {/* Post caption / bio */}
                {(msg.post_caption || msg.postCaption) ? (
                  <Text style={{ fontSize: 13, color: theme.text, lineHeight: 18, marginBottom: 5 }} numberOfLines={3}>
                    {msg.post_caption || msg.postCaption}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons
                    name={msg.message_type === 'shot_share' ? 'play-circle-outline' : 'open-outline'}
                    size={13}
                    color={theme.background === '#121212' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.background === '#121212' ? '#FFFFFF' : '#64748B' }}>
                    {msg.message_type === 'shot_share' ? 'Tap to watch reel' : 'Tap to view post'}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View>
              {/* ── Instagram-Style Reply: "You replied" label + quoted mini-bubble ABOVE ── */}
              {msg.reply_to_id && typeof msg.reply_to_id === 'object' && (msg.reply_to_id.content || msg.reply_to_id.media_url || msg.reply_to_id.message_type) && (
                <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: 1 }}>
                  {/* Small grey label */}
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2, paddingHorizontal: 6 }}>
                    {isMe
                      ? 'You replied'
                      : `${msg.reply_to_id.sender_id?.full_name || msg.reply_to_id.sender_id?.username || 'Someone'} replied`}
                  </Text>
                  {/* Quoted mini-bubble — dark, visually distinct from main bubble */}
                  <View style={[
                    {
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 16,
                      maxWidth: '80%',
                      // Dark bubble regardless of isMe — contrasts clearly with main bubble
                      backgroundColor: isMe ? '#1A0533' : '#CBD5E1',
                      // Bottom corners connect visually toward main bubble
                      borderBottomRightRadius: isMe ? 4 : 16,
                      borderBottomLeftRadius: isMe ? 16 : 4,
                    }
                  ]}>
                    {(msg.reply_to_id.message_type === 'image' && msg.reply_to_id.media_url) ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Image source={{ uri: resolveMediaUrl(msg.reply_to_id.media_url) }} style={{ width: 30, height: 30, borderRadius: 6 }} contentFit="cover" />
                        <Text style={{ fontSize: 13, color: isMe ? '#D8B4FE' : '#475569' }}>Photo</Text>
                      </View>
                    ) : (msg.reply_to_id.message_type === 'audio') ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="mic-outline" size={13} color={isMe ? '#D8B4FE' : '#64748B'} />
                        <Text style={{ fontSize: 13, color: isMe ? '#D8B4FE' : '#475569' }}>Voice note</Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 13, lineHeight: 18, color: isMe ? '#E9D5FF' : '#334155' }} numberOfLines={1}>
                        {msg.reply_to_id.content || 'Message'}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* ── Main Message Bubble ── */}

              <View
                style={[
                  styles.bubbleContainer,
                  isMe ? styles.bubbleRight : styles.bubbleLeft,
                  isSticker
                    ? { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 }
                    : { backgroundColor: isMe ? '#9333EA' : '#F1F5F9' },
                ]}
              >
                {/* Image Attachment */}
                {msg.media_url && msg.message_type === 'image' && (
                  <Image
                    source={{ uri: resolveMediaUrl(msg.media_url) }}
                    style={styles.bubbleImage}
                    contentFit="cover"
                    transition={200}
                  />
                )}

                {/* Audio Voice Note Bubble */}
                {(msg.message_type === 'audio' || (msg.media_url && msg.media_url.endsWith('.m4a'))) && (
                  <InlineAudioPlayer uri={msg.media_url} isMe={isMe} />
                )}

                {/* Smart Lottie Animated Sticker / GIF */}
                {isSticker && msg.media_url && (
                  msg.media_url.endsWith('.json') || msg.media_url.includes('/lottie/') ? (
                    <SmartLottieSticker
                      uri={msg.media_url}
                      isNewMsg={msg.isNew}
                      onLongPress={() => onLongPress(msg)}
                    />
                  ) : (
                    <Image
                      source={{ uri: resolveMediaUrl(msg.media_url) }}
                      style={{ width: 170, height: 170, borderRadius: 14 }}
                      contentFit="cover"
                      autoplay={true}
                    />
                  )
                )}

                {/* Text Content */}
                {!!msg.content && !isSticker && (
                  <Text style={[styles.bubbleText, { color: isMe ? '#FFFFFF' : '#0F172A' }]}>
                    {isDeleted ? 'Message deleted' : msg.content}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Reaction Pill Badge */}
          {reactionList.length > 0 && (
            <View style={[styles.reactionBadge, isMe ? { right: 8 } : { left: 8 }]}>
              <Text style={styles.reactionText}>{reactionList[0] as string}</Text>
            </View>
          )}
        </Pressable>

        {/* Seen Status under the last sent message (ONLY shown when read / seen) */}
        {isMe && isLastMsg && (msg.status === 'read' || msg.is_seen === true || msg.seen === true) && (
          <View style={styles.seenFooterWrap}>
            <Text style={styles.seenStatusText}>
              Seen
            </Text>
          </View>
        )}
      </Animated.View>

      {/* 🕒 Sliding Timestamp on right (Revealed on left-swipe of chat area) */}
      <View style={styles.slideTimestampCol}>
        <Text style={styles.slideTimestampText}>
          {formatTime(msg.created_at)}
        </Text>
      </View>
    </Animated.View>
  );
});

// ------------------------------------------------------------
// DEDICATED NORMAL DIRECT CHATROOM SCREEN
// ------------------------------------------------------------
export default function NormalChatRoomScreen() {
  const params = useLocalSearchParams<{ id: string; username?: string; profileImage?: string }>();
  const conversationId = params.id;
  const theme = useAppTheme();
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((state: any) => state.user);
  const myId = (currentUser?._id || currentUser?.id)?.toString();
  const isAnonymousMode = !!currentUser?.isAnonymousMode;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Chat Store Selectors
  const messagesCache = useChatStore((state: any) => state.messagesCache?.[conversationId] || []);
  const setCachedMessages = useChatStore((state: any) => state.setCachedMessages);
  const removeConversation = useChatStore((state: any) => state.removeConversation);

  // Immediate Partner User Resolution for Frame #1 Header Render
  const initialPartnerUser = useMemo(() => {
    if (params.username || params.profileImage) {
      return {
        full_name: params.username || 'AnuFi User',
        username: params.username || 'user',
        avatar_url: params.profileImage,
      };
    }
    const storeConv = (useChatStore.getState().normalConversations || []).find(
      (c: any) => (c._id || c.id)?.toString() === conversationId
    ) || (useChatStore.getState().anonymousConversations || []).find(
      (c: any) => (c._id || c.id)?.toString() === conversationId
    ) || (useChatStore.getState().conversations || []).find(
      (c: any) => (c._id || c.id)?.toString() === conversationId
    );

    if (storeConv) {
      const isConvAnon = storeConv.is_anonymous === true || storeConv.isAnonymous === true;
      const pParticipant = storeConv.participants?.find((p: any) => {
        const u = p.user || p || {};
        const uid = (u._id || u.id || u)?.toString();
        return uid && uid !== myId;
      });
      if (pParticipant) {
        const pUser = pParticipant.user || pParticipant;
        if (isConvAnon) {
          const ghost = pUser.ghost_persona || pUser.anonymousPersona || pParticipant.ghost_persona || pParticipant.anonymousPersona || {};
          const ghostName = ghost.name || pUser.full_name || pUser.name || (pUser.username ? `@${pUser.username}` : 'Ghost User');
          const ghostUsername = ghost.username || pUser.username || 'ghost';
          const ghostAvatar = ghost.avatar || pUser.avatar_url || pUser.avatar || '';
          return {
            _id: pUser._id || 'anonymous',
            full_name: ghostName,
            username: ghostUsername,
            avatar_url: ghostAvatar,
            is_anonymous: true,
          };
        }
        return pUser;
      }
    }
    return null;
  }, [params, conversationId, myId]);

  const [partnerUser, setPartnerUser] = useState<any>(initialPartnerUser);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<any[]>(messagesCache);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [recording, setRecording] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<any>(null);

  // Unskip and load pinned message for this conversation from storage
  useEffect(() => {
    if (conversationId) {
      useChatStore.getState().unskipConversation(conversationId);
    }
    const loadPinned = async () => {
      try {
        const stored = await AsyncStorage.getItem(`anufi_pinned_msg_${conversationId}`);
        if (stored) {
          setPinnedMessage(JSON.parse(stored));
        }
      } catch (e) {}
    };
    loadPinned();
  }, [conversationId]);

  const handlePinMessage = async (msgToPin: any) => {
    setPinnedMessage(msgToPin);
    setActionMenuOpen(false);
    try {
      await AsyncStorage.setItem(`anufi_pinned_msg_${conversationId}`, JSON.stringify(msgToPin));
    } catch (e) {}
  };

  const handleUnpinMessage = async () => {
    setPinnedMessage(null);
    try {
      await AsyncStorage.removeItem(`anufi_pinned_msg_${conversationId}`);
    } catch (e) {}
  };

  // 🛡️ Debounce header navigation to prevent duplicate chat-info pushes on rapid double-tap
  const isNavigatingRef = useRef(false);
  const handleOpenChatInfo = useCallback(() => {
    if (isAnonymousMode || partnerUser?.is_anonymous) return;
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 1000);

    const uName = partnerUser?.username || params.username || '';
    const fName = partnerUser?.full_name || partnerUser?.name || params.username || '';
    const av = partnerUser?.avatar_url || partnerUser?.avatar || params.profileImage || '';
    router.push(`/chat-info/${conversationId}?username=${encodeURIComponent(uName)}&name=${encodeURIComponent(fName)}&avatar=${encodeURIComponent(av)}`);
  }, [isAnonymousMode, partnerUser, params, conversationId, router]);

  // Modals & Action Sheet
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [stickerModalOpen, setStickerModalOpen] = useState(false);
  const [customReactionModalOpen, setCustomReactionModalOpen] = useState(false);
  const [isCustomizingMode, setIsCustomizingMode] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [quickReactions, setQuickReactions] = useState<string[]>(['❤️', '😂', '😮', '😢', '😡', '👍']);
  const [editingQuickReactions, setEditingQuickReactions] = useState<string[]>(['❤️', '😂', '😮', '😢', '😡', '👍']);
  const [emojiSearchQuery, setEmojiSearchQuery] = useState('');
  const [activeEmojiCategory, setActiveEmojiCategory] = useState('recent');

  // Load Per-User Custom Quick Reactions from AsyncStorage
  useEffect(() => {
    const loadQuickReactions = async () => {
      try {
        const stored = await AsyncStorage.getItem(`anufi_quick_reactions_${myId || 'default'}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length === 6) {
            setQuickReactions(parsed);
            setEditingQuickReactions(parsed);
          }
        }
      } catch (e) { }
    };
    loadQuickReactions();
  }, [myId]);

  const saveQuickReactions = async (newReactions: string[]) => {
    try {
      setQuickReactions(newReactions);
      await AsyncStorage.setItem(`anufi_quick_reactions_${myId || 'default'}`, JSON.stringify(newReactions));
    } catch (e) { }
  };
  const [showNewMsgBadge, setShowNewMsgBadge] = useState(false);
  const isNearBottomRef = useRef(true);

  // ⌨️ Auto-scroll to bottom when keyboard appears so input sits directly below the last message
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 🕒 Chat Area PanResponder (Left-Swipe to Reveal All Timestamps)
  const swipeAnim = useRef(new Animated.Value(0)).current;

  const chatAreaPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          swipeAnim.setValue(Math.max(gestureState.dx, -65));
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(swipeAnim, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const handleScroll = (event: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const paddingToBottom = 60;
    const isBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isNearBottomRef.current = isBottom;
    if (isBottom && showNewMsgBadge) {
      setShowNewMsgBadge(false);
    }
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setShowNewMsgBadge(false);
  };
  const [isSearchOpen, setIsSearchOpen] = useState((params as any)?.openSearch === 'true');
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');

  useEffect(() => {
    if ((params as any)?.openSearch === 'true') {
      setIsSearchOpen(true);
    }
  }, [(params as any)?.openSearch]);
  const [pickerTab, setPickerTab] = useState<'lottie' | 'giphy'>('lottie');
  const [giphyQuery, setGiphyQuery] = useState('');
  const [giphyResults, setGiphyResults] = useState<any[]>([]);

  useEffect(() => {
    if (stickerModalOpen) {
      const loadGiphy = async () => {
        try {
          const { data } = await apiClient.get(`/stickers/giphy?q=${giphyQuery || 'happy'}`);
          if (data?.data) {
            setGiphyResults(data.data);
          }
        } catch (e) { }
      };
      loadGiphy();
    }
  }, [stickerModalOpen, giphyQuery]);

  const handleUnsendMessage = async () => {
    if (!selectedMessage) return;
    const msgId = (selectedMessage._id || selectedMessage.id)?.toString();
    if (!msgId) return;

    setMessages(prev => prev.filter(m => (m._id || m.id)?.toString() !== msgId));
    setActionMenuOpen(false);
    setSelectedMessage(null);

    socketService.emit('message:deleted', { messageId: msgId, conversationId });

    try {
      await apiClient.delete(`/chat/messages/${msgId}`);
    } catch (e) { }
  };

  const filteredMessages = useMemo(() => {
    if (!inChatSearchQuery.trim()) return messages;
    const q = inChatSearchQuery.toLowerCase();
    return messages.filter(m => (m.content || '').toLowerCase().includes(q));
  }, [messages, inChatSearchQuery]);

  const flatListRef = useRef<any>(null);

  // Clear unread status notifications on screen mount
  useEffect(() => {
    if (conversationId) {
      clearConversationNotifications(conversationId);
    }
  }, [conversationId]);

  // Fetch Conversation & Messages Details
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { data } = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
      const rawMsgs = Array.isArray(data) ? data : (data?.data || []);
      const sortedMsgs = [...rawMsgs].sort((a: any, b: any) => {
        const tA = new Date(a.created_at || a.createdAt || 0).getTime();
        const tB = new Date(b.created_at || b.createdAt || 0).getTime();
        return tA - tB;
      });
      setMessages(sortedMsgs);
      setCachedMessages(conversationId, sortedMsgs);

      // Fetch partner profile details
      const convRes = await apiClient.get(`/chat/conversations/${conversationId}`);
      const convObj = convRes.data;
      if (convObj && Array.isArray(convObj.participants)) {
        const isAnon = convObj.is_anonymous === true || convObj.isAnonymous === true;
        const pParticipant = convObj.participants.find((p: any) => {
          const u = p.user || p || {};
          const uid = (u._id || u.id)?.toString();
          return uid && uid !== myId;
        });
        const pUser = pParticipant?.user || pParticipant || {};
        if (isAnon) {
          const ghost = pUser.ghost_persona || pUser.anonymousPersona || pParticipant?.ghost_persona || pParticipant?.anonymousPersona || {};
          const ghostName = ghost.name || pUser.full_name || pUser.name || (pUser.username ? `@${pUser.username}` : 'Ghost User');
          const ghostUsername = ghost.username || pUser.username || 'ghost';
          const ghostAvatar = ghost.avatar || pUser.avatar_url || pUser.avatar || '';
          setPartnerUser({
            _id: pUser._id || 'anonymous',
            full_name: ghostName,
            username: ghostUsername,
            avatar_url: ghostAvatar,
            is_anonymous: true,
          });
        } else {
          setPartnerUser(pUser);
        }
      }
    } catch (e) {
      // Fallback silently to pre-cached state
    } finally {
      setLoading(false);
    }
  }, [conversationId, myId, setCachedMessages]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Real-Time Socket Event Handlers
  useEffect(() => {
    if (!conversationId) return;

    socketService.emit('chat:join', { chatId: conversationId });
    socketService.emit('join_conversation', conversationId);

    const handleIncomingMessage = (newMsg: any) => {
      if ((newMsg.conversation_id || newMsg.conversationId)?.toString() !== conversationId) return;

      const msgWithNewFlag = { ...newMsg, isNew: true };

      setMessages(prev => {
        if (msgWithNewFlag.tempMessageId) {
          const index = prev.findIndex(m => m.tempMessageId === msgWithNewFlag.tempMessageId || m._id === msgWithNewFlag.tempMessageId);
          if (index !== -1) {
            const next = [...prev];
            next[index] = msgWithNewFlag;
            return next;
          }
        }
        if (prev.some(m => (m._id || m.id)?.toString() === (msgWithNewFlag._id || msgWithNewFlag.id)?.toString())) {
          return prev;
        }
        return [...prev, msgWithNewFlag];
      });

      setCachedMessages(conversationId, [msgWithNewFlag, ...messages]);

      // Check scroll position rule
      if (isNearBottomRef.current) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      } else {
        setShowNewMsgBadge(true);
      }
    };

    const handleUserTyping = (data: any) => {
      if (data?.conversationId === conversationId && data?.userId !== myId) {
        setIsTyping(true);
      }
    };

    const handleUserStoppedTyping = (data: any) => {
      if (data?.conversationId === conversationId && data?.userId !== myId) {
        setIsTyping(false);
      }
    };

    const handleStatusUpdate = (data: any) => {
      if (partnerUser && (partnerUser._id || partnerUser.id)?.toString() === data?.userId?.toString()) {
        setIsPartnerOnline(data.status === 'online');
      }
    };

    const handleMarkedRead = (data: any) => {
      if (data?.conversationId === conversationId) {
        setMessages(prev =>
          prev.map(m => (m.status !== 'read' ? { ...m, status: 'read' } : m))
        );
      }
    };

    const handleMessageReaction = (data: any) => {
      if (!data?.messageId) return;
      setMessages(prev =>
        prev.map(m => {
          if ((m._id || m.id || m.tempMessageId)?.toString() === data.messageId?.toString()) {
            let nextReactions = { ...(m.reactions || {}) };
            if (data.reactions) {
              nextReactions = data.reactions;
            } else if (data.userId) {
              if (data.emoji) {
                nextReactions[data.userId] = data.emoji;
              } else {
                delete nextReactions[data.userId];
              }
            }
            return { ...m, reactions: nextReactions };
          }
          return m;
        })
      );
    };

    socketService.on('message:new', handleIncomingMessage);
    socketService.on('message:received', handleIncomingMessage);
    socketService.on('user_typing', handleUserTyping);
    socketService.on('user_stopped_typing', handleUserStoppedTyping);
    socketService.on('user_status_update', handleStatusUpdate);
    socketService.on('messages_read', handleMarkedRead);
    socketService.on('message_reaction', handleMessageReaction);
    socketService.on('reaction_added', handleMessageReaction);
    socketService.on('reaction_removed', handleMessageReaction);

    return () => {
      socketService.emit('chat:leave', { chatId: conversationId });
      socketService.emit('leave_conversation', conversationId);
      socketService.off('message:new', handleIncomingMessage);
      socketService.off('message:received', handleIncomingMessage);
      socketService.off('user_typing', handleUserTyping);
      socketService.off('user_stopped_typing', handleUserStoppedTyping);
      socketService.off('user_status_update', handleStatusUpdate);
      socketService.off('messages_read', handleMarkedRead);
      socketService.off('message_reaction', handleMessageReaction);
      socketService.off('reaction_added', handleMessageReaction);
      socketService.off('reaction_removed', handleMessageReaction);
    };
  }, [conversationId, myId, partnerUser, messages, setCachedMessages]);

  // Send Message Engine (Optimistic Frame #1 Emission)
  const handleSendMessage = useCallback(async (contentToSend?: string, type = 'text', mediaUrl?: string) => {
    const text = contentToSend !== undefined ? contentToSend : inputText.trim();
    if (!text && !mediaUrl) return;

    if (!contentToSend) setInputText('');
    setReplyingTo(null);

    const tempId = `temp_${Date.now()}_${uuidv4().substring(0, 6)}`;
    const newMsgObj: any = {
      _id: tempId,
      tempMessageId: tempId,
      conversation_id: conversationId,
      sender_id: {
        _id: myId,
        username: currentUser?.username,
        full_name: currentUser?.full_name || currentUser?.username,
        avatar_url: currentUser?.avatar_url,
      },
      content: text,
      message_type: type,
      media_url: mediaUrl,
      reply_to_id: replyingTo,
      status: 'sending',
      created_at: new Date().toISOString(),
      reactions: {},
      isNew: true,
    };

    // Frame #1 Instant UI Append (Chronological Bottom)
    setMessages(prev => [...prev, newMsgObj]);

    const partnerId = (partnerUser?._id || partnerUser?.id || '').toString();

    // Socket Emission (Zero-Latency Rule: emits both message:send and send_message)
    socketService.emit('message:send', {
      chatId: conversationId,
      recipientId: partnerId,
      content: text,
      type: type,
      mediaUrl,
      replyTo: replyingTo?._id || replyingTo?.id,
      tempMessageId: tempId,
    });
    socketService.emit('send_message', {
      conversationId,
      recipientId: partnerId,
      content: text,
      messageType: type,
      mediaUrl,
      replyTo: replyingTo?._id || replyingTo?.id,
      tempMessageId: tempId,
    });

    // Dual-Channel Guarantee: Background REST persistence backup
    apiClient.post(`/chat/conversations/${conversationId}/messages`, {
      content: text,
      media_url: mediaUrl,
      type: type,
      clientMessageId: tempId,
      reply_to_id: replyingTo?._id || replyingTo?.id,
    }).then((res) => {
      if (res.data?._id || res.data?.id) {
        const savedMsg = res.data;
        setMessages(prev =>
          prev.map(m => (m.tempMessageId === tempId ? { ...m, ...savedMsg, _id: savedMsg._id || savedMsg.id, status: 'sent' } : m))
        );
      }
    }).catch(() => {});
  }, [inputText, conversationId, myId, currentUser, replyingTo]);

  // 📸 Take Live Photo via Camera
  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission Required', 'Please allow camera access to take and send photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const photoUri = result.assets[0].uri;
        try {
          const formData = new FormData();
          formData.append('file', {
            uri: photoUri,
            type: 'image/jpeg',
            name: 'camera_capture.jpg',
          } as any);

          const uploadRes = await apiClient.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          const uploadedUrl = uploadRes.data?.url || photoUri;
          handleSendMessage('', 'image', uploadedUrl);
        } catch (e) {
          handleSendMessage('', 'image', photoUri);
        }
      }
    } catch (err) {
      console.error('Failed to open camera:', err);
    }
  };

  // 🖼️ Pick Photo Attachment from Gallery
  const handlePickGalleryImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow photo gallery access to attach images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const photoUri = result.assets[0].uri;
        try {
          const formData = new FormData();
          formData.append('file', {
            uri: photoUri,
            type: 'image/jpeg',
            name: 'upload.jpg',
          } as any);

          const uploadRes = await apiClient.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          const uploadedUrl = uploadRes.data?.url || photoUri;
          handleSendMessage('', 'image', uploadedUrl);
        } catch (e) {
          handleSendMessage('', 'image', photoUri);
        }
      }
    } catch (err) {
      console.error('Failed to open gallery:', err);
    }
  };

  // Voice Note Recording
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) { }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        handleSendMessage('Voice note', 'audio', uri);
      }
    } catch (err) { }
  };

  // Add / Toggle Emoji Reaction
  const handleAddReaction = (emoji: string) => {
    if (!selectedMessage) return;
    const msgId = (selectedMessage._id || selectedMessage.id)?.toString();
    if (!msgId) return;

    const currentReaction = selectedMessage.reactions?.[myId];
    const isAlreadyApplied = currentReaction === emoji;

    if (isAlreadyApplied) {
      socketService.emit('remove_reaction', { messageId: msgId, emoji });
    } else {
      socketService.emit('add_reaction', { messageId: msgId, emoji });
    }

    setMessages(prev =>
      prev.map(m => {
        if ((m._id || m.id)?.toString() === msgId) {
          const reactions = { ...(m.reactions || {}) };
          if (isAlreadyApplied) {
            delete reactions[myId];
          } else {
            reactions[myId] = emoji;
          }
          return { ...m, reactions };
        }
        return m;
      })
    );

    setActionMenuOpen(false);
    setSelectedMessage(null);
  };

  const handleSelectCustomReaction = (emoji: string) => {
    if (isCustomizingMode) {
      // In Customise reactions mode: Replace the emoji in selectedSlotIndex slot!
      const updated = [...editingQuickReactions];
      updated[selectedSlotIndex] = emoji;
      setEditingQuickReactions(updated);
      setSelectedSlotIndex(prev => (prev + 1) % 6);
      return;
    }

    // Normal Picker mode: Apply emoji as reaction to selectedMessage & close modal!
    if (!selectedMessage) return;
    handleAddReaction(emoji);
    setCustomReactionModalOpen(false);
  };

  const lastTapRef = useRef<{ [key: string]: number }>({});

  const handleDoubleTap = (msg: any) => {
    const msgId = (msg._id || msg.id || msg.tempMessageId)?.toString();
    if (!msgId) return;

    // Toggle Like / Unlike ❤️ on double-tap
    const currentReaction = msg.reactions?.[myId];
    const isAlreadyLiked = currentReaction === '❤️';

    if (isAlreadyLiked) {
      socketService.emit('message:react', { messageId: msgId, chatId: conversationId, emoji: '' });
      socketService.emit('reaction_removed', { messageId: msgId, emoji: '❤️', userId: myId });
      socketService.emit('remove_reaction', { messageId: msgId, emoji: '❤️' });
      apiClient.post(`/chat/messages/${msgId}/react`, { emoji: '', chatId: conversationId }).catch(() => {});
    } else {
      socketService.emit('message:react', { messageId: msgId, chatId: conversationId, emoji: '❤️' });
      socketService.emit('reaction_added', { messageId: msgId, emoji: '❤️', userId: myId });
      socketService.emit('add_reaction', { messageId: msgId, emoji: '❤️' });
      apiClient.post(`/chat/messages/${msgId}/react`, { emoji: '❤️', chatId: conversationId }).catch(() => {});
    }

    setMessages(prev =>
      prev.map(m => {
        if ((m._id || m.id || m.tempMessageId)?.toString() === msgId) {
          const reactions = { ...(m.reactions || {}) };
          if (isAlreadyLiked) {
            delete reactions[myId];
          } else {
            reactions[myId] = '❤️';
          }
          return { ...m, reactions };
        }
        return m;
      })
    );
  };

  // Message Bubble Item Renderer (1:1 Instagram Style with Swipe-to-Reply & Swipe-to-Timestamp)
  const renderMessageItem = ({ item: msg, index }: { item: any; index: number }) => {
    if (!msg) return null;

    const senderId = (msg.sender_id?._id || msg.sender_id?.id || msg.sender_id)?.toString();
    const isMe = senderId === myId;
    const isDeleted = msg.is_deleted;
    const reactions = msg.reactions || {};
    const reactionList = Object.values(reactions);

    const isLastMsg = index === messages.length - 1;
    const partnerAvatarUrl = resolveAvatarUrl(partnerUser?.avatar_url || partnerUser?.avatar || params.profileImage);

    return (
      <SwipeableMessageRow
        key={(msg._id || msg.id || msg.tempMessageId)?.toString()}
        msg={msg}
        index={index}
        isMe={isMe}
        myId={myId}
        isLastMsg={isLastMsg}
        partnerAvatarUrl={partnerAvatarUrl}
        globalSwipeAnim={swipeAnim}
        theme={theme}
        router={router}
        onReply={(targetMsg: any) => setReplyingTo(targetMsg)}
        onDoubleTap={(targetMsg: any) => handleDoubleTap(targetMsg)}
        onLongPress={(targetMsg: any) => {
          setSelectedMessage(targetMsg);
          setActionMenuOpen(true);
        }}
        isDeleted={isDeleted}
        reactionList={reactionList}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      {/* 1. Header Section */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerUserBlock}
          disabled={isAnonymousMode || partnerUser?.is_anonymous}
          activeOpacity={isAnonymousMode || partnerUser?.is_anonymous ? 1 : 0.7}
          onPress={handleOpenChatInfo}
        >
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: resolveAvatarUrl(partnerUser?.avatar_url || partnerUser?.avatar || params.profileImage) }}
              style={styles.headerAvatar}
            />
            {isPartnerOnline && <View style={styles.headerOnlineDot} />}
          </View>

          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
              {partnerUser?.full_name || partnerUser?.name || params.username || 'AnuFi User'}
            </Text>
            <Text style={styles.headerStatusText}>
              {isTyping
                ? 'typing...'
                : (isPartnerOnline ? 'Online' : 'Offline')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Header Action Buttons (Call, Video) — Only in Normal Mode */}
        {!isAnonymousMode && !partnerUser?.is_anonymous && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="call-outline" size={22} color="#4F46E5" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="videocam-outline" size={22} color="#4F46E5" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 📌 Pinned Message Banner (Right below header) */}
      {pinnedMessage && (
        <View style={[styles.pinnedBanner, { backgroundColor: theme.surface }]}>
          <View style={styles.pinnedLeftBar} />
          <View style={styles.pinnedBody}>
            <Ionicons name="pin" size={14} color="#9333EA" style={{ marginRight: 6 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pinnedTitle}>Pinned message</Text>
              <Text style={[styles.pinnedPreviewText, { color: theme.text }]} numberOfLines={1}>
                {pinnedMessage.content || (pinnedMessage.message_type === 'image' ? '📷 Photo' : (pinnedMessage.message_type === 'audio' ? '🎤 Voice note' : 'Shared item'))}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.pinnedCloseBtn} onPress={handleUnpinMessage}>
            <Ionicons name="close" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      )}

      {/* In-Chat Search Strip */}
      {isSearchOpen && (
        <View style={styles.inChatSearchStrip}>
          <Ionicons name="search-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.inChatSearchInput}
            placeholder="Search in conversation..."
            placeholderTextColor="#94A3B8"
            value={inChatSearchQuery}
            onChangeText={setInChatSearchQuery}
            autoFocus
          />
          <TouchableOpacity onPress={() => { setIsSearchOpen(false); setInChatSearchQuery(''); }}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Message Inverted Feed */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#9333EA" />
          </View>
        ) : (
          <View style={{ flex: 1 }} {...chatAreaPanResponder.panHandlers}>
            <FlashList
              ref={flatListRef}
              data={filteredMessages}
              renderItem={renderMessageItem}
              keyExtractor={(item: any) => (item._id || item.id || item.tempMessageId)?.toString()}
              contentContainerStyle={[styles.feedContent, { flexGrow: 1, justifyContent: 'flex-end' }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onScroll={handleScroll}
              onContentSizeChange={() => {
                if (isNearBottomRef.current) {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }
              }}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          </View>
        )}

        {/* Floating "↓ New Messages" Badge */}
        {showNewMsgBadge && (
          <TouchableOpacity style={styles.floatingNewMsgBadge} onPress={scrollToBottom}>
            <Ionicons name="arrow-down" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.floatingNewMsgText}>New Messages</Text>
          </TouchableOpacity>
        )}

        {/* Quoted Reply Preview Strip (1:1 Instagram Style) */}
        {replyingTo && (
          <View style={styles.replyPreviewStrip}>
            <View style={styles.replyPreviewLeftBar} />
            <View style={{ flex: 1, paddingLeft: 8 }}>
              <Text style={styles.replyPreviewName}>
                Replying to {replyingTo.sender_id?.full_name || replyingTo.sender_id?.username || 'Message'}
              </Text>
              <Text style={styles.replyPreviewContent} numberOfLines={1}>
                {replyingTo.content || (replyingTo.message_type === 'image' ? '📷 Photo' : 'Voice note')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyCloseBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* 3. Input Bar (Exact 1:1 Instagram Layout & Capsule Style) */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.background,
              paddingBottom: isKeyboardVisible ? 6 : Math.max(insets.bottom, 12),
            },
          ]}
        >
          {/* Blue Circular Camera Button */}
          <TouchableOpacity style={styles.blueCameraBtn} onPress={handleTakePhoto} activeOpacity={0.85}>
            <Ionicons name="camera" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Capsule/Pill Input Container */}
          <View style={[styles.inputPillBox, { backgroundColor: theme.surface }]}>
            <TextInput
              style={[styles.inputField, { color: theme.text }]}
              placeholder="Message..."
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={(text) => {
                if (
                  (text.includes('giphy.com') || text.includes('tenor.com') || text.endsWith('.gif')) &&
                  (text.startsWith('http://') || text.startsWith('https://')) &&
                  text.length > 20
                ) {
                  setInputText('');
                  handleSendMessage('', 'gif', text.trim());
                  return;
                }
                setInputText(text);
              }}
              onFocus={() => {
                setTimeout(() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
              // @ts-ignore
              onImageChange={(event: any) => {
                const imgUri = event?.nativeEvent?.uri || event?.nativeEvent?.link;
                if (imgUri) {
                  handleSendMessage('', 'gif', imgUri);
                }
              }}
              multiline
            />

            {/* Right Action Icons: Mic, Gallery, Sticker, Plus */}
            {inputText.trim().length === 0 ? (
              <View style={styles.inputRightActions}>
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPressIn={startRecording}
                  onPressOut={stopRecording}
                >
                  <Ionicons
                    name={isRecording ? 'mic' : 'mic-outline'}
                    size={24}
                    color={isRecording ? '#EF4444' : theme.text}
                  />
                </TouchableOpacity>

                <TouchableOpacity style={styles.inputIconBtn} onPress={handlePickGalleryImage}>
                  <Ionicons name="image-outline" size={24} color={theme.text} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.inputIconBtn} onPress={() => setStickerModalOpen(true)}>
                  <Ionicons name="happy-outline" size={24} color={theme.text} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.inputIconBtn} onPress={() => setStickerModalOpen(true)}>
                  <Ionicons name="add-circle-outline" size={26} color={theme.text} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.sendTextBtn} onPress={() => handleSendMessage()}>
                <Text style={styles.sendTextLabel}>Send</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 4. Action Sheet Modal (1:1 Instagram Popup Style) */}
      <Modal visible={actionMenuOpen} transparent animationType="fade" onRequestClose={() => setActionMenuOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setActionMenuOpen(false)}>
          <View style={styles.instaActionPanel}>
            {/* Floating Reaction Bar */}
            <View style={styles.instaReactionsBar}>
              {quickReactions.map((emoji, idx) => {
                const isApplied = selectedMessage?.reactions?.[myId] === emoji;
                return (
                  <TouchableOpacity
                    key={`${emoji}_${idx}`}
                    style={[styles.reactionEmojiTouch, isApplied && styles.reactionEmojiTouchActive]}
                    onPress={() => handleAddReaction(emoji)}
                  >
                    <Text style={styles.instaReactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.reactionEmojiTouch}
                onPress={() => {
                  setActionMenuOpen(false);
                  setIsCustomizingMode(false);
                  setCustomReactionModalOpen(true);
                }}
              >
                <Ionicons name="add" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Action Items Box */}
            <View style={styles.instaActionCard}>
              <Text style={styles.instaCardTimestamp}>
                {selectedMessage?.created_at ? formatTime(selectedMessage.created_at) : 'TODAY'}
              </Text>

              <TouchableOpacity style={styles.instaActionRow} onPress={() => { setReplyingTo(selectedMessage); setActionMenuOpen(false); }}>
                <Ionicons name="arrow-undo-outline" size={20} color="#0F172A" />
                <Text style={styles.instaActionText}>Reply</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.instaActionRow} onPress={() => { setActionMenuOpen(false); }}>
                <Ionicons name="paper-plane-outline" size={20} color="#0F172A" />
                <Text style={styles.instaActionText}>Forward</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.instaActionRow} onPress={() => { Clipboard.setStringAsync(selectedMessage?.content || ''); setActionMenuOpen(false); }}>
                <Ionicons name="copy-outline" size={20} color="#0F172A" />
                <Text style={styles.instaActionText}>Copy</Text>
              </TouchableOpacity>

              {/* Pin / Unpin Message Option */}
              <TouchableOpacity
                style={styles.instaActionRow}
                onPress={() => {
                  const selId = (selectedMessage?._id || selectedMessage?.id || selectedMessage?.tempMessageId)?.toString();
                  const pinId = (pinnedMessage?._id || pinnedMessage?.id || pinnedMessage?.tempMessageId)?.toString();
                  if (selId && pinId && selId === pinId) {
                    handleUnpinMessage();
                    setActionMenuOpen(false);
                  } else {
                    handlePinMessage(selectedMessage);
                  }
                }}
              >
                <Ionicons
                  name={(selectedMessage?._id || selectedMessage?.id) === (pinnedMessage?._id || pinnedMessage?.id) ? 'pin' : 'pin-outline'}
                  size={20}
                  color="#9333EA"
                />
                <Text style={[styles.instaActionText, { color: '#9333EA', fontWeight: '700' }]}>
                  {(selectedMessage?._id || selectedMessage?.id) === (pinnedMessage?._id || pinnedMessage?.id) ? 'Unpin message' : 'Pin message'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.instaActionRow} onPress={() => { setActionMenuOpen(false); }}>
                <Ionicons name="sparkles-outline" size={20} color="#0F172A" />
                <Text style={styles.instaActionText}>Make AI image</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.instaActionRow} onPress={() => { setActionMenuOpen(false); }}>
                <Ionicons name="language-outline" size={20} color="#0F172A" />
                <Text style={styles.instaActionText}>Translate</Text>
              </TouchableOpacity>

              {/* Unsend Option (Red) */}
              {((selectedMessage?.sender_id?._id || selectedMessage?.sender_id?.id || selectedMessage?.sender_id)?.toString() === myId) && (
                <TouchableOpacity style={styles.instaActionRow} onPress={handleUnsendMessage}>
                  <Ionicons name="arrow-undo-circle-outline" size={22} color="#DC2626" />
                  <Text style={[styles.instaActionText, { color: '#DC2626', fontWeight: '700' }]}>Unsend</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.instaActionRow} onPress={() => { setActionMenuOpen(false); }}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#0F172A" />
                <Text style={[styles.instaActionText, { flex: 1 }]}>More</Text>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Animated Stickers & Giphy GIFs Modal with Segmented Tabs */}
      <Modal visible={stickerModalOpen} transparent animationType="slide" onRequestClose={() => setStickerModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.stickerPanel}>
            {/* Modal Header */}
            <View style={styles.stickerHeader}>
              <View style={styles.modalSegmentedBar}>
                <TouchableOpacity
                  style={[styles.modalSegmentTab, pickerTab === 'lottie' && styles.modalSegmentTabActive]}
                  onPress={() => setPickerTab('lottie')}
                >
                  <Text style={[styles.modalSegmentTabText, pickerTab === 'lottie' && styles.modalSegmentTabTextActive]}>
                    Lottie Emojis
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSegmentTab, pickerTab === 'giphy' && styles.modalSegmentTabActive]}
                  onPress={() => setPickerTab('giphy')}
                >
                  <Text style={[styles.modalSegmentTabText, pickerTab === 'giphy' && styles.modalSegmentTabTextActive]}>
                    Giphy GIFs
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setStickerModalOpen(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Giphy Search Bar (Only shown on Giphy tab) */}
            {pickerTab === 'giphy' && (
              <View style={styles.giphySearchWrap}>
                <Ionicons name="search-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.giphySearchInput}
                  placeholder="Search Giphy GIFs..."
                  placeholderTextColor="#94A3B8"
                  value={giphyQuery}
                  onChangeText={setGiphyQuery}
                />
              </View>
            )}

            {/* Grid List for active tab */}
            <FlatList
              key={pickerTab}
              data={pickerTab === 'lottie' ? ANIMATED_STICKERS : giphyResults}
              numColumns={pickerTab === 'lottie' ? 5 : 3}
              keyExtractor={(item: any, idx: number) => item.id || item.url || idx.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.stickerItem}
                  onPress={() => {
                    handleSendMessage('', pickerTab === 'giphy' ? 'gif' : 'sticker', item.url);
                    setStickerModalOpen(false);
                  }}
                >
                  {pickerTab === 'lottie' ? (
                    <Text style={{ fontSize: 28 }}>{item.emoji || '😀'}</Text>
                  ) : (
                    <Image source={{ uri: resolveMediaUrl(item.url) }} style={{ width: 80, height: 80, borderRadius: 8 }} contentFit="cover" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* 5. 1:1 Instagram Custom Reaction Picker & Customizer Sheet Modal */}
      <Modal
        visible={customReactionModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setCustomReactionModalOpen(false);
          setIsCustomizingMode(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.instaSheetPanel}>
            {/* Top Drag Handle */}
            <View style={styles.instaDragHandle} />

            {/* Header: Mode 1 vs Mode 2 */}
            {isCustomizingMode ? (
              <View style={styles.instaCustomizeHeader}>
                <TouchableOpacity
                  style={styles.instaHeaderIconBtn}
                  onPress={() => setIsCustomizingMode(false)}
                >
                  <Ionicons name="arrow-back" size={22} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.instaCustomizeTitle}>Customise reactions</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <TouchableOpacity
                    style={styles.instaHeaderIconBtn}
                    onPress={() => setEditingQuickReactions(DEFAULT_QUICK_REACTIONS)}
                  >
                    <Ionicons name="refresh-outline" size={22} color="#0F172A" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.instaHeaderIconBtn}
                    onPress={() => {
                      saveQuickReactions(editingQuickReactions);
                      setIsCustomizingMode(false);
                      setCustomReactionModalOpen(false);
                    }}
                  >
                    <Ionicons name="checkmark-outline" size={24} color="#0095F6" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* In Customise Mode: Floating Pill Container Overlay (Screenshot 2) */}
            {isCustomizingMode ? (
              <View style={styles.instaCustomizingPillWrap}>
                <View style={styles.instaFloatingPillBar}>
                  {editingQuickReactions.map((emoji, idx) => {
                    const isSelected = selectedSlotIndex === idx;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.instaPillSlot,
                          isSelected && styles.instaPillSlotSelected,
                        ]}
                        onPress={() => setSelectedSlotIndex(idx)}
                      >
                        <Text style={{ fontSize: 28 }}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.instaPillHelperText}>
                  Tap a reaction, then choose an emoji to replace it.
                </Text>
                <Text style={styles.instaPillSubtext}>
                  ❤️ is your double-tap reaction.
                </Text>
              </View>
            ) : null}

            {/* Search Input Bar (Screenshot 1 & 2) */}
            <View style={styles.instaSearchWrap}>
              <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.instaSearchInput}
                placeholder="Search"
                placeholderTextColor="#94A3B8"
                value={emojiSearchQuery}
                onChangeText={setEmojiSearchQuery}
              />
            </View>

            {/* In Mode 1 (Normal Picker): Section "Your reactions" (Screenshot 1) */}
            {!isCustomizingMode && !emojiSearchQuery ? (
              <View style={styles.instaYourReactionsWrap}>
                <View style={styles.instaSectionHeaderRow}>
                  <Text style={styles.instaSectionTitle}>Your reactions</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingQuickReactions([...quickReactions]);
                      setSelectedSlotIndex(0);
                      setIsCustomizingMode(true);
                    }}
                  >
                    <Text style={styles.instaCustomiseBtnText}>Customise</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.instaYourReactionsRow}>
                  {quickReactions.map((emoji, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.instaQuickReactionCircle}
                      onPress={() => handleSelectCustomReaction(emoji)}
                    >
                      <Text style={{ fontSize: 30 }}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Section Header "Recent" / Category Name / Search */}
            <View style={styles.instaSectionHeaderRow}>
              <Text style={styles.instaSectionTitle}>
                {emojiSearchQuery
                  ? 'Search Results'
                  : activeEmojiCategory === 'smileys'
                    ? 'Smileys & people'
                    : activeEmojiCategory === 'animals'
                      ? 'Animals & nature'
                      : activeEmojiCategory === 'food'
                        ? 'Food & drink'
                        : activeEmojiCategory === 'activities'
                          ? 'Activities & celebrations'
                          : activeEmojiCategory === 'travel'
                            ? 'Travel & places'
                            : activeEmojiCategory === 'objects'
                              ? 'Objects & tech'
                              : activeEmojiCategory === 'symbols'
                                ? 'Symbols & flags'
                                : 'Recent'}
              </Text>
            </View>

            {/* 6-Column Emoji Grid */}
            <FlatList
              key={activeEmojiCategory}
              data={
                emojiSearchQuery
                  ? ALL_EMOJI_LIST.filter(e => e.includes(emojiSearchQuery))
                  : activeEmojiCategory === 'smileys'
                    ? SMILEYS_EMOJIS
                    : activeEmojiCategory === 'animals'
                      ? ANIMALS_EMOJIS
                      : activeEmojiCategory === 'food'
                        ? FOOD_EMOJIS
                        : activeEmojiCategory === 'activities'
                          ? ACTIVITIES_EMOJIS
                          : activeEmojiCategory === 'travel'
                            ? TRAVEL_EMOJIS
                            : activeEmojiCategory === 'objects'
                              ? OBJECTS_EMOJIS
                              : activeEmojiCategory === 'symbols'
                                ? SYMBOLS_EMOJIS
                                : ALL_EMOJI_LIST
              }
              numColumns={6}
              keyExtractor={(item: string, idx: number) => item + idx}
              contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.instaEmojiGridItem}
                  onPress={() => handleSelectCustomReaction(item)}
                >
                  <Text style={{ fontSize: 30 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />

            {/* Bottom Category Icon Tabs Bar (Screenshot 1 & 2) */}
            <View style={styles.instaCategoryTabsBar}>
              {[
                { id: 'recent', icon: 'time-outline' },
                { id: 'smileys', icon: 'happy-outline' },
                { id: 'animals', icon: 'paw-outline' },
                { id: 'food', icon: 'restaurant-outline' },
                { id: 'activities', icon: 'football-outline' },
                { id: 'travel', icon: 'car-outline' },
                { id: 'objects', icon: 'bulb-outline' },
                { id: 'symbols', icon: 'calculator-outline' },
              ].map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.instaCategoryTabBtn,
                    activeEmojiCategory === cat.id && styles.instaCategoryTabBtnActive,
                  ]}
                  onPress={() => setActiveEmojiCategory(cat.id)}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={20}
                    color={activeEmojiCategory === cat.id ? '#0F172A' : '#94A3B8'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ------------------------------------------------------------
// STYLESHEET
// ------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  speedBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.06)', marginLeft: 4 },
  speedText: { fontSize: 11, fontWeight: '800' },
  inChatSearchStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  inChatSearchInput: { flex: 1, fontSize: 13.5, color: '#0F172A', height: 36 },
  modalSegmentedBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  modalSegmentTab: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  modalSegmentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modalSegmentTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSegmentTabTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  giphySearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    height: 38,
  },
  giphySearchInput: { flex: 1, fontSize: 13, color: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // ── 📌 Pinned Message Banner Styles ──
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 2,
    marginBottom: 6,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  pinnedLeftBar: {
    width: 3,
    height: 28,
    backgroundColor: '#9333EA',
    borderRadius: 2,
    marginRight: 8,
  },
  pinnedBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9333EA',
  },
  pinnedPreviewText: {
    fontSize: 12.5,
    marginTop: 1,
  },
  pinnedCloseBtn: {
    padding: 4,
    marginLeft: 6,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerUserBlock: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { position: 'relative', marginRight: 10 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#CBD5E1' },
  headerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerTitleWrap: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: '700' },
  headerStatusText: { fontSize: 12, color: '#64748B' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 6 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  feedContent: { paddingHorizontal: 12, paddingVertical: 10 },
  bubbleRowAnimated: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 3,
    position: 'relative',
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
    paddingLeft: 2,
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
    paddingRight: 2,
  },
  partnerAvatarCol: {
    marginRight: 8,
    marginBottom: 2,
  },
  bubblePartnerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
  },
  bubbleWrapper: {
    maxWidth: '76%',
  },
  bubbleWrapperLeft: {
    alignSelf: 'flex-start',
  },
  bubbleWrapperRight: {
    alignSelf: 'flex-end',
  },
  bubbleContainer: {
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  bubbleLeft: {
    borderBottomLeftRadius: 6,
  },
  bubbleRight: {
    borderBottomRightRadius: 6,
  },
  slideTimestampCol: {
    position: 'absolute',
    right: -60,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  slideTimestampText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '500',
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 6 },
  stickerLottie: { width: 44, height: 44 },
  audioBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 14,
    width: 180,
  },
  audioPlayBtn: { padding: 6, marginRight: 6 },
  audioProgressTrack: { flex: 1, height: 4, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 2, overflow: 'hidden' },
  audioProgressFill: { height: '100%', borderRadius: 2 },
  audioTimeText: { fontSize: 11, marginLeft: 8 },
  replyQuoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    marginBottom: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  replyQuoteBar: {
    width: 3,
    borderRadius: 3,
    alignSelf: 'stretch',
    minHeight: 30,
  },
  replyQuoteSender: { fontSize: 11.5, fontWeight: '700', marginBottom: 2 },
  replyQuoteText: { fontSize: 12, lineHeight: 16 },
  replyQuoteThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginLeft: 8,
  },
  // ── Instagram-Style Reply Mini Bubble ──
  replyMiniQuoteBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '80%',
  },
  replyMiniRight: {
    backgroundColor: '#7E22CE',   // Darker purple for sent side
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  replyMiniLeft: {
    backgroundColor: '#E2E8F0',   // Light grey for received side
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  replyMiniText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  sharedContentCard: {
    width: 280,
    borderRadius: 14,
    overflow: 'hidden',
    marginVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148,163,184,0.3)',
  },
  sharedContentText: { fontSize: 13, fontWeight: '600' },
  sharedCardThumbWrap: {
    width: '100%',
    height: 350,
    position: 'relative',
  },
  sharedCardThumb: {
    width: '100%',
    height: '100%',
  },
  sharedCardPlayOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sharedCardMeta: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  sharedCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sharedCardTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  sharedCardAuthor: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  floatingNewMsgBadge: {
    position: 'absolute',
    bottom: 70,
    alignSelf: 'center',
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 10,
  },
  floatingNewMsgText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  timeText: { fontSize: 11 },
  seenFooterWrap: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginRight: 4,
  },
  seenStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  reactionBadge: {
    position: 'absolute',
    bottom: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reactionText: { fontSize: 12 },
  swipeReplyIconWrapLeft: {
    position: 'absolute',
    left: -38,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
    top: '25%',
  },
  swipeReplyIconWrapRight: {
    position: 'absolute',
    right: -38,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
    top: '25%',
  },
  swipeReplyCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyPreviewStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  replyPreviewLeftBar: {
    width: 3.5,
    height: 32,
    backgroundColor: '#9333EA',
    borderRadius: 2,
  },
  replyPreviewName: { fontSize: 12.5, fontWeight: '700', color: '#9333EA' },
  replyPreviewContent: { fontSize: 12, color: '#64748B', marginTop: 1 },
  replyCloseBtn: { padding: 4 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  blueCameraBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  inputPillBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 4,
    minHeight: 44,
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
    maxHeight: 90,
  },
  inputRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inputIconBtn: {
    padding: 5,
  },
  sendTextBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendTextLabel: {
    color: '#3B82F6',
    fontSize: 15.5,
    fontWeight: '700',
  },
  instaActionPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  instaReactionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 14,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    gap: 12,
  },
  reactionEmojiTouch: {
    padding: 2,
  },
  reactionEmojiTouchActive: {
    transform: [{ scale: 1.15 }],
  },
  instaReactionEmoji: {
    fontSize: 26,
  },
  customizeSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customizeSlotNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    width: 20,
  },
  customizeChangeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  restoreDefaultBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  restoreDefaultBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  saveCustomizeBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveCustomizeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  instaSheetPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    height: '55%',
    maxHeight: '60%',
  },
  instaDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  instaCustomizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  instaHeaderIconBtn: {
    padding: 6,
  },
  instaCustomizeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  instaCustomizingPillWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  instaFloatingPillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    gap: 12,
    marginBottom: 10,
  },
  instaPillSlot: {
    padding: 4,
    borderRadius: 20,
  },
  instaPillSlotSelected: {
    transform: [{ scale: 1.25 }],
  },
  instaPillHelperText: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
  },
  instaPillSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
  },
  instaSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 14,
  },
  instaSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  instaYourReactionsWrap: {
    marginBottom: 12,
  },
  instaSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  instaSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  instaCustomiseBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0095F6',
  },
  instaYourReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 6,
  },
  instaQuickReactionCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instaEmojiGridItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  instaCategoryTabsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 6,
  },
  instaCategoryTabBtn: {
    padding: 6,
    borderRadius: 10,
  },
  instaCategoryTabBtnActive: {
    backgroundColor: '#F1F5F9',
  },
  instaActionCard: {
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  instaCardTimestamp: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 10,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  instaActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  instaActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  voiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#A855F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  voiceBtnActive: {
    backgroundColor: '#F43F5E',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  actionSheetPanel: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  reactionBar: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', marginBottom: 12 },
  reactionEmoji: { fontSize: 24 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  actionText: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  stickerPanel: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, height: 360 },
  stickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  stickerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  stickerItem: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
});
