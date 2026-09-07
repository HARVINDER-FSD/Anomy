import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Image } from 'expo-image';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, ActivityIndicator, RefreshControl, BackHandler,
  PanResponder, Animated, StatusBar, Alert, Modal, DeviceEventEmitter
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/store/authStore';
import { useProfileStore } from '@/src/store/profileStore';
import { useReelsStore } from '@/src/store/reelsStore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { TabActions } from '@react-navigation/native';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { PostOptionsModal } from '@/components/PostOptionsModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeleteEngine } from '@/src/engines/DeleteEngine';


const SIZES = {
  width: Dimensions.get('window').width,
  height: Dimensions.get('window').height
};

const PRESET_AVATARS = [
  // --- Male Avatars (Lorelei & Avataaars & Adventurer) ---
  'https://api.dicebear.com/7.x/lorelei/png?seed=Jack',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Leo',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Ethan',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Jacob',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Noah',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Liam',
  'https://api.dicebear.com/7.x/avataaars/png?seed=John',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Harry',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Bob',
  'https://api.dicebear.com/7.x/avataaars/png?seed=David',
  'https://api.dicebear.com/7.x/avataaars/png?seed=George',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Ryan',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Alexander',
  'https://api.dicebear.com/7.x/adventurer/png?seed=James',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Mason',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Samuel',
  'https://api.dicebear.com/7.x/micah/png?seed=Oliver',
  'https://api.dicebear.com/7.x/micah/png?seed=Tyler',
  'https://api.dicebear.com/7.x/open-peeps/png?seed=Kevin',
  'https://api.dicebear.com/7.x/open-peeps/png?seed=Aaron',

  // --- Female Avatars (Lorelei & Avataaars & Adventurer) ---
  'https://api.dicebear.com/7.x/lorelei/png?seed=Sophia',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Emma',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Chloe',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Olivia',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Ava',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Isabella',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Bella',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Lucy',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Lily',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Anna',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Grace',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Mia',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Luna',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Maya',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Sophie',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Zoe',
  'https://api.dicebear.com/7.x/micah/png?seed=Zoe',
  'https://api.dicebear.com/7.x/micah/png?seed=Lily',
  'https://api.dicebear.com/7.x/open-peeps/png?seed=Alice',
  'https://api.dicebear.com/7.x/open-peeps/png?seed=Sasha',

  // --- Cyber / Ghost / Robots (Ghost Theme) ---
  'https://api.dicebear.com/7.x/bottts/png?seed=Ghost',
  'https://api.dicebear.com/7.x/bottts/png?seed=Ninja',
  'https://api.dicebear.com/7.x/bottts/png?seed=Hacker',
  'https://api.dicebear.com/7.x/bottts/png?seed=Shadow',
  'https://api.dicebear.com/7.x/bottts/png?seed=Gamer',
  'https://api.dicebear.com/7.x/bottts/png?seed=Matrix',
  'https://api.dicebear.com/7.x/bottts/png?seed=Alpha',
  'https://api.dicebear.com/7.x/bottts/png?seed=Beta',
  'https://api.dicebear.com/7.x/bottts/png?seed=Cyber',
  'https://api.dicebear.com/7.x/bottts/png?seed=Mech',

  // --- Cute Cartoon & Bitmoji Styles (Big Ears, Fun Emoji) ---
  'https://api.dicebear.com/7.x/big-ears/png?seed=Felix',
  'https://api.dicebear.com/7.x/big-ears/png?seed=Milo',
  'https://api.dicebear.com/7.x/big-ears/png?seed=Max',
  'https://api.dicebear.com/7.x/big-ears/png?seed=Teddy',
  'https://api.dicebear.com/7.x/big-ears/png?seed=Leo',
  'https://api.dicebear.com/7.x/big-ears/png?seed=Toby',
  'https://api.dicebear.com/7.x/fun-emoji/png?seed=Cool',
  'https://api.dicebear.com/7.x/fun-emoji/png?seed=Smile',
  'https://api.dicebear.com/7.x/fun-emoji/png?seed=Wink',
  'https://api.dicebear.com/7.x/fun-emoji/png?seed=Love',
  'https://api.dicebear.com/7.x/fun-emoji/png?seed=Happy',
  'https://api.dicebear.com/7.x/fun-emoji/png?seed=Star',

  // --- Pixel Art & Retro Styles ---
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Hero',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Mage',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Rogue',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Knight',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Wizard',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Elf',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Orc',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Goblin'
];

