import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { verticalScale } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';


export default function MessageRequestsScreen() {
  const router = useSafeRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    try {
      const res = await apiClient.get('/users/message-requests');
      if (res.data.success) {
        setRequests(res.data.data);
      }
    } catch (error: any) {
      // If user not found, logout to force re-login
      if (error.message?.includes('User not found') || error.status === 404) {
        const { useAuthStore } = await import('@/src/store/authStore');
        await useAuthStore.getState().logout();
        Alert.alert('Session Expired', 'Please log in again');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAccept = async (requestId: string) => {
    try {
      const res = await apiClient.post(`/users/message-requests/${requestId}/accept`);
      if (res.data.success) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
        Alert.alert("Success", "Request accepted. You can now chat!");
      }
    } catch (error) {
      Alert.alert("Error", "Could not accept request.");
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const res = await apiClient.delete(`/users/message-requests/${requestId}`);
      if (res.data.success) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
      }
    } catch (error) {
      Alert.alert("Error", "Could not delete request.");
    }
  };

  const renderRequest = ({ item }: { item: any }) => {
    const sender = item.sender;
    const isAnonymous = item.is_anonymous || item.isAnonymous;
    
    // Ghost Persona if anonymous
    const displayAvatar = isAnonymous ? 'https://api.dicebear.com/7.x/avataaars/png?seed=ghost' : resolveAvatarUrl(sender?.profileImage || sender?.avatar_url, sender?.username);
    const displayUsername = isAnonymous ? 'Ghost User 👻' : (sender?.username || 'AnuFy User');
    const displayFullName = isAnonymous ? 'Secret Whisper' : (sender?.fullName || sender?.full_name || '');

    return (
      <View style={styles.requestItem}>
        <Image 
          source={{ uri: displayAvatar }} 
          style={styles.avatar} 
        />
        <View style={styles.info}>
          <Text style={[styles.username, isAnonymous && { color: COLORS.primary, fontWeight: '700' }]}>{displayUsername}</Text>
          <Text style={styles.fullName}>{displayFullName}</Text>
          <Text style={styles.time}>Requested {new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item.id)}>
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(item.id)}>
            <Ionicons name="close" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Message Requests</Text>
          <Text style={styles.headerSub}>Messages from people you don&apos;t follow</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequest}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRequests(); }} />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="mail-open-outline" size={60} color={COLORS.border} />
              <Text style={styles.emptyText}>No message requests</Text>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: verticalScale(6),
    width: '100%', maxWidth: 640, alignSelf: 'center'
  },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.subtitle, marginTop: 2 },
  listContent: { paddingVertical: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  requestItem: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: COLORS.border + '50' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 15, borderWidth: 1, borderColor: COLORS.border },
  info: { flex: 1 },
  username: { fontSize: 16, fontWeight: '400', color: COLORS.text },
  fullName: { fontSize: 14, color: COLORS.subtitle },
  time: { fontSize: 11, color: COLORS.subtitle, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  acceptBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  acceptText: { color: COLORS.white, fontWeight: 'bold', fontSize: 13 },
  rejectBtn: { backgroundColor: COLORS.surface, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 16, color: COLORS.subtitle, marginTop: 15 }
});
