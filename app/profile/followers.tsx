import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, SafeAreaView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';

export default function FollowListScreen() {
  const { userId, type } = useLocalSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setErrorMsg(null);
      const endpoint = type === 'followers' ? `/users/${userId}/followers` : `/users/${userId}/following`;
      const res = await apiClient.get(endpoint);
      setUsers(res.data.data || res.data || []);
    } catch (error: any) {
      console.error("Error fetching follow list:", error);
      if (error.response?.status === 403) {
        setErrorMsg("This account is private. Follow them to see their followers.");
      } else {
        Alert.alert("Error", "Could not load list.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [userId, type]);

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.userItem}
      onPress={() => router.push(`/user/${item.username}`)}
    >
      <Image 
        source={{ uri: item.profileImage || item.avatar_url || item.avatar || 'https://ui-avatars.com/api/?name=' + item.username }} 
        style={styles.avatar} 
      />
      <View style={styles.userInfo}>
        <Text style={styles.fullName}>{item.fullName || item.full_name || item.username}</Text>
        <Text style={styles.username}>@{item.username}</Text>
        {(item.isMutualFollow || item.followsBack) && (
          <Text style={styles.mutualFollowText}>Follows you back</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.border} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{type === 'followers' ? 'Followers' : 'Following'}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.centerNode}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id || item._id}
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons 
                name={errorMsg ? "lock-closed-outline" : "people-outline"} 
                size={60} 
                color={COLORS.border} 
              />
              <Text style={styles.emptyText}>{errorMsg || "No users found."}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingBottom: verticalScale(15), borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    backgroundColor: COLORS.white
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text, textTransform: 'capitalize' },
  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: scale(20) },
  userItem: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(20) },
  avatar: { width: scale(50), height: scale(50), borderRadius: scale(25), marginRight: scale(15), backgroundColor: COLORS.surface },
  userInfo: { flex: 1 },
  fullName: { fontSize: moderateFont(16), fontWeight: 'bold', color: COLORS.text },
  username: { fontSize: moderateFont(14), color: COLORS.subtitle, marginTop: verticalScale(2) },
  mutualFollowText: { fontSize: moderateFont(12), color: COLORS.secondary, marginTop: verticalScale(4), fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: verticalScale(100) },
  emptyText: { color: COLORS.subtitle, marginTop: verticalScale(15), fontSize: moderateFont(16) }
});
