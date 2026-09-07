import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { verticalScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { PostCard } from '@/src/components/PostCard';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { useUserCacheStore } from '@/src/store/userCacheStore';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';

export default function UserPostsFeedScreen() {
  const { userId, initialPostId, username } = useLocalSearchParams();
  const router = useSafeRouter();
  const { user: currentUser } = useAuthStore();
  
  const cacheKey = (username as string) || (userId as string) || '';
  const cachedUser = useUserCacheStore.getState().getUserCache(cacheKey);

  const [posts, setPosts] = useState<any[]>(() => cachedUser?.posts || []);
  const [loading, setLoading] = useState(() => !cachedUser?.posts || cachedUser.posts.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  const flatListRef = useRef<any>(null);

  const fetchPosts = async (pageNum: number, isRefresh = false) => {
    const hasCache = posts.length > 0;
    performanceEngine.startScreenTrace('UserPostsFeedScreen');
    performanceEngine.trackCacheAccess('Profile', hasCache);

    try {
      const res = await apiClient.get(`/users/${userId}/posts?page=${pageNum}&limit=10`);
      const newPosts = res.data.data || [];
      
      if (isRefresh) {
        setPosts(newPosts);
        if (cacheKey) {
          useUserCacheStore.getState().setUserCache(cacheKey, { posts: newPosts });
        }
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      
      setHasMore(newPosts.length === 10);
      setPage(pageNum);
      performanceEngine.endScreenTrace('UserPostsFeedScreen', hasCache);
    } catch (error) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPosts(1, true);
  }, [userId]);

  useEffect(() => {
    if (!initialScrollDone && posts.length > 0 && initialPostId) {
      const index = posts.findIndex(p => (p._id || p.id) === initialPostId);
      if (index !== -1) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: false });
          setInitialScrollDone(true);
        }, 100);
      }
    }
  }, [posts, initialPostId, initialScrollDone]);

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      fetchPosts(page + 1);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPosts(1, true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerSubtitle}>POSTS</Text>
          <Text style={styles.headerTitle}>{username || 'User'}'s Posts</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.centerNode}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
        </View>
      ) : (
        <FastFlashList
          ref={flatListRef}
          data={posts}
          keyExtractor={(item: any) => item._id || item.id}
          renderItem={({ item }: { item: any }) => (
            <PostCard 
              post={item} 
              currentUserId={currentUser?.id}
              onDelete={() => {
                setPosts(prev => prev.filter(p => (p._id || p.id) !== (item._id || item.id)));
              }}
            />
          )}
          estimatedItemSize={280}
          drawDistance={300}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListFooterComponent={() => (
            hasMore ? <ActivityIndicator size="small" color={COLORS.secondary} style={{ marginVertical: 20 }} /> : null
          )}
        />
      )}
      <PerformanceOverlay />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEE',
    paddingTop: verticalScale(6),
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  backBtn: {
    padding: 5,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  centerNode: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
