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
import { socketService } from '../src/lib/socket';
import { useAuthStore } from '../src/store/authStore';

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
  authorUsername?: string;
  authorAvatar?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isVisible, onClose, postId, postContent, mediaUrl, mediaType, isShot, authorUsername, authorAvatar }) => {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isSendingBulk, setIsSendingBulk] = useState(false);

  useEffect(() => {
    if (isVisible) {
      fetchMutualFollowers();
    } else {
      setSearch('');
      setSelectedUserIds(new Set());
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
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleBulkSend = async () => {
    if (selectedUserIds.size === 0) return;
    setIsSendingBulk(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const currentUser = useAuthStore.getState().user;
      const sendPromises = Array.from(selectedUserIds).map(async (recipientId) => {
        try {
          const convRes = await apiClient.post('/users/conversations', { 
            recipientId: recipientId,
            isAnonymous: currentUser?.isAnonymousMode === true
          });
          const convData = convRes.data?.data || convRes.data;
          const conversationId = convData?.conversation?.id || 
                                 convData?.conversation?._id || 
                                 convData?.id || 
                                 convData?._id;

          if (!conversationId) return;

          let finalType = isShot ? 'shot_share' : 'post_share';
          if (!isShot && mediaType === 'video') {
            finalType = 'shot_share';
          }

          const content = finalType === 'shot_share' ? `https://anufy.app/reels/${postId}` : `https://anufy.app/post/${postId}`;
          const resolvedMediaUrl = resolveMediaUrl(mediaUrl);
          const resolvedAvatar = resolveAvatarUrl(authorAvatar);

          if (socketService.socket?.connected) {
            socketService.sendMessage({
              chatId: conversationId,
              recipientId,
              content,
              type: finalType,
              mediaUrl: resolvedMediaUrl,
              authorUsername,
              authorAvatar: resolvedAvatar,
              tempMessageId: `share_${Date.now()}_${recipientId}`
            });
          } else {
            await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
              content,
              type: finalType,
              media_url: resolvedMediaUrl,
              author_username: authorUsername,
              author_avatar: resolvedAvatar,
            });
          }
        } catch (err) {
        }
      });

      await Promise.all(sendPromises);
      setSelectedUserIds(new Set());
      onClose();
    } catch (error) {
    } finally {
      setIsSendingBulk(false);
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
    const isSelected = selectedUserIds.has(item.id);

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
          style={styles.selectBtn} 
          onPress={() => toggleSelectUser(item.id)}
        >
          {isSelected ? (
            <Ionicons name="checkmark-circle" size={26} color={COLORS.primary} />
          ) : (
            <Ionicons name="ellipse-outline" size={26} color={COLORS.border} />
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

          <TouchableOpacity style={styles.addToStoryBtn} onPress={handleAddToStory}>
            <Image 
              source={{ uri: resolveAvatarUrl(currentUser?.avatar_url || currentUser?.avatar, currentUser?.username) }} 
              style={styles.storyAvatar} 
            />
            <Text style={styles.addToStoryText}>Add to Story</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>

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

          {selectedUserIds.size > 0 && (
            <TouchableOpacity 
              style={styles.bottomSendBtn} 
              onPress={handleBulkSend}
              disabled={isSendingBulk}
              activeOpacity={0.8}
            >
              {isSendingBulk ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.bottomSendBtnText}>
                  Send to {selectedUserIds.size} Friend{selectedUserIds.size > 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
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
    marginHorizontal: scale(20),
    paddingVertical: verticalScale(8),
    marginBottom: verticalScale(15),
  },
  storyAvatar: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    marginRight: scale(12),
    backgroundColor: COLORS.surface,
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
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(12),
    marginBottom: verticalScale(15),
    borderWidth: 1,
    borderColor: '#000000',
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
  selectBtn: {
    padding: moderateScale(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSendBtn: {
    backgroundColor: COLORS.primary,
    marginHorizontal: scale(20),
    marginBottom: verticalScale(20),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(15),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  bottomSendBtnText: {
    color: COLORS.white,
    fontSize: moderateFont(16),
    fontWeight: 'bold',
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
