import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Dimensions, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { verticalScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { PostCard } from '@/src/components/PostCard'; // I need to check if this exists or create it

export default function UserPostsFeedScreen() {
  const { userId, initialPostId, username } = useLocalSearchParams();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  const fetchPosts = async (pageNum: number, isRefresh = false) => {
    try {
      const res = await apiClient.get(`/users/${userId}/posts?page=${pageNum}&limit=10`);
      const newPosts = res.data.data || [];
      
      if (isRefresh) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      
      setHasMore(newPosts.length === 10);
      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching user posts:", error);
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
      } else if (hasMore) {
        // If not found in first page, fetch more (optional complexity)
        // For now, we assume it's in the first page or we just show the feed
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
        <FlatList
          ref={flatListRef}
          data={posts}
          keyExtractor={(item) => item._id || item.id}
          renderItem={({ item }) => (
            <PostCard 
              post={item} 
              currentUserId={currentUser?.id}
              onDelete={() => {
                setPosts(prev => prev.filter(p => (p._id || p.id) !== (item._id || item.id)));
              }}
            />
          )}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          getItemLayout={(data, index) => ({
            length: 500, // Estimated height of a post card
            offset: 500 * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          }}
          ListFooterComponent={() => (
            hasMore ? <ActivityIndicator size="small" color={COLORS.secondary} style={{ marginVertical: 20 }} /> : null
          )}
        />
      )}
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
    paddingTop: Platform.OS === 'ios' ? 0 : 10,
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
