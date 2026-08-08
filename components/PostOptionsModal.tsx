import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';

interface PostOptionsModalProps {
  isVisible: boolean;
  onClose: () => void;
  postId: string;
  isOwner: boolean;
  isPinnedInitial?: boolean;
  commentsDisabledInitial?: boolean;
  hideLikeCountInitial?: boolean;
  itemType?: 'post' | 'reel';
  onDeletePost?: (postId: string) => void;
  onPinToggle?: (postId: string, pinned: boolean) => void;
  onCommentsToggle?: (postId: string, disabled: boolean) => void;
  onLikesToggle?: (postId: string, hidden: boolean) => void;
  targetUsername?: string;
}

export const PostOptionsModal: React.FC<PostOptionsModalProps> = ({
  isVisible,
  onClose,
  postId,
  isOwner,
  isPinnedInitial = false,
  commentsDisabledInitial = false,
  hideLikeCountInitial = false,
  itemType = 'post',
  onDeletePost,
  onPinToggle,
  onCommentsToggle,
  onLikesToggle,
  targetUsername,
}) => {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const router = useSafeRouter();

  // Local state for optimistic toggles
  const [isPinned, setIsPinned] = useState(isPinnedInitial);
  const [commentsDisabled, setCommentsDisabled] = useState(commentsDisabledInitial);
  const [hideLikeCount, setHideLikeCount] = useState(hideLikeCountInitial);

  // Sync state when props change
  useEffect(() => {
    setIsPinned(isPinnedInitial);
  }, [isPinnedInitial, isVisible]);

  useEffect(() => {
    setCommentsDisabled(commentsDisabledInitial);
  }, [commentsDisabledInitial, isVisible]);

  useEffect(() => {
    setHideLikeCount(hideLikeCountInitial);
  }, [hideLikeCountInitial, isVisible]);

  // ─── Owner actions ───────────────────────────────────────────────────────

  const handleDelete = useCallback(() => {
    onClose();
    Alert.alert('Delete Post', 'Are you sure you want to delete this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDeletePost?.(postId),
      },
    ]);
  }, [postId, onDeletePost, onClose]);

  const handlePinToggle = useCallback(async () => {
    onClose();
    const next = !isPinned;
    setIsPinned(next);
    onPinToggle?.(postId, next);
    try {
      await apiClient.post(`/posts/${postId}/pin`, { pin: next });
    } catch (err: any) {
      setIsPinned(!next); // revert
      const errorMsg = err?.response?.data?.error || 'Could not update pin status';
      Alert.alert('Error', errorMsg);
    }
  }, [isPinned, postId, onPinToggle, onClose]);

  const handleToggleComments = useCallback(async () => {
    onClose();
    const next = !commentsDisabled;
    setCommentsDisabled(next);
    onCommentsToggle?.(postId, next);
    try {
      const endpoint = itemType === 'reel' ? `/reels/${postId}` : `/posts/${postId}`;
      await apiClient.patch(endpoint, { comments_disabled: next });
    } catch {
      setCommentsDisabled(!next); // revert
      Alert.alert("Error", "Could not update comment settings");
    }
  }, [commentsDisabled, postId, onCommentsToggle, onClose, itemType]);

  const handleToggleHideLikes = useCallback(async () => {
    onClose();
    const next = !hideLikeCount;
    setHideLikeCount(next);
    onLikesToggle?.(postId, next);
    try {
      const endpoint = itemType === 'reel' ? `/reels/${postId}` : `/posts/${postId}`;
      await apiClient.patch(endpoint, { hide_like_count: next });
    } catch {
      setHideLikeCount(!next); // revert
      Alert.alert("Error", "Could not update like settings");
    }
  }, [hideLikeCount, postId, onLikesToggle, onClose, itemType]);

  // ─── Viewer actions ──────────────────────────────────────────────────────

  const handleReport = useCallback(() => {
    onClose();
    router.push({ pathname: '/report', params: { targetId: postId, targetType: itemType, targetUsername } });
  }, [onClose, router, postId, itemType, targetUsername]);

  // submitReport removed as it is now handled in the new Report screen

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: COLORS.background }]}>
        <View style={styles.handle} />

        {isOwner ? (
          <>
            {/* Pin / Unpin */}
            <TouchableOpacity style={styles.option} onPress={handlePinToggle}>
              <View style={[styles.iconBox, { backgroundColor: isPinned ? '#EEF2FF' : COLORS.surface }]}>
                <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={20} color={isPinned ? '#6366F1' : COLORS.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: COLORS.text }]}>
                  {isPinned ? 'Unpin from Grid' : 'Pin to Grid'}
                </Text>
                <Text style={styles.optionSub}>
                  {isPinned ? 'Remove from top of your grid' : 'Show this post first in your grid'}
                </Text>
              </View>
              {isPinned && <Ionicons name="checkmark-circle" size={18} color="#6366F1" />}
            </TouchableOpacity>

            <View style={styles.separator} />

            {/* Turn off / on comments */}
            <TouchableOpacity style={styles.option} onPress={handleToggleComments}>
              <View style={[styles.iconBox, { backgroundColor: commentsDisabled ? '#FFF7ED' : COLORS.surface }]}>
                <Ionicons name={commentsDisabled ? 'chatbubble' : 'chatbubble-outline'} size={20} color={commentsDisabled ? '#F97316' : COLORS.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: COLORS.text }]}>
                  {commentsDisabled ? 'Turn On Comments' : 'Turn Off Comments'}
                </Text>
                <Text style={styles.optionSub}>
                  {commentsDisabled ? 'Allow others to comment' : 'No one can comment on this post'}
                </Text>
              </View>
              {commentsDisabled && <Ionicons name="checkmark-circle" size={18} color="#F97316" />}
            </TouchableOpacity>

            <View style={styles.separator} />

            {/* Hide / Show like count */}
            <TouchableOpacity style={styles.option} onPress={handleToggleHideLikes}>
              <View style={[styles.iconBox, { backgroundColor: hideLikeCount ? '#FFF0F0' : COLORS.surface }]}>
                <Ionicons name={hideLikeCount ? 'heart' : 'heart-outline'} size={20} color={hideLikeCount ? '#EF4444' : COLORS.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: COLORS.text }]}>
                  {hideLikeCount ? 'Show Like Count' : 'Hide Like Count'}
                </Text>
                <Text style={styles.optionSub}>
                  {hideLikeCount ? 'Make likes visible to everyone' : 'Only you can see the like count'}
                </Text>
              </View>
              {hideLikeCount && <Ionicons name="checkmark-circle" size={18} color="#EF4444" />}
            </TouchableOpacity>

            <View style={styles.separator} />

            {/* Delete */}
            <TouchableOpacity style={styles.option} onPress={handleDelete}>
              <View style={[styles.iconBox, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: '#EF4444' }]}>Delete Post</Text>
                <Text style={styles.optionSub}>Permanently remove this post</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Report */}
            <TouchableOpacity style={styles.option} onPress={handleReport}>
              <View style={[styles.iconBox, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="flag-outline" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: '#EF4444' }]}>Report Post</Text>
                <Text style={styles.optionSub}>Report inappropriate or harmful content</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
            </TouchableOpacity>
          </>
        )}

        <View style={styles.separator} />

        {/* Cancel */}
        <TouchableOpacity style={[styles.option, { paddingBottom: Platform.OS === 'ios' ? 6 : 0 }]} onPress={onClose}>
          <View style={[styles.iconBox, { backgroundColor: COLORS.surface }]}>
            <Ionicons name="close" size={20} color={COLORS.subtitle} />
          </View>
          <Text style={[styles.optionText, { color: COLORS.subtitle }]}>Cancel</Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && <View style={{ height: 20 }} />}
      </View>
    </Modal>
  );
};

const getStyles = (COLORS: any) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionSub: {
    fontSize: 12,
    color: COLORS.subtitle,
    marginTop: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border + '60',
    marginVertical: 2,
  },
});
