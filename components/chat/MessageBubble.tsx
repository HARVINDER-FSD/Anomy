import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Animated, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { COLORS } from '@/src/theme/colors';
import { LottieEmoji } from './LottieEmoji';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import type { Message } from '@/src/lib/types';
import * as Haptics from 'expo-haptics';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useVideoPlayer, VideoView } from 'expo-video';
import { scale, verticalScale } from '@/src/utils/responsive';

interface ChatVideoPreviewProps {
  uri: string;
  style: any;
}

const ChatVideoPreview = ({ uri, style }: ChatVideoPreviewProps) => {
  const player = useVideoPlayer(uri, p => {
    p.muted = true;
    p.loop = true;
  });
  
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

interface MessageBubbleProps {
  item: Message;
  mine: boolean;
  index: number;
  peerAvatar: string;
  mediaUri: string;
  isAnonymousChat: boolean;
  themeMeta: any;
  onLongPress: (message: Message) => void;
  onSwipeReply: (message: Message) => void;
  onDoubleTap: (message: Message) => void;
  onRetry?: (message: Message) => void;
}

export const MessageBubble = React.memo(({
  item,
  mine,
  index,
  peerAvatar,
  mediaUri,
  isAnonymousChat,
  themeMeta,
  onLongPress,
  onSwipeReply,
  onDoubleTap,
  onRetry,
}: MessageBubbleProps) => {
  const router = useSafeRouter();
  const translateX = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const timerRef = useRef<any>(null);

  const mt = item.message_type;
  const isSticker = mt === 'sticker';
  const isShotShare = mt === 'shot_share';
  const isPostShare = mt === 'post_share';
  const attachments = item.attachments || [];
  const hasAttachments = attachments.length > 0;
  const showImage = (!!mediaUri || hasAttachments) && mt !== 'video' && mt !== 'sticker' && mt !== 'shot_share' && mt !== 'post_share' && (mt === 'image' || (!mt && (!!item.media_url || hasAttachments)));

  const handleImagePress = (idx: number, mediaList: Array<{ url: string; type: string }>) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // 🚀 Double Tap detected
      if (timerRef.current) clearTimeout(timerRef.current);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onDoubleTap(item);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      // Wait for a possible second tap
      timerRef.current = setTimeout(() => {
        // 🚀 Single Tap confirmed
        const currentMedia = mediaList[idx];
        router.push({
          pathname: '/media-viewer',
          params: {
            urls: mediaList.map(m => m.url).join(','),
            types: mediaList.map(m => m.type).join(','),
            initialIndex: idx.toString(),
            type: currentMedia?.type === 'video' ? 'video' : 'image'
          }
        } as any);
        lastTap.current = 0;
      }, 300);
    }
  };

  const handlePress = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // 🚀 Double Tap detected
      if (timerRef.current) clearTimeout(timerRef.current);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onDoubleTap(item);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      if (isShotShare || isPostShare) {
        // Wait to see if it's a double tap before navigating
        timerRef.current = setTimeout(() => {
          const id = item.content.split('/').pop();
          if (id) {
            router.push(isShotShare ? `/reels/${id}` : `/post/${id}`);
          }
          lastTap.current = 0;
        }, 300);
        return;
      }
    }
  };

  if (item.is_deleted) {
    return (
      <View style={styles.msgRow}>
        <Text style={styles.deleted}>Message deleted</Text>
      </View>
    );
  }

  const reactions = item.reactions as Record<string, string> | undefined;
  const reactionCounts: Record<string, number> = {};
  if (reactions && typeof reactions === 'object') {
    Object.values(reactions).forEach((e) => {
      if (e && typeof e === 'string') reactionCounts[e] = (reactionCounts[e] || 0) + 1;
    });
  }
  const hasReactions = Object.keys(reactionCounts).length > 0;
  const otherBubbleBg = themeMeta.bubbleOther;

  const renderImages = () => {
    const mediaToRender = hasAttachments 
      ? attachments.filter(a => a.type === 'image' || a.type === 'video').map(a => ({ url: a.url, type: a.type }))
      : mediaUri ? [{ url: mediaUri, type: mt === 'video' ? 'video' : 'image' }] : [];

    if (mediaToRender.length === 0) return null;

    if (mediaToRender.length === 1) {
      const isVid = mediaToRender[0].type === 'video';
      return (
        <Pressable 
          onPress={() => handleImagePress(0, mediaToRender)}
          onLongPress={() => onLongPress(item)}
          delayLongPress={360}
          style={styles.mediaContainer}
        >
          {isVid ? (
            <View style={styles.chatImage}>
              <ChatVideoPreview
                uri={mediaToRender[0].url}
                style={styles.chatImage}
              />
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play" size={32} color="#FFF" />
              </View>
            </View>
          ) : (
            <Image
              source={{ uri: mediaToRender[0].url }}
              style={styles.chatImage}
              contentFit="cover"
              transition={120}
            />
          )}
        </Pressable>
      );
    }

    // Grid for multiple media
    return (
      <View style={styles.imageGrid}>
        {mediaToRender.map((media, idx) => (
          <Pressable 
            key={`${media.url}-${idx}`} 
            onPress={() => handleImagePress(idx, mediaToRender)}
            onLongPress={() => onLongPress(item)}
            delayLongPress={360}
          >
            {media.type === 'video' ? (
              <View style={[
                styles.gridImage,
                mediaToRender.length === 2 && styles.gridImage2,
                mediaToRender.length >= 3 && styles.gridImage3,
              ]}>
                <ChatVideoPreview
                  uri={media.url}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.videoPlayOverlaySmall}>
                  <Ionicons name="play" size={16} color="#FFF" />
                </View>
              </View>
            ) : (
              <Image
                source={{ uri: media.url }}
                style={[
                  styles.gridImage,
                  mediaToRender.length === 2 && styles.gridImage2,
                  mediaToRender.length >= 3 && styles.gridImage3,
                ]}
                contentFit="cover"
                transition={120}
              />
            )}
          </Pressable>
        ))}
      </View>
    );
  };

  const onGestureEvent = Animated.event<any>(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX } = event.nativeEvent;
      const threshold = 60;

      if ((!mine && translationX > threshold) || (mine && translationX < -threshold)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSwipeReply(item);
      }

      Animated.spring(translateX, {
        toValue: 0,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  };

  const isImageOnly = showImage && (!item.content || item.content === 'Photo' || item.content === `Sent ${attachments.length} photos`);

  return (
    <View style={styles.container}>
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={mine ? [-20, 0] : [0, 20]}
        failOffsetY={[-20, 20]}
      >
        <Animated.View style={[
          styles.msgRow, 
          mine ? styles.alignEnd : styles.alignStart,
          { transform: [{ translateX: translateX.interpolate({
            inputRange: mine ? [-100, 0] : [0, 100],
            outputRange: mine ? [-60, 0] : [0, 60],
            extrapolate: 'clamp'
          }) }] }
        ]}>
          {!mine ? (
            <Image source={{ uri: peerAvatar }} style={styles.msgAvatar} contentFit="cover" />
          ) : (
            <View style={styles.msgAvatarSpacer} />
          )}
          <View style={[styles.msgStack, { alignItems: mine ? 'flex-end' : 'flex-start' }, hasReactions && { marginBottom: 20 }]}>
            {isSticker ? (
              <View style={{ width: 60, height: 60 }}>
                <LottieEmoji 
                  source={{ uri: mediaUri }} 
                  autoPlay={item.isNew} 
                  onPress={handlePress}
                  onLongPress={() => onLongPress(item)}
                  style={{ width: '100%', height: '100%' }} 
                />
                {hasReactions ? (
                  <View style={[styles.reactionRow, { bottom: -8, right: 0 }]}>
                    {Object.entries(reactionCounts).map(([emoji, n]) => (
                      <View
                        key={emoji}
                        style={[styles.reactionChip, mine && styles.reactionChipMine]}
                      >
                        <Text style={[styles.reactionChipText, mine && styles.reactionChipTextMine]}>
                          {emoji}
                          {n > 1 ? ` ${n}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (isShotShare || isPostShare) ? (
              <View style={styles.shotShareContainer}>
                <Pressable
                  onPress={handlePress}
                  onLongPress={() => onLongPress(item)}
                  style={styles.shotShareBubble}
                >
                  <Image
                    source={{ uri: mediaUri }}
                    style={styles.shotShareThumbnail}
                    contentFit="cover"
                    transition={200}
                  />
                  <View style={styles.shotShareOverlay}>
                    <View style={styles.shotShareHeader}>
                      <Image 
                        source={{ uri: resolveAvatarUrl(item.author_avatar, item.author_username) }} 
                        style={styles.shotShareAvatar}
                      />
                      <Text style={styles.shotShareUser}>{item.author_username || 'user'}</Text>
                    </View>
                  </View>
                </Pressable>
                {hasReactions ? (
                  <View style={[styles.reactionRow, { bottom: -10, right: 0 }]}>
                    {Object.entries(reactionCounts).map(([emoji, n]) => (
                      <View
                        key={emoji}
                        style={[styles.reactionChip, mine && styles.reactionChipMine]}
                      >
                        <Text style={[styles.reactionChipText, mine && styles.reactionChipTextMine]}>
                          {emoji}
                          {n > 1 ? ` ${n}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : isImageOnly ? (
              <View style={styles.directImageContainer}>
                {item.is_pinned ? (
                  <View style={styles.pinTagDirect}>
                    <Ionicons name="pin" size={12} color={COLORS.secondary} />
                    <Text style={styles.pinTagTextDirect}>Pinned</Text>
                  </View>
                ) : null}
                {renderImages()}
                {item.status === 'sending' && (
                  <View style={styles.sendingIndicatorDirect}>
                    <Text style={styles.sendingTextDirect}>Sending</Text>
                  </View>
                )}
                {item.status === 'error' && (
                  <TouchableOpacity 
                    style={styles.retryBtnDirect} 
                    onPress={() => onRetry?.(item)}
                  >
                    <Ionicons name="refresh-circle" size={24} color="#FF3B30" />
                    <Text style={styles.retryTextDirect}>Retry</Text>
                  </TouchableOpacity>
                )}
                {hasReactions ? (
                  <View style={[styles.reactionRow, { bottom: -10, right: 0 }]}>
                    {Object.entries(reactionCounts).map(([emoji, n]) => (
                      <View
                        key={emoji}
                        style={[styles.reactionChip, mine && styles.reactionChipMine]}
                      >
                        <Text style={[styles.reactionChipText, mine && styles.reactionChipTextMine]}>
                          {emoji}
                          {n > 1 ? ` ${n}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <Pressable
                onPress={handlePress}
                onLongPress={() => onLongPress(item)}
                delayLongPress={360}
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : [styles.bubbleOther, { backgroundColor: otherBubbleBg }],
                  styles.bubbleShadow,
                ]}
              >
                {item.is_pinned ? (
                  <View style={styles.pinTag}>
                    <Ionicons name="pin" size={12} color={mine ? 'rgba(255,255,255,0.85)' : COLORS.secondary} />
                    <Text style={[styles.pinTagText, mine && styles.pinTagTextMine]}>Pinned</Text>
                  </View>
                ) : null}
                {renderImages()}
                {item.status === 'sending' && (
                  <View style={styles.sendingOverlay}>
                    <Text style={styles.sendingText}>Sending</Text>
                  </View>
                )}
                {item.status === 'error' && (
                  <TouchableOpacity 
                    style={styles.retryBtn} 
                    onPress={() => onRetry?.(item)}
                  >
                    <Ionicons name="refresh-circle" size={20} color="#FF3B30" />
                    <Text style={styles.retryText}>Retry sending</Text>
                  </TouchableOpacity>
                )}
                {item.content && !isShotShare && !isPostShare && (
                  <View style={[styles.bubbleContentWrap, showImage && { marginTop: 8 }]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                      {item.content}
                    </Text>
                  </View>
                )}
                {hasReactions ? (
                  <View style={styles.reactionRow}>
                    {Object.entries(reactionCounts).map(([emoji, n]) => (
                      <View
                        key={emoji}
                        style={[styles.reactionChip, mine && styles.reactionChipMine]}
                      >
                        <Text style={[styles.reactionChipText, mine && styles.reactionChipTextMine]}>
                          {emoji}
                          {n > 1 ? ` ${n}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            )}
            {mine && index === 0 && (item.status === 'read' || (item.read_by && item.read_by.length > 0)) && (
              <Text style={styles.msgStatusText}>Seen</Text>
            )}
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%' },
  msgRow: {
    marginVertical: 5,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  alignStart: { justifyContent: 'flex-start' },
  alignEnd: { justifyContent: 'flex-end' },
  msgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 6,
    marginBottom: 22,
    backgroundColor: COLORS.border,
  },
  msgAvatarSpacer: { width: 36 },
  msgStack: { maxWidth: '85%' },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bubbleShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  bubbleMine: { backgroundColor: COLORS.primary },
  bubbleOther: { backgroundColor: COLORS.border },
  pinTag: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pinTagText: { marginLeft: 4, fontSize: 12, fontWeight: '700', color: COLORS.secondary },
  pinTagTextMine: { color: 'rgba(255,255,255,0.9)' },
  bubbleText: { fontSize: 17, color: COLORS.text, lineHeight: 22 },
  bubbleTextMine: { color: '#fff' },
  deleted: { fontSize: 13, color: COLORS.subtitle, fontStyle: 'italic', textAlign: 'center', width: '100%' },
  shotShareContainer: {
    width: 175,
    height: 260,
    borderRadius: 16,
    overflow: 'visible',
  },
  shotShareBubble: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  shotShareThumbnail: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  shotShareOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shotShareHeader: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shotShareAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  shotShareUser: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  shotShareLabel: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  shotShareFooter: {
    marginTop: 4,
    paddingHorizontal: 8,
  },
  shotShareFooterText: {
    fontSize: 13,
    color: COLORS.text,
    fontStyle: 'italic',
  },
  shotShareFooterTextMine: {
    color: '#FFF',
  },
  directImageContainer: {
    padding: 0,
    borderRadius: 16,
    overflow: 'visible', // For reactions
  },
  pinTagDirect: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  pinTagTextDirect: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  mediaContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  sendingOverlay: {
    marginTop: 4,
    paddingHorizontal: 12,
  },
  sendingText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
  },
  sendingIndicatorDirect: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendingTextDirect: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  retryBtnDirect: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  retryTextDirect: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '700',
    marginLeft: 4,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
  },
  retryText: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '600',
    marginLeft: 4,
  },
  videoPlayOverlaySmall: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
  },
  chatImage: {
    width: scale(260),
    height: verticalScale(260),
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  imageGrid: {
    width: scale(260),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  gridImage: {
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  gridImage2: {
    width: 128,
    height: 128,
  },
  gridImage3: {
    width: 84,
    height: 84,
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    position: 'absolute',
    bottom: -16,
    right: 30, // 🚀 Shifted further left from 10
    backgroundColor: 'transparent',
  },
  reactionChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)', // 🚀 Slightly translucent background
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 4,
    marginBottom: 2,
    borderWidth: 1, // 🚀 Reduced border width
    borderColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1.5,
      },
      android: { 
        elevation: 2, // 🚀 Lower elevation for a flatter look
      },
    }),
  },
  reactionChipMine: { 
    backgroundColor: '#fff',
    borderColor: 'rgba(0,0,0,0.12)',
  },
  reactionChipText: { 
    fontSize: 14, 
    color: '#000',
    textAlign: 'center',
    includeFontPadding: false, // 🚀 Fix Android vertical clipping
    textAlignVertical: 'center',
  },
  reactionChipTextMine: { 
    color: '#000',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  bubbleContentWrap: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' },
  msgStatusText: { alignSelf: 'flex-end', fontSize: 11, color: COLORS.primary, marginTop: 4, marginRight: 4, fontWeight: '600' },
});
