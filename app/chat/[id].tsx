import { Socket } from 'socket.io-client';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Alert, Image, TouchableOpacity, Pressable, Modal, ActivityIndicator, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../../src/theme/colors';
import { VideoPlayer } from '../../src/components/chat/VideoPlayer';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { apiClient } from '../../src/api/client';
import LottieView from 'lottie-react-native';
import { ANIMATED_STICKERS } from '../../src/constants/animated-stickers';
import { getBaseUrl } from '../../src/api/config';
import { useAuthStore } from '../../src/store/authStore';
import { socketService } from '../../src/lib/socket';
import { useCall } from '../../src/context/CallContext';
import { ScrollView } from 'react-native-gesture-handler';
import ChatHeader from '../../src/components/chat/ChatHeader';
import ChatInputBar from '../../src/components/chat/ChatInputBar';
import { Gesture, GestureDetector, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
  withTiming,
  withRepeat
} from 'react-native-reanimated';

// Types Based on MongoDB Architecture
interface Reaction {
  user_id: string; // From backend schema
  emoji: string;
}

interface UserDetails {
  _id: string;
  username: string;
  fullName?: string;
  avatar_url?: string;
  is_online?: boolean;
}

interface Message {
  _id: string;
  conversation_id: string;
  sender_id: UserDetails;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'location' | 'file' | 'sticker';
  media_url?: string;
  is_deleted: boolean;
  deleted_for: string[];
  reactions: Record<string, string>;
  reply_to_id?: Message;
  is_edited: boolean;
  is_pinned: boolean;
  is_forwarded: boolean;
  created_at: string;
  status: 'sent' | 'delivered' | 'read';
  delivered_to?: Array<{ user_id: string }>;
  read_by?: Array<{ user_id: string }>;
  tempMessageId?: string; // Added for optimistic UI updates
}

const TypingBubble = ({ isAnonymousChat }: { isAnonymousChat: boolean }) => {
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
    <View style={styles.typingBubbleContainer}>
      <View style={[styles.typingBubble, { backgroundColor: isAnonymousChat ? '#222' : '#F2F2F7', flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }]}>
        <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#8E8E93' }, dotStyle1]} />
        <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#8E8E93' }, dotStyle2]} />
        <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#8E8E93' }, dotStyle3]} />
      </View>
    </View>
  );
};

