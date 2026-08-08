import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  InteractionManager,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { useChatStore } from '@/src/store/chatStore';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { CHAT_THEME_ORDER, getChatTheme } from '@/src/constants/chatThemes';
import { socketService } from '@/src/lib/socket';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';

async function uploadWallpaper(localUri: string): Promise<string> {
  const formData = new FormData();
  formData.append('folder', 'chat_wallpapers');
  const filename = localUri.split('/').pop()?.split('?')[0] || 'wall.jpg';
  const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  formData.append('media', {
    uri: Platform.OS === 'android' ? localUri : localUri.replace('file://', ''),
    name: filename,
    type: mime,
  } as any);
  const { data } = await apiClient.post('/upload/single', formData);
  const url = data?.data?.url || data?.url;
  if (!url) throw new Error('Upload failed');
  return url;
}

export default function ChatInfoScreen() {
  const router = useSafeRouter();
  const myId = useAuthStore((s) => s.user?.id) || '';
  const { id, initialTitle, initialAvatar, initialThemeId, initialDisappearing, initialWallpaperUrl } = useLocalSearchParams<{
    id: string;
    initialTitle?: string;
    initialAvatar?: string;
    initialThemeId?: string;
    initialDisappearing?: string;
    initialWallpaperUrl?: string;
  }>();
  const conversationId = String(id || '');

  const [isMuted, setIsMuted] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(initialTitle || '');
  const [username, setUsername] = useState('');
  const [otherUserId, setOtherUserId] = useState('');
  const [avatar, setAvatar] = useState(initialAvatar || '');
  const [themeId, setThemeId] = useState(initialThemeId || 'default');
  const [selectedThemeId, setSelectedThemeId] = useState(initialThemeId || 'default');
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const [isJustApplied, setIsJustApplied] = useState(false);
  const [disappearing, setDisappearing] = useState<'off' | 'on_read' | '24h'>(
    initialDisappearing === 'true' ? 'on_read' : 'off'
  );
  const [wallpaperUrl, setWallpaperUrl] = useState<string | undefined>(initialWallpaperUrl || undefined);
  const [isGroup, setIsGroup] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  const [updatingGroupName, setUpdatingGroupName] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isAnon, setIsAnon] = useState(false);

  const { isFollowing, isLoading: followLoading, toggleFollow } = useFollowStatus(otherUserId, {
    isFollowing: false,
  });

  const load = useCallback(() => {
    if (!conversationId) return () => { };

    performanceEngine.startScreenTrace('ChatInfoScreen');
    performanceEngine.trackCacheAccess('Chat', true);
    performanceEngine.endScreenTrace('ChatInfoScreen', true);

    // Defer data fetch to next tick to prevent blocking
    const timer = setTimeout(() => {
      const fetchData = async () => {
        try {
          const { data } = await apiClient.get(`/chat/conversations/${conversationId}`);
          setIsGroup(data?.type === 'group');
          const parts = data?.participants || [];
          setParticipants(parts);

          const other = parts
            .map((p: any) => p.user || p)
            .find((u: any) => (u._id || u.id)?.toString() !== myId);
          const u = other;
          const uid = (u?._id || u?.id)?.toString() || '';

          if (data?.is_anonymous) {
            setIsAnon(true);
          }

          if (data?.type === 'group') {
            setFullName(data.name || 'Group Chat');
            setUsername('');
          } else if (u) {
            if (data?.is_anonymous) {
              const p = parts.find((p: any) => (p.user?._id || p.user?.id || p.user)?.toString() === uid);
              const ghostUsername = p?.ghost_persona?.username || u.anonymousPersona?.username || u.ghost_persona?.username || p?.ghost_persona?.name || u.anonymousPersona?.name || u.ghost_persona?.name || 'Ghost User';
              const ghostAvatar = p?.ghost_persona?.avatar || u.anonymousPersona?.avatar || u.ghost_persona?.avatar || resolveAvatarUrl(undefined, ghostUsername, true);
              setFullName(ghostUsername.replace(/^@/, ''));
              setUsername(''); // hide real username
              setAvatar(ghostAvatar);
            } else {
              setFullName(u.full_name || u.username || 'Chat');
              setUsername(u.username ? `@${u.username}` : '');
              setAvatar(u.avatar_url || u.avatar || u.anonymousPersona?.avatar || '');
            }
            setOtherUserId(uid);
          }
          setThemeId(data?.theme_id || 'default');
          setSelectedThemeId(data?.theme_id || 'default');
          setDisappearing(data?.is_disappearing === '24h' ? '24h' : data?.is_disappearing ? 'on_read' : 'off');
          setWallpaperUrl(data?.wallpaper_url || undefined);

          // Fetch mute/block/follow status in parallel
          if (uid) {
            const [muteRes, blockRes] = await Promise.allSettled([
              apiClient.get(`/users/muted`),
              apiClient.get(`/users/blocked-list`),
            ]);

            if (muteRes.status === 'fulfilled') {
              const muted = muteRes.value.data?.muted || [];
              setIsMuted(muted.some((m: any) => (m._id || m.id)?.toString() === uid));
            }
            if (blockRes.status === 'fulfilled') {
              const blocked = blockRes.value.data?.blocked || [];
              setIsBlocked(blocked.some((b: any) => (b._id || b.id)?.toString() === uid));
            }
          }
        } catch (e: any) {
        }
      };

      fetchData();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [conversationId, myId]);

  // ── Action Handlers ──────────────────────────────────────────────────────

  const handleMuteToggle = useCallback(async () => {
    if (!otherUserId) return;
    setActionLoading('mute');
    try {
      const res = await apiClient.post(`/users/${otherUserId}/mute`);
      const newMuted = res.data?.isMuted ?? !isMuted;
      setIsMuted(newMuted);
      Alert.alert(newMuted ? 'Muted' : 'Unmuted', newMuted ? `You won't get notifications from ${fullName}.` : `Notifications from ${fullName} restored.`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not update mute status.');
    } finally {
      setActionLoading(null);
    }
  }, [otherUserId, isMuted, fullName]);

  const handleBlockToggle = useCallback(async () => {
    if (!otherUserId) return;
    setActionLoading('block');
    try {
      const res = await apiClient.post(`/users/${otherUserId}/block`);
      const nowBlocked = res.data?.isBlocked ?? !isBlocked;
      setIsBlocked(nowBlocked);
      
      if (isAnon && nowBlocked) {
        useChatStore.getState().removeConversation(conversationId);
        apiClient.post('/chat/anonymous/end', { conversationId }).catch(() => {});
        Alert.alert('Blocked', 'Stranger blocked and chat ended.');
        router.replace('/(tabs)/messages' as any);
      }
    } catch (e: any) {
    } finally {
      setActionLoading(null);
    }
  }, [otherUserId, isBlocked, fullName, isAnon, conversationId, router]);

  const handleReport = useCallback(async () => {
    if (!otherUserId) return;
    setActionLoading('report');
    try {
      if (isAnon) {
        await apiClient.post(`/chat/anonymous/report`, { reportedUserId: otherUserId, conversationId, reason: 'Inappropriate behavior' });
        Alert.alert('Reported', 'User has been reported and blocked.');
        router.replace('/(tabs)/messages' as any);
      } else {
        await apiClient.post('/reports', { target_id: otherUserId, target_type: 'user', reason: 'Inappropriate behavior' });
        Alert.alert('Reported', 'User has been reported.');
      }
    } catch (e: any) {
      Alert.alert('Error', 'Failed to report user.');
    } finally {
      setActionLoading(null);
    }
  }, [otherUserId, fullName, isAnon, conversationId, router]);

  const handleSaveGroupName = useCallback(async () => {
    if (!editNameInput.trim()) {
      Alert.alert('Required', 'Please enter a group name.');
      return;
    }

    setUpdatingGroupName(true);
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/settings`, { name: editNameInput.trim() });

      // Update local state
      setFullName(editNameInput.trim());

      // Update Zustand conversations store
      useChatStore.getState().setConversations(
        useChatStore.getState().conversations.map((c: any) =>
          (c._id || c.id)?.toString() === conversationId ? { ...c, name: editNameInput.trim() } : c
        )
      );

      setShowEditNameModal(false);
      Alert.alert('Success', 'Group name updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update group name.');
    } finally {
      setUpdatingGroupName(false);
    }
  }, [conversationId, editNameInput]);

  const isAdminOfGroup = useMemo(() => {
    if (!isGroup) return false;
    return participants.some(p => {
      const u = p.user || p;
      return (u._id || u.id || u.toString()) === myId && p.role === 'admin';
    });
  }, [isGroup, participants, myId]);

  const handleLeaveGroup = useCallback(async () => {
    // 🚀 Optimistic Instant Navigation & Local Store Update
    useChatStore.getState().setConversations(
      useChatStore.getState().conversations.filter((c: any) => (c._id || c.id)?.toString() !== conversationId)
    );
    router.replace('/(tabs)/messages');

    // Run API call in the background
    apiClient.post(`/chat/conversations/${conversationId}/leave`).catch((err) => {
    });
  }, [conversationId, router]);

  const handleDeleteGroup = useCallback(async () => {
    // 🚀 Optimistic Instant Navigation & Local Store Update
    useChatStore.getState().setConversations(
      useChatStore.getState().conversations.filter((c: any) => (c._id || c.id)?.toString() !== conversationId)
    );
    router.replace('/(tabs)/messages');

    // Run API call in the background
    apiClient.delete(`/chat/conversations/${conversationId}`).catch((err) => {
    });
  }, [conversationId, router]);

  const handleRemoveParticipant = useCallback(async (participantId: string, participantName: string) => {
    setActionLoading(`remove_${participantId}`);
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/remove-participant`, { participantId });

      // Update local state
      setParticipants(prev => prev.filter(p => {
        const u = p.user || p;
        return (u._id || u.id || u.toString()) !== participantId;
      }));

      // Update Zustand store
      useChatStore.getState().setConversations(
        useChatStore.getState().conversations.map((c: any) => {
          if ((c._id || c.id)?.toString() === conversationId) {
            return {
              ...c,
              participants: c.participants.filter((p: any) => {
                const u = p.user || p;
                return (u._id || u.id || u.toString()) !== participantId;
              })
            };
          }
          return c;
        })
      );

      Alert.alert('Success', `${participantName} has been removed.`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not remove member.');
    } finally {
      setActionLoading(null);
    }
  }, [conversationId]);

  useEffect(() => {
    const cleanup = load();

    const onSettingsUpdated = (data: any) => {
      if (data.theme_id !== undefined) {
        setThemeId(data.theme_id);
        setSelectedThemeId(data.theme_id);
      }
      if (data.is_disappearing !== undefined) setDisappearing(
        data.is_disappearing === '24h' ? '24h' : data.is_disappearing ? 'on_read' : 'off'
      );
      if (data.wallpaper_url !== undefined) setWallpaperUrl(data.wallpaper_url);
      if (data.name !== undefined) setFullName(data.name);
      if (data.avatar !== undefined) setAvatar(data.avatar);
    };

    const socket = socketService.socket;
    if (socket) {
      socket.on('chat:settings_updated', onSettingsUpdated);
    }

    return () => {
      cleanup();
      if (socket) {
        socket.off('chat:settings_updated', onSettingsUpdated);
      }
    };
  }, [load]);

  const persist = useCallback(
    async (
      patch: { is_disappearing?: boolean | string; theme_id?: string; wallpaper_url?: string | null },
      opts?: { toast?: boolean }
    ) => {
      if (!conversationId) return;

      // Update Local Store Instantly
      useChatStore.getState().setConversations(
        useChatStore.getState().conversations.map((c: any) =>
          (c._id || c.id)?.toString() === conversationId ? { ...c, ...patch } : c
        )
      );

      setSaving(true);
      try {
        await apiClient.post(`/chat/conversations/${conversationId}/settings`, patch);
        if (opts?.toast) Alert.alert('Saved', 'Chat updated for everyone in this chat.');
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not save');
      } finally {
        setSaving(false);
      }
    },
    [conversationId]
  );

  const changeGroupAvatar = async () => {
    if (!isGroup) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos', 'Permission needed to set group avatar.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (res.canceled || !res.assets[0]?.uri) return;

    const rawUri = res.assets[0].uri;
    const localUri = rawUri.startsWith('file://') || rawUri.startsWith('content://') || rawUri.startsWith('data:')
      ? rawUri
      : rawUri.startsWith('/') ? `file://${rawUri}` : rawUri;

    setAvatar(localUri);
    useChatStore.getState().setConversations(
      useChatStore.getState().conversations.map((c: any) =>
        (c._id || c.id)?.toString() === conversationId ? { ...c, avatar: localUri } : c
      )
    );

    setSaving(true);
    try {
      const remoteUrl = await uploadWallpaper(localUri);
      setAvatar(remoteUrl);
      useChatStore.getState().setConversations(
        useChatStore.getState().conversations.map((c: any) =>
          (c._id || c.id)?.toString() === conversationId ? { ...c, avatar: remoteUrl } : c
        )
      );

      await apiClient.post(`/chat/conversations/${conversationId}/settings`, { avatar: remoteUrl });
      Alert.alert('Success', 'Group avatar updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Upload failed');
      const cached = useChatStore.getState().conversations.find((c: any) => (c._id || c.id)?.toString() === conversationId);
      setAvatar(cached?.avatar || initialAvatar || '');
    } finally {
      setSaving(false);
    }
  };

  const pickWallpaper = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos', 'Permission needed to set wallpaper.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled || !res.assets[0]?.uri) return;

    const rawUri = res.assets[0].uri;
    const localUri = rawUri.startsWith('file://') || rawUri.startsWith('content://') || rawUri.startsWith('data:')
      ? rawUri
      : rawUri.startsWith('/') ? `file://${rawUri}` : rawUri;

    // 🚀 STEP 1: Instant Optimistic Update (Local UI)
    setWallpaperUrl(localUri);

    // 🚀 STEP 2: Instant Optimistic Update (Global Store for ChatRoom)
    useChatStore.getState().setConversations(
      useChatStore.getState().conversations.map((c: any) =>
        (c._id || c.id)?.toString() === conversationId ? { ...c, wallpaper_url: localUri } : c
      )
    );

    setSaving(true);
    try {
      // 🚀 STEP 3: Background Upload
      const remoteUrl = await uploadWallpaper(localUri);

      // 🚀 STEP 4: Final Update with Remote URL
      setWallpaperUrl(remoteUrl);
      useChatStore.getState().setConversations(
        useChatStore.getState().conversations.map((c: any) =>
          (c._id || c.id)?.toString() === conversationId ? { ...c, wallpaper_url: remoteUrl } : c
        )
      );

      await apiClient.post(`/chat/conversations/${conversationId}/settings`, { wallpaper_url: remoteUrl });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Upload failed');
      // Rollback on failure
      setWallpaperUrl(initialWallpaperUrl);
    } finally {
      setSaving(false);
    }
  };

  const clearWallpaper = async () => {
    setWallpaperUrl(undefined);
    useChatStore.getState().setConversations(
      useChatStore.getState().conversations.map((c: any) =>
        (c._id || c.id)?.toString() === conversationId ? { ...c, wallpaper_url: '' } : c
      )
    );
    setSaving(true);
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/settings`, { wallpaper_url: '' });
    } catch (e: any) {
    } finally {
      setSaving(false);
    }
  };

  const clearHistory = async () => {
    try {
      await apiClient.delete(`/chat/conversations/${conversationId}/clear`);
      router.back();
    } catch (e: any) {
    }
  };

  const navigateToProfile = useCallback(() => {
    const rawUser = username.startsWith('@') ? username.slice(1) : username;
    if (rawUser) {
      router.push(`/user/${rawUser}`);
    }
  }, [username, router]);

  if (!conversationId) {
    return null;
  }

  const currentTheme = getChatTheme(themeId);
  const infoBg = currentTheme.id === 'midnight' ? '#12121A' : COLORS.background;
  const infoSurface = currentTheme.id === 'midnight' ? '#1A1A24' : COLORS.surface;
  const infoBorder = currentTheme.id === 'midnight' ? '#2A2A38' : COLORS.border;
  const isDark = currentTheme.id === 'midnight' || COLORS.background === '#121212';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: infoBg }]} edges={['top']}>
      {/* Clean Flat Header */}
      <View style={[styles.topBar, { backgroundColor: infoBg, borderBottomWidth: 0 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backWrap}
        >
          <Ionicons name="arrow-back" size={22} color={isDark ? '#FFF' : COLORS.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: isDark ? '#FFF' : COLORS.text }]}>Chat Info</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Simple & Clean Profile Header */}
          <View style={styles.headerCard}>
            <TouchableOpacity
              onPress={navigateToProfile}
              activeOpacity={0.7}
              style={{ alignItems: 'center' }}
              disabled={!username}
            >
              <TouchableOpacity
                disabled={!isGroup}
                onPress={changeGroupAvatar}
                activeOpacity={0.7}
                style={[styles.avatarContainer, { borderColor: infoBorder }]}
              >
                <Image
                  source={{ uri: resolveAvatarUrl(avatar, fullName) }}
                  style={styles.profileAvatar}
                  contentFit="cover"
                  transition={150}
                />
                {isGroup && (
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 3, alignItems: 'center' }}>
                    <Ionicons name="camera" size={12} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.withTitle, { color: isDark ? '#FFF' : COLORS.text }]}>{fullName}</Text>
                {isGroup && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditNameInput(fullName);
                      setShowEditNameModal(true);
                    }}
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil-sharp" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              </View>
              {username ? <Text style={[styles.usernameText, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>{username}</Text> : null}
            </TouchableOpacity>

          </View>

          {/* Group Members Section */}
          {isGroup && participants.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionHeader, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>
                Group Members ({participants.length})
              </Text>
              <View style={[styles.cardBlock, { backgroundColor: infoSurface, borderColor: infoBorder }]}>
                {participants.map((p, idx) => {
                  const u = p.user || p;
                  if (!u) return null;
                  const isMe = (u._id || u.id || u.toString()) === myId;
                  const isAdmin = p.role === 'admin';
                  return (
                    <View key={u._id || u.id || idx.toString()}>
                      <TouchableOpacity
                        style={styles.cardRow}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (!isMe && u.username) {
                            router.push(`/user/${u.username}`);
                          }
                        }}
                      >
                        <View style={styles.cardRowLeft}>
                          <Image
                            source={{ uri: resolveAvatarUrl(u.avatar_url || u.avatar, u.username) }}
                            style={{ width: 36, height: 36, borderRadius: 18, marginRight: 12 }}
                            contentFit="cover"
                          />
                          <View style={styles.cardTextCol}>
                            <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : COLORS.text }]}>
                              {isMe ? 'You' : (u.full_name || u.username || 'Group Member')}
                            </Text>
                            {u.username ? (
                              <Text style={[styles.cardSub, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>
                                @{u.username}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {isAdmin && (
                          <View style={{ backgroundColor: COLORS.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: (isAdminOfGroup && !isMe) ? 8 : 0 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>Admin</Text>
                          </View>
                        )}
                        {isAdminOfGroup && !isMe && (
                          <TouchableOpacity
                            onPress={() => handleRemoveParticipant(u._id || u.id, u.full_name || u.username)}
                            style={{ padding: 4 }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle-outline" size={22} color={COLORS.error} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                      {idx < participants.length - 1 && (
                        <View style={[styles.cardDivider, { backgroundColor: infoBorder }]} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Chat Theme Section - Flat Circular Preset Selectors */}
          {!isAnon && (
            <>
              <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeader, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>Chat Theme</Text>
            <View style={styles.themeGrid}>
              {CHAT_THEME_ORDER.map((tid) => {
                const t = getChatTheme(tid);
                const active = selectedThemeId === tid;
                const isCurrentlySaved = themeId === tid;
                return (
                  <TouchableOpacity
                    key={tid}
                    style={[
                      styles.themeCard,
                      {
                        backgroundColor: infoSurface,
                        borderColor: active ? '#9333EA' : infoBorder
                      }
                    ]}
                    onPress={async () => {
                      setIsJustApplied(true);
                      setThemeId(tid);
                      setSelectedThemeId(tid);
                      await persist({ theme_id: tid }, { toast: false });
                      setTimeout(() => {
                        setIsJustApplied(false);
                      }, 1000);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.swatchCircle, { backgroundColor: t.tint, borderColor: tid === 'midnight' ? '#3B3B4F' : '#D1D5DB' }]}>
                      <View style={[styles.swatchCircleInner, { backgroundColor: t.bubbleOther }]} />
                    </View>
                    <Text style={[
                      styles.themeCardText,
                      { color: isDark ? '#FFF' : COLORS.text },
                      active && { fontWeight: '700', color: '#9333EA' }
                    ]}>
                      {t.label}
                    </Text>
                    {isCurrentlySaved && <Ionicons name="checkmark-circle" size={16} color="#9333EA" style={styles.checkIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Privacy & Customization List - Flat Apple Style */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeader, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>Preferences & Customization</Text>
            <View style={[styles.cardBlock, { backgroundColor: infoSurface, borderColor: infoBorder }]}>

              {/* Vanish Mode Option */}
              <View style={styles.cardRow}>
                <View style={styles.cardRowLeft}>
                  <Ionicons name="time-outline" size={20} color={isDark ? '#CCC' : COLORS.text} style={styles.rowIcon} />
                  <View style={styles.cardTextCol}>
                    <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : COLORS.text }]}>Vanish Mode</Text>
                    <Text style={[styles.cardSub, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>
                      {disappearing === 'on_read' ? 'Disappear after read' : disappearing === '24h' ? 'Disappear after 24 hours' : 'Off'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Minimal Segmented Selector */}
              <View style={[styles.segmentedContainer, { backgroundColor: isDark ? '#1E1E2F' : '#F3F4F6' }]}>
                {([
                  { key: 'off', label: 'Off' },
                  { key: 'on_read', label: 'On Read' },
                  { key: '24h', label: '24 Hours' },
                ] as const).map(opt => {
                  const active = disappearing === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => {
                        setDisappearing(opt.key);
                        void persist({
                          is_disappearing: opt.key === 'off' ? false : opt.key,
                        }, { toast: false });
                      }}
                      style={[
                        styles.segmentButton,
                        {
                          backgroundColor: active
                            ? (isDark ? '#2E1A47' : '#FFFFFF')
                            : 'transparent',
                          borderColor: active && !isDark ? '#E5E7EB' : 'transparent',
                          borderWidth: active && !isDark ? 1 : 0,
                        }
                      ]}
                    >
                      <Text style={[
                        styles.segmentButtonText,
                        {
                          fontWeight: active ? '700' : '500',
                          color: active
                            ? '#9333EA'
                            : (isDark ? '#8A8A9E' : COLORS.subtitle)
                        }
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.cardDivider, { backgroundColor: isDark ? '#2A2A38' : '#E5E7EB' }]} />

              {/* Wallpaper Option */}
              <View style={styles.cardRow}>
                <View style={styles.cardRowLeft}>
                  <Ionicons name="image-outline" size={20} color={isDark ? '#CCC' : COLORS.text} style={styles.rowIcon} />
                  <View style={styles.cardTextCol}>
                    <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : COLORS.text }]}>Chat Wallpaper</Text>
                    <Text style={[styles.cardSub, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>
                      {wallpaperUrl ? 'Custom wallpaper set' : 'Default chat background'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.actionPill, { backgroundColor: isDark ? '#2A2A38' : '#F3F4F6' }]}
                  onPress={pickWallpaper}
                  disabled={saving}
                >
                  <Text style={[styles.actionPillText, { color: isDark ? '#FFF' : COLORS.text }]}>
                    {wallpaperUrl ? 'Change' : 'Set'}
                  </Text>
                </TouchableOpacity>
              </View>

              {wallpaperUrl && (
                <>
                  <View style={[styles.cardDivider, { backgroundColor: isDark ? '#2A2A38' : '#E5E7EB' }]} />
                  <TouchableOpacity style={styles.cardRowAction} onPress={clearWallpaper} disabled={saving}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} style={styles.rowIcon} />
                    <Text style={[styles.cardActionText, { color: COLORS.error }]}>Remove Wallpaper</Text>
                  </TouchableOpacity>
                </>
              )}
              </View>
            </View>
            </>
          )}

          {/* Account & Safety Actions */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeader, { color: isDark ? '#8A8A9E' : COLORS.subtitle }]}>Options & Safety</Text>
            <View style={[styles.cardBlock, { backgroundColor: infoSurface, borderColor: infoBorder }]}>

              {/* Mute Notifications */}
              <TouchableOpacity
                style={styles.cardRowAction}
                onPress={handleMuteToggle}
                disabled={actionLoading === 'mute'}
              >
                {actionLoading === 'mute' ? (
                  <ActivityIndicator size="small" color={COLORS.text} style={styles.rowIcon} />
                ) : (
                  <Ionicons name={isMuted ? "notifications-outline" : "notifications-off-outline"} size={20} color={isDark ? '#CCC' : COLORS.text} style={styles.rowIcon} />
                )}
                <Text style={[styles.cardActionText, { color: isDark ? '#FFF' : COLORS.text }]}>
                  {isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                </Text>
              </TouchableOpacity>

              {!isGroup && isFollowing && (
                <>
                  <View style={[styles.cardDivider, { backgroundColor: infoBorder }]} />
                  <TouchableOpacity
                    style={styles.cardRowAction}
                    onPress={toggleFollow}
                    disabled={followLoading}
                  >
                    {followLoading ? (
                      <ActivityIndicator size="small" color={COLORS.error} style={styles.rowIcon} />
                    ) : (
                      <Ionicons name="person-remove-outline" size={20} color={COLORS.error} style={styles.rowIcon} />
                    )}
                    <Text style={[styles.cardActionText, { color: COLORS.error }]}>Unfollow {fullName}</Text>
                  </TouchableOpacity>
                </>
              )}

              {!isGroup && (
                <>
                  <View style={[styles.cardDivider, { backgroundColor: infoBorder }]} />
                  {/* Block User */}
                  <TouchableOpacity
                    style={styles.cardRowAction}
                    onPress={handleBlockToggle}
                    disabled={actionLoading === 'block'}
                  >
                    {actionLoading === 'block' ? (
                      <ActivityIndicator size="small" color={COLORS.error} style={styles.rowIcon} />
                    ) : (
                      <Ionicons name="ban-outline" size={20} color={COLORS.error} style={styles.rowIcon} />
                    )}
                    <Text style={[styles.cardActionText, { color: COLORS.error }]}>
                      {isBlocked ? 'Unblock User' : 'Block User'}
                    </Text>
                  </TouchableOpacity>

                  <View style={[styles.cardDivider, { backgroundColor: infoBorder }]} />
                  {/* Report User */}
                  <TouchableOpacity
                    style={styles.cardRowAction}
                    onPress={handleReport}
                    disabled={actionLoading === 'report'}
                  >
                    {actionLoading === 'report' ? (
                      <ActivityIndicator size="small" color={COLORS.error} style={styles.rowIcon} />
                    ) : (
                      <Ionicons name="flag-outline" size={20} color={COLORS.error} style={styles.rowIcon} />
                    )}
                    <Text style={[styles.cardActionText, { color: COLORS.error }]}>Report User</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Danger Zone */}
          <View style={styles.sectionContainer}>
            <View style={[styles.cardBlock, { backgroundColor: infoSurface, borderColor: infoBorder }]}>
              <TouchableOpacity style={styles.cardRowAction} onPress={clearHistory}>
                <Ionicons name="trash-outline" size={20} color={COLORS.error} style={styles.rowIcon} />
                <Text style={[styles.cardActionText, { color: COLORS.error, fontWeight: '600' }]}>Clear Chat History</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Group Danger Actions */}
          {isGroup && (
            <View style={styles.sectionContainer}>
              <View style={[styles.cardBlock, { backgroundColor: infoSurface, borderColor: infoBorder }]}>
                {/* Leave Group */}
                <TouchableOpacity
                  style={styles.cardRowAction}
                  onPress={handleLeaveGroup}
                >
                  <Ionicons name="log-out-outline" size={20} color={COLORS.error} style={styles.rowIcon} />
                  <Text style={[styles.cardActionText, { color: COLORS.error, fontWeight: '600' }]}>
                    Leave Group
                  </Text>
                </TouchableOpacity>

                {isAdminOfGroup && (
                  <>
                    <View style={[styles.cardDivider, { backgroundColor: infoBorder }]} />
                    {/* Delete Group */}
                    <TouchableOpacity
                      style={styles.cardRowAction}
                      onPress={handleDeleteGroup}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.error} style={styles.rowIcon} />
                      <Text style={[styles.cardActionText, { color: COLORS.error, fontWeight: '600' }]}>
                        Delete Group
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {isJustApplied && (
        <View style={styles.floatingToastContainer} pointerEvents="none">
          <BlurView intensity={35} tint="dark" style={styles.floatingToastBlur}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
            <Text style={styles.floatingToastText}>Applied</Text>
          </BlurView>
        </View>
      )}

      {/* rising preview sheet overlay tray */}
      {previewThemeId && (() => {
        const previewT = getChatTheme(previewThemeId);
        return (
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setPreviewThemeId(null)}
            />
            <View style={[styles.trayContainer, { backgroundColor: previewT.surface }]}>
              {/* Drag Handle Indicator */}
              <View style={[styles.trayHandle, { backgroundColor: previewT.id === 'midnight' ? '#3B3B4F' : '#E5E7EB' }]} />

              <Text style={[styles.trayTitle, { color: previewT.id === 'midnight' ? '#FFF' : COLORS.text }]}>
                Preview "{previewT.label}" Theme
              </Text>

              {/* Realistic Mock Chat screen */}
              <View style={[styles.previewContainer, { backgroundColor: previewT.tint, marginVertical: 16 }]}>
                {/* Other User Mock Bubble */}
                <View style={styles.previewRowLeft}>
                  <View style={[styles.previewAvatarMock, { backgroundColor: previewT.id === 'midnight' ? '#2A2A38' : '#D1D5DB' }]} />
                  <View style={[styles.previewBubbleOther, { backgroundColor: previewT.bubbleOther }]}>
                    <Text style={[styles.previewTextOther, { color: previewT.id === 'midnight' ? '#FFF' : '#000' }]}>
                      Hey! Kaisa lag raha h ye new theme?
                    </Text>
                  </View>
                </View>

                {/* Me Mock Bubble */}
                <View style={styles.previewRowRight}>
                  <View style={[
                    styles.previewBubbleMe,
                    {
                      backgroundColor:
                        previewT.id === 'sunset' ? '#FF5722' :
                          previewT.id === 'ocean' ? '#0284C7' :
                            previewT.id === 'forest' ? '#16A34A' :
                              previewT.id === 'lavender' ? '#8B5CF6' :
                                previewT.id === 'midnight' ? '#7C3AED' : '#9333EA'
                    }
                  ]}>
                    <Text style={styles.previewTextMe}>
                      Wow, ye simple look bahut solid h! Apply karo isko.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons Row */}
              {isJustApplied ? (
                <View style={styles.appliedSuccessContainer}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.appliedSuccessText}>Applied Successfully!</Text>
                </View>
              ) : (
                <View style={styles.trayActionsRow}>
                  <TouchableOpacity
                    style={[styles.trayBtnCancel, { backgroundColor: previewT.id === 'midnight' ? '#2A2A38' : '#F3F4F6' }]}
                    onPress={() => setPreviewThemeId(null)}
                  >
                    <Text style={[styles.trayBtnCancelText, { color: previewT.id === 'midnight' ? '#FFF' : COLORS.text }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.trayBtnApply}
                    onPress={async () => {
                      setIsJustApplied(true);
                      setThemeId(previewThemeId);
                      setSelectedThemeId(previewThemeId);
                      await persist({ theme_id: previewThemeId }, { toast: false });
                      setTimeout(() => {
                        setIsJustApplied(false);
                        setPreviewThemeId(null);
                      }, 700);
                    }}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.trayBtnApplyText}>Apply Theme</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );
      })()}
      {/* Edit Group Name Modal */}
      <Modal
        visible={showEditNameModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowEditNameModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', backgroundColor: infoSurface, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: currentTheme.id === 'midnight' ? '#FFF' : COLORS.text, marginBottom: 16, textAlign: 'center' }}>
              Edit Group Name
            </Text>

            <TextInput
              style={{
                height: 50,
                borderWidth: 1,
                borderColor: infoBorder,
                borderRadius: 12,
                paddingHorizontal: 16,
                fontSize: 16,
                color: currentTheme.id === 'midnight' ? '#FFF' : COLORS.text,
                backgroundColor: currentTheme.id === 'midnight' ? '#12121A' : '#F9FAFB',
                marginBottom: 20,
              }}
              placeholder="Enter group name..."
              placeholderTextColor={currentTheme.id === 'midnight' ? '#8A8A9E' : COLORS.subtitle}
              value={editNameInput}
              onChangeText={setEditNameInput}
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowEditNameModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: currentTheme.id === 'midnight' ? '#2A2A38' : '#F3F4F6',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: currentTheme.id === 'midnight' ? '#FFF' : COLORS.text }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveGroupName}
                disabled={updatingGroupName || !editNameInput.trim()}
                style={{
                  flex: 2,
                  backgroundColor: '#9333EA',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                {updatingGroupName ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <PerformanceOverlay />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backWrap: { padding: 4 },
  topTitle: { fontSize: 17, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 60 },

  // Clean Simple Header Card
  headerCard: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 16,
  },
  avatarContainer: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  profileAvatar: {
    width: '100%',
    height: '100%',
  },
  usernameText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 8,
  },
  withTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },

  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    marginBottom: 8,
    marginLeft: 6,
  },

  // Themes
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeCard: {
    flex: 1,
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    position: 'relative',
  },
  swatchCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  swatchCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  themeCardText: { fontSize: 13, fontWeight: '600' },
  checkIndicator: {
    position: 'absolute',
    right: 12,
  },

  // Clean Block Cards
  cardBlock: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  cardRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    marginRight: 12,
  },
  cardTextCol: {
    flex: 1,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  cardSub: { fontSize: 12, marginTop: 1 },
  cardDivider: {
    height: 1,
    marginLeft: 46,
  },

  actionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '700',
  },

  cardRowAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  cardActionText: {
    fontSize: 15,
    fontWeight: '500',
  },

  // Minimal Segmented Control
  segmentedContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 14,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonText: {
    fontSize: 12,
  },

  // Live Theme Preview Styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 1000,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  trayContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  trayHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: 16,
  },
  trayTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  trayActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  trayBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  trayBtnApply: {
    flex: 2,
    backgroundColor: '#9333EA',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayBtnApplyText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  previewContainer: {
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  previewRowLeft: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  previewAvatarMock: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  previewBubbleOther: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderBottomLeftRadius: 2,
  },
  previewTextOther: {
    fontSize: 13,
    lineHeight: 18,
  },
  previewRowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  previewBubbleMe: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderBottomRightRadius: 2,
  },
  previewTextMe: {
    fontSize: 13,
    lineHeight: 18,
    color: '#FFF',
  },
  appliedSuccessContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 12,
  },
  appliedSuccessText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
  },
  floatingToastContainer: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 9999,
  },
  floatingToastBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  floatingToastText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

