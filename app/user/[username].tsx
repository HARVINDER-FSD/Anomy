import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ScrollView, SafeAreaView, ActivityIndicator, Alert,
  Platform, Dimensions, StatusBar, Modal, FlatList, DeviceEventEmitter,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { LinearGradient } from 'expo-linear-gradient';
import { FollowButton } from '@/src/components/common/FollowButton';
import { FollowRequestActions } from '@/src/components/common/FollowRequestActions';
import * as Haptics from 'expo-haptics';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { PostGridItem } from '@/components/PostGridItem';
import { ProfileSkeleton } from '@/src/components/common/Skeleton';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { ProfileShareModal } from '@/components/ProfileShareModal';
import { AnonymousMessageModal } from '@/components/profile/AnonymousMessageModal';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { useUserCacheStore } from '@/src/store/userCacheStore';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function UserProfileScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const { username } = useLocalSearchParams();
  const router = useSafeRouter();
  const { user: currentUser } = useAuthStore();

  const isNavigating = useRef(false);
  const isLoadingMoreRef = useRef(false);

  const cachedUser = useUserCacheStore.getState().getUserCache((username as string) || '');
  const [loading, setLoading] = useState(() => !cachedUser?.userData);
  const [userData, setUserData] = useState<any>(() => cachedUser?.userData || null);
  const [isShareVisible, setIsShareVisible] = useState(false);
  const [isPendingFromTarget, setIsPendingFromTarget] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isAnonymousModalVisible, setIsAnonymousModalVisible] = useState(false);
  const [isMutualModalVisible, setIsMutualModalVisible] = useState(false);

  const [posts, setPosts] = useState<any[]>(() => cachedUser?.posts || []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'shots'>('posts');

  const { 
    isFollowing, 
    isPending, 
    followsBack, 
    isMutualFollow, 
    followersCount: storeFollowersCount, 
    followingCount: storeFollowingCount, 
    toggleFollow, 
    isLoading: isFollowLoading,
    acceptFollowRequest,
    rejectFollowRequest,
    source
  } = useFollowStatus(
    userData?._id || userData?.id || '',
    {
      isFollowing: !!userData?.is_following,
      isPending: !!userData?.is_requested,
      followsBack: !!userData?.followsBack,
      isMutualFollow: !!userData?.isMutualFollow,
      followersCount: userData?.followers_count || 0,
      followingCount: userData?.following_count || 0
    },
    { syncOnMount: true }
  );

  const followersCount = (source === 'initial' || storeFollowersCount === 0)
    ? (userData?.followers_count || 0)
    : storeFollowersCount;

  const followingCount = (source === 'initial' || storeFollowingCount === 0)
    ? (userData?.following_count || 0)
    : storeFollowingCount;

  const getItemKey = (item: any): string => {
    if (!item) return '';
    const raw = item._id || item.id || item.postId;
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
      if (raw.$oid) return String(raw.$oid);
      if (typeof raw.toString === 'function') return raw.toString();
    }
    return String(raw);
  };

  const dedupePosts = (items: any[]) => {
    const seen = new Set<string>();
    return (items || []).filter((item) => {
      const key = getItemKey(item);
      if (!key || key === 'undefined' || key === '[object Object]' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const fetchUserProfile = async () => {
    const existingCache = useUserCacheStore.getState().getUserCache((username as string) || '');
    const hasCache = !!existingCache?.userData;
    performanceEngine.startScreenTrace('UserProfileScreen');
    performanceEngine.trackCacheAccess('Profile', hasCache);
    if (hasCache) {
      performanceEngine.endScreenTrace('UserProfileScreen', true);
    }

    try {
      // 🚀 BOOTSTRAP FAST PATH: Fetch profile, stats, follow status, and posts in 1 parallel query
      const res = await apiClient.get(`/bootstrap/user/${username}`);
      if (res.data?.success && res.data?.data) {
        const bData = res.data.data;
        const profile = bData.profile || {};
        const updatedUser = {
          ...profile,
          mutualFollowersCount: profile.mutualFollowersCount || profile.mutual_count || 0,
          mutualFollowers: profile.mutualFollowers || [],
        };
        setUserData(updatedUser);
        setIsPendingFromTarget(!!profile.is_pending_from_target);
        setIsOnline(!!profile.is_online);

        let freshPosts: any[] = [];
        if (activeTab === 'shots') {
          if (Array.isArray(bData.reels) && bData.reels.length > 0) {
            freshPosts = dedupePosts(bData.reels.map((r: any) => ({
              ...r,
              media_type: 'video',
              media_urls: [r.videoUrl],
            })));
            setPosts(freshPosts);
            setPage(1);
            setTotalPages(1);
          } else {
            const userId = profile._id || profile.id;
            if (userId) fetchUserPosts(userId, 1, 'shots');
          }
        } else {
          if (Array.isArray(bData.posts) && bData.posts.length > 0) {
            freshPosts = dedupePosts(bData.posts);
            setPosts(freshPosts);
            setPage(1);
            setTotalPages(1);
          } else {
            const userId = profile._id || profile.id;
            if (userId) fetchUserPosts(userId, 1, 'posts');
          }
        }

        // Cache fresh profile & posts into userCacheStore
        useUserCacheStore.getState().setUserCache((username as string) || '', {
          userData: updatedUser,
          posts: freshPosts,
        });

      } else {
        // Fallback
        const fallbackRes = await apiClient.get(`/users/username/${username}`);
        setUserData(fallbackRes.data);
        const userId = fallbackRes.data._id || fallbackRes.data.id;
        if (userId) fetchUserPosts(userId, 1, activeTab);
      }
      if (!hasCache) {
        performanceEngine.endScreenTrace('UserProfileScreen', false);
      }
    } catch (error: any) {
      try {
        const fallbackRes = await apiClient.get(`/users/username/${username}`);
        setUserData(fallbackRes.data);
        const userId = fallbackRes.data._id || fallbackRes.data.id;
        if (userId) fetchUserPosts(userId, 1, activeTab);
      } catch {
        Alert.alert('Error', 'User not found');
        router.back();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const existingCache = useUserCacheStore.getState().getUserCache((username as string) || '');
    if (existingCache?.userData) {
      setUserData(existingCache.userData);
      setPosts(existingCache.posts || []);
      setLoading(false);
    } else {
      setUserData(null);
      setPosts([]);
      setLoading(true);
    }
    setPage(1);
    setTotalPages(1);
    isLoadingMoreRef.current = false;
    isTabMounted.current = false;
    fetchUserProfile();
  }, [username]);

  const fetchUserPosts = async (userId: string, pageNum: number, type: string = activeTab) => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const fetchType = type === 'shots' ? 'shots' : 'posts';
      const res = await apiClient.get(`/users/${userId}/posts?page=${pageNum}&type=${fetchType}`);
      setPosts((prev) => dedupePosts(pageNum === 1 ? res.data.data : [...prev, ...res.data.data]));
      setTotalPages(res.data.pagination?.totalPages || res.data.pagination?.pages || 1);
      setPage(pageNum);
    } catch (error) {
    } finally {
      isLoadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setUserData(null);
    setPosts([]);
    setPage(1);
    setTotalPages(1);
    isLoadingMoreRef.current = false;
    isTabMounted.current = false;
    fetchUserProfile();
  }, [username]);

  useEffect(() => {
    const subPost = DeviceEventEmitter.addListener('post:deleted:local', (data: { postId: string }) => {
      setPosts(prev => prev.filter(p => String(p.id || p._id) !== String(data.postId)));
      setUserData((prev: any) => prev ? { ...prev, posts_count: Math.max(0, (prev.posts_count || 1) - 1) } : prev);
    });
    const subShot = DeviceEventEmitter.addListener('shot:deleted:local', (data: { shotId: string }) => {
      setPosts(prev => prev.filter(p => String(p.id || p._id) !== String(data.shotId)));
      setUserData((prev: any) => prev ? { ...prev, posts_count: Math.max(0, (prev.posts_count || 1) - 1) } : prev);
    });
    return () => {
      subPost.remove();
      subShot.remove();
    };
  }, []);

  useEffect(() => {
    const socket = require('@/src/lib/socket').socketService.socket;
    if (!socket || !userData?.id) return;
    const targetId = userData._id || userData.id;
    const handleOnline = (data: { userId: string }) => { if (data.userId === targetId) setIsOnline(true); };
    const handleOffline = (data: { userId: string }) => { if (data.userId === targetId) setIsOnline(false); };
    const handleStatusUpdate = (data: { userId: string; isOnline: boolean }) => { if (data.userId === targetId) setIsOnline(data.isOnline); };
    const handleProfileUpdate = (data: { userId: string; updates: any }) => {
      if (data.userId === targetId) {
        setUserData((prev: any) => prev ? { ...prev, ...data.updates } : prev);
      }
    };
    
    socket.on('user:online', handleOnline);
    socket.on('user:offline', handleOffline);
    socket.on('user:status_result', handleStatusUpdate);
    socket.on('profile:updated', handleProfileUpdate);
    
    require('@/src/lib/socket').socketService.queryOnlineStatus(targetId);
    
    return () => {
      socket.off('user:online', handleOnline);
      socket.off('user:offline', handleOffline);
      socket.off('user:status_result', handleStatusUpdate);
      socket.off('profile:updated', handleProfileUpdate);
    };
  }, [userData?.id]);

  const isTabMounted = useRef(false);

  useEffect(() => {
    // Bootstrap API already fetched posts on initial mount.
    // Only fetch separate posts API when the user explicitly switches tabs later!
    if (!isTabMounted.current) {
      isTabMounted.current = true;
      return;
    }
    if (userData?.id && activeTab) {
      setPage(1);
      fetchUserPosts(userData.id, 1, activeTab);
    }
  }, [activeTab]);

  const handleAcceptRequest = async () => {
    if (!userData) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    acceptFollowRequest();
    setIsPendingFromTarget(false);
  };

  const handleRejectRequest = async () => {
    if (!userData) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    rejectFollowRequest();
    setIsPendingFromTarget(false);
  };



  const handleFollowToggle = async () => {
    if (!userData) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFollow();
  };



  const handleMessagePress = async () => {
    try {
      setLoading(true);
      const res = await apiClient.post('/users/conversations', {
        recipientId: userData._id || userData.id,
        isAnonymous: currentUser?.isAnonymousMode === true,
      });
      const convData = res.data?.data;
      const conversationId = convData?.conversation?.id || convData?.conversation?._id;
      const isMessageRequest = convData?.isMessageRequest || false;
      if (!conversationId) {
        Alert.alert('Error', 'Could not start conversation.');
        return;
      }
      const rid = userData._id || userData.id;
      const un = userData.username || '';
      const av = userData.avatar_url || userData.avatar || '';
      const q = new URLSearchParams();
      q.set('recipientId', String(rid));
      q.set('username', un);
      if (av) q.set('profileImage', String(av));
      if (currentUser?.isAnonymousMode) q.set('isAnonymousChat', 'true');
      const href = `/chat/${conversationId}?${q.toString()}`;
      if (isMessageRequest) {
        Alert.alert('Message request sent', 'They will see your message after they accept.', [
          { text: 'OK', onPress: () => router.push(href as any) },
        ]);
      } else {
        router.push(href as any);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not start conversation.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await apiClient.delete(`/posts/${postId}`);
      DeviceEventEmitter.emit('post:deleted:local', { postId: postId });
    } catch {
      Alert.alert('Error', 'Failed to delete post.');
    }
  };

  const handlePinPost = (postId: string, pinned: boolean) => {
    setPosts((prev) => {
      const updated = prev.map((p) =>
        p.id === postId ? { ...p, is_pinned: pinned } : { ...p, is_pinned: p.id === postId ? false : p.is_pinned }
      );
      // Pinned posts go to top
      return [
        ...updated.filter((p) => p.is_pinned),
        ...updated.filter((p) => !p.is_pinned),
      ];
    });
  };

  const isOwnProfile = currentUser?.username === userData?.username;
  const isPrivateLocked = (userData?.is_private || userData?.isPrivate) && !isFollowing && !isOwnProfile;

  if (loading && !userData) {
    return (
      <View style={styles.centerNode}>
        <ProfileSkeleton />
      </View>
    );
  }

  if (!userData) return null;

  const followBtnLabel = isPending ? 'Requested' : isFollowing ? 'Following' : (followsBack ? 'Follow Back' : 'Follow');

  const getMutualFollowersText = () => {
    const list: any[] = userData?.mutualFollowers || [];
    const count: number = userData?.mutualFollowersCount || 0;
    if (count === 0 || list.length === 0) return null;
    const names = list.slice(0, 2).map((u: any) => u.username).join(', ');
    const remainder = count - list.slice(0, 2).length;
    if (remainder > 0) return `Followed by ${names} and ${remainder} others`;
    return `Followed by ${names}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={COLORS.background === '#121212' ? 'light-content' : 'dark-content'} />

      {/* Slim header — back + options */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => setIsShareVisible(true)} style={styles.headerBtn}>
            <Ionicons name="share-social-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          const isCloseToBottom =
            nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >=
            nativeEvent.contentSize.height - 50;
          if (isCloseToBottom && !loadingMore && page < totalPages) {
            fetchUserPosts(userData.id, page + 1);
          }
        }}
        scrollEventThrottle={400}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          {/* Avatar Section Matching Profile Screen */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarShadowBox} />
            <View style={styles.avatarWrapper}>
              <Image
                source={{ uri: resolveAvatarUrl(userData.avatar_url || userData.avatar, userData.username) }}
                style={styles.avatar}
              />
            </View>

            {userData.is_verified && (
              <View style={styles.verifiedBadgeBox}>
                <VerifiedTick badgeType={userData.badge_type} size={20} />
              </View>
            )}
          </View>

          {/* Name */}
          <Text style={styles.fullName}>{userData.full_name || userData.name || userData.username}</Text>
          <Text style={styles.usernameText}>@{userData.username}</Text>




          {/* Bio */}
          {(userData.bio) && (
            <Text style={styles.bioText}>{userData.bio}</Text>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{userData.posts_count || 0}</Text>
              <Text style={styles.statLabel}>Creations</Text>
            </View>
            <TouchableOpacity
              style={styles.statBox}
              onPress={() => router.push({ pathname: '/profile/followers', params: { userId: userData._id || userData.id, type: 'followers' } })}
            >
              <Text style={styles.statValue}>{followersCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statBox}
              onPress={() => router.push({ pathname: '/profile/followers', params: { userId: userData._id || userData.id, type: 'following' } })}
            >
              <Text style={styles.statValue}>{followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          {!isOwnProfile && (
            <View style={styles.actionRow}>
              {isPendingFromTarget ? (
                <FollowRequestActions
                  targetUserId={userData._id || userData.id}
                  variant="text"
                  onAcceptSuccess={() => setIsPendingFromTarget(false)}
                  onRejectSuccess={() => setIsPendingFromTarget(false)}
                />
              ) : (
                <>
                  <FollowButton
                    targetUserId={userData._id || userData.id}
                    onToggle={toggleFollow}
                    isLoading={isFollowLoading}
                    variant="primary"
                    size="sm"
                    style={[
                      { 
                        width: (userData?.mutualFollowersCount || 0) > 0 ? scale(120) : scale(135), 
                        borderRadius: moderateScale(8)
                      },
                      isFollowing ? { 
                        backgroundColor: '#F3F4F6', 
                        borderWidth: 1, 
                        borderColor: '#E5E7EB' 
                      } : {
                        backgroundColor: COLORS.primary,
                        borderWidth: 0
                      }
                    ]}
                    textStyle={[
                      { fontSize: moderateFont(12), fontWeight: '600' },
                      isFollowing ? { color: '#374151' } : { color: '#FFFFFF' }
                    ]}
                  />

                  <View style={{ flexDirection: 'row', gap: scale(8), alignItems: 'center' }}>
                    <TouchableOpacity 
                      style={[styles.squareActionButton, loading && { opacity: 0.5 }]} 
                      onPress={handleMessagePress}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.squareActionButtonText}>Message</Text>
                    </TouchableOpacity>

                    {/* Mutual friends count button */}
                    {(userData?.mutualFollowersCount || 0) > 0 && (
                      <TouchableOpacity
                        style={styles.squareActionButton}
                        onPress={() => setIsMutualModalVisible(true)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4) }}>
                          <View style={styles.mutualCountAvatars}>
                            {(userData?.mutualFollowers || []).slice(0, 2).map((u: any, i: number) => (
                              <Image
                                key={u.username || i}
                                source={{ uri: resolveAvatarUrl(u.avatar_url, u.username) }}
                                style={[
                                  styles.mutualCountAvatar,
                                  { marginLeft: i === 0 ? 0 : -6, zIndex: 2 - i }
                                ]}
                              />
                            ))}
                          </View>
                          <Text style={styles.squareActionButtonText}>{userData.mutualFollowersCount} Mutual</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {currentUser?.isAnonymousMode && (
                      <TouchableOpacity 
                        style={[styles.squareActionButton, { paddingHorizontal: scale(10) }, loading && { opacity: 0.5 }]} 
                        onPress={() => setIsAnonymousModalVisible(true)}
                        disabled={loading}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="ghost" size={18} color="#374151" />
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* Content Section */}
        <View style={styles.contentSection}>
          {/* Tabs */}
          <View style={styles.universeTabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
              onPress={() => setActiveTab('posts')}
            >
              <Ionicons name="grid-outline" size={18} color={activeTab === 'posts' ? COLORS.primary : COLORS.subtitle} />
              <Text style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>Posts</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'shots' && styles.activeTab]}
              onPress={() => setActiveTab('shots')}
            >
              <Ionicons name="play-circle-outline" size={18} color={activeTab === 'shots' ? COLORS.primary : COLORS.subtitle} />
              <Text style={[styles.tabText, activeTab === 'shots' && styles.activeTabText]}>Shots</Text>
            </TouchableOpacity>
          </View>

          {/* Private account lock */}
          {isPrivateLocked ? (
            <View style={styles.privateBox}>
              <View style={styles.privateLockCircle}>
                <Ionicons name="lock-closed" size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.privateTitle}>Private Account</Text>
              <Text style={styles.privateSub}>Follow {userData.username} to see their posts and shots.</Text>
            </View>
          ) : (
            <>
              {loadingMore && posts.length === 0 ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
              ) : posts.length > 0 ? (
                <View style={styles.grid}>
                  {posts.filter(item => activeTab === 'shots' ? item.media_type === 'video' : item.media_type !== 'video').map((item) => (
                    <PostGridItem
                      key={String(item._id || item.id || item.postId)}
                      post={item}
                      isShot={activeTab === 'shots'}
                      currentUserId={currentUser?.id}
                      onDeletePost={handleDeletePost}
                      onPinToggle={handlePinPost}
                      onPress={(postId) => {
                        if (isNavigating.current) return;
                        isNavigating.current = true;
                        setTimeout(() => { isNavigating.current = false; }, 150);

                        const path = activeTab === 'shots' ? `/reels/${postId}` : `/post/${postId}`;
                        router.push({
                          pathname: path,
                          params: activeTab === 'shots' ? { id: postId } : {
                            initialData: JSON.stringify({
                              ...item,
                              id: postId,
                              user: {
                                id: userData?.id || userData?._id,
                                username: userData?.username,
                                avatar_url: userData?.avatar_url || userData?.avatar,
                                full_name: userData?.full_name || userData?.name,
                              },
                              isLiked: item.is_liked || false,
                              likes_count: item.likes_count || 0,
                            }),
                          },
                        } as any);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyBox}>
                  <Ionicons name={activeTab === 'posts' ? 'images-outline' : 'play-circle-outline'} size={56} color={COLORS.border} />
                  <Text style={styles.emptyTitle}>No {activeTab === 'posts' ? 'Posts' : 'Shots'} Yet</Text>
                  <Text style={styles.emptySub}>{userData.username} hasn't posted anything here.</Text>
                </View>
              )}
              {loadingMore && posts.length > 0 && (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ProfileShareModal
        isVisible={isShareVisible}
        onClose={() => setIsShareVisible(false)}
        sharedUsername={userData.username}
        sharedAvatar={userData.avatar_url || userData.avatar}
      />

      <AnonymousMessageModal
        isVisible={isAnonymousModalVisible}
        onClose={() => setIsAnonymousModalVisible(false)}
        recipientId={userData.id || userData._id}
        recipientUsername={userData.username}
      />
      <PerformanceOverlay />

      {/* Mutual Friends Bottom Sheet */}
      <Modal
        visible={isMutualModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMutualModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsMutualModalVisible(false)}
        />
        <View style={[styles.mutualSheet, { backgroundColor: COLORS.background }]}>
          <View style={styles.mutualSheetHandle} />
          <Text style={[styles.mutualSheetTitle, { color: COLORS.text }]}>
            Mutual Followers
          </Text>
          <Text style={[styles.mutualSheetSubtitle, { color: COLORS.subtitle }]}>
            {userData?.mutualFollowersCount || 0} people you follow also follow {userData?.username}
          </Text>
          <FlatList
            data={userData?.mutualFollowers || []}
            keyExtractor={(item: any) => item.username}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity
                style={styles.mutualSheetRow}
                onPress={() => {
                  setIsMutualModalVisible(false);
                  router.push(`/user/${item.username}` as any);
                }}
              >
                <Image
                  source={{ uri: resolveAvatarUrl(item.avatar_url, item.username) }}
                  style={styles.mutualSheetAvatar}
                />
                <Text style={[styles.mutualSheetUsername, { color: COLORS.text }]}>@{item.username}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingTop: Platform.OS === 'ios' ? verticalScale(35) : verticalScale(30), // Tighter header spacing
    paddingBottom: verticalScale(2),
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: moderateFont(16), fontWeight: '700', color: COLORS.text },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ECC71' },

  // Profile card
  profileCard: {
    backgroundColor: COLORS.white,
    paddingHorizontal: moderateScale(20),
    paddingTop: verticalScale(2), // Tightened top padding from 24
    paddingBottom: verticalScale(10), // Tightened from 20
    alignItems: 'center',
    marginBottom: verticalScale(2),
  },

  // Rhombus Avatar
  avatarSection: {
    position: 'relative',
    marginTop: moderateScale(2), // Tightened from 20 to keep consistent with tabs profile.tsx
    marginBottom: verticalScale(10),
  },
  avatarWrapper: {
    width: moderateScale(85), height: moderateScale(85),
    borderRadius: moderateScale(85) / 2,
    overflow: 'hidden', backgroundColor: COLORS.surface,
  },
  avatarShadowBox: {
    position: 'absolute',
    width: moderateScale(85),
    height: moderateScale(85),
    borderRadius: moderateScale(85) / 2,
    backgroundColor: COLORS.surface,
    top: 1,
    left: 12,
  },
  avatar: { width: '100%', height: '100%' },
  onlineBadge: {
    position: 'absolute', bottom: 5, right: 5, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981',
    borderWidth: 2, borderColor: COLORS.background,
    justifyContent: 'center', alignItems: 'center'
  },
  onlinePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.background },
  verifiedBadgeBox: {
    position: 'absolute', bottom: -5, left: '50%', transform: [{ translateX: -12 }],
    backgroundColor: COLORS.background, borderRadius: 12, padding: 2,
  },

  fullName: { fontSize: moderateFont(20), fontWeight: '800', color: COLORS.text, letterSpacing: -0.3, marginTop: 8 },
  usernameText: { fontSize: moderateFont(13), color: COLORS.subtitle, fontWeight: '500', marginTop: verticalScale(1) },
  bioText: {
    fontSize: moderateFont(13), color: COLORS.text, textAlign: 'center',
    lineHeight: moderateFont(20), marginTop: verticalScale(6),
    paddingHorizontal: scale(20),
  },

  // Stats
  statsRow: { flexDirection: 'row', width: '100%', marginTop: verticalScale(10), marginBottom: verticalScale(2) },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: verticalScale(4) },
  statValue: { fontSize: moderateFont(18), fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: moderateFont(10), color: COLORS.subtitle, marginTop: verticalScale(2), textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.5 },

  // Action buttons
  actionRow: { flexDirection: 'row', width: '100%', gap: scale(8), marginTop: verticalScale(10), alignItems: 'center', justifyContent: 'center' },
  actionBtn: { flex: 1, paddingVertical: verticalScale(8), borderRadius: moderateScale(12), alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { backgroundColor: COLORS.primary },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: moderateFont(13) },
  outlineBtn: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border },
  outlineBtnText: { color: COLORS.text, fontWeight: '600', fontSize: moderateFont(13) },
  iconBtn: {
    width: scale(40), justifyContent: 'center', alignItems: 'center',
  },

  // Content section
  contentSection: { flex: 1, backgroundColor: COLORS.background },
  universeTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: verticalScale(10),
  },
  activeTab: { borderBottomWidth: 2.5, borderBottomColor: COLORS.primary },
  tabText: { fontSize: moderateFont(13), fontWeight: '600', color: COLORS.subtitle },
  activeTabText: { color: COLORS.primary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 2 },

  // Private / empty states
  privateBox: { alignItems: 'center', paddingVertical: verticalScale(60), paddingHorizontal: scale(40) },
  privateLockCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  privateTitle: { fontSize: moderateFont(17), fontWeight: '700', color: COLORS.text, marginBottom: verticalScale(8) },
  privateSub: { fontSize: moderateFont(13), color: COLORS.subtitle, textAlign: 'center', lineHeight: moderateFont(20) },

  emptyBox: { alignItems: 'center', paddingVertical: verticalScale(60) },
  emptyTitle: { fontSize: moderateFont(16), fontWeight: '700', color: COLORS.text, marginTop: verticalScale(14) },
  emptySub: { fontSize: moderateFont(13), color: COLORS.subtitle, marginTop: verticalScale(6), textAlign: 'center', paddingHorizontal: scale(30) },

  // Mutual followers
  mutualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(8),
    gap: 8,
  },
  mutualAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutualAvatar: {
    width: moderateScale(22),
    height: moderateScale(22),
    borderRadius: moderateScale(11),
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
  mutualText: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle,
    fontWeight: '500',
    flexShrink: 1,
  },
  squareActionButton: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(8),
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  squareActionButtonText: {
    fontSize: moderateFont(12),
    fontWeight: '600',
    color: '#374151',
  },
  // Mutual friends count button
  mutualCountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  mutualCountAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutualCountAvatar: {
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
  mutualCountText: {
    fontSize: moderateFont(12),
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Mutual followers bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  mutualSheet: {
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(12),
    maxHeight: '65%',
  },
  mutualSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: verticalScale(14),
  },
  mutualSheetTitle: {
    fontSize: moderateFont(17),
    fontWeight: '800',
    marginBottom: verticalScale(4),
  },
  mutualSheetSubtitle: {
    fontSize: moderateFont(12),
    marginBottom: verticalScale(16),
  },
  mutualSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    paddingVertical: verticalScale(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  mutualSheetAvatar: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: COLORS.surface,
  },
  mutualSheetUsername: {
    flex: 1,
    fontSize: moderateFont(14),
    fontWeight: '600',
  },
});
