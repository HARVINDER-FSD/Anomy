import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, SafeAreaView, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENT } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function SecretCrushScreen() {
  const router = useRouter();
  const [crushes, setCrushes] = useState<any[]>([]);
  const [mutualCount, setMutualCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ count: 0, maxCrushes: 5 });

  const fetchCrushes = async () => {
    try {
      const res = await apiClient.get('/secret-crush/my-list');
      if (res.data.success) {
        setCrushes(res.data.crushes || []);
        setMutualCount(res.data.mutualCount || 0);
        setStats({ count: res.data.count, maxCrushes: res.data.maxCrushes });
      }
    } catch (error) {
      console.error('Error fetching secret crushes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCrushes();
  }, []);

  const handleRemove = async (userId: string) => {
    try {
      const res = await apiClient.delete(`/secret-crush/remove/${userId}`);
      if (res.data.success) {
        fetchCrushes();
      }
    } catch (error) {
      console.error('Error removing crush:', error);
    }
  };

  const renderCrush = ({ item }: { item: any }) => (
    <View style={styles.crushCard}>
      <Image 
        source={{ uri: item.user?.avatar_url || 'https://ui-avatars.com/api/?name=' + item.user?.username }} 
        style={styles.avatar} 
      />
      <View style={styles.info}>
        <Text style={styles.name}>{item.user?.full_name || item.user?.username}</Text>
        <Text style={styles.username}>@{item.user?.username}</Text>
        {item.isMutual && (
          <div style={styles.mutualBadge}>
            <Ionicons name="heart" size={12} color={COLORS.white} />
            <Text style={styles.mutualText}>It&apos;s Mutual!</Text>
          </div>
        )}
      </View>
      <div style={styles.actions}>
        {item.isMutual && item.chatId && (
          <TouchableOpacity 
            style={styles.chatBtn} 
            onPress={() => router.push(`/chat/${item.chatId}`)}
          >
            <Ionicons name="chatbubbles" size={20} color={COLORS.white} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item.user?._id || item.user?.id)}>
          <Ionicons name="close" size={20} color={COLORS.subtitle} />
        </TouchableOpacity>
      </div>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.header}>
        <div style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Secret Crush</Text>
          <div style={{ width: 28 }} />
        </div>
        
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.count}/{stats.maxCrushes}</Text>
            <Text style={styles.statLabel}>Added</Text>
          </View>
          <View style={[styles.statBox, styles.statBorder]}>
            <Text style={styles.statNum}>{mutualCount}</Text>
            <Text style={styles.statLabel}>Matches</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Your Favorite People</Text>
        <Text style={styles.subtitle}>Add users to this list. If they also add you, we&apos;ll notify both of you! 💕</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.secondary} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={crushes}
            keyExtractor={(item) => item.id}
            renderItem={renderCrush}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCrushes(); }} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="heart-dislike-outline" size={80} color={COLORS.border} />
                <Text style={styles.emptyText}>You haven&apos;t added any secret crushes yet.</Text>
                <TouchableOpacity style={styles.findBtn} onPress={() => router.push('/explore')}>
                  <Text style={styles.findBtnText}>Find Your Crush</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { padding: 20, paddingTop: 40, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.white },
  statsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 15 },
  statBox: { flex: 1, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.3)' },
  statNum: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  statLabel: { fontSize: 12, color: COLORS.white, opacity: 0.8 },
  
  body: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.subtitle, lineHeight: 20, marginBottom: 20 },
  list: { paddingBottom: 20 },
  crushCard: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, 
    padding: 15, borderRadius: 20, marginBottom: 15, elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10
  },
  avatar: { width: 60, height: 60, borderRadius: 30, marginRight: 15 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  username: { fontSize: 14, color: COLORS.subtitle },
  mutualBadge: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, 
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 5, gap: 4 
  },
  mutualText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatBtn: { backgroundColor: COLORS.secondary, padding: 10, borderRadius: 15 },
  removeBtn: { padding: 5 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: COLORS.subtitle, textAlign: 'center', marginTop: 20, fontSize: 16 },
  findBtn: { marginTop: 20, backgroundColor: COLORS.secondary, paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  findBtnText: { color: COLORS.white, fontWeight: 'bold' }
});
