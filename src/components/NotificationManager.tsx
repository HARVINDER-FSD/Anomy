import React, { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, View, Animated, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageCircleDashed } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { socketService } from '../lib/socket';
import { useRouter, usePathname } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useNotificationStore } from '../store/notificationStore';
import * as FileSystem from 'expo-file-system';
import { resolveAvatarUrl, resolveMediaUrl } from '../utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';


// Helper to check if running in Expo Go
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const resolvePostThumbnail = (url: string | undefined | null) => {
  if (!url) return '';
  let resolved = resolveMediaUrl(url);
  if (!resolved) return '';
  if (resolved.match(/\.(mp4|mov|mkv|webm|avi)(\?.*)?$/i) || resolved.includes('/video/upload/')) {
    if (resolved.includes('cloudinary.com')) {
      return resolved.replace('/video/upload/', '/video/upload/f_jpg,so_0,q_auto,w_300/').replace(/\.(mp4|mov|mkv|webm|avi)(\?.*)?$/i, '.jpg');
    } else {
      return resolved.replace(/\.(mp4|mov|mkv|webm|avi)(\?.*)?$/i, '.jpg');
    }
  }
  return resolved;
};

// Configure how notifications should appear when the app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    } as any;
  },
});

export async function clearConversationNotifications(conversationId: string) {
  if (!conversationId || conversationId === 'new') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const notif of presented) {
      const data: any = notif.request?.content?.data;
      const notifConvId = (data?.conversationId || data?.chatId)?.toString();
      if (notifConvId === conversationId.toString()) {
        await Notifications.dismissNotificationAsync(notif.request.identifier);
      }
    }
  } catch (e) {
  }
}

