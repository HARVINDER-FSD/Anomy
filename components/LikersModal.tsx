import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, FlatList,
  Image, ActivityIndicator, SafeAreaView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '@/src/api/client';
import { COLORS } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';

interface LikersModalProps {
  isVisible: boolean;
  onClose: () => void;
  postId: string;
}

export const LikersModal: React.FC<LikersModalProps> = ({ isVisible, onClose, postId }) => {
  const router = useRouter();
  const [likers, setLikers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isVisible && postId) {
      fetchAllLikers();
    }
  }, [isVisible, postId]);

  const fetchAllLikers = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/posts/${postId}/likers?limit=100`);
      if (res.data?.success && res.data?.likers) {
        setLikers(res.data.likers);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleUserPress = (username: string) => {
    onClose();
    setTimeout(() => {
      router.push(`/user/${username}`);
    }, 300);
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Likes</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Likers List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.secondary} />
          </View>
        ) : (
          <FlatList
            data={likers}
            keyExtractor={(item, index) => item._id || item.id || String(index)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.likerRow}
                onPress={() => handleUserPress(item.username)}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: resolveAvatarUrl(item.avatar_url || item.avatar, item.username) }}
                  style={styles.likerAvatar}
                />
                <View style={styles.likerInfo}>
                  <Text style={styles.likerUsername}>{item.username}</Text>
                  {item.full_name && (
                    <Text style={styles.likerFullName}>{item.full_name}</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="heart-outline" size={48} color={COLORS.border} />
                <Text style={styles.emptyText}>No likes yet</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  headerTitle: {
    fontSize: moderateFont(16),
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    position: 'absolute',
    right: scale(16),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  likerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
  },
  likerAvatar: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: '#F0F0F0',
  },
  likerInfo: {
    marginLeft: scale(12),
    flex: 1,
  },
  likerUsername: {
    fontSize: moderateFont(14),
    fontWeight: '700',
    color: COLORS.text,
  },
  likerFullName: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle,
    marginTop: verticalScale(2),
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: verticalScale(60),
  },
  emptyText: {
    fontSize: moderateFont(14),
    color: COLORS.subtitle,
    marginTop: verticalScale(12),
  },
});
