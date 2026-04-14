import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, 
  Image, SafeAreaView, Platform, ScrollView, ActivityIndicator,
  Dimensions, StatusBar
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { useRouter } from 'expo-router';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';


export default function ExploreScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/search?q=${query}`);
      setSearchResults(res.data.users || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <TouchableOpacity 
       style={styles.searchResultItem}
       onPress={() => router.push(`/user/${item.username}`)}
    >
       <Image 
          source={{ uri: resolveAvatarUrl(item.avatar_url || item.avatar, item.username) }} 
          style={styles.resultAvatar} 
       />
       <View style={{ flex: 1 }}>
          <Text style={styles.resultName}>{item.full_name || item.name}</Text>
          <Text style={styles.resultUsername}>@{item.username}</Text>
       </View>
       <Ionicons name="chevron-forward" size={18} color={COLORS.border} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.subtitle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends or creators..."
            placeholderTextColor={COLORS.subtitle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {searchQuery.trim().length > 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            {loading ? (
              <ActivityIndicator color={COLORS.secondary} style={{ marginTop: 20 }} />
            ) : (
              searchResults.map(item => renderSearchResult({ item }))
            )}
          </View>
        ) : (
          <View style={styles.content}>
             <Text style={styles.sectionTitle}>Trending Accounts</Text>
             <View style={styles.trendingBox}>
                <ActivityIndicator color="#EEE" />
                <Text style={styles.trendingText}>Discovering connections...</Text>
             </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { padding: 20, paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  title: { fontSize: 32, fontWeight: '800', color: '#000', marginBottom: 15 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', 
    borderRadius: 18, paddingHorizontal: 15, height: 50, borderWidth: 1, borderColor: '#EEE'
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: '#000' },
  content: { padding: 20 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#000', marginBottom: 20 },
  trendingBox: { height: 120, backgroundColor: '#FAFAFA', borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#EEE' },
  trendingText: { color: '#CCC', fontSize: 12, marginTop: 10, fontWeight: '600' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  resultAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15, backgroundColor: '#EEE' },
  resultName: { fontSize: 16, fontWeight: '700', color: '#000' },
  resultUsername: { fontSize: 14, color: COLORS.subtitle }
});