export default function ProfileScreen() {
  const COLORS = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(COLORS, insets);
  const router = useSafeRouter();
  const navigation = useNavigation();
  const { user, setAuth, logout, toggleAnonymousMode } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'posts' | 'shots' | 'saved'>('posts');
  const isAnonymous = user?.isAnonymousMode;

  // 🚀 Android back button: go to Home (index) instead of Discover (explore)
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // navigation IS the tab navigator inside a tab screen
        navigation.dispatch(TabActions.jumpTo('index'));
        return true; // prevent default back
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation])
  );

  const [editGhostModalVisible, setEditGhostModalVisible] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);

  const handleUpdateGhostAvatar = async (avatarUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const persona = user?.anonymousPersona || { name: 'Anonymous Ghost', username: 'ghost', avatar: '' };
    try {
      setUpdatingAvatar(true);
      const res = await apiClient.post('/users/anonymous/persona', {
        name: persona.name,
        avatar: avatarUrl
      });
      if (res.data?.success) {
        const updatedUser = {
          ...user!,
          anonymousPersona: {
            ...persona,
            avatar: avatarUrl
          }
        };
        await setAuth(updatedUser, useAuthStore.getState().token || '');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const swipeAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      glowAnim.setValue(0);
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
    }, [])
  );
  const { realityCache, ghostCache, loadCache, setCache } = useProfileStore();
  const currentCache = isAnonymous ? ghostCache : realityCache;

  useEffect(() => {
    loadCache();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('shot:deleted:local', (data: any) => {
      setReels(prev => {
        const updated = prev.filter(r => r && String(r._id || r.id) !== String(data.shotId));
        setTimeout(() => {
          void setCache(!!isAnonymous, { reels: updated });
        }, 0);
        return updated;
      });
    });
    return () => sub.remove();
  }, [isAnonymous]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('post:deleted:local', (data: any) => {
      setPosts(prev => {
        const updated = prev.filter(p => p && String(p._id || p.id) !== String(data.postId));
        setTimeout(() => {
          void setCache(!!isAnonymous, { posts: updated });
        }, 0);
        return updated;
      });
    });
    return () => sub.remove();
  }, [isAnonymous]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('post:liked:local', (data: any) => {
      setPosts(prev => {
        const updated = prev.map(p => {
          if (p && String(p._id || p.id) === String(data.postId)) {
            const count = data.likesCount !== undefined ? data.likesCount : (p.likes_count ?? p.likesCount ?? 0);
            return {
              ...p,
              isLiked: data.isLiked,
              is_liked: data.isLiked,
              likes_count: count,
              likesCount: count
            };
          }
          return p;
        });
        setTimeout(() => {
          void setCache(!!isAnonymous, { posts: updated });
        }, 0);
        return updated;
      });
      setReels(prev => {
        const updated = prev.map(r => {
          if (r && String(r._id || r.id) === String(data.postId)) {
            const count = data.likesCount !== undefined ? data.likesCount : (r.likes_count ?? r.likesCount ?? 0);
            return {
              ...r,
              isLiked: data.isLiked,
              is_liked: data.isLiked,
              likes_count: count,
              likesCount: count
            };
          }
          return r;
        });
        setTimeout(() => {
          void setCache(!!isAnonymous, { reels: updated });
        }, 0);
        return updated;
      });
    });
    return () => sub.remove();
  }, [isAnonymous]);

  // Cache useEffect intentionally removed — fetchProfile handles cache display to avoid double-write

  const isNavigating = useRef(false);
  const lastTapTime = useRef(0);

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [reels, setReels] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [savedReels, setSavedReels] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mutualCount, setMutualCount] = useState(0);
  const fetchGenRef = useRef(0); // tracks latest fetch to discard stale responses

  const dedupeItems = (items: any[]) => {
    const seen = new Set<string>();
    return (items || []).filter((item) => {
      if (!item) return false;
      const raw = item._id || item.id;
      if (!raw) return false;
      const key = typeof raw === 'string' ? raw : (raw.$oid ? String(raw.$oid) : raw.toString());
      if (!key || key === 'undefined' || key === '[object Object]' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [optionsPostId, setOptionsPostId] = useState('');
  const [optionsIsOwn, setOptionsIsOwn] = useState(true);
  const [optionsPostData, setOptionsPostData] = useState<any>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        swipeAnim.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 60) {
          handleToggleAnonymous();
        }
        Animated.spring(swipeAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const handleToggleAnonymous = () => {
    // 🚀 ULTRA-FAST TOGGLE: Trigger haptics and toggle mode synchronously
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleAnonymousMode();
  };

  useEffect(() => {
    if (isAnonymous && activeTab === 'shots') {
      setActiveTab('posts');
    }
  }, [isAnonymous, activeTab]);

  const currentUserId = user?.id || user?._id;
  const isCacheValid = currentCache?.profileData && currentUserId && String(currentCache.profileData.id || currentCache.profileData._id) === String(currentUserId);
  const validCache = isCacheValid ? currentCache : null;

  const fetchProfile = async (isManualRefresh = false) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    // 🛡️ GENERATION GUARD: Increment so any in-flight fetch knows it's stale
    fetchGenRef.current += 1;
    const myGen = fetchGenRef.current;

    try {
      // 🚀 INSTANT CACHE DISPLAY: Show cached data immediately if available for the current user
      if (validCache && !isManualRefresh) {
        setProfileData(validCache.profileData);
        setPosts(dedupeItems(validCache.posts));
        setReels(dedupeItems(validCache.reels));
        setSavedPosts(validCache.savedPosts);
        setSavedReels(validCache.savedReels);
        setMutualCount(validCache.mutualCount);
        setLoading(false);
      } else if (!validCache || (isManualRefresh && !refreshing)) {
        setLoading(true);
      }

      // 🚀 INSTANT PROFILE DATA: Fetch profile data first and display immediately
      const res = await apiClient.get('/users/me');
      if (myGen !== fetchGenRef.current) return; // stale, discard
      const freshData = res.data;
      setProfileData(freshData);
      setLoading(false);
      setMutualCount(freshData.friends_count ?? freshData.mutual_count ?? 0);

      const latestUser = useAuthStore.getState().user;
      if (latestUser) {
        setAuth({
          ...latestUser,
          ...freshData,
          id: freshData.id || freshData._id || latestUser.id
        }, useAuthStore.getState().token || '');
      }

      const userId = freshData._id || freshData.id;

      // 🚀 LOAD POSTS/REELS IN BACKGROUND: Don't block profile display
      setTimeout(async () => {
        if (myGen !== fetchGenRef.current) return; // stale, discard
        try {
          const [postsRes, shotsRes] = await Promise.all([
            apiClient.get(`/users/${userId}/posts?type=posts&limit=20&anonymous=${isAnonymous}`),
            apiClient.get(`/users/${userId}/posts?type=shots&limit=20&anonymous=${isAnonymous}`)
          ]);

          if (myGen !== fetchGenRef.current) return; // stale, discard

          const rawPosts = postsRes.data?.data || postsRes.data?.posts || [];
          const rawReels = shotsRes.data?.data || shotsRes.data?.reels || [];

          const dedupedPosts = dedupeItems(rawPosts);
          const dedupedReels = dedupeItems(rawReels);

          setPosts(dedupedPosts);
          setReels(dedupedReels);

          void setCache(!!isAnonymous, {
            profileData: freshData,
            posts: dedupedPosts,
            reels: dedupedReels,
            savedPosts: [],
            savedReels: [],
            mutualCount: 0,
          });
        } catch (err) {
        }
      }, 50);
    } catch (error) {
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      setDeletingId(postId);
      DeleteEngine.purgePostFromAllCaches(String(postId));
      setPosts(prev => {
        const updated = prev.filter(p => String(p.id || p._id) !== String(postId));
        void setCache(!!isAnonymous, { posts: updated });
        return updated;
      });
      setProfileData((prev: any) => {
        const updatedProfile = prev ? { ...prev, posts_count: Math.max(0, (prev.posts_count || 1) - 1) } : prev;
        void setCache(!!isAnonymous, { profileData: updatedProfile });
        return updatedProfile;
      });
      await apiClient.delete(`/posts/${postId}`);
    } catch (err) {
    } finally {
      setDeletingId(null);
    }
  };

  const handlePostOptions = (postId: string) => {
    const postData = posts.find(p => (p._id || p.id) === postId);
    setOptionsPostId(postId);
    setOptionsIsOwn(true);
    setOptionsPostData(postData);
    setOptionsModalVisible(true);
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [isAnonymous]) // Reload when mode changes
  );

  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    const sub = DeviceEventEmitter.addListener('mode_switched', () => {
      // Async background fetch to prevent blocking UI switch
      setTimeout(() => {
        fetchProfile(true);
      }, 300);
    });

    const bookmarkSub = DeviceEventEmitter.addListener('post:bookmarked:local', () => {
      fetchProfile(false);
    });

    // 🚀 LISTEN TO LOCAL POST CREATIONS FOR ZERO-DELAY INSTANT LISTING:
    const postCreatedSub = DeviceEventEmitter.addListener('post:created:local', (newPost: any) => {
      const isPAnon = !!newPost.is_anonymous || !!newPost.isAnonymous || !!newPost.anonymous || !!newPost.is_ghost;
      if (isAnonymous ? isPAnon : !isPAnon) {
        setPosts(prev => {
          if (prev.some(p => (p.id || p._id) === (newPost.id || newPost._id))) return prev;
          return [newPost, ...prev];
        });
      }
    });

    const reelCreatedSub = DeviceEventEmitter.addListener('reel:created:local', (newReel: any) => {
      const isRAnon = !!newReel.is_anonymous || !!newReel.isAnonymous || !!newReel.anonymous || !!newReel.is_ghost;
      if (isAnonymous ? isRAnon : !isRAnon) {
        setReels(prev => {
          if (prev.some(r => (r.id || r._id) === (newReel.id || newReel._id))) return prev;
          return [newReel, ...prev];
        });
      }
    });

    return () => {
      sub.remove();
      bookmarkSub.remove();
      postCreatedSub.remove();
      reelCreatedSub.remove();
    };
  }, [isAnonymous]);

  if (!user && !profileData) return null;

  const data = profileData || user;
  const fallbackSeed = user?.username || user?.id || 'ghost';
  const persona = user?.anonymousPersona || { 
    name: `@ghost_${fallbackSeed.substring(0, 6)}`, 
    username: `ghost_${fallbackSeed.substring(0, 6)}`, 
    avatar: `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(fallbackSeed)}` 
  };

  const themeColors = {
    bg: COLORS.background,
    card: COLORS.surface,
    text: COLORS.text,
    sub: COLORS.subtitle,
    accent: COLORS.primary
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={COLORS.background === '#121212' ? 'light-content' : 'dark-content'} />

      {/* Slim Header - settings icon only */}
      <View style={[styles.header, { backgroundColor: themeColors.bg, borderBottomColor: 'transparent', alignItems: 'flex-end', width: '100%' }]}>
        <TouchableOpacity onPress={() => router.push(isAnonymous ? '/settings/anonymous' : '/settings')} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <MaterialCommunityIcons name="cog-outline" size={28} color={themeColors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchProfile(true);
            }}
            tintColor={COLORS.secondary}
          />
        }
      >
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
            {/* Left glow arrow */}
            <Animated.View style={[styles.swipeArrow, { opacity: glowAnim }]}>
              <Ionicons name="chevron-back" size={22} color={'#9C27B0'} />
            </Animated.View>

            <View style={styles.avatarContainer}>
              {/* Shadow box behind avatar, shifted right */}
              <View style={[styles.avatarShadowBox, isAnonymous && { backgroundColor: '#333' }]} />

              <Animated.View
                style={[
                  styles.avatarWrapper,
                  { transform: [{ translateX: swipeAnim }] },
                  isAnonymous && { borderWidth: 2, borderColor: '#000', shadowColor: '#000', shadowRadius: 10, shadowOpacity: 0.1, backgroundColor: '#FFF' }
                ]}
                {...panResponder.panHandlers}
              >
                <Image
                  source={{ uri: resolveAvatarUrl(isAnonymous ? persona.avatar : (data.avatar_url || data.avatar), isAnonymous ? persona.username : data.username, isAnonymous) }}
                  style={styles.avatar}
                  transition={0}
                  cachePolicy="memory-disk"
                />

              </Animated.View>
            </View>

            {/* Right glow arrow */}
            <Animated.View style={[styles.swipeArrow, { opacity: glowAnim }]}>
              <Ionicons name="chevron-forward" size={22} color={'#9C27B0'} />
            </Animated.View>
          </View>

          <View style={styles.swipeHintBox}>
            <Ionicons name="swap-horizontal" size={14} color={themeColors.sub} />
            <Text style={[styles.swipeText, { color: themeColors.sub }]}>
              {isAnonymous ? 'Swipe to return to reality' : 'Swipe for Ghost Mode'}
            </Text>
          </View>

          <Text style={[styles.name, { color: themeColors.text }]}>
            {isAnonymous ? persona.name : (data.full_name || data.name || data.username)}
          </Text>
          {!isAnonymous && (
            <Text style={[styles.username, { color: themeColors.sub }]}>
              {data.username}
            </Text>
          )}

          {!isAnonymous && data.bio ? (
            <Text style={[styles.bioText, { color: themeColors.text }]}>{data.bio}</Text>
          ) : null}

          {!isAnonymous && (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{(posts.length + reels.length) || 0}</Text>
                <Text style={styles.statLabel}>Creations</Text>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.statBox}
                onPress={() => router.push({ pathname: '/profile/followers', params: { userId: data._id || data.id, type: 'followers' } })}
              >
                <Text style={styles.statValue}>{data.followers_count || 0}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.statBox}
                onPress={() => router.push({ pathname: '/profile/followers', params: { userId: data._id || data.id, type: 'following' } })}
              >
                <Text style={styles.statValue}>{data.following_count || 0}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>
            </View>
          )}

          {isAnonymous ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditGhostModalVisible(true)}>
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/profile/edit')}>
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
              <View style={styles.friendsPill}>
                <Ionicons name="people" size={16} color={COLORS.primary} />
                <Text style={styles.friendsCount}>{mutualCount}</Text>
                <Text style={styles.friendsLabel}>Friends</Text>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.contentSection, { backgroundColor: themeColors.bg }]}>
          <View style={[styles.universeTabs, { borderBottomColor: isAnonymous ? '#222' : COLORS.border }]}>
            <TouchableOpacity
              style={[styles.univTab, activeTab === 'posts' && (isAnonymous ? { borderBottomWidth: 3, borderBottomColor: themeColors.text } : styles.activeUnivTab)]}
              onPress={() => setActiveTab('posts')}
            >
              <Ionicons name="grid" size={20} color={activeTab === 'posts' ? themeColors.text : themeColors.sub} />
              <Text style={[styles.univTabText, { color: activeTab === 'posts' ? themeColors.text : themeColors.sub }]}>
                POSTS
              </Text>
            </TouchableOpacity>

            {!isAnonymous && (
              <TouchableOpacity
                style={[styles.univTab, activeTab === 'shots' && styles.activeUnivTab]}
                onPress={() => setActiveTab('shots')}
              >
                <Ionicons name="play-circle" size={20} color={activeTab === 'shots' ? themeColors.text : themeColors.sub} />
                <Text style={[styles.univTabText, { color: activeTab === 'shots' ? themeColors.text : themeColors.sub }]}>SHOTS</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.univTab, activeTab === 'saved' && (isAnonymous ? { borderBottomWidth: 3, borderBottomColor: '#FFF' } : styles.activeUnivTab)]}
              onPress={() => setActiveTab('saved')}
            >
              <Ionicons name="bookmark" size={20} color={activeTab === 'saved' ? themeColors.text : themeColors.sub} />
              <Text style={[styles.univTabText, { color: activeTab === 'saved' ? themeColors.text : themeColors.sub }]}>SAVED</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'posts' && (
            <View style={styles.grid}>
              {posts.filter(p => p.media_type !== 'video').length > 0 ? (
                posts.filter(p => p.media_type !== 'video').map((post) => (
                  <TouchableOpacity
                    key={post._id || post.id}
                    style={[styles.gridItem, isAnonymous && { backgroundColor: '#111' }]}
                    onPress={() => {
                      const now = Date.now();
                      if (now - lastTapTime.current < 300) return; // Prevent double tap within 300ms
                      if (isNavigating.current) return;
                      lastTapTime.current = now;
                      isNavigating.current = true;
                      setTimeout(() => { isNavigating.current = false; }, 800);

                      router.push({
                        pathname: `/post/${post._id || post.id}` as any,
                        params: { initialData: JSON.stringify(post) }
                      });
                    }}
                    onLongPress={() => handlePostOptions(post._id || post.id)}
                  >
                    <Image
                      source={{ uri: resolveMediaUrl(post.media?.[0]?.url || post.content_url || post.image_url || (post.media_urls && post.media_urls[0])) }}
                      style={styles.gridImage}
                      contentFit="cover"
                      transition={100}
                      cachePolicy="memory-disk"
                    />
                    {isAnonymous && (
                      <View style={styles.ghostBadge}>
                        <MaterialCommunityIcons name="ghost" size={12} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <View style={[styles.emptyBox, { backgroundColor: themeColors.bg }]}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name={isAnonymous ? "moon-outline" : "images-outline"} size={32} color={themeColors.sub} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                    {isAnonymous ? "Void is Empty" : "No Posts Yet"}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: themeColors.sub }]}>
                    {isAnonymous ? "Your shadow echoes will appear here." : "Share your first moment with the world."}
                  </Text>
                </View>
              )}
            </View>
          )}

          {!isAnonymous && activeTab === 'shots' && (
            <View style={styles.grid}>
              {reels.length > 0 ? (
                reels.map((reel) => (
                  <TouchableOpacity
                    key={reel._id || reel.id}
                    style={styles.shotGridItem}
                    onPress={() => {
                      const now = Date.now();
                      if (now - lastTapTime.current < 300) return; // Prevent double tap within 300ms
                      if (isNavigating.current) return;
                      lastTapTime.current = now;
                      isNavigating.current = true;
                      setTimeout(() => { isNavigating.current = false; }, 800);
                      useReelsStore.getState().setActiveReelData(reel);
                      router.push(`/reels/${reel._id || reel.id}`);
                    }}
                  >
                    <Image
                      source={{ uri: resolveMediaUrl(reel.thumbnailUrl || reel.thumbnail_url || reel.thumbnail || reel.video_thumbnail || reel.videoThumbnail || (reel.media_urls && reel.media_urls[0]) || reel.video_url || reel.videoUrl || '') }}
                      style={styles.gridImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                    />
                    <View style={styles.gridDuration}>
                      <Ionicons name="play" size={10} color="#FFF" />
                      <Text style={styles.durationText}>{reel.views_count || reel.viewsCount || 0}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyBox}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="play-outline" size={32} color={COLORS.subtitle} />
                  </View>
                  <Text style={styles.emptyTitle}>No Shots Yet</Text>
                  <Text style={styles.emptySubtitle}>Start creating short videos and get discovered.</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'saved' && (
            <View style={styles.grid}>
              {(() => {
                const allSaved = [
                  ...savedPosts.map((p) => ({ ...p, type: 'post' })),
                  ...savedReels.map((r) => ({ ...r, type: 'reel' }))
                ].sort((a, b) =>
                  new Date(b.created_at || b.createdAt || 0).getTime() -
                  new Date(a.created_at || a.createdAt || 0).getTime()
                );

                if (allSaved.length > 0) {
                  return allSaved.map((item) => (
                    <TouchableOpacity
                      key={item._id || item.id}
                      style={[
                        item.type === 'reel' ? styles.shotGridItem : styles.gridItem,
                        isAnonymous && { backgroundColor: '#111' }
                      ]}
                      onPress={() => {
                        const now = Date.now();
                        if (now - lastTapTime.current < 300) return; // Prevent double tap within 300ms
                        if (isNavigating.current) return;
                        lastTapTime.current = now;
                        isNavigating.current = true;
                        setTimeout(() => { isNavigating.current = false; }, 800);

                        if (item.type === 'reel') {
                          useReelsStore.getState().setActiveReelData(item);
                          router.push(`/reels/${item._id || item.id}`);
                        } else {
                          router.push({
                            pathname: `/post/${item._id || item.id}` as any,
                            params: { initialData: JSON.stringify(item) }
                          });
                        }
                      }}
                    >
                      <Image
                        source={{
                          uri: resolveMediaUrl(
                            item.type === 'reel'
                              ? (item.thumbnailUrl || item.thumbnail_url || item.thumbnail || item.video_thumbnail || (item.media_urls && item.media_urls[0]) || item.video_url || item.videoUrl || '')
                              : (item.media?.[0]?.url || item.content_url || item.image_url || (item.media_urls && item.media_urls[0]))
                          )
                        }}
                        style={styles.gridImage}
                        contentFit="cover"
                        transition={200}
                      />
                      {item.type === 'reel' && (
                        <View style={styles.gridDuration}>
                          <Ionicons name="play" size={10} color="#FFF" />
                          <Text style={styles.durationText}>{item.views_count || item.viewsCount || 0}</Text>
                        </View>
                      )}
                      {isAnonymous && (
                        <View style={styles.ghostBadge}>
                          <MaterialCommunityIcons name="ghost" size={12} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ));
                } else {
                  return (
                    <View style={[styles.emptyBox, { backgroundColor: themeColors.bg }]}>
                      <View style={styles.emptyIconCircle}>
                        <Ionicons name="bookmark-outline" size={32} color={themeColors.sub} />
                      </View>
                      <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                        {isAnonymous ? "No Echoes Saved" : "No Saved Posts"}
                      </Text>
                      <Text style={[styles.emptySubtitle, { color: themeColors.sub }]}>
                        {isAnonymous ? "Your saved ghost whispers will appear here." : "Save posts to easily find them later."}
                      </Text>
                    </View>
                  );
                }
              })()}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ➕ FAB: Always shown. Normal mode → /create (post+shots). Anonymous mode → /post-editor (anonymous post only) */}
      <TouchableOpacity
        style={[
          styles.floatingButton,
          { backgroundColor: COLORS.primary, borderWidth: 0 }
        ]}
        onPress={() => {
          if (isAnonymous) {
            // Anonymous post creation — go directly to post-editor, skip shots tab
            router.push({
              pathname: '/post-editor',
              params: { postType: 'post', isAnonymous: 'true' }
            } as any);
          } else {
            // 🚀 Use jumpTo (no scroll animation) — navigation IS the tab navigator
            navigation.dispatch(TabActions.jumpTo('create'));
          }
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={36} color={'#FFFFFF'} />
      </TouchableOpacity>

      {/* Ghost Profile Edit Modal */}
      <Modal
        visible={editGhostModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditGhostModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Ghost Profile</Text>
              <TouchableOpacity onPress={() => setEditGhostModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Current Avatar Preview */}
            <View style={styles.modalAvatarContainer}>
              {updatingAvatar ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={styles.modalAvatarLoader} />
              ) : (
                <Image
                  source={{ uri: resolveAvatarUrl(persona.avatar, persona.username, true) }}
                  style={styles.modalAvatarPreview}
                  transition={0}
                  cachePolicy="memory-disk"
                />
              )}
            </View>

            {/* Locked Info Fields */}
            <View style={styles.lockedFieldsContainer}>
              <View style={styles.lockedField}>
                <Text style={styles.lockedLabel}>GHOST NAME</Text>
                <View style={styles.lockedInputContainer}>
                  <Text style={styles.lockedInputText}>{persona.name}</Text>
                  <Ionicons name="lock-closed" size={16} color={COLORS.subtitle} />
                </View>
              </View>

              <View style={styles.lockedField}>
                <Text style={styles.lockedLabel}>GHOST USERNAME</Text>
                <View style={styles.lockedInputContainer}>
                  <Text style={styles.lockedInputText}>@{persona.username}</Text>
                  <Ionicons name="lock-closed" size={16} color={COLORS.subtitle} />
                </View>
              </View>
            </View>

            {/* Avatar Select Tray */}
            <Text style={styles.trayLabel}>CHOOSE YOUR AVATAR</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.avatarTrayScroll}
            >
              {PRESET_AVATARS.map((item, index) => {
                const isSelected = persona.avatar === item;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.trayAvatarOption,
                      isSelected && styles.trayAvatarOptionSelected
                    ]}
                    onPress={() => handleUpdateGhostAvatar(item)}
                  >
                    <Image source={{ uri: item }} style={styles.trayAvatarImage} />
                    {isSelected && (
                      <View style={styles.checkmarkBadge}>
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setEditGhostModalVisible(false)}
            >
              <Text style={styles.modalDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PostOptionsModal
        isVisible={optionsModalVisible}
        onClose={() => setOptionsModalVisible(false)}
        postId={optionsPostId}
        isOwner={optionsIsOwn}
        isPinnedInitial={optionsPostData?.is_pinned}
        commentsDisabledInitial={optionsPostData?.comments_disabled}
        hideLikeCountInitial={optionsPostData?.hide_like_count}
        onDeletePost={handleDeletePost}
        onPinToggle={(postId, pinned) => {
          setPosts(prev => prev.map(p =>
            (p._id || p.id) === postId ? { ...p, is_pinned: pinned } : p
          ));
        }}
        onCommentsToggle={(postId, disabled) => {
          setPosts(prev => prev.map(p =>
            (p._id || p.id) === postId ? { ...p, comments_disabled: disabled } : p
          ));
        }}
        onLikesToggle={(postId, hidden) => {
          setPosts(prev => prev.map(p =>
            (p._id || p.id) === postId ? { ...p, hide_like_count: hidden } : p
          ));
        }}
      />

    </SafeAreaView>
  );
}

const getStyles = (COLORS: any, insets: { top: number; bottom: number; left: number; right: number }) => {
  const { width: screenWidth } = Dimensions.get('window');
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const navBarHeight = 56 + safeBottom;
  // Grid item: 3 columns with 2px margin each side capped at max container width
  const effectiveWidth = Math.min(screenWidth, 640);
  const gridItemWidth = Math.floor((effectiveWidth - 16) / 3);

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(6),
    paddingBottom: verticalScale(6),
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text, letterSpacing: 1 },

  profileCard: {
    backgroundColor: COLORS.background, marginHorizontal: moderateScale(10), marginTop: 0, borderRadius: 20,
    padding: moderateScale(10), alignItems: 'center', elevation: 0,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  anonymousCard: { backgroundColor: '#0A0A0A', marginTop: 15 },

  avatarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  avatarContainer: {
    position: 'relative',
    width: moderateScale(85),
    height: moderateScale(85),
    marginTop: moderateScale(2),
  },
  avatarShadowBox: {
    position: 'absolute',
    width: moderateScale(85),
    height: moderateScale(85),
    borderRadius: moderateScale(85) / 2,
    backgroundColor: COLORS.surface,
    top: 0,
    left: 0,
  },
  swipeArrow: {
    padding: 9,
    marginBottom: 0,
  },
  divider: {
    width: 0.5, height: 24, backgroundColor: COLORS.border, marginHorizontal: 4,
  },
  avatarWrapper: {
    position: 'absolute',
    width: moderateScale(85), height: moderateScale(85), borderRadius: moderateScale(85) / 2,
    borderWidth: 0, borderColor: 'transparent', overflow: 'hidden', backgroundColor: COLORS.surface,
    top: 0,
    left: 0,
  },
  avatar: {
    width: '100%', height: '100%',
  },
  modeIndicator: {
    position: 'absolute', bottom: -2, right: -2, width: 26, height: 26,
    borderRadius: 13, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF'
  },

  swipeHintBox: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  swipeText: { fontSize: 10, color: COLORS.subtitle, fontWeight: '700', textTransform: 'uppercase' },

  name: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginTop: 8 },
  username: { fontSize: 13, color: COLORS.subtitle, fontWeight: '600', marginTop: 1 },
  bioText: { fontSize: 13, color: COLORS.subtitle, textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },

  statsRow: {
    flexDirection: 'row', width: '100%', maxWidth: 480, marginTop: 10, paddingVertical: 5, alignSelf: 'center',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, letterSpacing: 0.5 },
  statLabel: { fontSize: 11, color: COLORS.subtitle, marginTop: 2, fontFamily: 'Outfit_400Regular' },

  ghostStatsBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 8,
  },
  ghostStat: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  ghostStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
    fontFamily: 'Outfit_800ExtraBold',
  },
  ghostStatLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    fontFamily: 'Outfit_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  editBtn: {
    flex: 1, backgroundColor: COLORS.primary,
    paddingVertical: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  editBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 13 },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 10,
    gap: 10,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  friendsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12,
  },
  friendsCount: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  friendsLabel: { fontSize: 11, color: COLORS.subtitle, fontWeight: '600' },

  contentSection: {
    flex: 1,
    backgroundColor: COLORS.background,
    marginTop: 10,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  universeTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: 10 },
  univTab: { flex: 1, paddingVertical: 10, alignItems: 'center' }, // Reduced from 15
  activeUnivTab: { borderBottomWidth: 3, borderBottomColor: COLORS.secondary },
  univTabText: { fontSize: 11, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 2, paddingBottom: navBarHeight + 16 },
  gridItem: { width: gridItemWidth, height: gridItemWidth * 1.35, margin: 2, backgroundColor: COLORS.surface, position: 'relative' },
  shotGridItem: { width: gridItemWidth, height: gridItemWidth * (16 / 9), margin: 2, backgroundColor: COLORS.surface, position: 'relative' },
  gridImage: { width: '100%', height: '100%', backgroundColor: COLORS.surface },
  gridMenuBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
    display: 'none'
  },
  gridDuration: { position: 'absolute', bottom: 5, right: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', marginLeft: 2 },

  ghostBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderRadius: 8,
  },

  ghostVoid: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.8 },
  ghostHint: { color: COLORS.text, fontSize: 12, fontWeight: '900', marginTop: 20, letterSpacing: 2, textAlign: 'center' },
  ghostSub: { color: COLORS.subtitle, fontSize: 10, marginTop: 8, textAlign: 'center' },

  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    backgroundColor: COLORS.background
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4
  },
  emptySubtitle: {
    color: COLORS.subtitle,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40
  },

  floatingButton: {
    position: 'absolute', bottom: 100, right: 20, width: 60, height: 60,
    borderRadius: 30, justifyContent: 'center', alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Math.max(insets.bottom, 24),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalAvatarContainer: {
    alignSelf: 'center',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.primary,
    overflow: 'hidden',
  },
  modalAvatarPreview: {
    width: '100%',
    height: '100%',
  },
  modalAvatarLoader: {
    alignSelf: 'center',
  },
  lockedFieldsContainer: {
    gap: 16,
    marginBottom: 24,
  },
  lockedField: {
    gap: 6,
  },
  lockedLabel: {
    color: COLORS.subtitle,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  lockedInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockedInputText: {
    color: COLORS.text,
    opacity: 0.7,
    fontSize: 15,
    fontWeight: '600',
  },
  trayLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  avatarTrayScroll: {
    paddingVertical: 6,
    gap: 12,
  },
  trayAvatarOption: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  trayAvatarOptionSelected: {
    borderColor: COLORS.primary,
  },
  trayAvatarImage: {
    width: '100%',
    height: '100%',
  },
  checkmarkBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.background,
    borderRadius: 10,
  },
  modalDoneBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  modalDoneBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  }
});
};
