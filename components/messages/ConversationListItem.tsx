import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Pressable, Platform, Animated, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons as MCI } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/src/theme/colors';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { apiClient } from '@/src/api/client';
import { useChatStore } from '@/src/store/chatStore';
import {
  openChat,
  prepareChatFromConversation,
  warmChatIntent,
} from '@/src/lib/chatNavigation';
import { clearConversationNotifications } from '@/src/components/NotificationManager';
import { ANIMATED_STICKERS } from '@/src/constants/animated-stickers';

export type ConversationListItemProps = {
  item: any;
  currentUserId: string;
  isTyping?: boolean;
};

function otherParticipant(conv: any, myId: string) {
  const parts = conv?.participants || [];
  for (const p of parts) {
    const u = p?.user || p;
    if (!u) continue;
    const uid = (typeof u === 'string' ? u : (u._id || u.id))?.toString?.();
    if (uid && uid !== myId) {
      return typeof u === 'object' ? u : { _id: uid };
    }
  }
  return null;
}

function unreadFor(conv: any, myId: string): number {
  const last = conv?.last_message;
  const senderId = (last?.sender_id?._id || last?.sender_id)?.toString?.();
  const isMine = senderId === myId;
  if (isMine) return 0;

  const map = conv?.unread_counts;
  if (map && typeof map === 'object') {
    const v = map[myId];
    if (typeof v === 'number' && v > 0) return v;
  }
  const count = Number(conv?.unread_count) || 0;
  if (count > 0) return count;

  // Fallback: If last message is from someone else and status is not read, count as 1 unread!
  if (last && !isMine && last.status !== 'read') {
    return 1;
  }
  return 0;
}

function smartTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = Date.now();
    const diff = now - date.getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export const ConversationListItem = React.memo<ConversationListItemProps>(({
  item,
  currentUserId,
  isTyping = false,
}) => {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const router = useSafeRouter();
  const other = useMemo(() => otherParticipant(item, currentUserId), [item, currentUserId]);
  
  const isAnon = !!item?.is_anonymous;

  // Detect deleted user account
  const isDeletedUser = useMemo(() => {
    if (item?.type === 'group') return false;
    if (!other) return false;
    return !!(other?.is_deleted_user);
  }, [other, item]);

  const title = useMemo(() => {
    if (item?.type === 'group') {
      return item?.name || 'Group Chat';
    }
    if (isDeletedUser) return 'AnuFy User';
    if (isAnon) {
      const gUsername = other?.anonymousPersona?.username || other?.ghost_persona?.username || other?.anonymousPersona?.name || other?.ghost_persona?.name;
      if (gUsername) return gUsername.replace(/^@/, '');
      return 'Anonymous Ghost';
    }
    return other?.full_name || other?.fullName || other?.username || 'AnuFy User';
  }, [item, other, isAnon, isDeletedUser]);

  const avatar = useMemo(() => {
    if (item?.type === 'group') {
      return item?.avatar || '';
    }
    if (isDeletedUser) return ''; // Will use default AnuFy icon
    if (isAnon) {
      return other?.anonymousPersona?.avatar || other?.ghost_persona?.avatar || resolveAvatarUrl(undefined, title, true);
    }
    return other?.avatar_url || other?.avatar;
  }, [item, other, isAnon, title, isDeletedUser]);

  const isUserOnline = useMemo(() => {
    if (isAnon || isDeletedUser) return false;
    return !!(item?.is_online || item?.isOnline || other?.is_online || other?.isOnline);
  }, [item?.is_online, item?.isOnline, other?.is_online, other?.isOnline, isAnon, isDeletedUser]);

  const last = item?.last_message;
  const ur = unreadFor(item, currentUserId);

  const [menuVisible, setMenuVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(!!item?.is_muted);
  const isPinned = !!item?.is_pinned;
  const slideAnim = React.useRef(new Animated.Value(300)).current;
  const pressLockRef = React.useRef(false);

  const showMenu = useCallback(() => {
    setMenuVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [slideAnim]);

  const hideMenu = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setMenuVisible(false));
  }, [slideAnim]);

  // Is the last message mine?
  const isMine = useMemo(() => {
    const sid = last?.sender_id?._id?.toString?.() || last?.sender_id?.toString?.();
    return sid === currentUserId;
  }, [last, currentUserId]);

  // Message content preview
  const msgContent = useMemo(() => {
    if (!last) return 'No messages yet';
    if (last.is_deleted) return 'Message deleted';
    let text = '';
    if (last.message_type === 'image') text = '📷 Photo';
    else if (last.message_type === 'video') text = '🎥 Video';
    else if (last.message_type === 'audio') text = '🎤 Voice message';
    else if (last.message_type === 'sticker') {
      text = last.content || ANIMATED_STICKERS.find((s: any) => s.url === last.media_url)?.emoji || '✨ Sticker';
    }
    else if (last.message_type === 'shot_share') text = '📽️ Shot';
    else if (last.message_type === 'post_share') text = '🖼️ Post';
    else text = last.content || '';
    if (last.reply_to_id) {
      return isMine ? `You replied: ${text}` : `↳ ${text}`;
    }
    return text;
  }, [last, isMine]);

  const timeStr = useMemo(() => smartTime(last?.created_at || item?.updated_at || ''), [last?.created_at, item?.updated_at]);

  const [tick, setTick] = useState(0);

  // ⏱️ Real-time 30-second auto ticker (updates "Seen just now" -> "Seen 1m ago" -> "Seen 2m ago" dynamically)
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const previewLine = useMemo(() => {
    if (isTyping) return 'typing...';
    if (!last) return 'No messages yet';
    if (last.reply_to_id) return msgContent;
    if (isMine) {
      // Check if message is read (status field or read_by array)
      const isRead = last.status === 'read' ||
        (last.read_by && Array.isArray(last.read_by) && last.read_by.length > 0);

      if (isRead) {
        const readTime = last.readAt || last.read_at || (() => {
          if (last.read_by && Array.isArray(last.read_by)) {
            const entry = last.read_by.find((r: any) => {
              const rUid = r.user_id?._id || r.user_id;
              return rUid && rUid.toString() !== currentUserId?.toString();
            });
            return entry?.read_at || entry?.readAt;
          }
          return null;
        })() || last.updated_at || last.created_at;

        const relativeStr = readTime ? smartTime(readTime) : '';
        return relativeStr ? (relativeStr === 'just now' ? 'Seen just now' : `Seen ${relativeStr}`) : 'Seen';
      }
      const sentTime = last.created_at || item.updated_at;
      const relativeStr = sentTime ? smartTime(sentTime) : '';
      return relativeStr ? (relativeStr === 'just now' ? 'Sent just now' : `Sent ${relativeStr}`) : 'Sent';
    }
    if (ur >= 2) {
      const capped = Math.min(ur, 4);
      return `${capped} new messages`;
    }
    return msgContent;
  }, [isTyping, isMine, last, msgContent, item?.updated_at, ur, currentUserId, tick]);

  const unreadLabel = useMemo(() => {
    if (isMine || ur <= 1) return null;
    return String(Math.min(ur, 4));
  }, [ur, isMine]);

  const onPressIn = useCallback(() => {
    warmChatIntent(prepareChatFromConversation(item, other, currentUserId));
  }, [item, other, currentUserId]);

  const onPress = useCallback(() => {
    if (pressLockRef.current) return;
    pressLockRef.current = true;
    setTimeout(() => { pressLockRef.current = false; }, 1000);

    const convId = (item._id || item.id)?.toString?.();
    if (convId) clearConversationNotifications(convId);
    openChat(router, prepareChatFromConversation(item, other, currentUserId));
    requestAnimationFrame(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    });
  }, [item, other, router, currentUserId]);

  const onLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showMenu();
  }, [showMenu]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    hideMenu();
    const convId = item._id?.toString?.() || item.id;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Optimistic remove from store
    useChatStore.getState().setConversations(
      useChatStore.getState().conversations.filter((c: any) =>
        (c._id || c.id)?.toString() !== convId
      )
    );
    try {
      await apiClient.delete(`/chat/conversations/${convId}/clear`);
    } catch (e) {
    }
  }, [item, hideMenu]);

  const handleMute = useCallback(async () => {
    hideMenu();
    const convId = item._id?.toString?.() || item.id;
    const otherId = (other?._id || other?.id)?.toString?.();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (otherId) await apiClient.post(`/users/${otherId}/mute`);
    } catch (e) {
      setIsMuted(!newMuted);
    }
  }, [item, other, isMuted, hideMenu]);

  const handlePin = useCallback(async () => {
    hideMenu();
    const convId = item._id?.toString?.() || item.id;
    const newPinned = !isPinned;

    if (newPinned) {
      const pinnedCount = useChatStore.getState().conversations.filter((c: any) => c.is_pinned).length;
      if (pinnedCount >= 5) {
        Alert.alert('Pin Limit Reached', 'You can only pin up to 5 chats.');
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Update store optimistically
    useChatStore.getState().setConversations(
      useChatStore.getState().conversations.map((c: any) =>
        (c._id || c.id)?.toString() === convId
          ? { ...c, is_pinned: newPinned }
          : c
      )
    );
    try {
      await apiClient.post(`/chat/conversations/${convId}/pin`, { pin: newPinned });
    } catch (e) {
      // Revert optimistic update
      useChatStore.getState().setConversations(
        useChatStore.getState().conversations.map((c: any) =>
          (c._id || c.id)?.toString() === convId
            ? { ...c, is_pinned: !newPinned }
            : c
        )
      );
    }
  }, [item, isPinned, hideMenu]);

  const handleCardSkip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const convId = (item._id || item.id)?.toString?.();
    if (!convId) return;

    useChatStore.getState().removeConversation(convId);
    try {
      await apiClient.post('/chat/anonymous/end', { conversationId: convId });
    } catch (e) {
    }
  }, [item]);

  const handleCardReport = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const convId = (item._id || item.id)?.toString?.();
    const targetUserId = (other?._id || other?.id)?.toString?.();
    if (!convId) return;

    Alert.alert(
      'Report & Block Stranger',
      'Are you sure you want to report this stranger? They will be blocked and the chat will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report & Block',
          style: 'destructive',
          onPress: async () => {
            useChatStore.getState().setConversations(
              useChatStore.getState().conversations.filter((c: any) =>
                (c._id || c.id)?.toString() !== convId
              )
            );
            try {
              await apiClient.post('/chat/anonymous/report', {
                reportedUserId: targetUserId || 'anonymous',
                conversationId: convId,
                reason: 'Reported from chat list'
              });
            } catch (e) {
            }
          }
        }
      ]
    );
  }, [item, other]);

  return (
    <>
      <TouchableOpacity
        style={[styles.row, isPinned && styles.rowPinned]}
        onPressIn={onPressIn}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        delayPressIn={100}
      >
        {/* Pin indicator */}
        {isPinned && (
          <MCI
            name="pin"
            size={12}
            color={COLORS.primary}
            style={styles.pinIcon}
          />
        )}

        <View style={styles.avatarContainer}>
          {isDeletedUser ? (
            <View style={[styles.avatar, { backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }]}>
              <MCI name="account-remove" size={28} color={COLORS.subtitle} />
            </View>
          ) : (
            <Image
              source={{ uri: resolveAvatarUrl(avatar, title, isAnon) }}
              style={styles.avatar}
              contentFit="cover"
              transition={0}
            />
          )}
          {isUserOnline && <View style={styles.onlineBadge} />}
          {isMuted && (
            <View style={styles.muteBadge}>
              <MCI name="volume-mute" size={9} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.mid}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text numberOfLines={1} style={[styles.name, isAnon && styles.nameAnon, isDeletedUser && { color: COLORS.subtitle }, ur > 0 && styles.nameUnread]}>
                {title}
              </Text>
              {isDeletedUser && (
                <MCI name="account-remove-outline" size={13} color={COLORS.subtitle} style={{ marginLeft: 4, marginTop: 1 }} />
              )}
            </View>
          </View>
          
          <View style={styles.previewRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
              <Text numberOfLines={1} style={[
                styles.preview,
                isTyping && { color: COLORS.primary, fontWeight: '700', fontStyle: 'italic' },
                !isTyping && ur > 0 && !isMine && styles.previewUnread,
              ]}>
                {previewLine}
              </Text>
            </View>

            {!!unreadLabel && ur >= 4 && (
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>{unreadLabel}</Text>
              </View>
            )}
            {!!unreadLabel && ur < 4 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadLabel}</Text>
              </View>
            )}
          </View>
        </View>

        {!isAnon ? (
          <TouchableOpacity 
            style={styles.callIconBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <MCI name="phone-outline" size={24} color={COLORS.secondary} />
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={styles.anonActionBtnSkip}
              onPress={handleCardSkip}
            >
              <MCI name="skip-next" size={16} color="#FF9800" />
              <Text style={styles.anonActionBtnTextSkip}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.anonActionBtnReport}
              onPress={handleCardReport}
            >
              <MCI name="flag-outline" size={16} color="#FF3B30" />
              <Text style={styles.anonActionBtnTextReport}>Report</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Long-press Action Menu ── */}
      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={hideMenu}>
        <Pressable style={styles.backdrop} onPress={hideMenu} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* User info header */}
          <View style={styles.sheetHeader}>
            <Image
              source={{ uri: resolveAvatarUrl(avatar, title, isAnon) }}
              style={styles.sheetAvatar}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetName}>{title}</Text>
              <Text style={styles.sheetSub}>
                {last?.content
                  ? (last.content.length > 40 ? last.content.slice(0, 40) + '…' : last.content)
                  : 'No messages yet'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Actions */}
          <TouchableOpacity style={styles.action} onPress={handlePin}>
            <View style={[styles.actionIcon, { backgroundColor: '#EEF2FF' }]}>
              <MCI name={isPinned ? 'pin' : 'pin-outline'} size={20} color="#6366F1" />
            </View>
            <Text style={styles.actionText}>{isPinned ? 'Unpin Chat' : 'Pin Chat'}</Text>
            <MCI name="chevron-right" size={16} color="#CCC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.action} onPress={handleMute}>
            <View style={[styles.actionIcon, { backgroundColor: '#F0FDF4' }]}>
              <MCI
                name={isMuted ? 'bell-outline' : 'bell-off-outline'}
                size={20}
                color="#16A34A"
              />
            </View>
            <Text style={styles.actionText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            <MCI name="chevron-right" size={16} color="#CCC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.action} onPress={handleDelete}>
            <View style={[styles.actionIcon, { backgroundColor: '#FEF2F2' }]}>
              <MCI name="delete-outline" size={20} color="#EF4444" />
            </View>
            <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete Chat</Text>
            <MCI name="chevron-right" size={16} color="#CCC" />
          </TouchableOpacity>

          <View style={{ height: Platform.OS === 'ios' ? 34 : 16 }} />
        </Animated.View>
      </Modal>
    </>
  );
});

