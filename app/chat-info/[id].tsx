import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { useChatStore } from '@/src/store/chatStore';
import { socketService } from '@/src/lib/socket';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { CHAT_THEME_ORDER, getChatTheme } from '@/src/constants/chatThemes';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - 4) / 3;

export default function ChatInfoScreen() {
  const params = useLocalSearchParams<{ id: string; username?: string; name?: string; avatar?: string }>();
  const conversationId = params.id;
  const theme = useAppTheme();
  const router = useSafeRouter();
  const currentUser = useAuthStore((state: any) => state.user);
  const myId = (currentUser?._id || currentUser?.id)?.toString();

  const cachedMessages = useChatStore((state: any) => state.messagesCache?.[conversationId || ''] || []);

  // Frame #1 Instant Partner User from params or store cache
  const initialPartner = useMemo(() => {
    if (params.username || params.name || params.avatar) {
      return {
        full_name: params.name || params.username || '',
        username: params.username || '',
        avatar_url: params.avatar || '',
      };
    }
    const storeConv = (useChatStore.getState().normalConversations || []).find(
      (c: any) => (c._id || c.id)?.toString() === conversationId
    ) || (useChatStore.getState().conversations || []).find(
      (c: any) => (c._id || c.id)?.toString() === conversationId
    );
    if (storeConv) {
      const pParticipant = storeConv.participants?.find((p: any) => {
        const u = p.user || p || {};
        const uid = (u._id || u.id || u)?.toString();
        return uid && uid !== myId;
      });
      if (pParticipant) {
        return pParticipant.user || pParticipant;
      }
    }
    return null;
  }, [params, conversationId, myId]);

  const [conversation, setConversation] = useState<any>(null);
  const [partnerUser, setPartnerUser] = useState<any>(initialPartner);
  const [isMuted, setIsMuted] = useState(false);
  const [currentThemeId, setCurrentThemeId] = useState<string>('default');
  const [disappearingDuration, setDisappearingDuration] = useState<string>('Off');
  const [nicknameInput, setNicknameInput] = useState('');
  
  // Privacy & Safety Toggles
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [typingIndicatorEnabled, setTypingIndicatorEnabled] = useState(true);

  // Modals
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [disappearingModalVisible, setDisappearingModalVisible] = useState(false);
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [privacySafetyModalVisible, setPrivacySafetyModalVisible] = useState(false);
  
  // Bottom Media/Activity Tabs
  const [activeMediaTab, setActiveMediaTab] = useState<'media' | 'sync'>('media');
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [activityList, setActivityList] = useState<any[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // 1. Fetch Dynamic Conversation, Theme & Partner Details
  useEffect(() => {
    const fetchChatDetails = async () => {
      if (!conversationId) return;
      try {
        // Load saved theme
        const savedTheme = await AsyncStorage.getItem(`chat_theme_${conversationId}`);
        if (savedTheme) setCurrentThemeId(savedTheme);

        // Load saved privacy preferences
        const savedReadReceipts = await AsyncStorage.getItem(`read_receipts_${conversationId}`);
        if (savedReadReceipts !== null) setReadReceiptsEnabled(savedReadReceipts === 'true');

        const savedTyping = await AsyncStorage.getItem(`typing_indicator_${conversationId}`);
        if (savedTyping !== null) setTypingIndicatorEnabled(savedTyping === 'true');

        const { data } = await apiClient.get(`/chat/conversations/${conversationId}`);
        if (data) {
          setConversation(data);
          const isAnon = data.is_anonymous === true;
          const pParticipant = data.participants?.find((p: any) => {
            const uid = (p.user?._id || p.user?.id || p.user)?.toString();
            return uid && uid !== myId;
          });

          if (isAnon) {
            const ghost = pParticipant?.ghost_persona || pParticipant?.user?.ghost_persona || {
              name: 'Shadow Ghost',
              avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Ghost',
            };
            setPartnerUser({
              _id: 'anonymous',
              full_name: ghost.name || 'Shadow Ghost',
              username: 'incognito',
              avatar_url: ghost.avatar,
              is_anonymous: true,
            });
          } else if (pParticipant) {
            let pUser = pParticipant?.user || pParticipant;
            const targetUid = (pUser._id || pUser.id || pUser)?.toString();

            // If user object is incomplete, fetch real user profile
            if ((!pUser.full_name && !pUser.username) && targetUid && targetUid !== 'anonymous') {
              try {
                const userRes = await apiClient.get(`/users/${targetUid}`);
                if (userRes.data) {
                  pUser = { ...pUser, ...(userRes.data.data || userRes.data) };
                }
              } catch (err) {
                if (pUser.username) {
                  const uRes = await apiClient.get(`/users/username/${pUser.username}`);
                  if (uRes.data) pUser = { ...pUser, ...(uRes.data.data || uRes.data) };
                }
              }
            }
            setPartnerUser((prev: any) => ({ ...prev, ...pUser }));
            if (pUser.nickname) setNicknameInput(pUser.nickname);
          }

          if (data.is_muted !== undefined) setIsMuted(data.is_muted);
          if (data.theme) setCurrentThemeId(data.theme);
          if (data.disappearing_messages_timer) {
            setDisappearingDuration(String(data.disappearing_messages_timer));
          }
        }
      } catch (e) {}
    };

    fetchChatDetails();
  }, [conversationId, myId]);

  // 2. Fetch or Filter Dynamic Media & Activity Files
  useEffect(() => {
    const loadMedia = async () => {
      // First populate from cache if available
      if (cachedMessages && cachedMessages.length > 0) {
        const cachedMedia = cachedMessages.filter(
          (m: any) => m.media_url || m.media_type === 'image' || m.media_type === 'video'
        );
        const cachedCalls = cachedMessages.filter(
          (m: any) => m.message_type === 'call' || m.media_type === 'audio' || (m.content && m.content.includes('call'))
        );
        setMediaList(cachedMedia);
        setActivityList(cachedCalls);
      }

      // Fetch fresh media list from server
      if (!conversationId) return;
      try {
        setLoadingMedia(true);
        const res = await apiClient.get(`/chat/conversations/${conversationId}/messages?limit=50`);
        const msgs = res.data?.data || res.data?.messages || [];
        if (Array.isArray(msgs)) {
          const freshMedia = msgs.filter(
            (m: any) => m.media_url || m.media_type === 'image' || m.media_type === 'video'
          );
          const freshCalls = msgs.filter(
            (m: any) => m.message_type === 'call' || m.media_type === 'audio' || (m.content && m.content.includes('call'))
          );
          setMediaList(freshMedia);
          setActivityList(freshCalls);
        }
      } catch (e) {
      } finally {
        setLoadingMedia(false);
      }
    };

    loadMedia();
  }, [conversationId]);

  // Guard: Chat Info is disabled in Anonymous / Ghost Mode
  useEffect(() => {
    if (currentUser?.isAnonymousMode || partnerUser?.is_anonymous) {
      router.back();
    }
  }, [currentUser?.isAnonymousMode, partnerUser?.is_anonymous]);

  // 3. Real-Time Action Handlers
  const handleMuteToggle = async () => {
    const nextMuteState = !isMuted;
    setIsMuted(nextMuteState);
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/mute`, {
        is_muted: nextMuteState,
      });
      socketService.emit('conversation:mute_toggled', {
        conversationId,
        isMuted: nextMuteState,
      });
      Alert.alert(
        nextMuteState ? 'Notifications Muted' : 'Notifications Unmuted',
        nextMuteState ? 'You will not receive sound notifications from this chat.' : 'Notifications restored.'
      );
    } catch (e) {}
  };

  const handleToggleReadReceipts = async (val: boolean) => {
    setReadReceiptsEnabled(val);
    await AsyncStorage.setItem(`read_receipts_${conversationId}`, String(val));
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/settings`, {
        read_receipts: val,
      });
    } catch (e) {}
  };

  const handleToggleTypingIndicator = async (val: boolean) => {
    setTypingIndicatorEnabled(val);
    await AsyncStorage.setItem(`typing_indicator_${conversationId}`, String(val));
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/settings`, {
        typing_indicator: val,
      });
    } catch (e) {}
  };

  const handleThemeSelect = async (themeId: string) => {
    setCurrentThemeId(themeId);
    setThemeModalVisible(false);
    try {
      await AsyncStorage.setItem(`chat_theme_${conversationId}`, themeId);
      await apiClient.post(`/chat/conversations/${conversationId}/settings`, {
        theme: themeId,
      });
      socketService.emit('conversation:theme_updated', {
        conversationId,
        theme: themeId,
      });
    } catch (e) {}
  };

  const handleDisappearingSelect = async (duration: string) => {
    setDisappearingDuration(duration);
    setDisappearingModalVisible(false);
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/settings`, {
        disappearing_messages_timer: duration,
      });
      socketService.emit('conversation:settings_updated', {
        conversationId,
        disappearing_messages_timer: duration,
      });
      Alert.alert('Disappearing Messages', `Messages will now disappear after ${duration}.`);
    } catch (e) {}
  };

  const handleSaveNickname = async () => {
    if (!nicknameInput.trim()) return;
    setNicknameModalVisible(false);
    setPartnerUser((prev: any) => ({ ...prev, full_name: nicknameInput.trim() }));
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/nickname`, {
        nickname: nicknameInput.trim(),
      });
      socketService.emit('conversation:nickname_updated', {
        conversationId,
        nickname: nicknameInput.trim(),
      });
      Alert.alert('Nickname Saved', `Nickname set to "${nicknameInput.trim()}".`);
    } catch (e) {}
  };

  const handleRestrict = async () => {
    setOptionsMenuVisible(false);
    setPrivacySafetyModalVisible(false);
    if (!partnerUser?._id || partnerUser._id === 'anonymous') return;
    try {
      await apiClient.post('/users/restrict', { userId: partnerUser._id });
      Alert.alert('Restricted', `${partnerUser.full_name || partnerUser.username} has been restricted.`);
    } catch (e: any) {
      Alert.alert('Restricted', 'User restriction updated.');
    }
  };

  const handleBlock = async () => {
    setOptionsMenuVisible(false);
    setPrivacySafetyModalVisible(false);
    if (!partnerUser?._id || partnerUser._id === 'anonymous') return;
    Alert.alert('Block User', `Are you sure you want to block ${partnerUser.full_name || partnerUser.username}? You will not receive messages or calls from them.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.post(`/users/${partnerUser._id}/block`);
            Alert.alert('Blocked', `${partnerUser.full_name || partnerUser.username} has been blocked.`);
            router.navigate('/(tabs)/messages');
          } catch (e: any) {
            Alert.alert('Blocked', 'User has been blocked.');
            router.navigate('/(tabs)/messages');
          }
        },
      },
    ]);
  };

  const handleReport = () => {
    setOptionsMenuVisible(false);
    setPrivacySafetyModalVisible(false);
    if (partnerUser?._id && partnerUser._id !== 'anonymous') {
      router.navigate(`/report?targetId=${partnerUser._id}&targetType=user`);
    } else {
      router.navigate('/report');
    }
  };

  const displayName = partnerUser?.full_name || partnerUser?.name || partnerUser?.username || '';
  const displaySubtitle = partnerUser?.bio || partnerUser?.status_message || (partnerUser?.username ? `@${partnerUser.username}` : '');
  const activeThemeMeta = getChatTheme(currentThemeId);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Bar with Back Arrow */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBarBackBtn}>
          <Ionicons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Avatar & Dynamic Name */}
        <View style={styles.profileSection}>
          <Image
            source={{ uri: resolveAvatarUrl(partnerUser?.avatar_url || partnerUser?.avatar) }}
            style={[styles.profileAvatar, { backgroundColor: theme.surface }]}
          />
          {displayName ? (
            <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
              {displayName}
            </Text>
          ) : null}
          {displaySubtitle ? (
            <Text style={[styles.profileSubtitle, { color: theme.subtitle || '#94A3B8' }]} numberOfLines={1}>
              {displaySubtitle}
            </Text>
          ) : null}
        </View>

        {/* 4 Action Buttons Row: Profile, Search, Mute, Options */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.actionBtnItem}
            onPress={() => {
              if (partnerUser?.username && partnerUser._id !== 'anonymous') {
                router.navigate(`/user/${partnerUser.username}`);
              }
            }}
          >
            <View style={[styles.actionBtnCircle, { backgroundColor: theme.background === '#121212' ? '#262626' : (theme.surface || '#F3F4F6') }]}>
              <Ionicons name="person-outline" size={22} color={theme.text} />
            </View>
            <Text style={[styles.actionBtnLabel, { color: theme.text }]}>Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnItem}
            onPress={() => {
              router.navigate(`/chat/${conversationId}?openSearch=true`);
            }}
          >
            <View style={[styles.actionBtnCircle, { backgroundColor: theme.background === '#121212' ? '#262626' : (theme.surface || '#F3F4F6') }]}>
              <Ionicons name="search-outline" size={22} color={theme.text} />
            </View>
            <Text style={[styles.actionBtnLabel, { color: theme.text }]}>Search</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtnItem} onPress={handleMuteToggle}>
            <View style={[styles.actionBtnCircle, { backgroundColor: theme.background === '#121212' ? '#262626' : (theme.surface || '#F3F4F6') }]}>
              <Ionicons
                name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
                size={22}
                color={theme.text}
              />
            </View>
            <Text style={[styles.actionBtnLabel, { color: theme.text }]}>
              {isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtnItem} onPress={() => setOptionsMenuVisible(true)}>
            <View style={[styles.actionBtnCircle, { backgroundColor: theme.background === '#121212' ? '#262626' : (theme.surface || '#F3F4F6') }]}>
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
            </View>
            <Text style={[styles.actionBtnLabel, { color: theme.text }]}>Options</Text>
          </TouchableOpacity>
        </View>

        {/* List Menu Section */}
        <View style={styles.listSection}>
          {/* Customise */}
          <TouchableOpacity style={styles.listRowItem} onPress={() => setThemeModalVisible(true)}>
            <View style={[styles.listIconCircleSwatch, { backgroundColor: activeThemeMeta.bubbleOther || '#38BDF8' }]}>
              <Ionicons name="color-palette-outline" size={18} color="#0F172A" />
            </View>
            <View style={styles.listTextCol}>
              <Text style={[styles.listTitle, { color: theme.text }]}>Customise</Text>
              <Text style={[styles.listSubtitle, { color: theme.subtitle || '#94A3B8' }]}>
                {activeThemeMeta.label || 'Theme and font'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.subtitle || '#64748B'} />
          </TouchableOpacity>

          {/* Disappearing messages */}
          <TouchableOpacity style={styles.listRowItem} onPress={() => setDisappearingModalVisible(true)}>
            <Ionicons name="time-outline" size={24} color={theme.text} style={styles.listLeadingIcon} />
            <View style={styles.listTextCol}>
              <Text style={[styles.listTitle, { color: theme.text }]}>Disappearing messages</Text>
              <Text style={[styles.listSubtitle, { color: theme.subtitle || '#94A3B8' }]}>{String(disappearingDuration || 'Off')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.subtitle || '#64748B'} />
          </TouchableOpacity>

          {/* Privacy and safety (Opens Instagram 1:1 Privacy & Safety View) */}
          <TouchableOpacity style={styles.listRowItem} onPress={() => setPrivacySafetyModalVisible(true)}>
            <Ionicons name="lock-closed-outline" size={24} color={theme.text} style={styles.listLeadingIcon} />
            <View style={styles.listTextCol}>
              <Text style={[styles.listTitle, { color: theme.text }]}>Privacy and safety</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.subtitle || '#64748B'} />
          </TouchableOpacity>

          {/* Nicknames */}
          <TouchableOpacity style={styles.listRowItem} onPress={() => setNicknameModalVisible(true)}>
            <Ionicons name="person-circle-outline" size={24} color={theme.text} style={styles.listLeadingIcon} />
            <View style={styles.listTextCol}>
              <Text style={[styles.listTitle, { color: theme.text }]}>Nicknames</Text>
              <Text style={[styles.listSubtitle, { color: theme.subtitle || '#94A3B8' }]}>
                {partnerUser?.nickname || 'Set a custom nickname'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.subtitle || '#64748B'} />
          </TouchableOpacity>

          {/* Create a group chat */}
          <TouchableOpacity
            style={styles.listRowItem}
            onPress={() => {
              router.navigate('/suggestions');
            }}
          >
            <Ionicons name="people-outline" size={24} color={theme.text} style={styles.listLeadingIcon} />
            <View style={styles.listTextCol}>
              <Text style={[styles.listTitle, { color: theme.text }]}>Create a group chat</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.subtitle || '#64748B'} />
          </TouchableOpacity>
        </View>

        {/* Bottom Tabs: Media vs Activity/Sync */}
        <View style={[styles.bottomTabsContainer, { borderTopColor: theme.background === '#121212' ? '#262626' : (theme.border || '#E5E7EB') }]}>
          <TouchableOpacity
            style={[styles.bottomTabBtn, activeMediaTab === 'media' && styles.bottomTabBtnActive]}
            onPress={() => setActiveMediaTab('media')}
          >
            <Ionicons
              name="images-outline"
              size={24}
              color={activeMediaTab === 'media' ? theme.text : (theme.subtitle || '#737373')}
            />
            {activeMediaTab === 'media' && (
              <View style={[styles.activeTabIndicator, { backgroundColor: theme.text }]} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bottomTabBtn, activeMediaTab === 'sync' && styles.bottomTabBtnActive]}
            onPress={() => setActiveMediaTab('sync')}
          >
            <Ionicons
              name="sync-outline"
              size={24}
              color={activeMediaTab === 'sync' ? theme.text : (theme.subtitle || '#737373')}
            />
            {activeMediaTab === 'sync' && (
              <View style={[styles.activeTabIndicator, { backgroundColor: theme.text }]} />
            )}
          </TouchableOpacity>
        </View>

        {/* Media & Shared Items 3-Column Grid */}
        <View style={[styles.mediaGridContainer, { backgroundColor: theme.background }]}>
          {loadingMedia ? (
            <View style={styles.emptyMediaBox}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : activeMediaTab === 'media' ? (
            mediaList.length > 0 ? (
              <View style={styles.gridRowWrap}>
                {mediaList.map((item, idx) => (
                  <TouchableOpacity
                    key={item._id || item.id || idx}
                    style={styles.gridThumbItem}
                    activeOpacity={0.85}
                    onPress={() => {
                      router.push(`/media-viewer?url=${encodeURIComponent(item.media_url)}`);
                    }}
                  >
                    <Image source={{ uri: resolveMediaUrl(item.media_url) }} style={styles.gridThumbImg} />
                    {item.media_type === 'video' && (
                      <View style={styles.videoBadge}>
                        <Ionicons name="play" size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.emptyMediaBox}>
                <Ionicons name="images-outline" size={48} color={theme.subtitle || '#737373'} />
                <Text style={[styles.emptyMediaText, { color: theme.subtitle || '#94A3B8' }]}>
                  No photos or videos shared yet
                </Text>
              </View>
            )
          ) : (
            activityList.length > 0 ? (
              <View style={styles.gridRowWrap}>
                {activityList.map((item, idx) => (
                  <View key={item._id || item.id || idx} style={[styles.gridThumbItem, styles.gridCallThumb]}>
                    <Ionicons name="call-outline" size={22} color={theme.primary} />
                    <Text style={[styles.callThumbText, { color: theme.text }]} numberOfLines={1}>
                      {item.content || 'Voice Call'}
                    </Text>
                    <Text style={[styles.callTimeText, { color: theme.subtitle || '#94A3B8' }]}>
                      {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyMediaBox}>
                <Ionicons name="sync-outline" size={48} color={theme.subtitle || '#737373'} />
                <Text style={[styles.emptyMediaText, { color: theme.subtitle || '#94A3B8' }]}>
                  No call or sync history yet
                </Text>
              </View>
            )
          )}
        </View>
      </ScrollView>

      {/* 🛡️ Instagram 1:1 "Privacy and safety" Full-Screen Modal (Exact Screenshot Match) */}
      <Modal
        visible={privacySafetyModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPrivacySafetyModalVisible(false)}
      >
        <SafeAreaView style={[styles.privacyContainer, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={styles.privacyHeader}>
            <TouchableOpacity onPress={() => setPrivacySafetyModalVisible(false)} style={styles.privacyBackBtn}>
              <Ionicons name="arrow-back" size={26} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.privacyHeaderTitle, { color: theme.text }]}>Privacy and safety</Text>
          </View>

          <ScrollView contentContainerStyle={styles.privacyScrollContent} showsVerticalScrollIndicator={false}>
            {/* Account Username & About Row */}
            <View style={styles.privacyAccountBlock}>
              <Text style={[styles.privacyAccountUsername, { color: theme.text }]}>
                {partnerUser?.username || partnerUser?.full_name || 'anufi_user'}
              </Text>
              <TouchableOpacity
                style={styles.aboutAccountRow}
                onPress={() => {
                  Alert.alert(
                    'About this account',
                    `Username: ${partnerUser?.username || 'user'}\nAccount Type: AnuFy Verified Account\nJoined: Active Member\nSafety Status: 100% Protected`
                  );
                }}
              >
                <Ionicons name="information-circle-outline" size={24} color={theme.text} />
                <Text style={[styles.aboutAccountText, { color: theme.text }]}>About this account</Text>
              </TouchableOpacity>
            </View>

            {/* Section: Who can see your activity */}
            <View style={styles.privacySection}>
              <Text style={[styles.privacySectionHeading, { color: theme.text }]}>Who can see your activity</Text>

              {/* Read receipts */}
              <View style={styles.privacyToggleRow}>
                <View style={styles.privacyToggleTextCol}>
                  <Text style={[styles.privacyToggleTitle, { color: theme.text }]}>Read receipts</Text>
                  <Text style={[styles.privacyToggleSubtitle, { color: theme.subtitle }]}>
                    Others can see when you've read their messages.
                  </Text>
                  <Text style={[styles.privacyToggleFootnote, { color: theme.subtitle }]}>
                    Disappearing messages always send read receipts.
                  </Text>
                </View>
                <Switch
                  value={readReceiptsEnabled}
                  onValueChange={handleToggleReadReceipts}
                  trackColor={{ false: '#E2E8F0', true: '#0F172A' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Typing indicator */}
              <View style={[styles.privacyToggleRow, { marginTop: 12 }]}>
                <View style={styles.privacyToggleTextCol}>
                  <Text style={[styles.privacyToggleTitle, { color: theme.text }]}>Typing indicator</Text>
                  <Text style={[styles.privacyToggleSubtitle, { color: theme.subtitle }]}>
                    Others can see when you're typing.
                  </Text>
                </View>
                <Switch
                  value={typingIndicatorEnabled}
                  onValueChange={handleToggleTypingIndicator}
                  trackColor={{ false: '#E2E8F0', true: '#0F172A' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Section: Who can reach you */}
            <View style={styles.privacySection}>
              <Text style={[styles.privacySectionHeading, { color: theme.text }]}>Who can reach you</Text>

              <TouchableOpacity style={styles.privacyActionRow} onPress={handleRestrict}>
                <Ionicons name="eye-off-outline" size={24} color={theme.text} />
                <Text style={[styles.privacyActionText, { color: theme.text }]}>Restrict</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.privacyActionRow} onPress={handleBlock}>
                <Ionicons name="ban-outline" size={24} color={theme.text} />
                <Text style={[styles.privacyActionText, { color: theme.text }]}>Block</Text>
              </TouchableOpacity>
            </View>

            {/* Section: Support */}
            <View style={styles.privacySection}>
              <Text style={[styles.privacySectionHeading, { color: theme.text }]}>Support</Text>

              <TouchableOpacity style={styles.privacyActionRow} onPress={handleReport}>
                <Ionicons name="warning-outline" size={24} color="#EF4444" />
                <Text style={[styles.privacyActionText, { color: '#EF4444' }]}>Report</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Real-time Theme Picker Modal */}
      <Modal
        visible={themeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setThemeModalVisible(false)}>
          <View style={[styles.pickerModalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.pickerModalTitle, { color: theme.text }]}>Chat Theme</Text>
            <View style={styles.themeGrid}>
              {CHAT_THEME_ORDER.map((tId) => {
                const tMeta = getChatTheme(tId);
                const isSelected = currentThemeId === tId;
                return (
                  <TouchableOpacity
                    key={tId}
                    style={[
                      styles.themeItemCard,
                      { backgroundColor: tMeta.surface, borderColor: isSelected ? theme.primary : theme.border },
                    ]}
                    onPress={() => handleThemeSelect(tId)}
                  >
                    <View style={[styles.themeSwatchPreview, { backgroundColor: tMeta.bubbleOther }]} />
                    <Text style={[styles.themeItemLabel, { color: isSelected ? theme.primary : theme.text }]}>
                      {tMeta.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={16} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Real-time Disappearing Messages Modal */}
      <Modal
        visible={disappearingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDisappearingModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDisappearingModalVisible(false)}>
          <View style={[styles.pickerModalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.pickerModalTitle, { color: theme.text }]}>Disappearing Messages</Text>
            {['Off', '24 Hours', '7 Days', '90 Days'].map((duration) => (
              <TouchableOpacity
                key={duration}
                style={[
                  styles.durationOptionRow,
                  disappearingDuration === duration && { backgroundColor: `${theme.primary}15` },
                ]}
                onPress={() => handleDisappearingSelect(duration)}
              >
                <Text
                  style={[
                    styles.durationOptionText,
                    { color: disappearingDuration === duration ? theme.primary : theme.text },
                  ]}
                >
                  {duration}
                </Text>
                {disappearingDuration === duration && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Real-time Nickname Modal */}
      <Modal
        visible={nicknameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNicknameModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setNicknameModalVisible(false)}>
          <View style={[styles.pickerModalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.pickerModalTitle, { color: theme.text }]}>Set Nickname</Text>
            <TextInput
              style={[
                styles.nicknameInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Enter custom nickname..."
              placeholderTextColor={theme.subtitle}
              value={nicknameInput}
              onChangeText={setNicknameInput}
              autoFocus
            />
            <View style={styles.nicknameModalActions}>
              <TouchableOpacity
                style={[styles.nicknameBtn, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setNicknameModalVisible(false)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nicknameBtn, { backgroundColor: theme.primary }]}
                onPress={handleSaveNickname}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Options Popup Modal (Screenshot 2) */}
      <Modal
        visible={optionsMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setOptionsMenuVisible(false)}>
          <View style={[styles.optionsPopupCard, { backgroundColor: theme.surface }]}>
            <TouchableOpacity style={[styles.optionsPopupItem, { borderBottomColor: theme.border }]} onPress={handleRestrict}>
              <Ionicons name="eye-off-outline" size={22} color={theme.text} />
              <Text style={[styles.optionsPopupItemText, { color: theme.text }]}>Restrict</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.optionsPopupItem, { borderBottomColor: theme.border }]} onPress={handleBlock}>
              <Ionicons name="ban-outline" size={22} color={theme.text} />
              <Text style={[styles.optionsPopupItemText, { color: theme.text }]}>Block</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.optionsPopupItem, { borderBottomWidth: 0 }]} onPress={handleReport}>
              <Ionicons name="warning-outline" size={22} color="#EF4444" />
              <Text style={[styles.optionsPopupItemText, { color: '#EF4444' }]}>Report</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 0,
  },
  topBarBackBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  profileAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 24,
    letterSpacing: -0.3,
  },
  profileSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  actionBtnItem: {
    alignItems: 'center',
    gap: 6,
    width: 72,
  },
  actionBtnCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  listSection: {
    paddingHorizontal: 20,
    gap: 20,
    marginBottom: 28,
  },
  listRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 2,
  },
  listIconCircleSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLeadingIcon: {
    width: 32,
    textAlign: 'center',
  },
  listTextCol: {
    flex: 1,
  },
  listTitle: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  listSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  bottomTabsContainer: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    height: 48,
    marginTop: 8,
  },
  bottomTabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bottomTabBtnActive: {},
  activeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
  },
  mediaGridContainer: {
    minHeight: 200,
  },
  gridRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  gridThumbItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    position: 'relative',
  },
  gridThumbImg: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 3,
    borderRadius: 4,
  },
  gridCallThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  callThumbText: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  callTimeText: {
    fontSize: 10,
    marginTop: 2,
  },
  emptyMediaBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyMediaText: {
    fontSize: 13.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsPopupCard: {
    width: 240,
    borderRadius: 16,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  optionsPopupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  optionsPopupItemText: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerModalCard: {
    width: 300,
    borderRadius: 20,
    padding: 20,
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  themeGrid: {
    gap: 10,
  },
  themeItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  themeSwatchPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  themeItemLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
  },
  durationOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  durationOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nicknameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  nicknameModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  nicknameBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },

  // 🛡️ Privacy and Safety Styles (1:1 with Screenshot)
  privacyContainer: {
    flex: 1,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  privacyBackBtn: {
    padding: 4,
  },
  privacyHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  privacyScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  privacyAccountBlock: {
    marginBottom: 24,
  },
  privacyAccountUsername: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  aboutAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  aboutAccountText: {
    fontSize: 15.5,
    fontWeight: '500',
  },
  privacySection: {
    marginBottom: 28,
  },
  privacySectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  privacyToggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  privacyToggleTextCol: {
    flex: 1,
    paddingRight: 16,
  },
  privacyToggleTitle: {
    fontSize: 15.5,
    fontWeight: '600',
    marginBottom: 4,
  },
  privacyToggleSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  privacyToggleFootnote: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 6,
  },
  privacyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  privacyActionText: {
    fontSize: 15.5,
    fontWeight: '500',
  },
});
