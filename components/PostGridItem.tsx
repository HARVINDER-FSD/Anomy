import React, { useState } from 'react';
import {
  View, Image, StyleSheet, Dimensions, TouchableOpacity,
  Modal, Text, Pressable, Alert, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';

const { width } = Dimensions.get('window');
const ITEM_SIZE = width / 3; // For a 3-column grid

interface PostGridItemProps {
  post: {
    id: string;
    media_type: 'image' | 'video' | 'text';
    media_urls?: string[];
    user_id: string;
  };
  currentUserId?: string;
  onDeletePost: (postId: string) => void;
  onPress?: (postId: string) => void;
}

export const PostGridItem: React.FC<PostGridItemProps> = ({ post, currentUserId, onDeletePost, onPress }) => {
  const isVideo = post.media_type === 'video';
  const imageUrl = post.media_urls && post.media_urls.length > 0 ? post.media_urls[0] : undefined;
  const isOwner = currentUserId === post.user_id;

  const [isModalVisible, setModalVisible] = useState(false);

  const toggleModal = () => setModalVisible(v => !v);

  const handleDelete = () => {
    setModalVisible(false);
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeletePost(post.id),
        },
      ]
    );
  };

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={() => onPress && onPress(post.id)}
      activeOpacity={0.85}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} />
      ) : (
        <View style={styles.noMediaContainer}>
          <Ionicons name="image-outline" size={ITEM_SIZE / 3} color={COLORS.border} />
        </View>
      )}

      {isVideo && (
        <View style={styles.videoOverlay}>
          <Ionicons name="play-circle" size={24} color={COLORS.white} />
        </View>
      )}

      {isOwner && (
        <TouchableOpacity
          style={styles.optionsButton}
          onPress={toggleModal}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={COLORS.white} />
        </TouchableOpacity>
      )}

      {/* Bottom-sheet style options modal (no external lib) */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={toggleModal}
      >
        <Pressable style={styles.backdrop} onPress={toggleModal} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <TouchableOpacity style={styles.option} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color="#E53935" style={{ marginRight: 10 }} />
            <Text style={[styles.optionText, { color: '#E53935' }]}>Delete Post</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.option} onPress={toggleModal}>
            <Ionicons name="close-circle-outline" size={20} color={COLORS.text} style={{ marginRight: 10 }} />
            <Text style={styles.optionText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderWidth: 1,
    borderColor: COLORS.background,
    position: 'relative',
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
  optionsButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal styles
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
});
