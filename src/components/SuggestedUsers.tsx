import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { COLORS, GRADIENT } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { FollowButton } from '@/src/components/common/FollowButton';
import { Skeleton } from '@/src/components/common/Skeleton';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';


const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = scale(155);
const CARD_HEIGHT = verticalScale(210);

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
}

interface SuggestedUsersProps {
  /** Maximum number of users to display */
  limit?: number;
  /** Show the "See All" button */
  showSeeAll?: boolean;
  /** Custom title */
  title?: string;
  /** Called when the section has no data (useful for conditional rendering) */
  onEmpty?: () => void;
}

// ─── Skeleton Loader ──────────────────────────────────────────────────
const SuggestionSkeleton = () => (
  <View style={styles.skeletonContainer}>
    {[1, 2, 3].map((i) => (
      <View key={i} style={styles.skeletonCard}>
        <Skeleton width={moderateScale(60)} height={moderateScale(60)} borderRadius={moderateScale(30)} />
        <Skeleton width={scale(90)} height={12} borderRadius={6} style={{ marginTop: verticalScale(10) }} />
        <Skeleton width={scale(60)} height={10} borderRadius={5} style={{ marginTop: verticalScale(6) }} />
        <Skeleton width={scale(100)} height={verticalScale(32)} borderRadius={moderateScale(16)} style={{ marginTop: verticalScale(12) }} />
      </View>
    ))}
  </View>
);

// ─── Reason Icon ──────────────────────────────────────────────────────
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

// ─── Individual User Card ─────────────────────────────────────────────
const UserCard = React.memo(({ user, onDismiss }: {
  user: SuggestedUser;
  onDismiss: (userId: string) => void;
}) => {
  const router = useSafeRouter();
  const userId = user.id || user._id;
  const { isFollowing, isPending, isLoading, toggleFollow } = useFollowStatus(userId, {
    isFollowing: !!(user as any).is_following,
  });
  const isFollowed = isFollowing || isPending;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onDismiss(user.id);
    });
  };

  const handlePress = () => {
    router.push(`/user/${user.username}`);
  };

  const reasonColor = getReasonColor(user.reasonType);
  const reasonIcon = getReasonIcon(user.reasonType);

  return (
    <Animated.View style={[
      styles.card,
      { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
    ]}>
      {/* Dismiss (×) button */}
      <TouchableOpacity
        style={styles.dismissBtn}
        onPress={handleDismiss}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Ionicons name="close" size={14} color={COLORS.subtitle} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.cardContent} onPress={handlePress} activeOpacity={0.8}>
        {/* Avatar with gradient ring */}
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={['#7C3AED', '#4B0082', '#1a0040']}
            style={styles.avatarRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.avatarInner}>
              <Image
                source={{ uri: resolveAvatarUrl(user.avatar_url, user.username) }}
                style={styles.avatar}
              />
            </View>
          </LinearGradient>
          {user.is_verified && (
            <View style={styles.verifiedBadge}>
              <VerifiedTick badgeType={user.badge_type} size={14} />
            </View>
          )}
        </View>

        {/* Username */}
        <Text style={styles.username} numberOfLines={1}>
          {user.username}
        </Text>

        {/* Full Name */}
        <Text style={styles.fullName} numberOfLines={1}>
          {user.full_name || user.username}
        </Text>

        {/* Reason chip */}
        <View style={[styles.reasonChip, { backgroundColor: `${reasonColor}12` }]}>
          <Ionicons name={reasonIcon as any} size={11} color={reasonColor} />
          <Text style={[styles.reasonText, { color: reasonColor }]} numberOfLines={1}>
            {user.reason}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Follow / Following button */}
      <FollowButton
        targetUserId={userId}
        onToggle={isFollowed ? () => {} : toggleFollow}
        isLoading={isLoading}
        variant="primary"
        size="md"
      />
    </Animated.View>
  );
});

