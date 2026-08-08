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
import { resolveAvatarUrl } from '../src/utils/imageUtils';
import * as Haptics from 'expo-haptics';
import { socketService } from '../src/lib/socket';
import { useAuthStore } from '../src/store/authStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface User {
  id: string;
  _id?: string;
  username: string;
  full_name: string;
  avatar_url: string;
  verified: boolean;
}

interface ProfileShareModalProps {
  isVisible: boolean;
  onClose: () => void;
  sharedUsername: string;
  sharedAvatar?: string;
}

export const ProfileShareModal: React.FC<ProfileShareModalProps> = ({ isVisible, onClose, sharedUsername, sharedAvatar }) => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
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
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (recipientId: string) => {
    setSentUsers((prev) => new Set(prev).add(recipientId));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    try {
      const currentUser = useAuthStore.getState().user;
      // Background conversation check/create
      const convRes = await apiClient.post('/users/conversations', { 
        recipientId: recipientId,
        isAnonymous: currentUser?.isAnonymousMode === true
      });
      const convData = convRes.data?.data || convRes.data;
      const conversationId = convData?.conversation?.id || 
                             convData?.conversation?._id || 
                             convData?.id || 
                             convData?._id;

      if (!conversationId) {
        return;
      }

      const content = `https://anufy.app/profile/${sharedUsername}`;

      if (socketService.socket?.connected) {
        socketService.sendMessage({
          chatId: conversationId,
          recipientId: recipientId,
          content: content,
          type: 'profile_share',
          authorUsername: sharedUsername,
          authorAvatar: sharedAvatar,
        });
      } else {
        await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
          content: content,
          type: 'profile_share',
          author_username: sharedUsername,
          author_avatar: sharedAvatar,
        });
      }
    } catch (error) {
    }
  };

  const filteredUsers = users.filter((u) => {
    const s = search.toLowerCase();
    return u.username.toLowerCase().includes(s) || u.full_name?.toLowerCase().includes(s);
  });

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.dragIndicator} />
          
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Share Profile</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.subtitle} style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search people..."
              placeholderTextColor={COLORS.subtitle}
              style={styles.searchInput}
            />
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => (item.id || item._id || '').toString()}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const uId = item.id || item._id || '';
                const isSent = sentUsers.has(uId);

                return (
                  <View style={styles.userRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Image
                        source={{ uri: resolveAvatarUrl(item.avatar_url, item.username) }}
                        style={styles.avatar}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fullName} numberOfLines={1}>
                          {item.full_name}
                        </Text>
                        <Text style={styles.username} numberOfLines={1}>
                          @{item.username}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => !isSent && handleSend(uId)}
                      disabled={isSent}
                      style={[styles.sendBtn, isSent && styles.sentBtn]}
                    >
                      <Text style={[styles.sendBtnText, isSent && styles.sentBtnText]}>
                        {isSent ? 'Sent' : 'Send'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No followers found</Text>
              }
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: SCREEN_HEIGHT * 0.55,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: scale(20),
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: verticalScale(15),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(15),
  },
  headerTitle: {
    fontSize: moderateFont(17),
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 45,
    marginBottom: verticalScale(15),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateFont(14),
    color: COLORS.text,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
    backgroundColor: COLORS.surface,
  },
  fullName: {
    fontSize: moderateFont(14),
    fontWeight: '600',
    color: COLORS.text,
  },
  username: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle,
    marginTop: 2,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    minWidth: 70,
    alignItems: 'center',
  },
  sentBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: moderateFont(13),
  },
  sentBtnText: {
    color: COLORS.subtitle,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.subtitle,
    marginTop: 40,
    fontSize: moderateFont(14),
  },
});
