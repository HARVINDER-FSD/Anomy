import React, { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, View } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { socketService } from '../lib/socket';
import { useRouter, usePathname } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NotificationBanner } from './NotificationBanner';

// Helper to check if running in Expo Go
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Configure how notifications should appear when the app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    } as any; // 🛡️ Use any to bypass strict internal interface mismatches
  },
});

export const NotificationManager = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const [bannerNotification, setBannerNotification] = useState<any>(null);

  useEffect(() => {
    if (user) {
      // 🚀 Skip Push Token Registration in Expo Go SDK 53+ to avoid crashes
      if (!isExpoGo) {
        registerForPushNotificationsAsync().then(token => {
          if (token) {
            // Update push token on server
            apiClient.put('/users/profile', { pushToken: token }).catch(err => {
              console.error('[NotificationManager] Error updating push token:', err);
            });
          }
        });
      } else {
        console.log('[NotificationManager] Running in Expo Go. Remote push notifications are disabled (SDK 53+ restriction). Use a Development Build for full push support.');
      }

      // 1. Listen for Socket-based real-time messages (In-app banner logic)
      const handleNewMessage = (message: any) => {
        console.log('[NotificationManager] Socket message received:', message);
        
        const isFromMe = (message.sender_id?._id || message.sender_id) === user?.id;
        const isCurrentlyInThisChat = pathname.includes(`/chat/${message.conversation_id}`);
        
        if (!isFromMe) {
          // ✅ ACCURACY: Mark as 'delivered' immediately via socket so sender sees it
          socketService.markRead({ 
            chatId: message.conversation_id, 
            messageIds: [message._id], 
            status: 'delivered' 
          });

          if (!isCurrentlyInThisChat) {
            const senderName = message.sender_id?.full_name || message.sender_id?.username || 'New Message';
            
            Notifications.scheduleNotificationAsync({
              content: {
                title: senderName,
                body: message.content,
                categoryIdentifier: 'message',
                data: { 
                  type: 'message', 
                  conversationId: message.conversation_id,
                  messageId: message._id,
                  recipientId: message.sender_id?._id || message.sender_id,
                  username: message.sender_id?.username,
                  profileImage: message.sender_id?.avatar_url,
                  url: `/chat/${message.conversation_id}?recipientId=${message.sender_id?._id || message.sender_id}&username=${message.sender_id?.username}&profileImage=${encodeURIComponent(message.sender_id?.avatar_url || '')}`
                },
              },
              trigger: null,
            }).catch(err => {
              console.error('[NotificationManager] scheduleNotificationAsync failed:', err);
            });
          }
        }
      };

      // Safely attach listener, check if socket exists
      const intervalId = setInterval(() => {
        if (socketService.socket) {
          socketService.socket.off('message:new', handleNewMessage); // Avoid double listeners
          socketService.socket.on('message:new', handleNewMessage);
          clearInterval(intervalId);
        }
      }, 1000);

      const cleanup = () => {
        clearInterval(intervalId);
        socketService.socket?.off('message:new', handleNewMessage);
      };

      // 2. Listen for received foreground notifications
      notificationListener.current = Notifications.addNotificationReceivedListener((notification: any) => {
        console.log('[NotificationManager] Foreground notification:', notification);
        
        // Show custom banner for like notifications with post thumbnail
        const data = notification.request.content.data;
        if (data?.type === 'like' && data?.post) {
          setBannerNotification({
            actor: data.actor,
            post: data.post,
            data: data
          });
        }
      });

      // 3. Define Notification Categories (Actions)
      Notifications.setNotificationCategoryAsync('message', [
        {
          identifier: 'MARK_AS_READ',
          buttonTitle: 'Mark as Read',
          options: { opensAppToForeground: false },
        },
        {
          identifier: 'LIKE',
          buttonTitle: 'Like ❤️',
          options: { opensAppToForeground: false },
        },
        {
          identifier: 'REPLY',
          buttonTitle: 'Reply 💬',
          options: { opensAppToForeground: true },
        },
      ]);

      // 4. Listen for user interaction with notification (tapping it or clicking actions)
      responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const { actionIdentifier, notification } = response;
        const data = notification.request.content.data;
        
        console.log(`[NotificationManager] Action: ${actionIdentifier}, Data:`, data);
        
        if (actionIdentifier === 'MARK_AS_READ') {
          if (data?.conversationId) {
             socketService.markRead({ chatId: data.conversationId, status: 'read' });
             Notifications.dismissNotificationAsync(notification.request.identifier);
          }
        } else if (actionIdentifier === 'LIKE') {
          if (data?.messageId && data?.conversationId) {
             socketService.reactToMessage({ messageId: data.messageId, emoji: '❤️', chatId: data.conversationId });
             Notifications.dismissNotificationAsync(notification.request.identifier);
          }
        } else if (actionIdentifier === 'REPLY' || !actionIdentifier || actionIdentifier === 'expo.modules.notifications.actions.DEFAULT') {
           // Default tap or specific Reply tap
           if (data?.url) {
             router.push(data.url as any);
           } else if (data?.conversationId) {
             router.push(`/chat/${data.conversationId}` as any);
           }
        }
      });

      return () => {
        cleanup();
        if (notificationListener.current) {
          notificationListener.current.remove();
        }
        if (responseListener.current) {
          responseListener.current.remove();
        }
      };
    }
  }, [user, pathname]);

  return (
    <View style={{ flex: 1 }}>
      {bannerNotification && (
        <NotificationBanner
          notification={bannerNotification}
          onDismiss={() => setBannerNotification(null)}
        />
      )}
      {children}
    </View>
  );
};

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    try {
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('[NotificationManager] Push Token:', token);
    } catch (e) {
      console.error('[NotificationManager] Error fetching push token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
