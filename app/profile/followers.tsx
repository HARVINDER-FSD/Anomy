import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, SafeAreaView, ActivityIndicator, Alert, Platform, TextInput, Modal, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import * as Haptics from 'expo-haptics';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '@/src/store/authStore';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
import { useRelationshipStore } from '@/src/store/relationshipStore';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { FollowButton } from '@/src/components/common/FollowButton';
import { FlashList } from '@shopify/flash-list';
const FastFlashList = FlashList as React.ComponentType<any>;
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';

// Module-level cache to prevent reloading spinner when returning to this screen
const listCache: Record<string, any[]> = {};

export default function FollowListScreen() {
  const { userId, type, username } = useLocalSearchParams();
  const router = useSafeRouter();
  const currentUser = useAuthStore(state => state.user);

  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
  const isOwnProfile = !userId || (currentUserId && String(userId) === currentUserId) || (currentUser?.username && username === currentUser.username);

  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(type === 'following' ? 'following' : 'followers');

  const followersCacheKey = `${userId}-followers`;
  const followingCacheKey = `${userId}-following`;

  const [loading, setLoading] = useState(!listCache[`${userId}-${activeTab}`]);
  const [followers, setFollowers] = useState<any[]>(listCache[followersCacheKey] || []);
  const [following, setFollowing] = useState<any[]>(listCache[followingCacheKey] || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedUserForAction, setSelectedUserForAction] = useState<any>(null);
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);

  useEffect(() => {
    setErrorMsg(null);
    
    const activeCacheKey = activeTab === 'followers' ? followersCacheKey : followingCacheKey;
    const hasActiveCache = !!listCache[activeCacheKey] || followers.length > 0 || following.length > 0;

    performanceEngine.startScreenTrace('FollowersListScreen');
    performanceEngine.trackCacheAccess('Profile', hasActiveCache);
    performanceEngine.endScreenTrace('FollowersListScreen', hasActiveCache);

    if (!hasActiveCache) {
      setLoading(true);
    } else {
      setLoading(false);
    }
    
    Promise.all([
      apiClient.get(`/users/${userId}/followers`),
      apiClient.get(`/users/${userId}/following`)
    ])
      .then(([followersRes, followingRes]: [any, any]) => {
        const followersData = followersRes.data?.data || followersRes.data || [];
        const followingData = followingRes.data?.data || followingRes.data || [];
        
        setFollowers(followersData);
        listCache[followersCacheKey] = followersData;
        
        setFollowing(followingData);
        listCache[followingCacheKey] = followingData;
      })
      .catch((error: any) => {
        if (error.response?.status === 403) {
          setErrorMsg("This account is private.");
        }
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [userId, activeTab]);

  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    const sub = DeviceEventEmitter.addListener('user:follow:changed', (data: { userId: string, isFollowing: boolean }) => {
      setFollowing(prev => prev.filter(u => String(u._id || u.id) !== String(data.userId)));
    });
    return () => sub.remove();
  }, []);

  const activeList = activeTab === 'followers' ? followers : following;

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return activeList;
    const lower = searchQuery.toLowerCase().trim();
    return activeList.filter(u => {
      const uname = (u.username || '').toLowerCase();
      const fname = (u.fullName || u.full_name || '').toLowerCase();
      const phoneStr = (u.phone || '').toLowerCase();
      return uname.includes(lower) || fname.includes(lower) || phoneStr.includes(lower);
    });
  }, [activeList, searchQuery]);


  const handleMessageUser = async (targetUser: any) => {
    try {
      setLoading(true);
      const { useAuthStore } = await import('@/src/store/authStore');
      const currentUser = useAuthStore.getState().user;

      const res = await apiClient.post('/users/conversations', {
        recipientId: targetUser._id || targetUser.id,
        isAnonymous: currentUser?.isAnonymousMode === true,
      });
      const conversationId = res.data?.data?.conversation?.id || res.data?.data?.conversation?._id;
      if (!conversationId) {
        Alert.alert('Error', 'Could not start conversation.');
        return;
      }
      const q = new URLSearchParams();
      q.set('recipientId', String(targetUser._id || targetUser.id));
      q.set('username', targetUser.username || '');
      if (targetUser.profileImage || targetUser.avatar_url || targetUser.avatar) {
        q.set('profileImage', String(targetUser.profileImage || targetUser.avatar_url || targetUser.avatar));
      }
      if (currentUser?.isAnonymousMode) q.set('isAnonymousChat', 'true');
      router.push(`/chat/${conversationId}?${q.toString()}` as any);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not start conversation.');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerActionSheet = (targetUser: any) => {
    setSelectedUserForAction(targetUser);
    setIsActionSheetVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleConfirmAction = async () => {
    if (!selectedUserForAction) return;
    const isFollowersTab = activeTab === 'followers';
    try {
      const targetId = selectedUserForAction._id || selectedUserForAction.id;
      if (isFollowersTab) {
        await apiClient.delete(`/users/followers/${targetId}`);
        setFollowers(prev => prev.filter(u => (u._id || u.id) !== targetId));
        useRelationshipStore.getState().updateRelationship(targetId, {
          followsBack: false,
        }, 'http');
      } else {
        await apiClient.delete(`/users/${targetId}/follow`);
        setFollowing(prev => prev.filter(u => (u._id || u.id) !== targetId));
        useRelationshipStore.getState().updateRelationship(targetId, {
          isFollowing: false,
          isPending: false,
        }, 'http');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Error', 'Operation failed. Please try again.');
    } finally {
      setIsActionSheetVisible(false);
      setSelectedUserForAction(null);
    }
  };

  const UserListItem = ({ item, isFollowersTab, onTriggerActionSheet, onMessageUser }: any) => {
    const targetId = item._id || item.id;
    const initialIsFollowing = item?.is_following ?? item?.isFollowing ?? (!isFollowersTab && isOwnProfile);

    const { isFollowing, isPending, isMutualFollow, followsBack, isLoading, toggleFollow, removeFollower } = useFollowStatus(targetId, {
      isMutualFollow: !!item.isMutualFollow,
      followsBack: !!item.followsBack,
      isFollowing: !!initialIsFollowing,
    });

    const isMutual = isMutualFollow || followsBack;
    const hasStory = !!item.hasActiveStory || !!item.has_story || !!item.activeStory;

    const handleVisitProfile = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/user/${item.username}`);
    };

    const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
    const targetUserId = targetId?.toString();
    const isSelf = !!(
      (currentUserId && targetUserId && currentUserId === targetUserId) ||
      (currentUser?.username && item.username === currentUser.username)
    );

    const handleFollowAction = () => {
      if (isFollowersTab) {
        if (isMutual) {
          onMessageUser(item);
        } else {
          toggleFollow();
        }
      } else {
        onTriggerActionSheet(item);
      }
    };

    return (
      <View style={styles.userItem}>
        <TouchableOpacity
          style={styles.userPressableArea}
          onPress={handleVisitProfile}
          activeOpacity={0.7}
        >
          <View style={[
            styles.avatarRing,
            hasStory ? { borderColor: '#E1306C', borderWidth: 2 } : { borderColor: 'transparent', borderWidth: 0 }
          ]}>
            <Image
              source={{ uri: resolveAvatarUrl(item.profileImage || item.avatar_url || item.avatar, item.username) }}
              style={styles.avatar}
            />
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.usernameText} numberOfLines={1}>
              {item.username}
            </Text>
            <Text style={styles.fullNameText} numberOfLines={1}>
              {item.fullName || item.full_name || item.username}
            </Text>
          </View>
        </TouchableOpacity>

        {isSelf ? (
          <View style={styles.selfBadgeContainer}>
            <Text style={styles.selfBadgeText}>You</Text>
          </View>
        ) : (
          <View style={styles.actionSection}>
            {isFollowersTab && isMutual ? (
              <TouchableOpacity
                onPress={() => onMessageUser(item)}
                style={[styles.capsuleBtn, styles.capsuleBtnGrey]}
              >
                <Text style={[styles.capsuleBtnText, styles.capsuleBtnTextGrey]}>Message</Text>
              </TouchableOpacity>
            ) : (
              <FollowButton
                targetUserId={targetId || ''}
                onToggle={isFollowersTab ? toggleFollow : () => onTriggerActionSheet(item)}
                isLoading={isLoading}
                variant={isFollowersTab ? "primary" : "outline"}
                size="md"
                followsBackLabel={followsBack}
              />
            )}

            <TouchableOpacity
              style={styles.optionsBtn}
              onPress={() => onTriggerActionSheet(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderUser = ({ item }: { item: any }) => (
    <UserListItem
      item={item}
      isFollowersTab={activeTab === 'followers'}
      onTriggerActionSheet={handleTriggerActionSheet}
      onMessageUser={handleMessageUser}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {username || (currentUser && (String(currentUser._id || currentUser.id) === String(userId)) ? currentUser.username : 'Profile')}
        </Text>
        <TouchableOpacity onPress={() => router.push('/profile/discover' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="person-add-outline" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'followers' && styles.activeTabBtn]}
          onPress={() => setActiveTab('followers')}
        >
          <Text style={[styles.tabTxt, activeTab === 'followers' && styles.activeTabTxt]}>
            {followers.length} followers
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'following' && styles.activeTabBtn]}
          onPress={() => setActiveTab('following')}
        >
          <Text style={[styles.tabTxt, activeTab === 'following' && styles.activeTabTxt]}>
            {following.length} following
          </Text>
        </TouchableOpacity>
      </View>

      {!loading && !errorMsg && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${type === 'followers' ? 'followers' : 'following'}...`}
              placeholderTextColor="#8E8E93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.centerNode}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
        </View>
      ) : (
        <FastFlashList
          data={filteredUsers}
          keyExtractor={(item: any) => item.id || item._id}
          renderItem={renderUser}
          estimatedItemSize={65}
          drawDistance={300}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={errorMsg ? "lock-closed-outline" : "search-outline"}
                size={60}
                color={COLORS.border}
              />
              <Text style={styles.emptyText}>
                {errorMsg || (searchQuery.trim() ? "No matching users found." : "No users found.")}
              </Text>
            </View>
          }
        />
      )}
      <PerformanceOverlay />

      <Modal
        visible={isActionSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsActionSheetVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsActionSheetVisible(false)}>
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>

        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />

          {selectedUserForAction && (
            <View style={styles.sheetHeader}>
              <View style={styles.sheetAvatarContainer}>
                <Image
                  source={{ uri: resolveAvatarUrl(selectedUserForAction.profileImage || selectedUserForAction.avatar_url || selectedUserForAction.avatar, selectedUserForAction.username) }}
                  style={styles.sheetAvatar}
                />
              </View>
              <Text style={styles.sheetTitle}>
                {activeTab === 'followers' ? 'Remove follower?' : `Unfollow @${selectedUserForAction.username}?`}
              </Text>
              <Text style={styles.sheetSubtitle}>
                {activeTab === 'followers'
                  ? `AnuFy won't notify @${selectedUserForAction.username} that they were removed from your followers.`
                  : `You'll stop seeing their posts, creations, and updates in your feed.`}
              </Text>
            </View>
          )}

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.sheetBtnDangerous}
              onPress={handleConfirmAction}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetBtnDangerousTxt}>
                {activeTab === 'followers' ? 'Remove Follower' : 'Unfollow'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetBtnCancel}
              onPress={() => setIsActionSheetVisible(false)}
              activeOpacity={0.9}
            >
              <Text style={styles.sheetBtnCancelTxt}>
                {activeTab === 'followers' ? 'Keep Follower' : 'Cancel'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingBottom: verticalScale(12), borderBottomWidth: 0,
    paddingTop: Platform.OS === 'ios' ? verticalScale(55) : verticalScale(50),
    backgroundColor: COLORS.background
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: '700', color: COLORS.text },

  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: verticalScale(10),
  },
  tabBtn: {
    flex: 1,
    paddingVertical: verticalScale(12),
    alignItems: 'center',
  },
  activeTabBtn: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.text,
  },
  tabTxt: {
    fontSize: moderateFont(15),
    color: COLORS.subtitle,
    fontWeight: '600',
  },
  activeTabTxt: {
    color: COLORS.text,
  },

  searchContainer: {
    paddingHorizontal: scale(20),
    paddingBottom: verticalScale(10),
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    height: verticalScale(36),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: scale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateFont(14),
    color: COLORS.text,
    height: '100%',
    paddingVertical: 0,
  },

  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: scale(10), paddingTop: scale(10) },

  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(4),
    width: '100%',
  },
  userPressableArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarRing: {
    width: scale(54),
    height: scale(54),
    borderRadius: scale(27),
    borderWidth: 2,
    borderColor: '#A200FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(12),
  },
  avatar: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    backgroundColor: COLORS.surface,
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  usernameText: {
    fontSize: moderateFont(14),
    fontWeight: '700',
    color: COLORS.text,
  },
  fullNameText: {
    fontSize: moderateFont(14),
    color: COLORS.subtitle,
    marginTop: verticalScale(2),
  },
  subtextLabel: {
    fontSize: moderateFont(11),
    color: '#0095F6',
    fontWeight: '600',
    marginTop: verticalScale(2),
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  capsuleBtn: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(8),
    minWidth: scale(88),
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleBtnGrey: {
    backgroundColor: '#EFEFEF',
    borderWidth: 0,
  },
  capsuleBtnPrimary: {
    backgroundColor: '#3858F6',
  },
  capsuleBtnText: {
    fontSize: moderateFont(14),
    fontWeight: '600',
  },
  capsuleBtnTextGrey: {
    color: '#000',
  },
  capsuleBtnTextPrimary: {
    color: '#FFF',
  },
  optionsBtn: {
    width: scale(24),
    height: scale(24),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: scale(2),
  },
  emptyContainer: { alignItems: 'center', marginTop: verticalScale(100) },
  emptyText: { color: COLORS.subtitle, marginTop: verticalScale(15), fontSize: moderateFont(16) },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: moderateScale(32),
    borderTopRightRadius: moderateScale(32),
    paddingHorizontal: scale(24),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(40) : verticalScale(28),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sheetHandle: {
    width: scale(44),
    height: scale(5),
    borderRadius: moderateScale(3),
    backgroundColor: '#E5E0F0',
    marginTop: verticalScale(12),
    marginBottom: verticalScale(24),
  },
  sheetHeader: {
    alignItems: 'center',
    width: '100%',
    marginBottom: verticalScale(28),
  },
  sheetAvatarContainer: {
    padding: scale(3),
    borderRadius: moderateScale(45),
    backgroundColor: '#FFF',
    shadowColor: '#4B0082',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: verticalScale(16),
  },
  sheetAvatar: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    backgroundColor: '#F5F3FF',
  },
  sheetTitle: {
    fontSize: moderateFont(17),
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: verticalScale(8),
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: moderateFont(13),
    color: COLORS.subtitle,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: scale(10),
  },
  buttonGroup: {
    width: '100%',
    gap: verticalScale(12),
    marginTop: verticalScale(8),
  },
  sheetBtnDangerous: {
    width: '100%',
    height: verticalScale(50),
    borderRadius: moderateScale(14),
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  sheetBtnDangerousTxt: {
    fontSize: moderateFont(15),
    fontWeight: '700',
    color: '#FFF',
  },
  sheetBtnCancel: {
    width: '100%',
    height: verticalScale(50),
    borderRadius: moderateScale(14),
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sheetBtnCancelTxt: {
    fontSize: moderateFont(15),
    fontWeight: '700',
    color: COLORS.text,
  },
  selfBadgeContainer: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(6),
    backgroundColor: COLORS.surface || '#F5F5F5',
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: COLORS.border || '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfBadgeText: {
    fontSize: moderateFont(12),
    fontWeight: '600',
    color: COLORS.subtitle || '#666',
  }
});
