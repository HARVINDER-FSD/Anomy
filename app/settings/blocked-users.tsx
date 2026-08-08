import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { COLORS } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';


export default function BlockedUsersScreen() {
  const router = useSafeRouter();
  const { updateBlockedUsers } = useAuthStore();
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  const fetchBlockedUsers = async () => {
    try {
      setLoading(true);
      // Ensure we use the correct relative path that the client will append to its base
      const res = await apiClient.get('/users/blocked-list');
      setBlockedUsers(res.data.blocked || []);
    } catch (error: any) {
      if (error.response?.status === 404) {
        setBlockedUsers([]);
      } else {
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (userId: string, username: string) => {
    try {
      const res = await apiClient.post(`/users/unblock-user`, { userId });
      if (res.data.success) {
        setBlockedUsers(prev => prev.filter(u => u.id !== userId));
        updateBlockedUsers(userId, false);
      }
    } catch (error) {
    }
  };

  const renderUser = ({ item }: { item: any }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        <Image 
          source={{ uri: resolveAvatarUrl(item.avatar, item.username) }} 
          style={styles.avatar} 
        />
        <View>
          <Text style={styles.name}>{item.name || item.username}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.unblockBtn} 
        onPress={() => handleUnblock(item.id, item.username)}
      >
        <Text style={styles.unblockBtnText}>Unblock</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : blockedUsers.length > 0 ? (
        <FlatList
          data={blockedUsers}
          renderItem={renderUser}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={60} color="#CCC" />
          <Text style={styles.emptyText}>No blocked users found.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingVertical: verticalScale(15), backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border
  },
  headerTitle: { fontSize: moderateFont(19), fontWeight: 'bold', color: COLORS.text },
  backBtn: { padding: 4 },
  list: { padding: scale(20) },
  userItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, padding: moderateScale(15), borderRadius: moderateScale(18),
    marginBottom: verticalScale(10), borderWidth: 1, borderColor: COLORS.border
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  avatar: { width: scale(45), height: scale(45), borderRadius: scale(22.5) },
  name: { fontSize: moderateFont(16), fontWeight: '700', color: COLORS.text },
  username: { fontSize: moderateFont(14), color: COLORS.subtitle },
  unblockBtn: { backgroundColor: COLORS.primary, paddingHorizontal: scale(15), paddingVertical: verticalScale(8), borderRadius: scale(12) },
  unblockBtnText: { color: '#FFF', fontWeight: '700', fontSize: moderateFont(14) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: moderateFont(16), color: COLORS.subtitle }
});