// ─── Main Component ───────────────────────────────────────────────────
export const SuggestedUsers: React.FC<SuggestedUsersProps> = ({
  limit = 10,
  showSeeAll = true,
  title = 'Suggested for You',
  onEmpty,
}) => {
  const router = useSafeRouter();
  const { user } = useAuthStore();
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const fetchSuggestions = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await apiClient.get(`/users/suggestions?limit=${limit}`);
      if (res.data?.success && res.data?.data) {
        const currentUserId = (user?._id || user?.id)?.toString();
        const rawData = Array.isArray(res.data.data) ? res.data.data : [];
        const filtered = rawData.filter(
          (u: any) =>
            String(u._id || u.id) !== currentUserId &&
            u.username !== user?.username &&
            u.role !== 'super_admin' &&
            u.role !== 'admin'
        );
        setSuggestions(filtered);
        if (filtered.length === 0) {
          onEmpty?.();
        }
      }
    } catch (error) {
      onEmpty?.();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [limit, onEmpty]);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Spin animation
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start(() => rotateAnim.setValue(0));

    fetchSuggestions(true);
  };

  const handleDismiss = (targetUserId: string) => {
    setSuggestions(prev => prev.filter(u => u.id !== targetUserId));
  };

  const spinInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Don't render if no suggestions and not loading
  if (!loading && suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerActions}>
          {/* Refresh button */}
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={refreshing}
            style={styles.refreshBtn}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
              <Ionicons
                name="refresh"
                size={18}
                color={refreshing ? COLORS.subtitle : COLORS.primary}
              />
            </Animated.View>
          </TouchableOpacity>

          {/* See All button */}
          {showSeeAll && suggestions.length > 0 && (
            <TouchableOpacity
              style={styles.seeAllBtn}
              onPress={() => router.push('/suggestions' as any)}
            >
              <Text style={styles.seeAllText}>See All</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <SuggestionSkeleton />
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onDismiss={handleDismiss}
            />
          )}
          snapToInterval={CARD_WIDTH + scale(12)}
          decelerationRate="fast"
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(8),
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(12),
  },
  headerTitle: {
    fontSize: moderateFont(16),
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  refreshBtn: {
    padding: scale(4),
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(2),
  },
  seeAllText: {
    fontSize: moderateFont(13),
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Skeleton
  skeletonContainer: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    gap: scale(12),
  },
  skeletonCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#F9F7FF',
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(12),
  },

  // List
  listContent: {
    paddingHorizontal: scale(16),
    gap: scale(12),
  },

  // Card
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#FAFAFF',
    borderRadius: moderateScale(20),
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    position: 'relative',
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: verticalScale(20),
    paddingHorizontal: scale(10),
  },
  dismissBtn: {
    position: 'absolute',
    top: scale(6),
    right: scale(6),
    zIndex: 10,
    width: scale(22),
    height: scale(22),
    borderRadius: scale(11),
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Avatar
  avatarContainer: {
    position: 'relative',
    marginBottom: verticalScale(6),
  },
  avatarRing: {
    width: moderateScale(64),
    height: moderateScale(64),
    borderRadius: moderateScale(32),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: moderateScale(58),
    height: moderateScale(58),
    borderRadius: moderateScale(29),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: moderateScale(54),
    height: moderateScale(54),
    borderRadius: moderateScale(27),
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    backgroundColor: COLORS.white,
    borderRadius: 10,
  },

  // Text
  username: {
    fontSize: moderateFont(13),
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  fullName: {
    fontSize: moderateFont(11),
    color: COLORS.subtitle,
    textAlign: 'center',
    marginTop: verticalScale(1),
  },

  // Reason chip
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(10),
    marginTop: verticalScale(5),
    maxWidth: '100%',
  },
  reasonText: {
    fontSize: moderateFont(9),
    fontWeight: '600',
    flexShrink: 1,
  },

  // Follow button
  followBtn: {
    marginHorizontal: scale(10),
    marginBottom: verticalScale(10),
    height: verticalScale(32),
    borderRadius: moderateScale(16),
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  followBtnFollowed: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  followGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(4),
    flex: 1,
  },
  followBtnText: {
    fontSize: moderateFont(12),
    fontWeight: '700',
    color: '#FFF',
  },
  followBtnTextFollowed: {
    color: COLORS.primary,
  },
});

export default SuggestedUsers;
