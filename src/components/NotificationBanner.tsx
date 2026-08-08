import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, TouchableOpacity, Dimensions, Platform, TextInput, KeyboardAvoidingView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { resolveMediaUrl, resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useRouter } from 'expo-router';
import { socketService } from '../lib/socket';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';


interface NotificationBannerProps {
  notification: any;
  onDismiss: () => void;
}

export const NotificationBanner = ({ notification, onDismiss }: NotificationBannerProps) => {
  const slideAnim = useRef(new Animated.Value(-150)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current; // For expanding actions
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isRead, setIsRead] = useState(false);
  
  const router = useSafeRouter();

  const type = notification.data?.type || notification.type || 'like';
  const isMessage = type === 'message';
  const duration = isMessage ? 6000 : 4000;
  const timerRef = useRef<any>(null);

  const data = notification.data || notification;
  const conversationId = data.conversationId || notification.conversation_id;
  const messageId = data.messageId || notification._id;
  const senderId = data.recipientId || notification.sender_id?._id || notification.sender_id;

  useEffect(() => {
    // 🎭 INITIAL ANIMATION (Slide down + Fade in)
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();

    // 🕒 AUTO DISMISS TIMER
    startTimer();

    return () => stopTimer();
  }, [slideAnim]);

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dismiss();
    }, duration);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -150,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => onDismiss());
  };

  const toggleExpand = () => {
    const toValue = isExpanded ? 0 : 1;
    setIsExpanded(!isExpanded);
    
    if (!isExpanded) {
      stopTimer(); // Don't dismiss if user is interacting
    } else {
      startTimer(); // Resume timer if collapsed
    }

    Animated.spring(expandAnim, {
      toValue,
      useNativeDriver: false, // height/flex cannot use native driver
      tension: 40,
      friction: 8
    }).start();
  };

  const handleReply = () => {
    if (!replyText.trim()) return;

    
    socketService.sendMessage({
      chatId: conversationId,
      recipientId: senderId,
      content: replyText,
    });

    setReplyText('');
    setIsRead(true);
    
    // Quick success animation then dismiss
    setTimeout(dismiss, 800);
  };

  const handleMarkAsRead = () => {
    if (isMessage && conversationId) {
      socketService.markRead({
        chatId: conversationId,
        messageIds: messageId ? [messageId] : undefined,
        status: 'read'
      });
      setIsRead(true);
      setTimeout(dismiss, 1000);
    }
  };

  const handleBannerPress = () => {
    if (isExpanded) return; // Ignore if interacting with input
    
    const url = data.url;
    if (isMessage && url) {
      router.push(url as any);
    } else if (data.postId || notification.post?.id) {
      const postId = data.postId || notification.post?.id;
      router.push(`/post/${postId}`);
    }
    dismiss();
  };

  const actor = notification.actor || notification.sender || notification.data || {};
  const actorName = actor.full_name || actor.username || 'Someone';
  const actorAvatar = resolveAvatarUrl(actor.avatar_url, actor.username);
  
  const content = notification.content || data.content || (isMessage ? 'Sent a message' : 'Interacted with your profile');

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View 
        style={[
          styles.banner, 
          isRead && styles.isReadBanner
        ]} 
      >
        <TouchableOpacity 
          activeOpacity={0.85}
          onPress={handleBannerPress}
          style={styles.mainContent}
        >
          <View style={styles.avatarContainer}>
            <Image source={{ uri: actorAvatar }} style={styles.avatar} />
            <View style={[styles.typeBadge, { backgroundColor: isMessage ? '#4CAF50' : COLORS.primary }]}>
              <Ionicons 
                name={isMessage ? "mail" : "heart"} 
                size={10} 
                color="#fff" 
              />
            </View>
          </View>
          
          <View style={styles.textContent}>
            <Text style={styles.senderName} numberOfLines={1}>{actorName}</Text>
            <Text style={styles.messagePreview} numberOfLines={isExpanded ? 3 : 1}>{content}</Text>
          </View>

          {isMessage && !isExpanded && (
            <TouchableOpacity onPress={toggleExpand} style={styles.actionIcon}>
              <Ionicons name="chevron-down" size={20} color={COLORS.subtitle} />
            </TouchableOpacity>
          )}

          {!isExpanded && (
            <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
              <Ionicons name="close-circle-sharp" size={24} color={COLORS.subtitle} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* 🚀 EXPANDABLE INTERACTIONS (Reply / Mark as Read) */}
        {isMessage && (
          <Animated.View 
            style={[
              styles.actionsContainer,
              {
                maxHeight: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 150]
                }),
                opacity: expandAnim,
                marginTop: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 12]
                }),
                paddingBottom: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 8]
                })
              }
            ]}
          >
            <View style={styles.inputRow}>
              <TextInput
                style={styles.replyInput}
                placeholder="Type your reply..."
                placeholderTextColor={COLORS.subtitle}
                value={replyText}
                onChangeText={setReplyText}
                autoFocus={isExpanded}
                onFocus={stopTimer}
              />
              <TouchableOpacity 
                style={[styles.sendBtn, !replyText.trim() && styles.disabledSend]} 
                onPress={handleReply}
                disabled={!replyText.trim()}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.bottomButtons}>
              <TouchableOpacity style={styles.subActionBtn} onPress={handleMarkAsRead}>
                <Ionicons name={isRead ? "checkmark-done" : "checkmark"} size={16} color={isRead ? "#4CAF50" : COLORS.subtitle} />
                <Text style={[styles.subActionText, isRead && { color: "#4CAF50" }]}>
                  {isRead ? 'Marked as Read' : 'Read Now'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.subActionBtn} onPress={toggleExpand}>
                <Text style={styles.subActionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 54 : 15,
  },
  banner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  isReadBanner: {
    backgroundColor: '#F8F9FA',
    borderColor: 'rgba(76, 175, 80, 0.2)',
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  typeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  textContent: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  senderName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  messagePreview: {
    fontSize: 14,
    color: '#666',
    marginTop: 1,
    lineHeight: 18,
  },
  actionIcon: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginLeft: 8,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  actionsContainer: {
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingLeft: 16,
    paddingRight: 6,
    height: 44,
  },
  replyInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    height: '100%',
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSend: {
    backgroundColor: '#D1D5DB',
  },
  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 10,
  },
  subActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  subActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.subtitle,
    marginLeft: 6,
  },
});
