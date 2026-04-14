import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '../src/utils/responsive';
import { apiClient } from '../src/api/client';
import { resolveAvatarUrl, resolveMediaUrl } from '../src/utils/imageUtils';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface User {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  verified: boolean;
}

interface ShareModalProps {
  isVisible: boolean;
  onClose: () => void;
  postId: string;
  postContent?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  isShot?: boolean;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isVisible, onClose, postId, postContent, mediaUrl, mediaType, isShot }) => {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentUsers, setSentUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isVisible) {
      fetchMutualFollowers();
    } else {
      setSearch('');
      setSentUsers(new Set());
    }
  }, [isVisible]);

  const fetchMutualFollowers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/users/list?mutual=true&limit=20');
      if (response.data.success) {
        setUsers(response.data.data.users);
      }
    } catch (error) {
      console.error('[ShareModal] Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (recipientId: string) => {
    setSendingTo(recipientId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Get or create conversation
      const convRes = await apiClient.post('/chat/conversations', { userId: recipientId });
      const conversationId = convRes.data.id || convRes.data._id;

      // 2. Send post as a message
      // We can use a special message_type 'post_share' if backend supports it, 
      // otherwise send as text with post link
      await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
        content: `Check out this post: https://anufy.app/post/${postId}\n\n${postContent || ''}`,
        type: 'text', // Or 'post_share' if implemented
      });

      setSentUsers(prev => new Set(prev).add(recipientId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[ShareModal] Error sending post:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSendingTo(null);
    }
  };

  const handleAddToStory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    
    // Construct params for create-story
    const params: any = {
      type: isShot ? 'shot_share' : 'post_share',
    };

    if (isShot) {
      params.shotId = postId;
      params.videoUrl = mediaUrl;
    } else {
      params.postId = postId;
      params.mediaUrl = mediaUrl;
      params.mediaType = mediaType || 'image';
    }

    router.push({
      pathname: '/create-story',
      params
    });
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(search.toLowerCase()) || 
    user.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const renderUser = ({ item }: { item: User }) => {
    const isSent = sentUsers.has(item.id);
    const isSending = sendingTo === item.id;

    return (
      <View style={styles.userItem}>
        <View style={styles.userInfo}>
          <Image 
            source={{ uri: resolveAvatarUrl(item.avatar_url, item.username) }} 
            style={styles.avatar} 
          />
          <View style={styles.userDetails}>
            <View style={styles.usernameRow}>
              <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
              {item.verified && <Ionicons name="checkmark-circle" size={14} color={COLORS.info} style={{ marginLeft: 4 }} />}
            </View>
            <Text style={styles.fullName} numberOfLines={1}>{item.full_name}</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={[
            styles.sendBtn, 
            isSent && styles.sentBtn,
            isSending && { opacity: 0.7 }
          ]} 
          onPress={() => !isSent && handleSend(item.id)}
          disabled={isSent || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={[styles.sendBtnText, isSent && styles.sentBtnText]}>
              {isSent ? 'Sent' : 'Send'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={styles.title}>Send to Friends</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.addToStoryBtn} onPress={handleAddToStory}>
            <View style={styles.storyIconBox}>
              <Ionicons name="aperture" size={24} color={COLORS.white} />
            </View>
            <Text style={styles.addToStoryText}>Add to Story</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={COLORS.subtitle} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search mutual followers..."
              placeholderTextColor={COLORS.subtitle}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading && users.length === 0 ? (
            <View style={styles.centerNode}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              renderItem={renderUser}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {search ? 'No mutual followers found' : 'No mutual followers to share with'}
                  </Text>
                </View>
              }
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: moderateScale(25),
    borderTopRightRadius: moderateScale(25),
    height: SCREEN_HEIGHT * 0.6,
    paddingTop: verticalScale(10),
  },
  handle: {
    width: scale(40),
    height: verticalScale(5),
    backgroundColor: COLORS.border,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: verticalScale(10),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    marginBottom: verticalScale(15),
  },
  title: {
    fontSize: moderateFont(18),
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeBtn: {
    padding: 5,
  },
  addToStoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: scale(20),
    padding: moderateScale(12),
    borderRadius: moderateScale(15),
    marginBottom: verticalScale(15),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  storyIconBox: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(12),
  },
  addToStoryText: {
    flex: 1,
    fontSize: moderateFont(16),
    fontWeight: '600',
    color: COLORS.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: scale(20),
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    marginBottom: verticalScale(15),
  },
  searchIcon: {
    marginRight: scale(8),
  },
  searchInput: {
    flex: 1,
    height: verticalScale(40),
    fontSize: moderateFont(15),
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: scale(20),
    paddingBottom: verticalScale(20),
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: moderateScale(45),
    height: moderateScale(45),
    borderRadius: moderateScale(22.5),
    backgroundColor: COLORS.surface,
  },
  userDetails: {
    marginLeft: scale(12),
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: moderateFont(15),
    fontWeight: '600',
    color: COLORS.text,
  },
  fullName: {
    fontSize: moderateFont(13),
    color: COLORS.subtitle,
    marginTop: 2,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
    minWidth: scale(70),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtnText: {
    color: COLORS.black,
    fontSize: moderateFont(14),
    fontWeight: 'bold',
  },
  sentBtnText: {
    color: COLORS.subtitle,
  },
  centerNode: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    marginTop: verticalScale(50),
    alignItems: 'center',
  },
  emptyText: {
    fontSize: moderateFont(15),
    color: COLORS.subtitle,
    textAlign: 'center',
  },
});
