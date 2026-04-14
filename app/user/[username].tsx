import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Platform, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { PostGridItem } from '@/components/PostGridItem';

const SIZES = {
  width: Dimensions.get('window').width,
  height: Dimensions.get('window').height
};

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isPendingFromTarget, setIsPendingFromTarget] = useState(false);
  const [followsBack, setFollowsBack] = useState(false);
  const [isMutualFollow, setIsMutualFollow] = useState(false);

  const [posts, setPosts] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'shots'>('posts');
  const [isOnline, setIsOnline] = useState(false);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/users/username/${username}`);
      setUserData(res.data);
      setIsFollowing(res.data.is_following || res.data.isFollowing);
      setIsPending(res.data.isPending || res.data.is_pending);
      setIsPendingFromTarget(res.data.isPendingFromTarget || res.data.is_pending_from_target);
      setFollowsBack(res.data.followsBack);
      setIsMutualFollow(res.data.isMutualFollow || false);
      setIsOnline(res.data.is_online || false);
    } catch (error: any) {
      console.error("Error fetching user profile:", error);
      Alert.alert("Error", "User not found or something went wrong.");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPosts = async (userId: string, pageNum: number, type: string = activeTab) => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      // Map 'shots' to backend 'shots', and 'posts' to 'all' to show everything in main grid
      const fetchType = type === 'shots' ? 'shots' : 'all';
      const res = await apiClient.get(`/users/${userId}/posts?page=${pageNum}&type=${fetchType}`);
      
      setPosts((prevPosts) => (pageNum === 1 ? res.data.data : [...prevPosts, ...res.data.data]));
      setTotalPages(res.data.pagination.totalPages || res.data.pagination.pages);
      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      Alert.alert("Error", "Failed to load posts.");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, [username]);

  // ✅ Socket Listeners for Live Status updates
  useEffect(() => {
    const socket = require('@/src/lib/socket').socketService.socket;
    if (!socket || !userData?.id) return;

    const targetId = userData._id || userData.id;

    // Listen for events that affect this user
    const handleOnline = (data: { userId: string }) => {
      if (data.userId === targetId) setIsOnline(true);
    };
    const handleOffline = (data: { userId: string }) => {
      if (data.userId === targetId) setIsOnline(false);
    };
    const handleStatusUpdate = (data: { userId: string, isOnline: boolean }) => {
      if (data.userId === targetId) setIsOnline(data.isOnline);
    };

    socket.on('user:online', handleOnline);
    socket.on('user:offline', handleOffline);
    socket.on('user:status_result', handleStatusUpdate);

    // Initial query for absolute accuracy
    require('@/src/lib/socket').socketService.queryOnlineStatus(targetId);

    return () => {
      socket.off('user:online', handleOnline);
      socket.off('user:offline', handleOffline);
      socket.off('user:status_result', handleStatusUpdate);
    };
  }, [userData?.id]);

  // Handle user data or Tab change
  useEffect(() => {
    if (userData?.id) {
      setPosts([]); 
      setPage(1); 
      fetchUserPosts(userData.id, 1, activeTab);
    }
  }, [userData?.id, activeTab]);

  const handleAcceptRequest = async () => {
    if (!userData) return;
    try {
      await apiClient.post(`/users/follow-requests/${userData._id || userData.id}/accept`);
      setIsPendingFromTarget(false);
      setIsFollowing(false); // ME -> TARGET is still false
      setFollowsBack(true);  // TARGET -> ME is now true
      setUserData((prev: any) => ({ ...prev, followers_count: (prev.followers_count || 0) + 1 }));
    } catch (error) {
      console.error("Error accepting request:", error);
      Alert.alert("Error", "Failed to accept request.");
    }
  };

  const handleRejectRequest = async () => {
    if (!userData) return;
    try {
      await apiClient.post(`/users/follow-requests/${userData._id || userData.id}/reject`);
      setIsPendingFromTarget(false);
    } catch (error) {
      console.error("Error rejecting request:", error);
      Alert.alert("Error", "Failed to reject request.");
    }
  };

  const handleFollowToggle = async () => {
    if (!userData) return;
    
    try {
      // Optimistic UI
      if (isFollowing) {
        setIsFollowing(false);
        setUserData((prev: any) => ({ ...prev, followers_count: (prev.followers_count || 1) - 1 }));
      } else {
        if (userData.is_private) {
            setIsPending(true);
        } else {
            setIsFollowing(true);
            setUserData((prev: any) => ({ ...prev, followers_count: (prev.followers_count || 0) + 1 }));
        }
      }

      const res = await apiClient.post(`/users/${userData?._id || userData?.id}/follow`);
      
      // Update with actual response
      setIsFollowing(res.data.isFollowing);
      setIsPending(res.data.isPending);
      setIsMutualFollow(res.data.isMutualFollow || false);
      if (res.data.followerCount !== undefined) {
         setUserData((prev: any) => ({ ...prev, followers_count: res.data.followerCount }));
      }
    } catch (error) {
      console.error("Follow error:", error);
      fetchUserProfile(); // Revert on error
    }
  };

  const handleMessagePress = async () => {
    try {
      setLoading(true);
      const res = await apiClient.post('/users/conversations', { 
         recipientId: userData._id || userData.id,
         isAnonymous: currentUser?.isAnonymousMode === true
      });

      // Correct path: res.data.data.conversation
      const convData = res.data?.data;
      const conversationId = convData?.conversation?.id || convData?.conversation?._id;
      const isMessageRequest = convData?.isMessageRequest || false;
      
      if (!conversationId) {
        Alert.alert("Error", "Could not start conversation.");
        return;
      }

      if (isMessageRequest) {
        Alert.alert(
          "Message Request Sent",
          "Your message will be sent as a request. They can accept or decline it.",
          [{ text: "OK", onPress: () => router.push({
            pathname: `/chat/${conversationId}`,
            params: {
              recipientId: userData._id || userData.id,
              username: currentUser?.isAnonymousMode ? 'Unknown Spirit' : userData.username,
              profileImage: currentUser?.isAnonymousMode ? '' : (userData.avatar_url || userData.avatar),
              isAnonymousChat: currentUser?.isAnonymousMode ? 'true' : 'false'
            }
          } as any) }]
        );
      } else {
        router.push({
          pathname: `/chat/${conversationId}`,
          params: {
            recipientId: userData._id || userData.id,
            username: currentUser?.isAnonymousMode ? 'Unknown Spirit' : userData.username,
            profileImage: currentUser?.isAnonymousMode ? '' : (userData.avatar_url || userData.avatar),
            isAnonymousChat: currentUser?.isAnonymousMode ? 'true' : 'false'
          }
        } as any);
      }
    } catch (error: any) {
      console.error("Error starting conversation:", error);
      Alert.alert("Error", error?.response?.data?.message || "Could not start conversation.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await apiClient.delete(`/posts/${postId}`);
      setPosts((prevPosts) => prevPosts.filter((post) => post.id !== postId));
      setUserData((prev: any) => ({ ...prev, posts_count: (prev.posts_count || 1) - 1 }));
      Alert.alert("Success", "Post deleted successfully.");
    } catch (error) {
      console.error("Error deleting post:", error);
      Alert.alert("Error", "Failed to delete post.");
    }
  };

  if (loading && !userData) {
    return (
      <View style={styles.centerNode}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!userData) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{userData.username}</Text>
        <TouchableOpacity>
          <Ionicons name="ellipsis-vertical" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
            const isCloseToBottom = nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - 50;
            if (isCloseToBottom && !loadingMore && page < totalPages) {
                fetchUserPosts(userData.id, page + 1);
            }
        }}
        scrollEventThrottle={400}
      >
        {/* Profile Info Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrapper}>
            <ProfileAvatar 
              url={userData.avatar_url || userData.avatar} 
              username={userData.username} 
              size={moderateScale(96)} 
              isOnline={isOnline}
            />
            {userData.is_verified && (
               <View style={styles.verifiedBadge}>
                 <Ionicons name="checkmark-circle" size={20} color={COLORS.secondary} />
               </View>
            )}
          </View>
          
          <Text style={styles.username}>@{userData.username}</Text>
          <Text style={styles.fullName}>{userData.full_name || userData.name}</Text>
          <Text style={styles.bioText}>{userData.bio || "Crafting moments on AnuFy 🚀"}</Text>

          {isMutualFollow && (
            <View style={styles.mutualFollowBadge}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.secondary} />
              <Text style={styles.mutualFollowText}>Follows you back</Text>
            </View>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{userData.posts_count || 0}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity 
              style={styles.statBox}
              onPress={() => router.push({ pathname: '/profile/followers', params: { userId: userData._id || userData.id, type: 'followers' } })}
            >
              <Text style={styles.statValue}>{userData.followers_count || 0}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity 
              style={styles.statBox}
              onPress={() => router.push({ pathname: '/profile/followers', params: { userId: userData._id || userData.id, type: 'following' } })}
            >
              <Text style={styles.statValue}>{userData.following_count || 0}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>

          {currentUser?.username !== userData.username && (
            <View style={styles.actionButtons}>
                {isPendingFromTarget ? (
                  <>
                    <TouchableOpacity 
                        style={[styles.followBtn, { backgroundColor: COLORS.secondary }]} 
                        onPress={handleAcceptRequest}
                    >
                        <Text style={[styles.followBtnText, { color: COLORS.white }]}>Confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.followBtn, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]} 
                        onPress={handleRejectRequest}
                    >
                        <Text style={{ color: COLORS.text, fontWeight: '600' }}>Delete</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity 
                        style={[
                            styles.followBtn, 
                            (isFollowing || isPending) && styles.followingBtn
                        ]} 
                        onPress={handleFollowToggle}
                    >
                        <Text style={[
                            styles.followBtnText, 
                            (isFollowing || isPending) && styles.followingBtnText
                        ]}>
                            {isPending ? 'Requested' : isFollowing ? 'Following' : (followsBack ? 'Follow Back' : 'Follow')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={styles.msgBtn}
                        onPress={handleMessagePress}
                    >
                        <Ionicons name="chatbubble-ellipses-outline" size={22} color={COLORS.text} />
                    </TouchableOpacity>
                  </>
                )}
            </View>
          )}
        </View>

        {/* Post Grid Section */}
        <View style={styles.gridSection}>
             <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={[styles.tabButton, activeTab === 'posts' && styles.activeTabButton]}
                    onPress={() => setActiveTab('posts')}
                >
                    <Text style={[styles.tabButtonText, activeTab === 'posts' && styles.activeTabButtonText]}>Posts</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tabButton, activeTab === 'shots' && styles.activeTabButton]}
                    onPress={() => setActiveTab('shots')}
                >
                    <Text style={[styles.tabButtonText, activeTab === 'shots' && styles.activeTabButtonText]}>Shots</Text>
                </TouchableOpacity>
             </View>
             <Text style={styles.sectionTitle}>{activeTab === 'posts' ? 'Posts' : 'Shots'}</Text>
             {(userData.is_private || userData.isPrivate) && !isFollowing && currentUser?.username !== userData.username ? (
                 <View style={styles.privateMsg}>
                    <Ionicons name="lock-closed-outline" size={50} color={COLORS.border} />
                    <Text style={styles.privateTitle}>This Account is Private</Text>
                    <Text style={styles.privateSub}>Follow to see their photos and videos.</Text>
                 </View>
             ) : (
                <View style={styles.grid}>
                    {posts.length > 0 ? (
                        posts.map((item) => (
                            <PostGridItem 
                                key={item.id}
                                post={item} 
                                currentUserId={currentUser?.id} 
                                onDeletePost={handleDeletePost} 
                                onPress={(postId) => {
                                  const postData = {
                                    ...item,
                                    id: postId,
                                    user: {
                                      id: (userData as any)?.id || (userData as any)?._id,
                                      username: (userData as any)?.username,
                                      avatar_url: (userData as any)?.avatar_url || (userData as any)?.avatar,
                                      full_name: (userData as any)?.full_name || (userData as any)?.name
                                    },
                                    isLiked: item.is_liked || false,
                                    likes_count: item.likes_count || 0
                                  };
                                  
                                  router.push({
                                    pathname: `/post/${postId}`,
                                    params: { 
                                      initialData: JSON.stringify(postData)
                                    }
                                  } as any);
                                }}
                            />
                        ))
                    ) : (
                        <View style={styles.emptyGridContainer}>
                            <Ionicons name="camera-outline" size={60} color={COLORS.border} />
                            <Text style={styles.emptyGridTitle}>No {activeTab === 'posts' ? 'Posts' : 'Shots'} Yet</Text>
                            {currentUser?.username === userData.username && (
                                <TouchableOpacity style={styles.createPostButton}>
                                    <Text style={styles.createPostButtonText}>Create Your First {activeTab === 'posts' ? 'Post' : 'Shot'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                    {loadingMore && <ActivityIndicator size="small" color={COLORS.secondary} style={{ marginVertical: 20, width: '100%' }} />}
                </View>
             )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingBottom: verticalScale(15), backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45)
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text },

  profileCard: {
    backgroundColor: COLORS.white, padding: moderateScale(20), alignItems: 'center',
    borderBottomLeftRadius: moderateScale(30), borderBottomRightRadius: moderateScale(30),
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10
  },
  avatarWrapper: { position: 'relative', marginBottom: verticalScale(15) },
  verifiedBadge: { 
    position: 'absolute', 
    bottom: 0, 
    right: 2, 
    backgroundColor: COLORS.white, 
    borderRadius: moderateScale(12), 
    padding: 2 
  },
  username: { fontSize: moderateFont(20), fontWeight: '800', color: COLORS.text, marginBottom: verticalScale(2) },
  fullName: { fontSize: moderateFont(14), color: COLORS.subtitle, marginBottom: verticalScale(10) },
  bioText: { fontSize: moderateFont(14), color: COLORS.text, textAlign: 'center', lineHeight: moderateFont(22), marginBottom: verticalScale(20), paddingHorizontal: scale(10) },

  mutualFollowBadge: { flexDirection: 'row', alignItems: 'center', gap: scale(6), backgroundColor: COLORS.surface, paddingHorizontal: scale(12), paddingVertical: verticalScale(6), borderRadius: moderateScale(12), marginBottom: verticalScale(15) },
  mutualFollowText: { fontSize: moderateFont(12), color: COLORS.secondary, fontWeight: '600' },

  statsRow: { flexDirection: 'row', width: '100%', paddingVertical: verticalScale(15), borderTopWidth: 1, borderTopColor: COLORS.border },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text },
  statLabel: { fontSize: moderateFont(12), color: COLORS.subtitle },
  divider: { width: 1, backgroundColor: COLORS.border, height: '60%', alignSelf: 'center' },

  actionButtons: { flexDirection: 'row', width: '100%', gap: scale(10), marginTop: verticalScale(10) },
  followBtn: { flex: 1, backgroundColor: COLORS.secondary, paddingVertical: verticalScale(12), borderRadius: moderateScale(15), alignItems: 'center' },
  followingBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  followBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: moderateFont(16) },
  followingBtnText: { color: COLORS.text },
  msgBtn: { width: scale(55), backgroundColor: COLORS.surface, borderRadius: moderateScale(15), justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },

  gridSection: { padding: moderateScale(20) },
  sectionTitle: { fontSize: moderateFont(17), fontWeight: 'bold', color: COLORS.text, marginBottom: verticalScale(20) },
  emptyGrid: { alignItems: 'center', marginTop: verticalScale(40) },
  emptyGridTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text, marginTop: verticalScale(15) },
  createPostButton: { backgroundColor: COLORS.primary, paddingVertical: verticalScale(10), paddingHorizontal: scale(20), borderRadius: moderateScale(10), marginTop: verticalScale(20) },
  createPostButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: moderateFont(14) },
  privateMsg: { alignItems: 'center', marginTop: verticalScale(50), paddingHorizontal: scale(40) },
  privateTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text, marginTop: verticalScale(15) },
  privateSub: { fontSize: moderateFont(14), color: COLORS.subtitle, textAlign: 'center', marginTop: verticalScale(8), lineHeight: moderateFont(20) },
  emptyGridContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', width: '100%', paddingVertical: verticalScale(50) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 2 },
  gridItem: { width: scale(SIZES.width / 3 - 4), height: scale(SIZES.width / 3 - 4), margin: 2, position: 'relative' },
  tabContainer: { flexDirection: 'row', marginBottom: verticalScale(20), backgroundColor: COLORS.surface, borderRadius: moderateScale(15), overflow: 'hidden' },
  tabButton: { flex: 1, paddingVertical: verticalScale(10), alignItems: 'center', justifyContent: 'center' },
  activeTabButton: { backgroundColor: COLORS.primary },
  tabButtonText: { fontSize: moderateFont(14), fontWeight: '600', color: COLORS.subtitle },
  activeTabButtonText: { color: COLORS.white }
});