export default function ChatRoomScreen() {
  const { id, recipientId, username, profileImage, isAnonymousChat: isAnonParam } = useLocalSearchParams();
  const router = useRouter();
  const colors = COLORS;
  const user = useAuthStore((state) => state.user);
  const updateBlockedUsers = useAuthStore((state) => state.updateBlockedUsers);

  const [messages, setMessages] = useState<Message[]>([]);
  const [recipient, setRecipient] = useState<UserDetails | null>({
    _id: recipientId as string,
    username: username as string,
    avatar_url: profileImage ? decodeURIComponent(profileImage as string) : undefined
  });

  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isSendingMedia, setIsSendingMedia] = useState(false);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<any>(null);
  const [selectedGalleryMedia, setSelectedGalleryMedia] = useState<{ url: string, type: string }[] | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryMode, setGalleryMode] = useState<'grid' | 'detail'>('grid');
  const flatListRef = useRef<FlatList>(null);
  const galleryRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef({ time: 0, id: '' });
  const { startCall } = useCall();

  const conversationId = id as string;

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

  const [isAnonymousChat, setIsAnonymousChat] = useState(isAnonParam === 'true');
  const [isSkipping, setIsSkipping] = useState(false);
  const [partnerUserId, setPartnerUserId] = useState<string | null>((recipientId as string) || null);

  const targetRecipientId = (partnerUserId || recipient?._id || recipientId) as string;
  const isBlocked = user?.blocked_users?.some(id => id.toString() === targetRecipientId?.toString());

  useEffect(() => {
    // Sync profile to get latest block list when entering chat
    const syncProfile = async () => {
      try {
        const res = await apiClient.get('/users/me');
        if (res.data && res.data.blocked_users) {
          const latestUser = useAuthStore.getState().user;
          if (latestUser) {
            useAuthStore.getState().setAuth({ ...latestUser, blocked_users: res.data.blocked_users }, useAuthStore.getState().token || '');
          }
        }
      } catch (e) {
        console.log('[ChatRoom] Profile sync failed:', e);
      }
    };
    syncProfile();
  }, []);

  useEffect(() => {
    if (targetRecipientId) {
      console.log(`[ChatRoom] Target: ${targetRecipientId}, isBlocked: ${isBlocked}, Blocked List:`, user?.blocked_users);
    }
  }, [targetRecipientId, isBlocked, user?.blocked_users]);

  // ─── HANDLERS DEFINED AT TOP LEVEL ──────────────────────────────────────

  const fetchConv = useCallback(async () => {
    if (conversationId === 'new') return;
    try {
      const res = await apiClient.get(`/chat/conversations/${conversationId}`);
      setIsAnonymousChat(res.data.is_anonymous || false);

      const currentUserId = user?.id || user?._id;
      const partnerParticipant = res.data.participants.find((p: any) => {
        const pUserId = p.user?._id || p.user;
        return pUserId && pUserId.toString() !== currentUserId?.toString();
      });

      const partner = partnerParticipant?.user;
      if (partner) {
        const pId = partner._id || partner;
        setPartnerUserId(pId.toString());
        if (res.data.is_anonymous && partner.anonymousPersona) {
          setRecipient({
            _id: pId.toString(),
            username: partner.anonymousPersona?.name || 'Anonymous Ghost',
            avatar_url: partner.anonymousPersona?.avatar || `https://ui-avatars.com/api/?name=Ghost&background=111&color=fff&size=128`
          });
        } else if (!res.data.is_anonymous) {
          // It's a normal chat, populate the recipient state from the conversation details
          setRecipient({
            _id: pId.toString(),
            username: partner.username,
            avatar_url: partner.avatar_url || partner.avatar || `https://ui-avatars.com/api/?name=${partner.username || 'User'}&background=random`,
            is_online: partner.is_online
          });
          if (partner.is_online === true) setIsOnline(true);
        }
      }
    } catch (err) { console.error(err); }
  }, [conversationId, user?.id, user?._id]);

  const fetchMessageHistory = useCallback(async () => {
    if (conversationId === 'new') return;
    try {
      const response = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
      if (response.data) {
        setMessages(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const fetchRecipientDetails = useCallback(async () => {
    // If we're in the Ghost Universe, strictly do NOT fetch and override with reality persona details!
    if (isAnonymousChat || isAnonParam === 'true') return;
    if (recipient?.username && recipient?.avatar_url) return;
    try {
      let rId = recipientId as string;
      const currentUserId = user?.id || user?._id;

      if (!rId && conversationId !== 'new') {
        const res = await apiClient.get(`/chat/conversations/${conversationId}`);
        const partnerParticipant = res.data.participants.find((p: any) => {
          const pUserId = p.user?._id || p.user;
          return pUserId && pUserId.toString() !== currentUserId?.toString();
        });
        if (partnerParticipant) {
          rId = (partnerParticipant.user?._id || partnerParticipant.user).toString();
        }
      }

      if (rId) {
        const userRes = await apiClient.get(`/users/${rId}`);
        setRecipient(userRes.data);
        // ✅ Also set isOnline from DB as initial value (socket will update it in real-time)
        if (userRes.data?.is_online === true) {
          setIsOnline(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch recipient details:', error);
    }
  }, [isAnonymousChat, isAnonParam, recipient?.username, recipient?.avatar_url, recipientId, conversationId, user?.id, user?._id]);

  const onMessageReceived = useCallback((message: Message) => {
    // 🛡️ SECURITY: Only process messages for the current conversation
    const msgConvId = message.conversation_id?.toString();
    const currentConvId = conversationId?.toString();

    if (msgConvId !== currentConvId) {
      console.log(`[onMessageReceived] Message belongs to different conversation (${msgConvId}), current: ${currentConvId}, ignoring.`);
      return;
    }

    console.log('[onMessageReceived] Message received:', message._id, 'tempId:', message.tempMessageId);

    setMessages(prev => {
      const incoming = { ...message, _id: message._id?.toString?.() || message._id };

      // 1. If this is a server confirmation for an optimistic message, replace it
      if (incoming.tempMessageId) {
        console.log(`[onMessageReceived] Replacing optimistic message with tempId: ${incoming.tempMessageId} with server ID: ${incoming._id}`);
        const exists = prev.some(m => m._id === incoming.tempMessageId);
        if (exists) {
          return prev.map(m => m._id === incoming.tempMessageId ? { ...incoming, _id: incoming._id } : m);
        }
        console.log(`[onMessageReceived] Optimistic message ${incoming.tempMessageId} not found in state, adding as new.`);
      }

      // 2. Check for duplicate server-side IDs (crucial for cross-device sync)
      const isDuplicate = prev.some(m => m._id?.toString() === incoming._id?.toString());
      if (isDuplicate) {
        console.log(`[onMessageReceived] Message with server ID ${incoming._id} already exists, skipping.`);
        return prev;
      }

      return [incoming, ...prev];
    });

    const isMe = (message.sender_id?._id || message.sender_id)?.toString() === (user?.id || user?._id)?.toString();
    if (!isMe) {
      // ✅ ACCURACY: Mark as 'read' AND 'delivered' immediately
      socketService.markRead({ chatId: conversationId, messageIds: [message._id?.toString?.() || message._id], status: 'delivered' });
      socketService.markRead({ chatId: conversationId, messageIds: [message._id?.toString?.() || message._id], status: 'read' });
    }
  }, [conversationId, user?.id, user?._id]);

  const onMessageDeleted = useCallback(({ messageId, type }: { messageId: string; type: 'me' | 'everyone' }) => {
    setMessages(prev => prev.filter(m => m._id !== messageId));
  }, []);

  const onMessageEdited = useCallback(({ messageId, content }: { messageId: string; content: string }) => {
    setMessages(prev => prev.map(m => m._id === messageId ? { ...m, content, is_edited: true } : m));
  }, []);

  const onReactionsUpdated = useCallback((data: { messageId: string, reactions: any }) => {
    setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, reactions: data.reactions } : m));
  }, []);

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

  const onStatusUpdated = useCallback(({ messageIds, status }: any) => {
    console.log(`[onStatusUpdated] Received status ${status} for ${messageIds.length} messages`);
    setMessages(prev => prev.map(m =>
      messageIds.some((id: string) => id.toString() === m._id.toString()) ? { ...m, status } : m
    ));
  }, []);

  const onChatIdAssigned = useCallback(({ oldId, newId }: { oldId: string; newId: string }) => {
    if (oldId === 'new' && conversationId === 'new') {
      console.log(`[onChatIdAssigned] Chat ID transitioned from new -> ${newId}`);
      router.setParams({ id: newId });
      // Update local message list to reflect the new conversation ID
      setMessages(prev => prev.map(m => ({ ...m, conversation_id: newId })));
    }
  }, [conversationId, router]);

  const onSocketError = useCallback((error: any) => {
    console.error('[Socket Error]', error);
    Alert.alert('Chat Error', error.message || 'An error occurred in the chat session.');
  }, []);

  const onMessagePinned = useCallback(({ messageId, isPinned }: any) => {
    setMessages(prev => prev.map(m => m._id === messageId ? { ...m, is_pinned: isPinned } : m));
  }, []);

  const onReconnect = useCallback(() => {
    socketService.joinRoom(conversationId);
    const tid = (recipientId as string) || recipient?._id;
    if (tid) socketService.socket?.emit('user:status', { targetUserId: tid });
  }, [conversationId, recipientId, recipient?._id]);

  // INITIALIZE SOCKET & FETCH HISTORY
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const currentSocket = socketService.socket;

    const token = useAuthStore.getState().token;
    if (token && !currentSocket?.connected) {
      socketService.connect(token);
    }

    // Always join the room, even if it's 'new' (server handles it)
    socketService.joinRoom(conversationId);

    if (conversationId !== 'new') {
      fetchConv();
      fetchMessageHistory();
      fetchRecipientDetails();
    } else {
      setLoading(false);
    }

    const targetId = (recipientId as string) || recipient?._id;
    if (targetId) {
      socketService.queryOnlineStatus(targetId);
    }

    const attachListeners = (s: Socket) => {
      if (!s) return;
      s.on('message:received', onMessageReceived);
      s.on('message:deleted', onMessageDeleted);
      s.on('message:edited', onMessageEdited);
      s.on('message:reactions_updated', onReactionsUpdated);
      s.on('chat:typing', onTyping);
      s.on('user:online', onUserOnline);
      s.on('user:offline', onUserOffline);
      s.on('user:status_result', onUserStatusResult);
      s.on('message:status_updated', onStatusUpdated);
      s.on('message:pinned', onMessagePinned);
      s.on('chat:id_assigned', onChatIdAssigned);
      s.on('error', onSocketError);
      s.on('connect', onReconnect);
    };

    const detachListeners = (s: Socket) => {
      if (!s) return;
      s.off('message:received', onMessageReceived);
      s.off('message:deleted', onMessageDeleted);
      s.off('message:edited', onMessageEdited);
      s.off('message:reactions_updated', onReactionsUpdated);
      s.off('chat:typing', onTyping);
      s.off('user:online', onUserOnline);
      s.off('user:offline', onUserOffline);
      s.off('user:status_result', onUserStatusResult);
      s.off('message:status_updated', onStatusUpdated);
      s.off('message:pinned', onMessagePinned);
      s.off('chat:id_assigned', onChatIdAssigned);
      s.off('error', onSocketError);
      s.off('connect', onReconnect);
    };

    if (currentSocket?.connected) {
      attachListeners(currentSocket);
    } else {
      const onFirstConnect = () => {
        attachListeners(socketService.socket!);
      };
      socketService.socket?.once('connect', onFirstConnect);
    }

    return () => {
      socketService.leaveRoom(conversationId);
      if (currentSocket) detachListeners(currentSocket);
    };
  }, [
    conversationId,
    user?.id,
    recipientId,
    recipient?._id,
    onMessageReceived,
    onMessageDeleted,
    onMessageEdited,
    onReactionsUpdated,
    onTyping,
    onUserOnline,
    onUserOffline,
    onUserStatusResult,
    onStatusUpdated,
    onMessagePinned,
    onChatIdAssigned,
    onSocketError,
    onReconnect
  ]);

  // ✅ ACCURACY: Mark as read every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!user || !conversationId || conversationId === 'new') return;

      console.log(`[ChatRoom] focused: Marking conversation ${conversationId} as read`);
      apiClient.post(`/chat/conversations/${conversationId}/read`)
        .then(() => {
          socketService.markRead({ chatId: conversationId, status: 'read' });
        })
        .catch((err: any) => console.error('[ChatRoom] Mark read error:', err));
    }, [conversationId, user?.id])
  );

  // UPLOAD MEDIA SYSTEM
  const getMediaThumbnail = (url: string, type: string) => {
    if (type !== 'video') return url;
    // Simple Cloudinary hack: replace extension with .jpg for video thumbnail
    return url.replace(/\.[^/.]+$/, ".jpg");
  };

  const handleVideoCall = () => {
    if (recipient?._id && recipient?.username) {
      startCall(recipient._id, recipient.username, true);
    }
  };

  const handleVoiceCall = () => {
    if (recipient?._id && recipient?.username) {
      startCall(recipient._id, recipient.username, false);
    }
  };

  const uploadToCloudinary = async (fileUri: string, resourceType: 'image' | 'video' = 'image'): Promise<string | null> => {
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

      // 3. Absolute direct upload to Cloudinary (No backend bottleneck)
      const uploadRes = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return uploadRes.data.secure_url;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
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
          allowsMultipleSelection: true, // 🚀 Multiple selection enabled
          selectionLimit: 10
        });

      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        setIsSendingMedia(true);
        const uploadedAttachments: Array<{ url: string, type: 'image' | 'video' }> = [];

        for (const asset of pickerResult.assets) {
          const fileUrl = await uploadToCloudinary(asset.uri, asset.type === 'video' ? 'video' : 'image');
          if (fileUrl) {
            uploadedAttachments.push({
              url: fileUrl,
              type: asset.type === 'video' ? 'video' : 'image'
            });
          }
        }

        if (uploadedAttachments.length > 0) {
          socketService.sendMessage({
            chatId: conversationId,
            recipientId: recipientId as string,
            content: uploadedAttachments.length > 1 ? `Sent ${uploadedAttachments.length} items` : (uploadedAttachments[0].type === 'video' ? 'Sent a video' : 'Sent an image'),
            type: uploadedAttachments.length > 1 ? 'image' : uploadedAttachments[0].type, // Fallback to 'image' type if multiple
            mediaUrl: uploadedAttachments[0].url, // First one for backward compatibility
            attachments: uploadedAttachments // 🚀 Full list
          });
        }
      }
    } catch (err: any) {
      console.error('[handleMediaPick] Error:', err);
      Alert.alert('Error', 'Could not open media library. Please check your permissions.');
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

      const fileUri = `${FileSystem.documentDirectory}${Date.now()}.${url.split('.').pop()}`;
      const downloadRes = await FileSystem.downloadAsync(url, fileUri);

      if (downloadRes.status === 200) {
        await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
        Alert.alert('Success', 'Media saved to gallery! ✅');
      } else {
        throw new Error('Download failed');
      }
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('Error', 'Could not download media. Please try again.');
    }
  };

  // VOICE RECORDING SYSTEM
  const startRecording = async () => {
    try {
      // 🛡️ SECURITY: Cleanup previous recording if any
      if (recording) {
        try {
          const status = await recording.getStatusAsync();
          if (status.canRecord) {
            await recording.stopAndUnloadAsync();
          }
        } catch (e) {
          console.log('[startRecording] Cleanup error:', e);
        }
        setRecording(null);
      }

      const { Audio } = require('expo-av');
      
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'AnuFy needs microphone permission to record voice messages.');
        return;
      }

      // Ensure audio mode is set before creating
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      setRecording(null);
      setIsRecording(false);
      Alert.alert('Recording Error', 'Could not start voice recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) {
      setIsRecording(false);
      return;
    }

    try {
      setIsRecording(false);
      const status = await recording.getStatusAsync();
      if (status.canRecord) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        if (uri) {
          sendVoiceMessage(uri);
        }
      } else {
        setRecording(null);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      setRecording(null);
    }
  };

  const sendVoiceMessage = async (uri: string) => {
    try {
      setIsSendingMedia(true);
      // 1. Get Signature/Config for audio
      const configRes = await apiClient.post('/upload', { folder: 'chat_audio' });
      const { cloudName, apiKey, timestamp, signature, publicId } = configRes.data;

      // 2. Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        type: 'audio/m4a',
        name: 'voice_message.m4a',
      } as any);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);
      formData.append('public_id', publicId);
      formData.append('resource_type', 'video'); // Cloudinary treats audio as video resource type

      const uploadRes = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (uploadRes.data.secure_url) {
        socketService.sendMessage({
          chatId: conversationId,
          recipientId: recipientId as string,
          content: 'Voice message',
          type: 'audio',
          mediaUrl: uploadRes.data.secure_url
        });
      }
    } catch (error) {
      console.error('Voice upload error:', error);
      Alert.alert('Error', 'Could not send voice message');
    } finally {
      setIsSendingMedia(false);
    }
  };

  // 1. MESSAGING SYSTEM (Send/Reply/Edit)
  const handleSendMessage = () => {
    if (!newMessage.trim() || !user) return;

    if (!socketService.socket?.connected) {
      // Try to reconnect on the spot
      const token = useAuthStore.getState().token;
      if (token) {
        socketService.connect(token);
        socketService.joinRoom(conversationId);
      }
      Alert.alert('Connecting...', 'Reconnecting to server. Please try again in a moment.');
      return;
    }

    if (editingMessage) {
      socketService.editMessage({ messageId: editingMessage._id, newContent: newMessage.trim(), chatId: conversationId });
      setEditingMessage(null);
    } else {
      console.log('[handleSendMessage] Creating optimistic message...');
      const tempMessageId = uuidv4();
      const now = new Date().toISOString();

      const content = newMessage.trim();

      // 🚀 Check if content is ONLY one of our animated stickers
      const stickerMatch = ANIMATED_STICKERS.find(s => s.emoji === content);
      const isSticker = !!stickerMatch;

      const optimisticMessage: Message = {
        _id: tempMessageId,
        conversation_id: conversationId,
        sender_id: {
          _id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
        },
        content: content,
        message_type: isSticker ? 'sticker' : 'text',
        media_url: isSticker ? stickerMatch.url : undefined,
        is_deleted: false,
        deleted_for: [],
        reactions: {},
        is_edited: false,
        is_pinned: false,
        is_forwarded: false,
        created_at: now,
        status: 'sent',
      };

      setMessages(prev => {
        const logMsg = {
          ...optimisticMessage,
          sender_id: {
            ...optimisticMessage.sender_id,
            avatar_url: 'Redacted' // Redacted for cleaner console
          }
        };
        console.log('[handleSendMessage] Adding optimistic message to state:', logMsg);
        return [optimisticMessage, ...prev];
      });
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

      const msgPayload = {
        chatId: conversationId,
        recipientId: recipientId as string,
        content: content,
        type: isSticker ? 'sticker' : 'text',
        mediaUrl: isSticker ? stickerMatch.url : undefined,
        replyTo: replyingTo?._id,
        tempMessageId: tempMessageId, // Pass temp ID to server
      };
      console.log('[handleSendMessage] Sending message payload to server:', msgPayload);
      socketService.sendMessage(msgPayload);
      setReplyingTo(null);
    }

    setNewMessage('');
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
    socketService.reactToMessage({ messageId: selectedMessage._id, emoji, chatId: conversationId });
    setSelectedMessage(null);
  };

  const handleDoubleTapLike = (messageId: string) => {
    socketService.reactToMessage({ messageId, emoji: '❤️', chatId: conversationId });
  };

  const handlePin = () => {
    if (!selectedMessage) return;
    socketService.pinMessage({ messageId: selectedMessage._id, chatId: conversationId, isPinned: !selectedMessage.is_pinned });
    setSelectedMessage(null);
  };

  const handleForward = () => {
    Alert.alert('Forward', 'Choose a conversation to forward this message to.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Select Chat', onPress: () => router.push('/chat' as any) }
    ]);
    setSelectedMessage(null);
  };

  // 3. ACTIONS & DELETIONS
  const handleDeleteMessage = (deleteType: 'me' | 'everyone') => {
    if (!selectedMessage) return;

    // OPTIMISTIC UPDATE: Update UI immediately
    const messageId = selectedMessage._id;
    setMessages(prev => {
      if (deleteType === 'everyone') {
        return prev.map(m => m._id === messageId ? { ...m, is_deleted: true } : m);
      } else {
        return prev.filter(m => m._id !== messageId);
      }
    });

    socketService.deleteMessage({ messageId, deleteType, chatId: conversationId });
    setSelectedMessage(null);
  };

  const handleCopy = () => {
    if (selectedMessage) {
      Alert.alert('Copied', selectedMessage.content);
      setSelectedMessage(null);
    }
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    setNewMessage('');
  };

  const handleEdit = () => {
    if (selectedMessage && selectedMessage.sender_id?._id === user?.id) {
      setEditingMessage(selectedMessage);
      setNewMessage(selectedMessage.content);
      setSelectedMessage(null);
    }
  };

  const handleUnblockUser = async () => {
    if (!targetRecipientId) return;

    setShowHeaderMenu(false);

    Alert.alert(
      'Unblock User',
      'Are you sure you want to unblock this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              const res = await apiClient.post(`/users/unblock-user`, { userId: targetRecipientId });
              // Update global auth store
              updateBlockedUsers(targetRecipientId, false);
              Alert.alert('Success', res.data.message);
            } catch (e) {
              console.error('Block toggle error:', e);
              Alert.alert('Error', 'Could not complete action.');
            }
          }
        }
      ]
    );
  };

  const handleBlockUser = async () => {
    if (!targetRecipientId) return;

    setShowHeaderMenu(false);

    Alert.alert(
      'Block User',
      'Are you sure you want to block this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiClient.post(`/users/block-user`, { userId: targetRecipientId });
              // Update global auth store
              updateBlockedUsers(targetRecipientId, true);
              Alert.alert('Success', res.data.message);
            } catch (e) {
              console.error('Block toggle error:', e);
              Alert.alert('Error', 'Could not complete action.');
            }
          }
        }
      ]
    );
  };

  const handleBlockToggle = async () => {
    if (isBlocked) {
      handleUnblockUser();
    } else {
      handleBlockUser();
    }
  };

  // UI RENDERING
  // MESSAGE ITEM COMPONENT (to handle Swipeable refs)
  const MessageItem = React.memo(({ item, isMe, isLatest, isLastOfGroup, isFirstOfGroup, onReply, onLongPress, onDoubleTap, onSingleTap, isJustAdded }: any) => {
    const swipeableRef = useRef<Swipeable>(null);
    const lottieRef = useRef<LottieView>(null);

    const renderReplyAction = () => (
      <View style={{ width: 60, height: '100%', backgroundColor: 'transparent' }} />
    );

    const animatedBubbleStyle = useAnimatedStyle(() => {
      return {
        transform: [{ translateX: swipeX.value }],
      };
    });

    const animatedTimeStyle = useAnimatedStyle(() => {
      const opacity = interpolate(swipeX.value, [0, -50], [0, 1], Extrapolate.CLAMP);
      const translateX = interpolate(swipeX.value, [0, -70], [70, 0], Extrapolate.CLAMP);
      return {
        opacity,
        transform: [{ translateX }],
      };
    });

    const handleTap = () => {
      if (lottieRef.current) {
        lottieRef.current.reset();
        // Give it a tiny moment to reset before playing again
        requestAnimationFrame(() => {
          lottieRef.current?.play();
        });
      }
      onSingleTap();
    };

    return (
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderReplyAction}
        friction={2}
        enableTrackpadTwoFingerGesture
        rightThreshold={40}
        onSwipeableWillOpen={(direction) => {
          if (direction === 'right') { // Swipe Left revealing Right actions
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onReply(item);
            setTimeout(() => swipeableRef.current?.close(), 0);
          }
        }}
        containerStyle={{ marginTop: isFirstOfGroup ? 16 : 2 }}
      >
        <Animated.View style={[styles.messageWrapper, animatedBubbleStyle]}>
          <View style={[styles.messageContainer, isMe ? styles.myMessageContainer : styles.theirMessageContainer]}>
            {!isMe && (
              <View style={{ width: 32, height: 32, marginRight: 10 }}>
                {isLastOfGroup && (
                  <Image
                    source={{ uri: item.sender_id?.avatar_url || `https://ui-avatars.com/api/?name=${recipient?.username}&background=random` }}
                    style={styles.avatar}
                  />
                )}
              </View>
            )}
            <View style={{ flex: 1, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              <View style={{ position: 'relative' }}>
                <Pressable
                  style={[
                    styles.bubble,
                    isMe ? styles.myBubble : styles.theirBubble,
                    (() => {
                      const isSticker = item.message_type === 'sticker' || (!item.is_deleted && !item.media_url && ANIMATED_STICKERS.find(s => s.emoji === item.content.trim()));
                      const isMedia = item.message_type === 'image' || item.message_type === 'video' || isSticker;

                      return {
                        backgroundColor: isMedia ? 'transparent' : (isMe ? colors.primary : (isAnonymousChat ? '#222' : '#F2F2F7')),
                        paddingHorizontal: isMedia ? 0 : 16,
                        paddingVertical: (isMedia || isSticker) ? 0 : 12,
                        overflow: 'visible',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minWidth: isSticker ? 55 : 0,
                        minHeight: isSticker ? 55 : 0
                      };
                    })(),
                    isLastOfGroup ? (isMe ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }) : { borderRadius: 22 }
                  ]}
                  onLongPress={onLongPress}
                  onPress={handleTap}
                >
                  {item.reply_to_id && (
                    <View style={[styles.replyQuote, { borderLeftColor: isMe ? '#fff' : colors.primary }]}>
                      <Text style={{ color: isMe ? '#f0f0f0' : colors.primary, fontSize: 12, fontWeight: 'bold' }}>
                        {item.reply_to_id.sender_id?.username}
                      </Text>
                      <Text numberOfLines={1} style={{ color: isMe ? '#e0e0e0' : colors.text, fontSize: 13 }}>
                        {item.reply_to_id.content}
                      </Text>
                    </View>
                  )}

                  {/* 🚀 Multi-Media Renderer (Grid/Single) */}
                  {(item.attachments && item.attachments.length > 0) ? (() => {
                    const attachments = item.attachments;
                    const count = attachments.length;

                    return (
                      <View style={{
                        width: 280,
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 2,
                        borderRadius: 18,
                        overflow: 'hidden'
                      }}>
                        {attachments.map((media: { url: string, type: string }, idx: number) => (
                          <TouchableOpacity
                            key={idx}
                            activeOpacity={0.9}
                            onPress={() => {
                              setSelectedGalleryMedia(attachments);
                              setGalleryIndex(idx);
                              setGalleryMode(attachments.length > 1 ? 'grid' : 'detail');
                            }}
                            style={{
                              width: count === 1 ? 280 : (count === 2 ? 139 : (count === 3 && idx === 0 ? 280 : (count === 3 ? 139 : 139))),
                              height: count === 1 ? 280 : 139,
                              position: 'relative'
                            }}
                          >
                            <Image
                              source={{ uri: getMediaThumbnail(media.url, media.type) }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                            {media.type === 'video' && (
                              <View style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -15, marginTop: -15, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="play" size={16} color="white" />
                              </View>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })() : (item.message_type === 'image' || item.message_type === 'video') && item.media_url && (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        setSelectedGalleryMedia([{ url: item.media_url!, type: item.message_type === 'video' ? 'video' : 'image' }]);
                        setGalleryIndex(0);
                        setGalleryMode('detail');
                      }}
                    >
                      <Image
                        source={{ uri: getMediaThumbnail(item.media_url, item.message_type!) }}
                        style={{ width: 240, height: 240, borderRadius: 18, marginBottom: 0 }}
                        resizeMode="cover"
                      />
                      {item.message_type === 'video' && (
                        <View style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="play" size={24} color="white" />
                        </View>
                      )}
                    </TouchableOpacity>
                  )}

                  {item.message_type === 'audio' && item.media_url && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                      <TouchableOpacity
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : colors.primary, justifyContent: 'center', alignItems: 'center' }}
                        onPress={async () => {
                          const { Audio } = require('expo-av');
                          const { sound } = await Audio.Sound.createAsync({ uri: item.media_url });
                          await sound.playAsync();
                        }}
                      >
                        <Ionicons name="play" size={20} color={isMe ? '#FFF' : '#FFF'} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, height: 2, backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)', borderRadius: 1 }} />
                      <Text style={{ color: isMe ? '#FFF' : colors.text, fontSize: 10 }}>Voice</Text>
                    </View>
                  )}

                  {item.message_type === 'sticker' && item.media_url ? (
                    <View 
                      pointerEvents="none"
                      style={{ width: 55, height: 55, justifyContent: 'center', alignItems: 'center', alignSelf: isMe ? 'flex-end' : 'flex-start', marginVertical: 5 }}
                    >
                      <LottieView
                        ref={lottieRef}
                        key={`lottie-${item._id}`}
                        source={{ uri: `${getBaseUrl(false)}${item.media_url}` }}
                        autoPlay={isJustAdded}
                        loop={false}
                        style={{ width: 55, height: 55 }}
                        resizeMode="contain"
                        hardwareAccelerationAndroid={false}
                      />
                    </View>
                  ) : (() => {
                    const trimmedContent = (item.content || '').trim();
                    const stickerMatch = !item.is_deleted && !item.media_url && ANIMATED_STICKERS.find(s => s.emoji === trimmedContent);
                    if (stickerMatch) {
                      return (
                        <View 
                          pointerEvents="none"
                          style={{ width: 55, height: 55, justifyContent: 'center', alignItems: 'center', alignSelf: isMe ? 'flex-end' : 'flex-start', marginVertical: 5 }}
                        >
                          <LottieView
                            ref={lottieRef}
                            key={`lottie-match-${item._id}`}
                            source={{ uri: `${getBaseUrl(false)}${stickerMatch.url}` }}
                            autoPlay={isJustAdded}
                            loop={false}
                            style={{ width: 55, height: 55 }}
                            resizeMode="contain"
                            hardwareAccelerationAndroid={false}
                          />
                        </View>
                      );
                    }
                    return (
                      <Text style={{ color: isMe ? '#fff' : colors.text, fontSize: 16 }}>
                        {item.is_deleted ? '' : item.content}
                      </Text>
                    );
                  })()}
                </Pressable>

                <View style={[styles.metaData, isMe ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                  {item.is_edited && <Text style={styles.metaText}>edited</Text>}
                  {isMe && isLastOfGroup && (
                    <View style={styles.statusContainer}>
                      <Text style={[
                        styles.metaText, 
                        item.status === 'read' ? { color: COLORS.secondary, fontWeight: '700' } : { color: '#8E8E93' }
                      ]}>
                        {item.status === 'read' ? 'Seen' : (item.status === 'delivered' ? 'Delivered' : 'Sent')}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Reactions Floating Bubble - Modern Grouped UI */}
                {item.reactions && Object.keys(item.reactions).length > 0 && (() => {
                  const reactionsObj = typeof item.reactions === 'object' ? item.reactions : {};
                  const reactionEntries = Object.entries(reactionsObj as Record<string, string>);
                  const counts = reactionEntries.reduce((acc, [uid, emoji]) => {
                    acc[emoji] = (acc[emoji] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                  const myReaction = reactionsObj[user?.id || ''];

                  return (
                    <View style={[styles.reactionContainer, isMe ? { left: 0, bottom: -8 } : { right: 0, bottom: -8 }]}>
                      {Object.keys(counts).map((emoji, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.reactionText}>{emoji}</Text>
                          {Object.keys(counts).length === 1 && counts[emoji] > 1 && (
                            <Text style={styles.reactionCount}>{counts[emoji]}</Text>
                          )}
                        </View>
                      ))}
                      {Object.keys(counts).length > 1 && (
                        <Text style={styles.reactionCount}>{reactionEntries.length}</Text>
                      )}
                    </View>
                  );
                })()}
              </View>
            </View>
          </View>

          {/* Instagram Style Sliding Time */}
          <Animated.View style={[styles.slidingTimeContainer, animatedTimeStyle]}>
            <Text style={styles.slidingTimeText}>
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Animated.View>
        </Animated.View>
      </Swipeable>
    );
  });
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id?._id?.toString() === user?.id?.toString() || item.sender_id?.toString() === user?.id?.toString();

    const getSenderId = (msg: any) => msg?.sender_id?._id?.toString() || msg?.sender_id?.toString();
    const currentSenderId = getSenderId(item);

    const isFirstOfGroup = index === messages.length - 1 || getSenderId(messages[index + 1]) !== currentSenderId;
    const isLastOfGroup = index === 0 || getSenderId(messages[index - 1]) !== currentSenderId;

    if (item.deleted_for?.includes(user?.id || '')) {
      return null;
    }

    const handleSingleTap = () => {
      const now = Date.now();
      if (now - lastTapRef.current.time < 300 && lastTapRef.current.id === item._id) {
        handleDoubleTapLike(item._id);
      }
      lastTapRef.current = { time: now, id: item._id };
    };

    return (
      <MessageItem
        item={item}
        isMe={isMe}
        isLatest={index === 0}
        isLastOfGroup={isLastOfGroup}
        isFirstOfGroup={isFirstOfGroup}
        onReply={handleReply}
        onLongPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSelectedMessage(item);
        }}
        onSingleTap={handleSingleTap}
        isJustAdded={item.created_at && (new Date().getTime() - new Date(item.created_at).getTime() < 10000)} // 10 seconds threshold for "new"
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isAnonymousChat ? '#121212' : colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatHeader
        username={recipient?.username || username as string || (isAnonymousChat ? 'Unknown Spirit' : 'User')}
        profileImage={recipient?.avatar_url || (profileImage ? decodeURIComponent(profileImage as string) : undefined)}
        isTyping={false} // 🚀 Removed typing from header as requested
        isOnline={isOnline || recipient?.is_online || false}
        isAnonymousChat={isAnonymousChat}
        onBack={() => router.back()}
        onProfile={isAnonymousChat ? undefined : () => router.push(`/profile/${recipient?.username}` as any)}
        onVoiceCall={isAnonymousChat ? undefined : handleVoiceCall}
        onVideoCall={isAnonymousChat ? undefined : handleVideoCall}
        onMore={() => setShowHeaderMenu(true)}
      />


      {/* Anonymous Action Bar: Skip & Report */}
      {isAnonymousChat && (
        <View style={[styles.anonymousBanner, { justifyContent: 'space-between', paddingHorizontal: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="eye-off-outline" size={13} color="#555" />
            <Text style={[styles.anonymousBannerText, { color: '#555' }]}>Anonymous chat</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={async () => {
                if (!partnerUserId) return;
                Alert.alert(
                  'Report Ghost',
                  'Reporting will block this person and penalize their reputation.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Report',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await apiClient.post('/chat/anonymous/report', {
                            reportedUserId: partnerUserId,
                            conversationId,
                            reason: 'Inappropriate behavior'
                          });
                          Alert.alert('Reported', 'The user has been reported and blocked.');
                          router.back();
                        } catch (e) {
                          Alert.alert('Error', 'Could not submit report.');
                        }
                      }
                    }
                  ]
                );
              }}
            >
              <Text style={{ color: '#FF3B30', fontSize: 13, fontWeight: '600' }}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isSkipping}
              onPress={async () => {
                setIsSkipping(true);
                try {
                  const res = await apiClient.post('/chat/anonymous/skip', {
                    interests: ['general'],
                    currentConversationId: conversationId
                  });
                  if (res.data.status === 'matched' && res.data.conversationId) {
                    router.replace({
                      pathname: '/chat/[id]',
                      params: { id: res.data.conversationId, isAnonymousChat: 'true' }
                    } as any);
                  } else {
                    Alert.alert('Searching...', 'Waiting for a new Ghost. Check your Ghost chats!');
                    router.back();
                  }
                } catch (e) {
                  Alert.alert('Error', 'Could not find next Ghost.');
                } finally {
                  setIsSkipping(false);
                }
              }}
            >
              {isSkipping
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>Next ›</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

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

      {user?.isAnonymousMode && !isAnonymousChat && (
        <View style={styles.anonymousBanner}>
          <Ionicons name="eye-off" size={14} color={COLORS.white} />
          <Text style={styles.anonymousBannerText}>
            Sending as <Text style={{ fontWeight: '900' }}>{user?.anonymousPersona?.name}</Text> 👻
          </Text>
        </View>
      )}

      {/* Header More Menu Modal */}
      <Modal transparent visible={showHeaderMenu} animationType="fade" onRequestClose={() => setShowHeaderMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHeaderMenu(false)}>
          <View style={[styles.menuContent, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.menuItem} onPress={handleBlockToggle}>
              <Ionicons
                name={isBlocked ? "checkmark-circle-outline" : "ban-outline"}
                size={20}
                color={isBlocked ? colors.primary : "#FF3B30"}
              />
              <Text style={[styles.menuText, { color: isBlocked ? colors.primary : "#FF3B30" }]}>
                {isBlocked ? 'Unblock User' : 'Block User'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setShowHeaderMenu(false);
              if (!partnerUserId) return;
              Alert.alert('Report Ghost', 'Report this anonymous user?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Report',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await apiClient.post('/chat/anonymous/report', {
                        reportedUserId: partnerUserId,
                        conversationId,
                        reason: 'Reported via chat menu'
                      });
                      Alert.alert('Reported', 'User has been blocked and reported.');
                      router.back();
                    } catch { Alert.alert('Error', 'Could not submit report.'); }
                  }
                }
              ]);
            }}>
              <Ionicons name="flag-outline" size={20} color="#FF3B30" />
              <Text style={[styles.menuText, { color: '#FF3B30' }]}>Report Ghost</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={async () => {
              setShowHeaderMenu(false);
              try {
                await apiClient.delete(`/chat/conversations/${conversationId}/clear`);
                setMessages([]);
              } catch (error) {
                Alert.alert('Error', 'Could not clear chat');
              }
            }}>
              <Ionicons name="trash-outline" size={20} color={colors.text} />
              <Text style={styles.menuText}>Clear Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => setShowHeaderMenu(false)}>
              <Ionicons name="close-outline" size={20} color={colors.subtitle} />
              <Text style={[styles.menuText, { color: colors.subtitle }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <GestureDetector gesture={panGesture}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id?.toString?.() || item._id}
            inverted
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={isTyping ? (
              <TypingBubble isAnonymousChat={isAnonymousChat} />
            ) : null}
          />

          {/* Reply/Edit Indicator */}
          {(replyingTo || editingMessage) && (
            <View style={[styles.indicatorBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 13 }}>
                  {editingMessage ? 'Editing Message' : `Replying to ${replyingTo?.sender_id?.username}`}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14 }}>
                  {editingMessage ? editingMessage.content : replyingTo?.content}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setReplyingTo(null); setEditingMessage(null); setNewMessage(''); }}>
                <Text style={{ color: colors.text, padding: 8 }}>✖</Text>
              </TouchableOpacity>
            </View>
          )}

          <ChatInputBar
            value={newMessage}
            onChangeText={handleTextChange}
            onSend={handleSendMessage}
            onCamera={isAnonymousChat ? undefined : () => handleMediaPick(true)}
            onGallery={isAnonymousChat ? undefined : () => handleMediaPick(false)}
            onEmoji={() => setShowEmojiPicker(true)}
            onVoiceStart={startRecording}
            onVoiceEnd={stopRecording}
            isRecording={isRecording}
            isSending={isSendingMedia}
          />

          {isSendingMedia && (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: '#fff', marginTop: 10 }}>Uploading Media...</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </GestureDetector>

      {/* Message Options Modal */}
      {selectedMessage && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedMessage(null)}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              {/* Reactions Bar - Premium Style */}
              <View style={styles.reactionBarModern}>
                {['👍', '❤️', '😂', '😲', '😢', '😡'].map(emoji => (
                  <TouchableOpacity key={emoji} style={styles.reactionItemModern} onPress={() => handleReaction(emoji)}>
                    <Text style={{ fontSize: 26 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.actionList}>
                <TouchableOpacity style={styles.actionItem} onPress={() => handleReply(selectedMessage!)}>
                  <Ionicons name="arrow-undo-outline" size={20} color={colors.text} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>Reply</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={handleCopy}>
                  <Ionicons name="copy-outline" size={20} color={colors.text} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>Copy Text</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={handlePin}>
                  <Ionicons name={selectedMessage.is_pinned ? "pin" : "pin-outline"} size={20} color={colors.primary} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>{selectedMessage.is_pinned ? 'Unpin' : 'Pin'}</Text>
                </TouchableOpacity>

                {selectedMessage.sender_id?._id === user?.id && !selectedMessage.is_deleted && (
                  <>
                    <TouchableOpacity style={styles.actionItem} onPress={handleEdit}>
                      <Ionicons name="create-outline" size={20} color={colors.text} />
                      <Text style={[styles.actionLabel, { color: colors.text }]}>Edit Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionItem} onPress={() => handleDeleteMessage('everyone')}>
                      <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                      <Text style={[styles.actionLabel, { color: '#FF3B30' }]}>Delete for Everyone</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={[styles.actionItem, { borderBottomWidth: 0 }]} onPress={() => handleDeleteMessage('me')}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  <Text style={[styles.actionLabel, { color: '#FF3B30' }]}>Delete for Me</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Emoji Picker Modal */}
      {showEmojiPicker && (
        <Modal transparent visible animationType="slide" onRequestClose={() => setShowEmojiPicker(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowEmojiPicker(false)}>
            <View style={[styles.emojiSheet, { backgroundColor: colors.surface, zIndex: 999 }]}>
              <View style={styles.sheetHandle} />
              <View style={{ flex: 1, paddingBottom: 20, zIndex: 1000 }}>
                <FlatList
                  data={ANIMATED_STICKERS}
                  numColumns={5}
                  keyExtractor={(_, index) => index.toString()}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={20}
                  maxToRenderPerBatch={20}
                  windowSize={5}
                  renderItem={({ item: sticker, index }) => (
                    <TouchableOpacity
                      style={styles.emojiCell}
                      onPress={() => {
                        setNewMessage(prev => prev + sticker.emoji);
                        setShowEmojiPicker(false);
                      }}
                    >
                      <LottieView
                        key={`picker-lottie-${index}`}
                        source={{ uri: `${getBaseUrl(false)}${sticker.url}` }}
                        autoPlay
                        loop
                        style={{ width: 40, height: 40 }}
                        hardwareAccelerationAndroid={true}
                      />
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={{ paddingHorizontal: 10 }}
                />
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
                        <VideoPlayer uri={media.url} />
                      ) : (
                        <Image
                          source={{ uri: media.url }}
                          style={{ width: '100%', height: '80%' }}
                          resizeMode="contain"
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
                      <Image source={{ uri: getMediaThumbnail(m.url, m.type) }} style={styles.thumbImg} />
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

const styles = StyleSheet.create({
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
  messageWrapper: { flexDirection: 'row', width: '100%', alignItems: 'center', paddingVertical: 4, marginBottom: 2 },
  slidingTimeContainer: { width: 70, position: 'absolute', right: -70, alignItems: 'center', justifyContent: 'center' },
  slidingTimeText: { fontSize: 11, color: '#8E8E93', fontWeight: '500' },
  messageContainer: { flexDirection: 'row', alignItems: 'flex-end', width: '100%' },
  myMessageContainer: { justifyContent: 'flex-end' },
  theirMessageContainer: { justifyContent: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  bubble: { maxWidth: '82%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, position: 'relative' },
  myBubble: { borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4 },
  replyQuote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 8, opacity: 0.8 },
  metaData: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, gap: 4, paddingHorizontal: 4 },
  statusContainer: { marginLeft: 2 },
  metaText: { fontSize: 11, color: '#8E8E93', fontWeight: '500' },
  reactionContainer: { position: 'absolute', flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center', zIndex: 100, borderWidth: 1.5, borderColor: '#f0f0f0' },
  reactionText: { fontSize: 13 },
  reactionCount: { fontSize: 10, color: '#666', marginLeft: 2, fontWeight: '700' },
  indicatorBar: { flexDirection: 'row', padding: 10, borderTopWidth: 1, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContent: { width: '92%', backgroundColor: '#fff', borderRadius: 24, padding: 16, marginBottom: 40, overflow: 'hidden' },
  reactionBarModern: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 15, padding: 6 },
  reactionItemModern: { padding: 5 },
  actionList: { gap: 4 },
  actionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', gap: 12 },
  actionLabel: { fontSize: 16, fontWeight: '500' },

  emojiSheet: { width: '100%', height: '60%', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingTop: 10 },
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
    backgroundColor: '#FFF',
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
  emojiCell: { padding: 10, width: (Dimensions.get('window').width - 20) / 5, alignItems: 'center', justifyContent: 'center' },

  menuContent: { width: 220, position: 'absolute', top: 60, right: 20, borderRadius: 16, padding: 8, elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  menuText: { fontSize: 15, fontWeight: '500' },
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
  }
});