const getStyles = (COLORS: any) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
  },
  rowPinned: {
    backgroundColor: COLORS.surface,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  pinIcon: {
    position: 'absolute',
    top: 8,
    right: 12,
  },
  avatarContainer: { position: 'relative' },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F3F4F6' },
  onlineBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    borderWidth: 2.5,
    borderColor: COLORS.background,
  },
  muteBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#9CA3AF',
    borderWidth: 2.5,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text, flexShrink: 1 },
  nameAnon: { color: COLORS.secondary },
  nameUnread: { fontWeight: '800' },
  time: { fontSize: 12, color: COLORS.subtitle },
  timeUnread: { color: COLORS.primary, fontWeight: '700' },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview: { fontSize: 14, color: COLORS.subtitle, flex: 1 },
  previewUnread: { color: COLORS.text, fontWeight: '800' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  badgePill: {
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  callIconBtn: {
    paddingLeft: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  anonActionBtnSkip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 152, 0, 0.12)',
    gap: 3,
  },
  anonActionBtnTextSkip: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF9800',
  },
  anonActionBtnReport: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    gap: 3,
  },
  anonActionBtnTextReport: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF3B30',
  },

  // ── Bottom Sheet ──
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
  },
  sheetAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F3F4F6',
  },
  sheetName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sheetSub: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F3F4F6',
    marginBottom: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
});
