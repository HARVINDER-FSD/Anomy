import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView,
  SafeAreaView, Platform, ActivityIndicator, RefreshControl,
  PanResponder, Animated, StatusBar, Alert
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SIZES = {
  width: Dimensions.get('window').width,
  height: Dimensions.get('window').height
};

export default function ProfileScreen() {
  const { user, setAuth, logout, toggleAnonymousMode } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'posts' | 'shots' | 'saved'>('posts');
  const router = useRouter();
  const isAnonymous = user?.isAnonymousMode;

  const swipeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [reels, setReels] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleToggleAnonymous = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await toggleAnonymousMode();
  };

  const fetchProfile = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        if (!refreshing) setLoading(true);
      }
      const res = await apiClient.get('/users/me');
      const freshData = res.data;
      setProfileData(freshData);

      const latestUser = useAuthStore.getState().user;
      if (latestUser) {
        setAuth({
          ...latestUser,
          ...freshData,
          id: freshData.id || freshData._id || latestUser.id
        }, useAuthStore.getState().token || '');
      }

      const postsRes = await apiClient.get(`/users/${freshData._id || freshData.id}/posts`);
      setPosts(postsRes.data.posts || postsRes.data.data || []);

      const reelsRes = await apiClient.get(`/reels?username=${freshData.username}`);
      setReels(reelsRes.data.reels || reelsRes.data.data || []);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(postId);
              await apiClient.delete(`/posts/${postId}`);
              setPosts(prev => prev.filter(p => (p.id || p._id) !== postId));
              // Update local post count
              setProfileData((prev: any) => prev ? { ...prev, posts_count: Math.max(0, (prev.posts_count || 1) - 1) } : prev);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete post. Please try again.');
            } finally {
              setDeletingId(null);
            }
          }
        }
      ]
    );
  };

  const handlePostOptions = (postId: string) => {
    Alert.alert(
      'Post Options',
      '',
      [
        {
          text: '🗑️  Delete Post',
          style: 'destructive',
          onPress: () => handleDeletePost(postId)
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  if (!user && !profileData) return null;

  const data = profileData || user;
  const persona = user?.anonymousPersona || { name: 'Spirit', username: 'ghost', avatar: '' };

  return (
    <SafeAreaView style={[styles.container, isAnonymous ? { backgroundColor: COLORS.black } : { backgroundColor: '#FFF' }]}>
      <StatusBar barStyle={isAnonymous ? "light-content" : "dark-content"} />

      {/* Universe Header */}
      <View style={[styles.header, isAnonymous ? { backgroundColor: COLORS.black, borderBottomColor: '#1A1A1A' } : { backgroundColor: '#FFF', borderBottomColor: '#EEE' }]}>
        <Text style={[styles.headerTitle, isAnonymous && { color: '#FFF' }]}>
          My Profile
        </Text>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <MaterialCommunityIcons name="cog-outline" size={26} color={isAnonymous ? '#FFF' : COLORS.text} />
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
            tintColor={isAnonymous ? '#FFF' : COLORS.secondary} 
          />
        }
      >
        <View style={[styles.profileCard, isAnonymous && styles.anonymousCard]}>
          <Animated.View
            style={[
              styles.avatarWrapper,
              { transform: [{ translateX: swipeAnim }] },
              isAnonymous && { borderColor: '#FFF', shadowColor: '#FFF', shadowRadius: 20, shadowOpacity: 0.15, backgroundColor: '#000' }
            ]}
            {...panResponder.panHandlers}
          >
            <Image
              source={{ uri: resolveAvatarUrl(isAnonymous ? persona.avatar : (data.avatar_url || data.avatar), isAnonymous ? persona.username : data.username) }}
              style={styles.avatar}
            />
            {isAnonymous && (
              <View style={[styles.modeIndicator, { backgroundColor: '#FFF', borderColor: '#000' }]}>
                <MaterialCommunityIcons name="ghost" size={14} color="#000" />
              </View>
            )}
          </Animated.View>

          <View style={styles.swipeHintBox}>
            <Ionicons name="swap-horizontal" size={14} color={isAnonymous ? '#FFF' : COLORS.subtitle} />
            <Text style={[styles.swipeText, isAnonymous && { color: '#FFF' }]}>
              {isAnonymous ? 'Swipe to return to reality' : 'Swipe for Ghost Mode'}
            </Text>
          </View>

          <Text style={[styles.name, isAnonymous && { color: '#FFF', fontWeight: '900', fontSize: 24 }]}>
            {isAnonymous ? persona.name : (data.full_name || data.name || data.username)}
          </Text>
          <Text style={[styles.username, isAnonymous && { color: '#FFF', fontWeight: 'bold' }]}>
            {isAnonymous ? `@${persona.username}` : data.username}
          </Text>


          {isAnonymous && (
            <TouchableOpacity 
              style={[styles.editBtn, { backgroundColor: '#111', borderColor: '#FFF', borderWidth: 1, marginTop: 15 }]} 
              onPress={async () => {
                try {
                  const res = await apiClient.post('/users/anonymous/reset');
                  if (res.data.success) {
                    await fetchProfile(true);
                    Alert.alert('Ghost Renewed', 'Your identity has been reset with a new unique persona.');
                  }
                } catch (error) {
                  Alert.alert('Error', 'Failed to refresh identity.');
                }
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="refresh" size={18} color="#FFF" />
                <Text style={[styles.editBtnText, { color: '#FFF' }]}>Renew Ghost Identity</Text>
              </View>
            </TouchableOpacity>
          )}

          {!isAnonymous && (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{data.posts_count || 0}</Text>
                <Text style={styles.statLabel}>Posts</Text>
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

          {!isAnonymous && (
            <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/profile/edit')}>
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Content Tabs */}
        <View style={[styles.contentSection, isAnonymous && { backgroundColor: COLORS.black }]}>
          {!isAnonymous ? (
            <>
              <View style={styles.universeTabs}>
                <TouchableOpacity 
                  style={[styles.univTab, activeTab === 'posts' && styles.activeUnivTab]}
                  onPress={() => setActiveTab('posts')}
                >
                  <Text style={[styles.univTabText, activeTab !== 'posts' && { color: COLORS.subtitle }]}>Posts</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.univTab, activeTab === 'shots' && styles.activeUnivTab]}
                  onPress={() => setActiveTab('shots')}
                >
                  <Text style={[styles.univTabText, activeTab !== 'shots' && { color: COLORS.subtitle }]}>Shots</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.univTab, activeTab === 'saved' && styles.activeUnivTab]}
                  onPress={() => setActiveTab('saved')}
                >
                  <Text style={[styles.univTabText, activeTab !== 'saved' && { color: COLORS.subtitle }]}>Saved</Text>
                </TouchableOpacity>
              </View>

              {loading ? (
                <ActivityIndicator size="large" color={COLORS.secondary} style={{ marginTop: 40 }} />
              ) : activeTab === 'posts' ? (
                posts.length > 0 ? (
                  <View style={styles.grid}>
                    {posts.map(post => {
                      const postId = post.id || post._id;
                      const mediaUrl = post.media_urls?.[0] || post.media?.[0]?.url;
                      const isDeleting = deletingId === postId;
                      return (
                      <View key={postId} style={styles.gridItem}>
                        <TouchableOpacity 
                          style={{ flex: 1 }} 
                          onPress={() => {
                            const postData = {
                               ...post,
                               id: postId,
                               user: {
                                 id: (profileData as any)?.id || (profileData as any)?._id,
                                 username: (profileData as any)?.username,
                                 avatar_url: (profileData as any)?.avatar_url || (profileData as any)?.avatar,
                                 full_name: (profileData as any)?.full_name || (profileData as any)?.name
                               },
                               isLiked: post.is_liked || false,
                               likes_count: post.likes_count || 0
                             };
                            
                            router.push({
                              pathname: `/post/${postId}`,
                              params: { 
                                initialData: JSON.stringify(postData)
                              }
                            } as any);
                          }} 
                          activeOpacity={0.85}
                        >
                          {mediaUrl ? (
                            post.media_type === 'video' ? (
                               <Video
                                 source={{ uri: resolveMediaUrl(mediaUrl) }}
                                 style={styles.gridImage}
                                 resizeMode={ResizeMode.COVER}
                                 shouldPlay={false}
                                 isMuted={true}
                               />
                            ) : (
                               <Image source={{ uri: resolveMediaUrl(mediaUrl) }} style={styles.gridImage} />
                            )
                          ) : (
                            <View style={[styles.gridImage, { padding: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0F0' }]}>
                              <Text style={{ fontSize: 11, color: '#333', textAlign: 'center' }} numberOfLines={4}>
                                {post.content || post.caption || ''}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        {/* 3-dot menu button */}
                        <TouchableOpacity
                          style={styles.gridMenuBtn}
                          onPress={() => handlePostOptions(postId)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {isDeleting ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Ionicons name="ellipsis-vertical" size={16} color="#FFF" />
                          )}
                        </TouchableOpacity>
                      </View>
                    )})}
                  </View>
                ) : (
                  <View style={styles.emptyBox}>
                    <View style={styles.emptyIconCircle}>
                      <MaterialCommunityIcons name="image-off-outline" size={32} color="#CCC" />
                    </View>
                    <Text style={styles.emptyTitle}>No Posts Yet</Text>
                    <Text style={styles.emptySubtitle}>Share your first moment with the world.</Text>
                  </View>
                )
              ) : activeTab === 'shots' ? (
                reels.length > 0 ? (
                  <View style={styles.grid}>
                    {reels.map(reel => (
                      <TouchableOpacity key={reel.id || reel._id} style={styles.gridItem} onPress={() => router.push(`/(tabs)/shots?id=${reel.id || reel._id}`)}>
                        {reel.media_type === 'video' || reel.video_url ? (
                            <Video
                               source={{ uri: resolveMediaUrl(reel.thumbnail_url || reel.video_url) }}
                               style={styles.gridImage}
                               resizeMode={ResizeMode.COVER}
                               shouldPlay={false}
                               isMuted={true}
                            />
                        ) : (
                            <Image source={{ uri: resolveMediaUrl(reel.thumbnail_url || reel.video_url) }} style={styles.gridImage} />
                        )}
                        <View style={styles.gridDuration}>
                           <Ionicons name="play" size={10} color="#FFF" />
                           <Text style={styles.durationText}>{Math.floor((reel.duration || 0) / 1000)}s</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyBox}>
                    <View style={styles.emptyIconCircle}>
                      <MaterialCommunityIcons name="video-off-outline" size={32} color="#CCC" />
                    </View>
                    <Text style={styles.emptyTitle}>No Shots Yet</Text>
                    <Text style={styles.emptySubtitle}>Start creating amazing shots to inspire others.</Text>
                  </View>
                )
              ) : (
                <View style={styles.emptyBox}>
                  <View style={styles.emptyIconCircle}>
                    <MaterialCommunityIcons name="bookmark-outline" size={32} color="#CCC" />
                  </View>
                  <Text style={styles.emptyTitle}>No Saved Items</Text>
                  <Text style={styles.emptySubtitle}>Save posts you want to see again.</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.ghostVoid}>
               <MaterialCommunityIcons name="ghost-outline" size={80} color="#333" />
               <Text style={styles.ghostHint}>You are anonymous here</Text>
               <Text style={styles.ghostSub}>Your posts and stats are hidden in Ghost Mode.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.floatingButton,
          isAnonymous 
            ? { backgroundColor: '#111', shadowColor: '#FFF', borderWidth: 1, borderColor: '#FFF' } 
            : { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, elevation: 12, borderWidth: 0 }
        ]}
        onPress={() => router.push('/create')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={36} color={isAnonymous ? '#FFF' : '#FFFFFF'} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingVertical: verticalScale(15),
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    borderBottomWidth: 1, borderBottomColor: '#EEE'
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text, letterSpacing: 1 },

  profileCard: {
    backgroundColor: '#FFF', margin: moderateScale(10), borderRadius: 20,
    padding: moderateScale(15), alignItems: 'center', elevation: 0,
    borderWidth: 1, borderColor: '#EEE'
  },
  anonymousCard: { backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#1A1A1A', marginTop: 30 },



  avatarWrapper: {
    width: moderateScale(80), height: moderateScale(80), borderRadius: 40,
    borderWidth: 2, borderColor: COLORS.primary, padding: 2, backgroundColor: 'transparent'
  },
  avatar: { width: '100%', height: '100%', borderRadius: 38 },
  modeIndicator: {
    position: 'absolute', bottom: -2, right: -2, width: 26, height: 26,
    borderRadius: 13, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF'
  },

  swipeHintBox: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  swipeText: { fontSize: 10, color: COLORS.subtitle, fontWeight: '700', textTransform: 'uppercase' },

  name: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 15 },
  username: { fontSize: 14, color: COLORS.secondary, fontWeight: '600', marginTop: 2 },
  bioText: { fontSize: 13, color: COLORS.subtitle, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },

  statsRow: {
    flexDirection: 'row', width: '100%', marginTop: 15, paddingVertical: 10,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: 'bold', color: COLORS.text, letterSpacing: 1 },
  statLabel: { fontSize: 11, color: COLORS.subtitle, marginTop: 4 },
  divider: { width: 1, backgroundColor: COLORS.border, height: '60%', alignSelf: 'center' },

  editBtn: {
    marginTop: 20, backgroundColor: COLORS.primary, width: '100%',
    paddingVertical: 12, borderRadius: 15, alignItems: 'center'
  },
  editBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 14 },

  contentSection: { flex: 1, backgroundColor: COLORS.white },
  universeTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  univTab: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  activeUnivTab: { borderBottomWidth: 3, borderBottomColor: COLORS.secondary },
  univTabText: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 2 },
  gridItem: { width: SIZES.width / 3 - 4, height: SIZES.width / 3 - 4, margin: 2, backgroundColor: '#F5F5F5', position: 'relative' },
  gridImage: { width: '100%', height: '100%', backgroundColor: COLORS.surface },
  gridMenuBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center'
  },
  gridDuration: { position: 'absolute', bottom: 5, right: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', marginLeft: 2 },

  ghostVoid: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 },
  ghostHint: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 20, letterSpacing: 2, textAlign: 'center' },
  ghostSub: { color: '#222', fontSize: 10, marginTop: 8, textAlign: 'center' },

  emptyBox: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 80, 
    backgroundColor: '#FFF' 
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { 
    color: '#333', 
    fontSize: 16, 
    fontWeight: '700',
    marginBottom: 4
  },
  emptySubtitle: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40
  },

  floatingButton: {
    position: 'absolute', bottom: 100, right: 20, width: 60, height: 60,
    borderRadius: 30, justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 5
  }
});
