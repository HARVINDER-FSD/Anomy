import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, ActivityIndicator, StatusBar, ScrollView,
  RefreshControl, Dimensions, Keyboard
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { useAuthStore } from '@/src/store/authStore';
import { useExploreStore } from '@/src/store/exploreStore';
import { apiClient } from '@/src/api/client';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreateGhostRoomModal } from '@/components/profile/CreateGhostRoomModal';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { verticalScale, scale, moderateScale } from '@/src/utils/responsive';

const { width } = Dimensions.get('window');

interface WhisperItem {
  _id?: string;
  id?: string;
  user?: { username?: string };
  content?: string;
  timestamp?: string | number | Date;
  created_at?: string | number | Date;
  likes?: number;
  likes_count?: number;
  comments?: number;
  comments_count?: number;
}

const GHOST_CATEGORIES = [
  { id: 'anime', label: 'Anime', icon: 'television-play' },
  { id: 'friends', label: 'Friends', icon: 'account-group' },
  { id: 'sports', label: 'Sports', icon: 'soccer' },
  { id: 'politics', label: 'Politics', icon: 'bank' },
  { id: 'movies_series', label: 'Movies & Series', icon: 'movie-open' },
  { id: 'adult', label: 'Adult 18+', icon: 'fire' },
];

