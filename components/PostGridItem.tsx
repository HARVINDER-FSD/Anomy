import React, { useState, useCallback } from 'react';
import { Image } from 'expo-image';
import {
  View, StyleSheet, Dimensions, TouchableOpacity,
  Modal, Text, Pressable, Alert, Platform, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';

const { width } = Dimensions.get('window');
const ITEM_SIZE = width / 3;

interface PostGridItemProps {
  post: {
    id: string;
    media_type: 'image' | 'video' | 'text';
    media_urls?: string[];
    user_id: string;
    is_pinned?: boolean;
    comments_disabled?: boolean;
    hide_like_count?: boolean;
  };
  currentUserId?: string;
  onDeletePost: (postId: string) => void;
  onPress?: (postId: string) => void;
  isShot?: boolean;
  onPinToggle?: (postId: string, pinned: boolean) => void;
  onRefresh?: () => void;
}

export const PostGridItem: React.FC<PostGridItemProps> = ({
  post,
  currentUserId,
  onDeletePost,
  onPress,
  isShot,
  onPinToggle,
  onRefresh,
}) => {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);

  const isVideo = post.media_type === 'video';
  const imageUrl =
    (post.media_urls && post.media_urls.length > 0 ? post.media_urls[0] : undefined) ||
    (post as any).thumbnail_url ||
    (post as any).thumbnail ||
    (post as any).video_thumbnail ||
    (post as any).thumbnailUrl ||
    (post as any).videoThumbnail ||
    (post as any).video_url ||
    (post as any).videoUrl ||
    (post as any).content_url ||
    '';
  const isOwner = currentUserId === post.user_id;

  const [isModalVisible, setModalVisible] = useState(false);

  // Local state for optimistic toggles
  const [isPinned, setIsPinned] = useState(!!post.is_pinned);
  const [commentsOff, setCommentsOff] = useState(!!post.comments_disabled);
  const [hideLikes, setHideLikes] = useState(!!post.hide_like_count);

  const closeModal = useCallback(() => setModalVisible(false), []);

  // ─── Owner actions ───────────────────────────────────────────────────────

  const handleDelete = useCallback(() => {
    closeModal();
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDeletePost(post.id),
      },
    ]);
  }, [post.id, onDeletePost, closeModal]);

  const handlePinToggle = useCallback(async () => {
    closeModal();
    const next = !isPinned;
    setIsPinned(next);
    onPinToggle?.(post.id, next);
    try {
      await apiClient.post(`/posts/${post.id}/pin`, { pin: next });
    } catch {
      setIsPinned(!next); // revert on error
    }
  }, [isPinned, post.id, onPinToggle, closeModal]);

  const handleToggleComments = useCallback(async () => {
    closeModal();
    const next = !commentsOff;
    setCommentsOff(next);
    try {
      await apiClient.patch(`/posts/${post.id}`, { comments_disabled: next });
    } catch {
      setCommentsOff(!next);
    }
  }, [commentsOff, post.id, closeModal]);

  const handleToggleHideLikes = useCallback(async () => {
    closeModal();
    const next = !hideLikes;
    setHideLikes(next);
    try {
      await apiClient.patch(`/posts/${post.id}`, { hide_like_count: next });
    } catch {
      setHideLikes(!next);
    }
  }, [hideLikes, post.id, closeModal]);

  // ─── Viewer actions ──────────────────────────────────────────────────────

  const handleReport = useCallback(async () => {
    closeModal();
    Alert.alert(
      'Report Post',
      'Why are you reporting this post?',
      [
        { text: 'Spam', onPress: () => submitReport('spam') },
        { text: 'Inappropriate content', onPress: () => submitReport('inappropriate') },
        { text: 'Harassment', onPress: () => submitReport('harassment') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [closeModal]);

  const submitReport = useCallback(async (reason: string) => {
    try {
      await apiClient.post(`/posts/${post.id}/report`, { reason });
      Alert.alert('Reported', 'Thank you for your report. We will review it shortly.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  }, [post.id]);

  return (
    <TouchableOpacity
      style={[styles.container, isShot && styles.shotContainer]}
      onPress={() => onPress && onPress(post.id)}
      activeOpacity={0.85}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View style={styles.noMediaContainer}>
          <Ionicons name="image-outline" size={ITEM_SIZE / 3} color={COLORS.border} />
        </View>
      )}

      {isVideo && (
        <View style={styles.videoOverlay}>
          <Ionicons name="play-circle" size={24} color="#FFF" />
        </View>
      )}

      {/* Pin badge on grid */}
      {isPinned && (
        <View style={styles.pinBadge}>
          <Ionicons name="pin" size={11} color="#FFF" />
        </View>
      )}

      {/* 3-dot button — always visible for owner OR other user */}
      <TouchableOpacity
        style={styles.optionsButton}
        onPress={(e) => { e.stopPropagation?.(); setModalVisible(true); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-vertical" size={16} color="#FFF" />
      </TouchableOpacity>

      {/* ─── OWNER bottom-sheet ─── */}
      {isOwner && (
        <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={closeModal}>
          <Pressable style={styles.backdrop} onPress={closeModal} />
          <View style={[styles.sheet, { backgroundColor: COLORS.background }]}>
            <View style={styles.handle} />

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
              <View style={[styles.iconBox, { backgroundColor: commentsOff ? '#FFF7ED' : COLORS.surface }]}>
                <Ionicons name={commentsOff ? 'chatbubble' : 'chatbubble-outline'} size={20} color={commentsOff ? '#F97316' : COLORS.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: COLORS.text }]}>
                  {commentsOff ? 'Turn On Comments' : 'Turn Off Comments'}
                </Text>
                <Text style={styles.optionSub}>
                  {commentsOff ? 'Allow others to comment' : 'No one can comment on this post'}
                </Text>
              </View>
              {commentsOff && <Ionicons name="checkmark-circle" size={18} color="#F97316" />}
            </TouchableOpacity>

            <View style={styles.separator} />

            {/* Hide / Show like count */}
            <TouchableOpacity style={styles.option} onPress={handleToggleHideLikes}>
              <View style={[styles.iconBox, { backgroundColor: hideLikes ? '#FFF0F0' : COLORS.surface }]}>
                <Ionicons name={hideLikes ? 'heart' : 'heart-outline'} size={20} color={hideLikes ? '#EF4444' : COLORS.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: COLORS.text }]}>
                  {hideLikes ? 'Show Like Count' : 'Hide Like Count'}
                </Text>
                <Text style={styles.optionSub}>
                  {hideLikes ? 'Make likes visible to everyone' : 'Only you can see the like count'}
                </Text>
              </View>
              {hideLikes && <Ionicons name="checkmark-circle" size={18} color="#EF4444" />}
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

            <View style={styles.separator} />

            {/* Cancel */}
            <TouchableOpacity style={[styles.option, { paddingBottom: Platform.OS === 'ios' ? 6 : 0 }]} onPress={closeModal}>
              <View style={[styles.iconBox, { backgroundColor: COLORS.surface }]}>
                <Ionicons name="close" size={20} color={COLORS.subtitle} />
              </View>
              <Text style={[styles.optionText, { color: COLORS.subtitle }]}>Cancel</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && <View style={{ height: 20 }} />}
          </View>
        </Modal>
      )}

      {/* ─── VIEWER (other user's post) bottom-sheet ─── */}
      {!isOwner && (
        <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={closeModal}>
          <Pressable style={styles.backdrop} onPress={closeModal} />
          <View style={[styles.sheet, { backgroundColor: COLORS.background }]}>
            <View style={styles.handle} />

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

            <View style={styles.separator} />

            {/* Cancel */}
            <TouchableOpacity style={[styles.option, { paddingBottom: Platform.OS === 'ios' ? 6 : 0 }]} onPress={closeModal}>
              <View style={[styles.iconBox, { backgroundColor: COLORS.surface }]}>
                <Ionicons name="close" size={20} color={COLORS.subtitle} />
              </View>
              <Text style={[styles.optionText, { color: COLORS.subtitle }]}>Cancel</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && <View style={{ height: 20 }} />}
          </View>
        </Modal>
      )}
    </TouchableOpacity>
  );
};

const getStyles = (COLORS: any) => StyleSheet.create({
  container: {
    width: ITEM_SIZE - 4,
    height: (ITEM_SIZE - 4) * 1.35,
    margin: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.background,
    position: 'relative',
    overflow: 'hidden',
  },
  shotContainer: {
    height: (ITEM_SIZE - 4) * (16 / 9),
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  noMediaContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface ?? '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoOverlay: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 2,
  },
  pinBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: '#6366F1',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
