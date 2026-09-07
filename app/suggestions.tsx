import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Animated,
  StatusBar,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { COLORS, GRADIENT } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { FollowButton } from '@/src/components/common/FollowButton';
import { Skeleton, ListSkeleton } from '@/src/components/common/Skeleton';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';


// ─── Types ────────────────────────────────────────────────────────────
interface SuggestedUser {
  id: string;
  _id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  is_verified: boolean;
  badge_type: string | null;
  is_private: boolean;
  followers_count: number;
  reason: string;
  reasonType: 'mutual' | 'interests' | 'active';
  is_following?: boolean;
}

// ─── Reason helpers ───────────────────────────────────────────────────
const getReasonIcon = (reasonType: string) => {
  switch (reasonType) {
    case 'mutual': return 'people';
    case 'interests': return 'sparkles';
    case 'active': return 'flash';
    default: return 'person-add';
  }
};

const getReasonColor = (reasonType: string) => {
  switch (reasonType) {
    case 'mutual': return '#7C3AED';
    case 'interests': return '#F59E0B';
    case 'active': return '#10B981';
    default: return COLORS.subtitle;
  }
};

// ─── List Item Component ──────────────────────────────────────────────
const SuggestionListItem = React.memo(({ user, onDismiss }: {
  user: SuggestedUser;
  onDismiss: (userId: string) => void;
}) => {
  const router = useSafeRouter();
  const userId = user.id || user._id;
  const { isFollowing, isPending, isLoading, toggleFollow } = useFollowStatus(userId, {
    isFollowing: !!user.is_following,
  });
  const isFollowed = isFollowing || isPending;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss(user.id));
  };

  const reasonColor = getReasonColor(user.reasonType);

  return (
    <Animated.View style={[styles.listItem, { opacity: fadeAnim }]}>
      {/* Avatar */}
      <TouchableOpacity
        style={styles.listItemLeft}
        onPress={() => router.push(`/user/${user.username}`)}
        activeOpacity={0.7}
      >
        <View style={styles.listAvatarContainer}>
          <LinearGradient
            colors={['#7C3AED', '#4B0082', '#1a0040']}
            style={styles.listAvatarRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.listAvatarInner}>
              <Image
                source={{ uri: resolveAvatarUrl(user.avatar_url, user.username) }}
                style={styles.listAvatar}
              />
            </View>
          </LinearGradient>
          {user.is_verified && (
            <View style={styles.listVerifiedBadge}>
              <VerifiedTick badgeType={user.badge_type} size={14} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.listItemInfo}>
          <Text style={styles.listUsername} numberOfLines={1}>{user.username}</Text>
          <Text style={styles.listFullName} numberOfLines={1}>
            {user.full_name || user.username}
          </Text>
          {/* Reason */}
          <View style={[styles.listReasonChip, { backgroundColor: `${reasonColor}12` }]}>
            <Ionicons name={getReasonIcon(user.reasonType) as any} size={10} color={reasonColor} />
            <Text style={[styles.listReasonText, { color: reasonColor }]} numberOfLines={1}>
              {user.reason}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.listItemActions}>
        {/* Follow/Following Button */}
        <FollowButton
          targetUserId={userId}
          onToggle={isFollowed ? () => {} : toggleFollow}
          isLoading={isLoading}
          variant="primary"
          size="md"
        />

        {/* Dismiss */}
        <TouchableOpacity
          style={styles.listDismissBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="close" size={18} color={COLORS.subtitle} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────
export default function SuggestionsScreen() {
  const router = useSafeRouter();
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSuggestions = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await apiClient.get('/users/suggestions?limit=30');
      if (res.data?.success && res.data?.data) {
        setSuggestions(res.data.data);
      }
    } catch (error) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleDismiss = (targetUserId: string) => {
    setSuggestions(prev => prev.filter(u => u.id !== targetUserId));
  };

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fetchSuggestions(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discover People</Text>
        <View style={{ width: scale(32) }} />
      </View>

      {/* Subtitle */}
      <View style={styles.subtitleContainer}>
        <LinearGradient
          colors={['#F9F7FF', '#F0EEFF']}
          style={styles.subtitleBanner}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons name="sparkles" size={18} color="#7C3AED" />
          <Text style={styles.subtitleText}>
            People suggested based on your connections, interests, and activity
          </Text>
        </LinearGradient>
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ padding: scale(16) }}>
          <ListSkeleton />
          <View style={{ height: verticalScale(20) }} />
          <ListSkeleton />
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SuggestionListItem
              user={item}
              onDismiss={handleDismiss}
            />
          )}
          contentContainerStyle={styles.listContentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No Suggestions Right Now</Text>
              <Text style={styles.emptySubtitle}>
                We'll find people for you as you use the app more. Try following some accounts first!
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.navigate('/(tabs)/explore' as any)}
              >
                <LinearGradient
                  colors={GRADIENT.main as [string, string]}
                  style={styles.emptyBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.emptyBtnText}>Explore</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(6),
    paddingBottom: verticalScale(10),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  backBtn: {
    width: scale(32),
    height: scale(32),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: moderateFont(18),
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },

  // Subtitle
  subtitleContainer: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  subtitleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(12),
    borderRadius: moderateScale(12),
    gap: scale(8),
  },
  subtitleText: {
    flex: 1,
    fontSize: moderateFont(12),
    color: '#6B5B8A',
    lineHeight: moderateFont(16),
  },

  // List
  listContentContainer: {
    paddingBottom: verticalScale(100),
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: scale(16),
  },

  // List Item
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: scale(12),
  },

  // List Avatar
  listAvatarContainer: {
    position: 'relative',
    marginRight: scale(12),
  },
  listAvatarRing: {
    width: moderateScale(52),
    height: moderateScale(52),
    borderRadius: moderateScale(26),
    alignItems: 'center',
    justifyContent: 'center',
  },
  listAvatarInner: {
    width: moderateScale(47),
    height: moderateScale(47),
    borderRadius: moderateScale(23.5),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listAvatar: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
  },
  listVerifiedBadge: {
    position: 'absolute',
    bottom: -1,
    right: -2,
    backgroundColor: COLORS.white,
    borderRadius: 10,
  },

  // List Info
  listItemInfo: {
    flex: 1,
  },
  listUsername: {
    fontSize: moderateFont(14),
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  listFullName: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle,
    marginTop: verticalScale(1),
  },
  listReasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(8),
    marginTop: verticalScale(4),
    alignSelf: 'flex-start',
  },
  listReasonText: {
    fontSize: moderateFont(10),
    fontWeight: '600',
  },

  // List Actions
  listItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  listFollowBtn: {
    width: scale(95),
    height: verticalScale(34),
    borderRadius: moderateScale(10),
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  listFollowBtnFollowed: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  listFollowGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listFollowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(4),
    flex: 1,
  },
  listFollowText: {
    fontSize: moderateFont(13),
    fontWeight: '700',
    color: '#FFF',
  },
  listFollowTextFollowed: {
    color: COLORS.primary,
  },
  listDismissBtn: {
    width: scale(28),
    height: scale(28),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(40),
    paddingTop: verticalScale(80),
  },
  emptyTitle: {
    fontSize: moderateFont(18),
    fontWeight: '700',
    color: COLORS.text,
    marginTop: verticalScale(16),
  },
  emptySubtitle: {
    fontSize: moderateFont(13),
    color: COLORS.subtitle,
    textAlign: 'center',
    marginTop: verticalScale(8),
    lineHeight: moderateFont(18),
  },
  emptyBtn: {
    marginTop: verticalScale(24),
    borderRadius: moderateScale(12),
    overflow: 'hidden',
  },
  emptyBtnGradient: {
    paddingHorizontal: scale(32),
    paddingVertical: verticalScale(12),
  },
  emptyBtnText: {
    fontSize: moderateFont(14),
    fontWeight: '700',
    color: '#FFF',
  },
});