export const NotificationManager = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuthStore();
  const router = useSafeRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const insets = useSafeAreaInsets();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const { incrementUnreadCount, incrementUnreadNotificationsCount, setUnreadMessagesCount, addNotification } = useNotificationStore();

  // In-App Toast Banner Animation & State
  const [activeBanner, setActiveBanner] = useState<any | null>(null);
  const bannerAnim = useRef(new Animated.Value(-140)).current;
  const bannerTimer = useRef<any>(null);

  const showBanner = (notifData: any) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setActiveBanner(notifData);
    bannerAnim.setValue(-140);

    Animated.spring(bannerAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    bannerTimer.current = setTimeout(() => {
      hideBanner();
    }, 4500);
  };

  const hideBanner = () => {
    Animated.timing(bannerAnim, {
      toValue: -150,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setActiveBanner(null);
    });
  };

  useEffect(() => {
    if (user) {
      Notifications.setNotificationCategoryAsync('message', [
        {
          identifier: 'reply',
          buttonTitle: 'Reply',
          options: {
            opensAppToForeground: false,
          },
          textInput: {
            placeholder: 'Type your message...',
            submitButtonTitle: 'Send'
          }
        },
        {
          identifier: 'read',
          buttonTitle: 'Mark as Read',
          options: {
            opensAppToForeground: false,
          },
        },
      ]);

      if (!isExpoGo) {
        registerForPushNotificationsAsync().then(token => {
          if (token) {
            apiClient.post('/push/token', {
              pushToken: token,
              platform: Platform.OS
            }).catch(() => {});
          }
        });
      }

      const handleNewMessage = (message: any) => {
        const senderId = message.sender_id?._id || message.sender_id;
        const isFromMe = senderId === user?.id;
        const convId = message.conversation_id?.toString?.() || message.conversation_id;
        const currentPath = pathnameRef.current || '';
        const inThisChat =
          typeof convId === 'string' &&
          currentPath.includes('/chat/') &&
          currentPath.includes(convId);

        if (!isFromMe && !inThisChat) {
          incrementUnreadCount();

          const sender = message.sender || message.sender_id || {};
          const senderName = sender.full_name || sender.username || 'New Message';
          const bodyText = message.content?.trim() || (message.message_type === 'image' ? 'Sent an image' : message.message_type === 'video' ? 'Sent a video' : message.message_type === 'sticker' ? 'Sent a sticker' : 'Sent a message');

          (Notifications as any).scheduleNotificationAsync({
            content: {
              title: senderName,
              body: bodyText,
              categoryIdentifier: 'message',
              data: { 
                type: 'message', 
                conversationId: message.conversation_id,
                senderId: senderId,
                messageId: message._id,
                url: `/chat/${message.conversation_id}?recipientId=${encodeURIComponent(String(senderId))}`
              },
            },
            trigger: null,
          });
          
          incrementUnreadCount();
        }
      };

      const handleNewNotification = (notif: any) => {
        if (notif.type !== 'message') {
          const wasAdded = useNotificationStore.getState().addNotification(notif);
          if (wasAdded === false) {
            return;
          }

          let title = notif.title || 'anufi';
          let body = notif.content || '';
          let icon = '??';
          let routeUrl = '/notifications';

          switch (notif.type) {
            case 'follow':
              icon = '??';
              title = title || 'New Follower';
              routeUrl = notif.data?.senderUsername ? `/user/${notif.data.senderUsername}` : '/notifications';
              break;
            case 'like':
            case 'reel_like':
            case 'story_like':
              icon = '??';
              title = title || 'New Like';
              break;
            case 'comment':
            case 'reel_comment':
              icon = '??';
              title = title || 'New Comment';
              break;
            case 'comment_reply':
              icon = '??';
              title = title || 'Comment Reply';
              break;
            case 'dm':
              icon = '??';
              title = title || 'New Message';
              routeUrl = notif.data?.conversationId ? `/chat/${notif.data.conversationId}` : '/(tabs)/messages';
              break;
            case 'story_reaction':
              icon = '??';
              title = title || 'Story Reaction';
              break;
            case 'story_reply':
              icon = '??';
              title = title || 'Story Reply';
              break;
            case 'mention':
            case 'tag':
              icon = '???';
              title = title || 'Mentioned You';
              break;
            case 'post_share':
              icon = '??';
              title = title || 'Shared Post';
              break;
            case 'security':
              icon = '??';
              title = title || 'Security Alert';
              break;
          }

          Notifications.scheduleNotificationAsync({
            content: {
              title: `${icon} ${title}`,
              body,
              data: {
                ...notif.data,
                type: notif.type,
                url: routeUrl,
              },
            },
            trigger: null,
          });

          // Trigger Custom In-App Banner Toast with Post/Reel Thumbnail Card!
          const actorObj = notif.actor || notif.user || {};
          const actorAvatar = resolveAvatarUrl(actorObj.avatar_url || actorObj.avatar, actorObj.username);
          const rawThumb = notif.post?.image || notif.post?.image_url || notif.post?.thumbnail_url || notif.data?.postImage || notif.data?.thumbnailUrl || notif.data?.mediaUrl;

          showBanner({
            title: title,
            body: body,
            avatar: actorAvatar,
            thumbnail: rawThumb,
            type: notif.type,
            url: routeUrl,
            postId: notif.post?.id || notif.data?.postId || notif.data?.reelId,
          });

          incrementUnreadNotificationsCount();
        }
      };

      const intervalId = setInterval(() => {
        if (socketService.socket) {
          socketService.socket.off('message:new', handleNewMessage);
          socketService.socket.on('message:new', handleNewMessage);
          socketService.socket.off('notification:new', handleNewNotification);
          socketService.socket.on('notification:new', handleNewNotification);
          clearInterval(intervalId);
        }
      }, 1000);

      const cleanup = () => {
        clearInterval(intervalId);
        socketService.socket?.off('message:new', handleNewMessage);
        socketService.socket?.off('notification:new', handleNewNotification);
      };

      notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        const { actionIdentifier, notification } = response;
        const userText = (response as any).userText;
        const data: any = notification.request.content.data;

        if (actionIdentifier === 'reply' && userText && data.conversationId) {
          socketService.sendMessage({
            chatId: data.conversationId,
            recipientId: data.senderId,
            content: userText,
          });
        } else if (actionIdentifier === 'read' && data.conversationId) {
          socketService.markRead({
            chatId: data.conversationId,
            messageIds: data.messageId ? [data.messageId] : undefined,
            status: 'read'
          });
          Notifications.dismissNotificationAsync(notification.request.identifier);
        } else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER || actionIdentifier === 'reply') {
          if (data.url) {
            router.push(data.url as any);
          } else if (data.conversationId) {
            router.push(`/chat/${data.conversationId}` as any);
          } else {
            router.push('/(tabs)/messages' as any);
          }
        }
      });

      return () => {
        cleanup();
        if (notificationListener.current) notificationListener.current.remove();
        if (responseListener.current) responseListener.current.remove();
      };
    }
  }, [user?.id]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {/* ?? In-App Floating Notification Banner Toast */}
      {activeBanner && (
        <Animated.View
          style={{
            position: 'absolute',
            top: (insets?.top || 10) + 6,
            left: 12,
            right: 12,
            zIndex: 999999,
            transform: [{ translateY: bannerAnim }],
          }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              hideBanner();
              if (activeBanner.postId) {
                router.push(`/post/${activeBanner.postId}`);
              } else if (activeBanner.url) {
                router.push(activeBanner.url);
              } else {
                router.push('/notifications');
              }
            }}
            style={bannerStyles.card}
          >
            {/* Actor Avatar */}
            <Image
              source={{ uri: activeBanner.avatar }}
              style={bannerStyles.avatar}
            />

            {/* Body Content */}
            <View style={bannerStyles.contentWrapper}>
              <Text style={bannerStyles.title} numberOfLines={1}>
                {activeBanner.title}
              </Text>
              <Text style={bannerStyles.body} numberOfLines={2}>
                {activeBanner.body}
              </Text>
            </View>

            {/* Thumbnail Card on Right Corner (if post / reel / story) */}
            {!!activeBanner.thumbnail && (
              <View style={bannerStyles.thumbnailContainer}>
                <Image
                  source={{ uri: resolvePostThumbnail(activeBanner.thumbnail) }}
                  style={bannerStyles.thumbnail}
                  contentFit="cover"
                />
                <View style={bannerStyles.typeBadge}>
                  {activeBanner.type?.includes('comment') ? (
                    <MessageCircleDashed size={10} color="#FFF" />
                  ) : (
                    <MaterialCommunityIcons name="thumb-up" size={9} color="#FFF" />
                  )}
                </View>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const bannerStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  contentWrapper: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  body: {
    color: '#DDDDDD',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  thumbnailContainer: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  thumbnail: {
    width: 42,
    height: 42,
  },
  typeBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FF3040',
    width: 16,
    height: 16,
    borderTopLeftRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Helper function for exponential backoff retries
async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T | null> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      }
    }
  }
  return null;
}

async function registerForPushNotificationsAsync() {
  let token;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      }).catch(() => {});
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync().catch(() => ({ status: 'undetermined' }));
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync().catch(() => ({ status: 'denied' }));
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        return undefined;
      }

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      const result = await retryAsync(async () => Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null));
      if (result) {
        token = result.data;
      }
    }
  } catch (err) {
    // Safe fallback
  }

  return token;
}
