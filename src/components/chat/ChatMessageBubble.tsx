import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { scale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';

export interface ChatMessageBubbleProps {
  message: any;
  currentUserId: string;
  isOwn: boolean;
  onLongPress: (message: any, pageX?: number, pageY?: number) => void;
  onMediaPress?: (mediaUrl: string, mediaType: string) => void;
  styles?: any;
  COLORS: any;
}

const ChatMessageBubbleBase: React.FC<ChatMessageBubbleProps> = ({
  message,
  currentUserId,
  isOwn,
  onLongPress,
  onMediaPress,
  COLORS,
}) => {
  // Track component render count in PerformanceEngine
  if (__DEV__) {
    performanceEngine.incrementRender('ChatMessageBubble');
  }

  const mediaUrl = message.media_url || message.mediaUrl;
  const mediaType = message.media_type || message.mediaType || (mediaUrl?.match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image');
  const reactions = message.reactions || [];

  const handlePress = (e: any) => {
    if (onLongPress) {
      const pageX = e.nativeEvent?.pageX || 0;
      const pageY = e.nativeEvent?.pageY || 0;
      onLongPress(message, pageX, pageY);
    }
  };

  return (
    <Pressable
      onLongPress={handlePress}
      delayLongPress={200}
      style={[
        bubbleStyles.bubbleContainer,
        isOwn ? bubbleStyles.ownContainer : bubbleStyles.otherContainer,
      ]}
    >
      <View
        style={[
          bubbleStyles.bubbleBox,
          isOwn ? { backgroundColor: COLORS.primary } : { backgroundColor: COLORS.surface || '#262626' },
        ]}
      >
        {/* Media attachment */}
        {!!mediaUrl && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onMediaPress && onMediaPress(mediaUrl, mediaType)}
            style={bubbleStyles.mediaWrapper}
          >
            <Image
              source={{ uri: resolveMediaUrl(mediaUrl) }}
              style={bubbleStyles.mediaImage}
              resizeMode="cover"
            />
            {mediaType === 'video' && (
              <View style={bubbleStyles.videoOverlay}>
                <Ionicons name="play-circle" size={36} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Text Content */}
        {!!message.content && (
          <Text
            style={[
              bubbleStyles.messageText,
              isOwn ? { color: '#FFF' } : { color: COLORS.text || '#FFF' },
            ]}
          >
            {message.content}
          </Text>
        )}

        {/* Footer: Time + Status Icon + Edited badge */}
        <View style={bubbleStyles.footerRow}>
          {message.is_edited && (
            <Text style={bubbleStyles.metaText}>edited • </Text>
          )}
          <Text style={bubbleStyles.metaText}>
            {message.created_at
              ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''}
          </Text>

          {isOwn && (
            <View style={{ marginLeft: 4 }}>
              {message.status === 'sending' ? (
                <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.7)" />
              ) : message.status === 'read' ? (
                <Ionicons name="checkmark-done" size={14} color="#38BDF8" />
              ) : message.status === 'delivered' ? (
                <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" />
              ) : (
                <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />
              )}
            </View>
          )}
        </View>

        {/* Reactions Pill */}
        {Array.isArray(reactions) && reactions.length > 0 && (
          <View style={bubbleStyles.reactionsBadge}>
            <Text style={bubbleStyles.reactionsText}>
              {reactions.map((r: any) => (typeof r === 'string' ? r : r.emoji)).join(' ')}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

// 🛡️ Custom comparative equality function to prevent unnecessary re-renders
const arePropsEqual = (prev: ChatMessageBubbleProps, next: ChatMessageBubbleProps): boolean => {
  const pMsg = prev.message;
  const nMsg = next.message;

  if (!pMsg || !nMsg) return false;

  const sameId = (pMsg._id || pMsg.id) === (nMsg._id || nMsg.id);
  const sameStatus = pMsg.status === nMsg.status;
  const sameContent = pMsg.content === nMsg.content;
  const sameEdited = pMsg.is_edited === nMsg.is_edited;
  const sameMedia = (pMsg.media_url || pMsg.mediaUrl) === (nMsg.media_url || nMsg.mediaUrl);

  // Compare reactions
  const pReactions = JSON.stringify(pMsg.reactions || []);
  const nReactions = JSON.stringify(nMsg.reactions || []);
  const sameReactions = pReactions === nReactions;

  return sameId && sameStatus && sameContent && sameEdited && sameMedia && sameReactions;
};

export const ChatMessageBubble = React.memo(ChatMessageBubbleBase, arePropsEqual);

const bubbleStyles = StyleSheet.create({
  bubbleContainer: {
    marginVertical: 4,
    paddingHorizontal: 12,
    flexDirection: 'row',
  },
  ownContainer: {
    justifyContent: 'flex-end',
  },
  otherContainer: {
    justifyContent: 'flex-start',
  },
  bubbleBox: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'relative',
  },
  mediaWrapper: {
    width: 220,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
    backgroundColor: '#000',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  messageText: {
    fontSize: moderateFont(14),
    lineHeight: moderateFont(19),
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
  },
  metaText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  reactionsBadge: {
    position: 'absolute',
    bottom: -10,
    right: 8,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  reactionsText: {
    fontSize: 11,
  },
});