const formatDate = (date: any) => {
  if (!date) return '';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

export default function ExploreScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAnonymous = user?.isAnonymousMode;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ users: any[], posts: WhisperItem[] }>({ users: [], posts: [] });
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'ghosts' | 'whispers' | 'rooms'>('ghosts');

  const {
    cachedTrendingWhispers,
    setCachedTrendingWhispers,
    cachedNormalWhispers,
    setCachedNormalWhispers,
    cachedGhostRooms,
    setCachedGhostRooms
  } = useExploreStore();

  const [trendingWhispers, setTrendingWhispers] = useState<WhisperItem[]>(() =>
    isAnonymous ? cachedTrendingWhispers : cachedNormalWhispers
  );
  const [ghostRooms, setGhostRooms] = useState<any[]>(() => isAnonymous ? cachedGhostRooms : []);
  const [loadingDiscovery, setLoadingDiscovery] = useState(() => {
    const whispers = isAnonymous ? cachedTrendingWhispers : cachedNormalWhispers;
    const rooms = isAnonymous ? cachedGhostRooms : [];
    return whispers.length === 0 && (!isAnonymous || rooms.length === 0);
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateRoomModalVisible, setIsCreateRoomModalVisible] = useState(false);

  // Sync state with cache when isAnonymous changes
  useEffect(() => {
    const whispers = isAnonymous ? cachedTrendingWhispers : cachedNormalWhispers;
    const rooms = isAnonymous ? cachedGhostRooms : [];
    setTrendingWhispers(whispers);
    setGhostRooms(rooms);
    setLoadingDiscovery(whispers.length === 0 && (!isAnonymous || rooms.length === 0));
  }, [isAnonymous, cachedTrendingWhispers, cachedNormalWhispers, cachedGhostRooms]);

  const fetchDiscovery = useCallback(async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const store = useExploreStore.getState();
    const whispers = isAnonymous ? store.cachedTrendingWhispers : store.cachedNormalWhispers;
    const rooms = isAnonymous ? store.cachedGhostRooms : [];

    if (whispers.length === 0 && (!isAnonymous || rooms.length === 0)) {
      setLoadingDiscovery(true);
    }
    try {
      const endpoint = isAnonymous ? '/feed/anonymous?page=1&limit=10' : '/feed?page=1&limit=10';
      const res = await apiClient.get(endpoint);
      const posts = res.data.posts || res.data.data || [];
      setTrendingWhispers(posts);
      if (isAnonymous) {
        store.setCachedTrendingWhispers(posts);
      } else {
        store.setCachedNormalWhispers(posts);
      }

      if (isAnonymous) {
        const roomsRes = await apiClient.get('/chat/anonymous/groups');
        const roomData = roomsRes.data.data || [];
        setGhostRooms(roomData);
        store.setCachedGhostRooms(roomData);
      }
    } catch (error) {
    } finally {
      setLoadingDiscovery(false);
    }
  }, [isAnonymous]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchDiscovery();
    setIsRefreshing(false);
  }, [fetchDiscovery]);

  const performSearch = async (query: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setSearching(true);
    try {
      const res = await apiClient.get(`/search?q=${query}`);
      setSearchResults({
        users: res.data.users || [],
        posts: res.data.posts || []
      });
    } catch (error) {
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        performSearch(searchQuery);
      } else {
        setSearchResults({ users: [], posts: [] });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear search when navigating back to this screen
  const isMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const hasCache = trendingWhispers.length > 0;
      performanceEngine.startScreenTrace('ExploreScreen');
      performanceEngine.trackCacheAccess('Explore', hasCache);
      performanceEngine.endScreenTrace('ExploreScreen', hasCache);

      if (isMounted.current) {
        setSearchQuery('');
        setSearchResults({ users: [], posts: [] });
      } else {
        isMounted.current = true;
      }
    }, [trendingWhispers])
  );

  useEffect(() => {
    fetchDiscovery();
  }, [fetchDiscovery]);

  const renderNormalSearch = () => (
    <View style={styles.normalContainer}>
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
          {searching && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 10 }} />}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {searchQuery.trim().length > 0 ? (
          <FlashList<any>
            data={searchResults.users}
            keyExtractor={(item) => item._id || item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => {
                  Keyboard.dismiss();
                  router.push(`/user/${item.username}`);
                }}
              >
                <Image
                  source={{ uri: resolveAvatarUrl(item.avatar_url || item.avatar, item.username) }}
                  style={styles.resultAvatar}
                  contentFit="cover"
                  transition={200}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{item.full_name || item.name}</Text>
                  <Text style={styles.resultUsername}>@{item.username}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.border} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !searching ? (
                <View style={styles.emptySearch}>
                  <Ionicons name="search-outline" size={50} color={COLORS.border} />
                  <Text style={styles.emptySearchText}>No users found for "{searchQuery}"</Text>
                </View>
              ) : null
            }
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>Discover People</Text>
            <Text style={styles.sectionSubtitle}>Search for friends, creators, or anyone in the AnuFi community.</Text>

            <View style={styles.discoverCard}>
              <Ionicons name="people" size={40} color={COLORS.secondary} />
              <Text style={styles.discoverTitle}>Find your circle</Text>
              <Text style={styles.discoverText}>Connect with people who share your interests.</Text>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );

  const renderGhostSearch = () => (
    <View style={[styles.ghostContainer, { paddingTop: insets.top }]}>
      <StatusBar barStyle={COLORS.background === '#121212' ? 'light-content' : 'dark-content'} />
      <View style={styles.ghostHeader}>
        <Text style={styles.ghostTitle}>GHOST EXPLORE</Text>
        <View style={styles.ghostSearchBox}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            placeholder="Search for ghosts or whispers..."
            placeholderTextColor="#999"
            style={styles.ghostInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searching && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>

        {searchQuery.trim().length > 0 && (
          <View style={styles.ghostSearchTabs}>
            <TouchableOpacity
              style={[styles.searchTab, searchMode === 'ghosts' && styles.activeSearchTab]}
              onPress={() => setSearchMode('ghosts')}
            >
              <Text style={[styles.searchTabText, searchMode === 'ghosts' && styles.activeSearchTabText]}>GHOSTS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.searchTab, searchMode === 'whispers' && styles.activeSearchTab]}
              onPress={() => setSearchMode('whispers')}
            >
              <Text style={[styles.searchTabText, searchMode === 'whispers' && styles.activeSearchTabText]}>WHISPERS</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.ghostScroll}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        {searchQuery.trim().length > 0 ? (
          <View style={styles.ghostSection}>
            {searchMode === 'ghosts' ? (
              <>
                {searchResults.users.length > 0 ? (
                  searchResults.users.map((item) => (
                    <TouchableOpacity
                      key={item._id || item.id}
                      style={styles.ghostResultItem}
                      onPress={() => {
                        const targetId = String(item._id || item.id);
                        router.push({
                          pathname: '/chat/new',
                          params: {
                            recipientId: targetId,
                            username: item.username || item.name || 'Anonymous Ghost',
                            isAnonymousChat: 'true',
                          }
                        } as any);
                      }}
                    >
                      <Image
                        source={{ uri: resolveAvatarUrl(item.avatar_url || item.avatar, item.username, true) }}
                        style={styles.ghostResultAvatar}
                        contentFit="cover"
                        transition={200}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ghostResultName}>{item.full_name || item.name}</Text>
                        <Text style={styles.ghostResultUsername}>@{item.username}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#CCC" />
                    </TouchableOpacity>
                  ))
                ) : !searching ? (
                  <View style={styles.noResultsBox}>
                    <Ionicons name="search-outline" size={50} color="#EEE" />
                    <Text style={styles.noResultsText}>No ghosts found for "{searchQuery}"</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {searchResults.posts.length > 0 ? (
                  searchResults.posts.map((item) => (
                    <TouchableOpacity
                      key={item._id || item.id}
                      style={styles.whisperBox}
                      onPress={() => router.push({
                        pathname: `/post/${item._id || item.id}` as any,
                        params: { initialData: JSON.stringify(item) }
                      })}
                    >
                      <View style={styles.whisperHeader}>
                        <MaterialCommunityIcons name="ghost" size={16} color={COLORS.primary} />
                        <Text style={styles.whisperAuthor}>{item.user?.username || 'Anonymous'}</Text>
                      </View>
                      <Text style={styles.whisperText} numberOfLines={3}>{item.content}</Text>
                      <View style={styles.whisperFooter}>
                        <Text style={styles.whisperTime}>{formatDate(item.timestamp)}</Text>
                        <View style={styles.whisperStats}>
                          <Ionicons name="heart" size={14} color={COLORS.primary} />
                          <Text style={styles.whisperStatText}>{item.likes}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : !searching ? (
                  <View style={styles.noResultsBox}>
                    <Ionicons name="chatbubbles-outline" size={50} color="#EEE" />
                    <Text style={styles.noResultsText}>No whispers found for "{searchQuery}"</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <>
            <View style={styles.ghostSection}>
              <TouchableOpacity
                style={styles.randomChatHero}
                onPress={() => router.push({
                  pathname: '/anonymous-match',
                  params: { topic: 'Random' }
                })}
              >
                <View style={styles.heroContent}>
                  <MaterialCommunityIcons name="lightning-bolt" size={32} color="#FFF" />
                  <View>
                    <Text style={styles.heroTitle}>Start Random Match</Text>
                    <Text style={styles.heroSub}>Talk to a stranger instantly</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#FFF" />
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>EXPLORE REALMS</Text>
              <View style={styles.ghostCategoryGrid}>
                {GHOST_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.smallCategoryCard}
                    onPress={() => router.push({
                      pathname: '/anonymous-match',
                      params: { topic: cat.label }
                    })}
                  >
                    <View style={styles.catIconBox}>
                      <MaterialCommunityIcons name={cat.icon as any} size={20} color={COLORS.primary} />
                    </View>
                    <Text style={styles.catLabel} numberOfLines={1}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>



          </>
        )}
      </ScrollView>

      <CreateGhostRoomModal
        isVisible={isCreateRoomModalVisible}
        onClose={() => setIsCreateRoomModalVisible(false)}
        onRoomCreated={fetchDiscovery}
      />
    </View>
  );

  return (
    <>
      {isAnonymous ? renderGhostSearch() : renderNormalSearch()}
      <PerformanceOverlay />
    </>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  // Normal Mode Styles
  normalContainer: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: verticalScale(6),
    paddingBottom: 10,
    backgroundColor: COLORS.background,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: 15, fontFamily: 'Outfit_800ExtraBold', letterSpacing: -0.5 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 20, paddingHorizontal: 15, height: 50, borderWidth: 1, borderColor: COLORS.border
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: COLORS.text, fontFamily: 'Outfit_400Regular' },
  content: { paddingVertical: 20, alignItems: 'center', paddingHorizontal: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 8, fontFamily: 'Outfit_700Bold' },
  sectionSubtitle: { fontSize: 13, color: COLORS.subtitle, textAlign: 'center', fontFamily: 'Outfit_400Regular', lineHeight: 18, width: '80%' },

  searchResultItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  resultAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15, backgroundColor: COLORS.surface },
  resultName: { fontSize: 16, fontWeight: '700', color: COLORS.text, fontFamily: 'Outfit_600SemiBold' },
  resultUsername: { fontSize: 14, color: COLORS.subtitle, fontFamily: 'Outfit_400Regular' },

  emptySearch: { alignItems: 'center', marginTop: 50, gap: 12 },
  emptySearchText: { fontSize: 14, color: COLORS.subtitle, fontFamily: 'Outfit_400Regular' },
  discoverCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 30,
    width: '100%',
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  discoverTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 15,
    marginBottom: 8,
    fontFamily: 'Outfit_700Bold'
  },
  discoverText: {
    fontSize: 14,
    color: COLORS.subtitle,
    textAlign: 'center',
    fontFamily: 'Outfit_400Regular',
    lineHeight: 20
  },

  // Ghost Mode Styles
  ghostContainer: { flex: 1, backgroundColor: COLORS.background },
  ghostHeader: { paddingHorizontal: 20, paddingTop: verticalScale(6), paddingBottom: 10, backgroundColor: COLORS.background, width: '100%', maxWidth: 640, alignSelf: 'center' },
  ghostTitle: { color: COLORS.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginBottom: 15, fontFamily: 'Outfit_800ExtraBold' },
  ghostSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 15, paddingHorizontal: 15, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border },
  ghostInput: { flex: 1, marginLeft: 10, color: COLORS.text, fontSize: 16, fontFamily: 'Outfit_400Regular' },
  ghostScroll: { padding: 20, paddingBottom: 100 },
  ghostSection: { marginBottom: 30 },
  randomChatHero: { backgroundColor: COLORS.primary, borderRadius: 25, padding: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  heroTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', fontFamily: 'Outfit_800ExtraBold' },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  ghostCategoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  smallCategoryCard: { width: (width - 60) / 3, backgroundColor: COLORS.surface, borderRadius: 15, padding: 12, marginBottom: 5, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  catIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(75,0,130,0.05)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  catLabel: { color: COLORS.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  whisperBox: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 15 },
  whisperHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  whisperAuthor: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  whisperText: { color: COLORS.text, fontSize: 15, lineHeight: 22, marginBottom: 15 },
  whisperFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  whisperTime: { color: '#AAA', fontSize: 12 },
  whisperStats: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  whisperStatText: { color: '#888', fontSize: 12, fontWeight: '600' },
  ghostResultItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  ghostResultAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15, backgroundColor: COLORS.surface },
  ghostResultName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  ghostResultUsername: { fontSize: 14, color: COLORS.subtitle },
  noResultsText: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', marginTop: 10 },
  noResultsBox: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100, opacity: 0.5 },
  ghostSearchTabs: { flexDirection: 'row', marginTop: 15, gap: 20 },
  searchTab: { paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeSearchTab: { borderBottomColor: COLORS.primary },
  searchTabText: { color: COLORS.subtitle, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  activeSearchTabText: { color: COLORS.primary },

  // Ghost Rooms Styles
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ghostRoomCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: 15, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  roomIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  roomInfo: { flex: 1 },
  roomName: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  roomMembers: { fontSize: 13, color: COLORS.subtitle },
  joinBtn: { backgroundColor: COLORS.surface, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12 },
  joinBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  noRoomsBox: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 12, alignItems: 'center' },
  noRoomsText: { color: COLORS.subtitle, fontSize: 13, fontStyle: 'italic' },
});
