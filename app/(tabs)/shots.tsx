import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  SafeAreaView, ActivityIndicator, Dimensions, Platform,
  StatusBar, TextInput, ScrollView, Alert, Modal, Share, Pressable,
  KeyboardAvoidingView, Keyboard, Animated, Linking, DeviceEventEmitter
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { Video, ResizeMode } from 'expo-av';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { socketService } from '@/src/lib/socket';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { STICKERS_BY_CATEGORY } from '@/src/constants/animated-stickers';
import LottieView from 'lottie-react-native';
import { getBaseUrl } from '@/src/api/config';
import { ShareModal } from '@/components/ShareModal';

const { width, height } = Dimensions.get('window');

// --- Emoji Data ---
const EMOJI_CATEGORIES = [
  { id: 'recent', label: 'Recent', emojis: ['👍', '❤️', '😂', '🔥', '💀', '🤩', '✨', '😎', '🤓', '😇', '🤑', '😢'] },
  { id: 'smileys', label: 'Smileys and people', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '🫠', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😜', '🤑', '🤗', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤔', '🫣', '🤨', '😐', '😑', '😶', '🫥', '😶‍🌫️', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '😵‍💫', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊'] }
];

const EMOJI_TABS = [
  { id: 'recent', icon: 'clock-outline' },
  { id: 'smiley', icon: 'emoticon-outline' },
];

// --- Reel Component (Normal Mode) ---
const ReelItem = ({ item, isVisible, router, user }: { item: any, isVisible: boolean, router: any, user: any }) => {
  const videoRef = useRef<Video>(null);
  const editInputRef = useRef<TextInput>(null);
  const heartScale = useRef(new Animated.Value(0)).current;

  const [isLiked, setIsLiked] = useState(item.isLiked || false);
  const [activeEmoji, setActiveEmoji] = useState('❤️');
  const author = item.user || item.author;
  const [isFollowing, setIsFollowing] = useState(item.is_following || item.isFollowing || author?.is_following || author?.isFollowing || false);
  const [showComments, setShowComments] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const { setCustomReactions } = useAuthStore();
  const [showHeart, setShowHeart] = useState(false);
  const [reactions, setReactions] = useState(user?.customReactions && user.customReactions.length > 0 ? user.customReactions : ['❤️', '😂', '😮', '😢', '😡']);
  const [editingReactionIndex, setEditingReactionIndex] = useState<number | null>(null);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [likesCount, setLikesCount] = useState(parseInt(item.likesCount || item.likes_count || '0'));
  const [commentsCount, setCommentsCount] = useState(parseInt(item.commentsCount || item.comments_count || '0'));
  const [newComment, setNewComment] = useState('');
  const [shareModalVisible, setShareModalVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (isEditingMode) {
      setTimeout(() => editInputRef.current?.focus(), 150);
    }
  }, [isEditingMode, editingReactionIndex]);

  useEffect(() => {
    if (isVisible) {
      videoRef.current?.playAsync();
      socketService.socket?.emit('shot:view', { shotId: item._id });
    } else {
      videoRef.current?.pauseAsync();
    }
  }, [isVisible]);

  useEffect(() => {
    if (!socketService.socket) return;
    const handleUpdate = (payload: any) => {
      if (payload.shotId === item._id) {
        if (payload.likesCount !== undefined) setLikesCount(payload.likesCount);
        if (payload.commentsCount !== undefined) setCommentsCount(payload.commentsCount);
      }
    };
    socketService.socket.on('shot:updated', handleUpdate);

    // ⚡ Listen for LOCAL updates from other screens
    const localSub = DeviceEventEmitter.addListener('post:liked:local', (data: { postId: string, isLiked: boolean, likesCount?: number }) => {
      if (data.postId === item._id) {
        setIsLiked(data.isLiked);
        if (data.likesCount !== undefined) setLikesCount(data.likesCount);
      }
    });

    return () => { 
      socketService.socket?.off('shot:updated', handleUpdate); 
      localSub.remove();
    };
  }, [item._id]);

  const updateReaction = (emoji: string) => {
    if (!emoji || editingReactionIndex === null) return;
    const newReactions = [...reactions];
    // Modern way to get actual emoji character (handles multi-char emojis)
    const symbol = Array.from(emoji)[0];
    newReactions[editingReactionIndex] = symbol;

    setReactions(newReactions);
    setCustomReactions(newReactions);

    const nextIndex = (editingReactionIndex + 1) % 5;
    setEditingReactionIndex(nextIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const startEditing = () => {
    setIsEditingMode(true);
    setEditingReactionIndex(0);
  };

  const selectReactionSlot = (idx: number) => {
    setEditingReactionIndex(idx);
    editInputRef.current?.focus();
  };

  const resetReactions = () => {
    const defaultReactions = ['❤️', '😂', '😮', '😢', '😡'];
    setReactions(defaultReactions);
    setCustomReactions(defaultReactions);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const finishEditing = () => {
    setIsEditingMode(false);
    setEditingReactionIndex(null);
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleLike = () => {
    const newState = !isLiked;
    setIsLiked(newState);
    
    // ⚡ Emit local event for other screens
    DeviceEventEmitter.emit('post:liked:local', { 
      postId: item._id, 
      isLiked: newState,
      likesCount: newState ? likesCount + 1 : likesCount - 1
    });

    if (newState) {
      sendReaction(activeEmoji);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      setLikesCount(prev => Math.max(0, prev - 1));
      socketService.socket?.emit('shot:unreact', { shotId: item._id });
    }
  };
  const handleFollow = async () => {
    const authorId = (item.user || item.author)?._id || (item.user || item.author)?.id;
    if (!authorId || authorId === 'anonymous') return;

    try {
      const newState = !isFollowing;
      setIsFollowing(newState);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Call API
      await apiClient.post(`/users/${authorId}/follow`);
    } catch (error) {
      console.error('Follow error:', error);
      setIsFollowing(!isFollowing); // Rollback on error
    }
  };

  const handleSendComment = () => {
    if (!newComment.trim()) return;
    socketService.socket?.emit('shot:comment', { shotId: item._id, text: newComment });
    setNewComment('');
    setCommentsCount(prev => prev + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const sendReaction = (emoji: string) => {
    setActiveEmoji(emoji);
    const wasLiked = isLiked;
    setIsLiked(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    socketService.socket?.emit('shot:react', { shotId: item._id, emoji });
    
    // Only increment local count if it's a new like/reaction
    if (!wasLiked) {
      setLikesCount(prev => prev + 1);
    }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (lastTap && (now - lastTap) < 300) {
      setIsLiked(true);
      sendReaction(activeEmoji);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      setLastTap(now);
    }
  };

  return (
    <View style={styles.reelContainer}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleDoubleTap}>
        <Video
          ref={videoRef}
          style={StyleSheet.absoluteFill}
          source={{ uri: item.videoUrl || item.video_url || item.content_url || 'https://assets.mixkit.co/videos/preview/mixkit-spinning-around-the-earth-in-space-4034-large.mp4' }}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={isVisible}
          usePoster={true}
          posterSource={{ uri: item.thumbnail_url || item.thumbnail }}
          posterStyle={{ resizeMode: 'cover' }}
          onLoadStart={() => setIsBuffering(true)}
          onLoad={() => setIsBuffering(false)}
          onReadyForDisplay={() => setIsBuffering(false)}
        />
        {isBuffering && (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        )}
        {showHeart && (
          <Animated.View style={[styles.centeredHeart, { transform: [{ scale: heartScale }] }]}>
            <Ionicons name="heart" size={120} color="#FF3B30" />
          </Animated.View>
        )}
      </Pressable>

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomGradient} />

      {/* Header Profile Pill */}
      <View style={styles.reelHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerProfilePill} activeOpacity={0.8}>
          <Image source={{ uri: resolveAvatarUrl((item.user || item.author)?.avatar || (item.user || item.author)?.avatar_url, (item.user || item.author)?.username) }} style={styles.pillAvatar} />
          <View style={styles.pillInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.pillUsername}>@{(item.user || item.author)?.username || 'anufy_user'}</Text>
              {item.is_ad && (
                <View style={styles.sponsoredBadge}>
                  <Text style={styles.sponsoredText}>Sponsored</Text>
                </View>
              )}
            </View>
            <View style={styles.headerMusicRow}>
              <Ionicons name="musical-notes" size={10} color={COLORS.primary} />
              <Text style={styles.headerMusicText} numberOfLines={1}>{item.title || "Original Sound"}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleFollow} style={styles.pillFollow}>
            <Text style={[styles.pillFollowText, isFollowing && { color: COLORS.primary }]}>
              {isFollowing ? 'Joined' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

      {/* Modern Interaction Sidebar */}
      <View style={styles.interactionSidebar}>
        <View style={styles.sidebarItem}>
          <TouchableOpacity
            onPress={() => item.isAuthor ? Alert.alert('Stats', 'Seen by 12.4K people') : toggleLike()}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name={isLiked ? "heart" : "heart-outline"} size={36} color={isLiked ? "#FF3B30" : "#FFF"} />
          </TouchableOpacity>
          <Text style={styles.sidebarText}>{likesCount > 1000 ? (likesCount / 1000).toFixed(1) + 'K' : likesCount}</Text>
        </View>

        <View style={styles.sidebarItem}>
          <TouchableOpacity onPress={() => setShowComments(true)}>
            <Ionicons name="chatbubble-ellipses" size={32} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.sidebarText}>{commentsCount > 1000 ? (commentsCount / 1000).toFixed(1) + 'K' : commentsCount}</Text>
        </View>

        <View style={styles.sidebarItem}>
          <TouchableOpacity onPress={() => setShareModalVisible(true)}>
            <Ionicons name="paper-plane" size={32} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.sidebarText}>Share</Text>
        </View>

        <TouchableOpacity style={styles.sidebarMore}>
          <MaterialCommunityIcons name="dots-vertical" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Advanced Bottom Dashboard */}
      {!isEditingMode && (
        <View style={styles.bottomInfoFlow}>
          <View style={styles.reactionCapsuleContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 6 }}>
              {reactions.map((emoji: string, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.8}
                  style={styles.reactionPuck}
                  onPress={() => sendReaction(emoji)}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.plusPuckAction}
                onPress={startEditing}
              >
                <Ionicons name="add" size={18} color="#FFF" />
              </TouchableOpacity>
            </ScrollView>
          </View>
          
          {item.is_ad && (
            <TouchableOpacity 
              style={styles.adCtaBtn} 
              onPress={() => item.cta_url && Linking.openURL(item.cta_url)}
            >
              <Text style={styles.adCtaText}>{item.cta_text || 'LEARN MORE'}</Text>
              <Ionicons name="open-outline" size={14} color="#000" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          )}

          <View style={styles.metaData}>
            <Text style={styles.userCaption} numberOfLines={2}>
              {item.description || item.caption || "Discovering new horizons with AnuFy. #VibeCheck #NextGen"}
            </Text>
          </View>
        </View>
      )}

      {/* Instagram-style Customise Reactions UI Overlay (Half-Screen Bottom Sheet) */}
      {isEditingMode && (
        <>
          <Pressable style={styles.sheetBackdrop} onPress={finishEditing} />
          <View style={styles.customiseSheet}>
            <View style={styles.sheetHeaderHandle} />
            <View style={styles.customiseHeader}>
              <TouchableOpacity onPress={() => setIsEditingMode(false)}>
                <Ionicons name="arrow-back" size={28} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.customiseTitle}>Customise reactions</Text>
              <View style={styles.customiseActions}>
                <TouchableOpacity onPress={resetReactions} style={{ marginRight: 20 }}>
                  <Ionicons name="refresh-outline" size={26} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={finishEditing}>
                  <Ionicons name="checkmark" size={30} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.customiseContent}>
              <View style={styles.largeReactionCapsule}>
                {reactions.map((emoji: string, idx: number) => (
                  <View key={idx} style={{ alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => selectReactionSlot(idx)}
                      style={[
                        styles.largeReactionPuck,
                        editingReactionIndex === idx && styles.largePuckActive
                      ]}
                    >
                      <Text style={{ fontSize: idx === 0 ? 36 : 28 }}>{emoji}</Text>
                    </TouchableOpacity>
                    {editingReactionIndex === idx && (
                      <View style={styles.activeDot} />
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Custom Emoji Picker Drawer */}
            <View style={styles.emojiPickerDrawer}>
              <View style={styles.searchBarContainer}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#666" />
                  <TextInput placeholder="Search" placeholderTextColor="#666" style={styles.searchText} />
                </View>
              </View>

                      <ScrollView style={styles.emojiList} showsVerticalScrollIndicator={false}>
                {Object.keys(STICKERS_BY_CATEGORY).map((category: string) => (
                  <View key={category} style={styles.emojiSection}>
                    <Text style={styles.sectionHeader}>{category}</Text>
                    <View style={styles.emojiGrid}>
                      {STICKERS_BY_CATEGORY[category].slice(0, 60).map((sticker: any, index: number) => (
                         <TouchableOpacity 
                           key={index} 
                           style={[styles.emojiItem, { zIndex: 10, position: 'relative' }]} 
                           onPress={() => updateReaction(sticker.emoji)}
                         >
                           <Text style={{ fontSize: 12, color: '#FFF', position: 'absolute', opacity: 0.5 }}>{sticker.emoji}</Text>
                             <LottieView
                               source={{ uri: `${getBaseUrl(false)}${sticker.url}` }}
                               autoPlay
                               loop
                               style={{ width: 24, height: 24 }}
                               resizeMode="contain"
                               hardwareAccelerationAndroid={false}
                             />
                         </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </>
      )}

      {/* Premium Dark Comment Sheet */}
      <Modal visible={showComments} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowComments(false)} />
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Discussion</Text>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <Ionicons name="close" size={24} color="#555" />
              </TouchableOpacity>
            </View>
            <View style={styles.emptyComments}>
              <MaterialCommunityIcons name="comment-multiple-outline" size={48} color="#222" />
              <Text style={styles.emptyText}>Be the first to start the vibe!</Text>
            </View>
            <View style={styles.commentInputRow}>
              <Image source={{ uri: resolveAvatarUrl(user?.avatar, user?.username) }} style={styles.commentAvatar} />
              <View style={styles.commentBar}>
                <TextInput
                  placeholder="Add a thought..."
                  placeholderTextColor="#666"
                  style={styles.inputField}
                  value={newComment}
                  onChangeText={setNewComment}
                  onSubmitEditing={handleSendComment}
                />
                <TouchableOpacity style={styles.sendIcon} onPress={handleSendComment}>
                  <Ionicons name="arrow-up" size={20} color="#000" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      
      <ShareModal
        isVisible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        postId={item._id}
        postContent={item.caption || item.description}
        mediaUrl={item.videoUrl || item.video_url || item.content_url}
        mediaType="video"
        isShot={true}
      />
    </View>
  );
};

// --- Ghost Interest Grid (Same Logic) ---
const INTERESTS = [
  { id: 'general', label: 'Vibe', icon: 'earth', desc: 'The collective soul' },
  { id: 'confessions', label: 'Shadows', icon: 'incognito', desc: 'Whispers in dark' },
  { id: 'music', label: 'Rhythm', icon: 'headphones', desc: 'No faces, just sound' },
  { id: 'nighttalks', label: '3 AM', icon: 'moon-waning-crescent', desc: 'Deep cosmic talks' },
  { id: 'lostsouls', label: 'Spirits', icon: 'ghost', desc: 'Find your kin' },
  { id: 'philosophy', label: 'Essence', icon: 'thought-bubble-outline', desc: 'The why behind all' },
];

export default function ShotsScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user } = useAuthStore();
  const isAnonymous = user?.isAnonymousMode;

  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [viewableItems, setViewableItems] = useState<any[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [matchState, setMatchState] = useState<'idle' | 'waiting' | 'matched'>('idle');
  const [onlineCounts, setOnlineCounts] = useState<Record<string, number>>({});

  const fetchReels = async (pageNum = 1, isRefresh = false) => {
    if (loadingMore || (!hasMore && !isRefresh)) return;

    try {
      if (isRefresh) {
        setLoading(true);
        setPage(1);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      const res = await apiClient.get(`/reels?page=${pageNum}&limit=10`);
      const data = res.data.reels || res.data.data || res.data || [];
      const newReels = data.length ? data : [];
      
      if (isRefresh) {
        setReels(newReels);
        if (newReels.length > 0) {
          setViewableItems([newReels[0]._id || newReels[0].id]);
        }
      } else {
        setReels(prev => [...prev, ...newReels]);
      }

      setHasMore(newReels.length === 10);
      setPage(pageNum);
    } catch { 
      if (isRefresh) {
        setReels([]);
        setViewableItems([]);
      }
    } finally { 
      setLoading(false); 
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      console.log('[Shots] Fetching reels feed...');
      fetchReels(1, true);
    }
  }, [isFocused]);

  useEffect(() => {
    if (reels.length > 0 && viewableItems.length === 0) {
      setViewableItems([reels[0]._id || reels[0].id]);
    }
  }, [reels]);

  const onViewableItemsChanged = useRef(({ viewableItems: v }: any) => {
    setViewableItems(v.map((i: any) => i.key));
  }).current;

  // Render Logic...
  if (isAnonymous) {
    return (
      <SafeAreaView style={styles.ghostContainer}>
        <StatusBar barStyle="light-content" />
        {matchState !== 'idle' ? (
          <View style={styles.waitingZone}>
            <Animated.View style={styles.ghostPulsar}>
              <MaterialCommunityIcons name="ghost" size={100} color={matchState === 'matched' ? COLORS.primary : '#222'} />
            </Animated.View>
            <Text style={styles.ghostTitle}>{matchState === 'matched' ? 'Presence Detected' : 'Connecting to Void'}</Text>
            <TouchableOpacity style={styles.ghostCancel} onPress={() => setMatchState('idle')}>
              <Text style={{ color: '#555' }}>Sever Connection</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.ghostHeader}>
              <Text style={styles.voidTitle}>Ghost Universe</Text>
              <Text style={styles.voidSub}>Choose your resonance to mirror with another soul</Text>
            </View>
            <ScrollView contentContainerStyle={styles.voidGrid}>
              {INTERESTS.map(i => (
                <TouchableOpacity key={i.id} style={[styles.voidTile, selectedInterests.includes(i.id) && styles.voidTileSelected]} onPress={() => setSelectedInterests(prev => prev.includes(i.id) ? prev.filter(x => x !== i.id) : [...prev, i.id])}>
                  <MaterialCommunityIcons name={i.icon as any} size={30} color={selectedInterests.includes(i.id) ? '#000' : '#FFF'} />
                  <Text style={[styles.voidLabel, selectedInterests.includes(i.id) && { color: '#000' }]}>{i.label}</Text>
                  <Text style={[styles.voidDesc, selectedInterests.includes(i.id) && { color: '#444' }]}>{i.desc}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.findVoidBtn} onPress={() => setMatchState('waiting')}>
              <Text style={styles.findVoidText}>Manifest</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.blackBase}>
      <StatusBar barStyle="light-content" translucent />
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.primary} /></View>
      ) : reels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={80} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyTitle}>No Shots Yet</Text>
          <Text style={styles.emptySubtitle}>Be the first to share a moment with the AnuFy community!</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/(tabs)/create')}>
            <Text style={styles.createBtnText}>Create Shot</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={i => (i._id || i.id).toString()}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          renderItem={({ item }) => <ReelItem item={item} isVisible={viewableItems.includes(item._id || item.id)} router={router} user={user} />}
          onEndReached={() => {
            if (hasMore && !loadingMore) {
              fetchReels(page + 1);
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ height: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blackBase: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  reelContainer: { width, height, backgroundColor: '#000' },
  centeredHeart: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.4 },

  // Header Pill Design
  reelHeader: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  backBtn: { position: 'absolute', left: 20, padding: 5 },
  headerProfilePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 10, paddingHorizontal: 18, borderRadius: 35, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pillAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: '#FFF' },
  pillInfo: { marginLeft: 12, gap: 3 },
  pillUsername: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  headerMusicRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMusicText: { color: '#AAA', fontSize: 11, fontStyle: 'italic', fontWeight: '500', maxWidth: 120 },
  pillFollow: { marginLeft: 15, backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20 },
  pillFollowText: { color: '#FFF', fontSize: 13, fontWeight: '900' },

  // Modern Sidebar
  interactionSidebar: { position: 'absolute', right: 12, bottom: 120, alignItems: 'center', gap: 20, zIndex: 15 },
  sidebarItem: { alignItems: 'center', gap: 8 },
  sidebarText: { color: '#FFF', fontSize: 13, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 3 },
  sidebarMore: { marginTop: 10, opacity: 0.7 },

  // Bottom Dashboard (Centered & Responsive)
  bottomInfoFlow: { position: 'absolute', left: 0, right: 0, bottom: 50, zIndex: 15, alignItems: 'center' },
  reactionCapsuleContainer: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 22, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 12, width: width * 0.75, justifyContent: 'center' },
  reactionPuck: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginHorizontal: 4 },
  plusPuckAction: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

  // Customise Sheet (Instagram-like Half-Screen)
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 95 },
  customiseSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.72, backgroundColor: '#000', borderTopLeftRadius: 32, borderTopRightRadius: 32, zIndex: 100, overflow: 'hidden' },
  sheetHeaderHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  customiseHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, justifyContent: 'space-between', marginBottom: 15 },
  customiseTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  customiseActions: { flexDirection: 'row', alignItems: 'center' },
  customiseContent: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginBottom: 10 },
  largeReactionCapsule: { flexDirection: 'row', backgroundColor: '#161616', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 45, gap: 15, marginBottom: 15, alignItems: 'center' },
  largeReactionPuck: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  largePuckActive: { backgroundColor: 'transparent' },
  activeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF', marginTop: 2 },
  customiseTip: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 4 },
  doubleTapInfo: { color: '#555', fontSize: 11, textAlign: 'center' },

  // Emoji Picker within Sheet
  emojiPickerDrawer: { flex: 1, backgroundColor: '#0A0A0A', borderTopLeftRadius: 25, borderTopRightRadius: 25, marginTop: 5, zIndex: 110 },
  searchBarContainer: { padding: 12, zIndex: 115 },
  searchBar: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchText: { color: '#AAA', fontSize: 15, flex: 1 },
  emojiList: { flex: 1, zIndex: 120 },
  emojiSection: { paddingHorizontal: 20, marginBottom: 20 },
  sectionHeader: { color: '#8E8E8E', fontSize: 13, fontWeight: '600', marginBottom: 15 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  emojiItem: { width: (width - 120) / 6, aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  pickerTabs: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#222', backgroundColor: '#121212' },

  metaData: { width: width * 0.85, alignItems: 'center', gap: 6 },
  userCaption: { color: '#FFF', fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  tickerFrame: { maxWidth: width * 0.6 },
  musicText: { color: '#CCC', fontSize: 12, fontStyle: 'italic', fontWeight: '600' },

  // Comment Sheet Premium
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheetContent: { backgroundColor: '#0A0A0A', height: height * 0.75, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 25 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#222', borderRadius: 10, alignSelf: 'center', marginBottom: 15 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  emptyComments: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.4, gap: 15 },
  emptyText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 20 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 15 },
  commentBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#161616', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 8 },
  inputField: { flex: 1, color: '#FFF', fontSize: 14 },
  sendIcon: { backgroundColor: COLORS.primary, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  // Ghost Mode New Design
  ghostContainer: { flex: 1, backgroundColor: '#000' },
  voidTitle: { fontSize: 32, fontWeight: '900', color: '#FFF', marginBottom: 8 },
  voidSub: { fontSize: 14, color: '#444' },
  ghostHeader: { padding: 25, paddingTop: 40 },
  voidGrid: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 15, paddingBottom: 120 },
  voidTile: { width: (width - 55) / 2, backgroundColor: '#080808', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#111', gap: 10 },
  voidTileSelected: { backgroundColor: '#FFF', borderColor: '#FFF' },
  voidLabel: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  voidDesc: { fontSize: 12, color: '#333' },
  findVoidBtn: { position: 'absolute', bottom: 40, left: 25, right: 25, backgroundColor: '#FFF', height: 65, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 10 },
  findVoidText: { fontSize: 18, fontWeight: '900', color: '#000', letterSpacing: 1 },
  waitingZone: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 30 },
  ghostPulsar: { padding: 40, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.02)' },
  ghostTitle: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  ghostCancel: { marginTop: 40, padding: 15 },

  // Share Sheet Design
  shareUserItem: { alignItems: 'center', marginRight: 20, width: 70 },
  shareAvatar: { width: 60, height: 60, borderRadius: 30, marginBottom: 8, borderWidth: 1, borderColor: '#222' },
  shareUsername: { color: '#888', fontSize: 11, fontWeight: '600' },
  sendBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 5 },
  sendBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  shareOptionsRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 25 },
  shareOptionBtn: { alignItems: 'center', gap: 10 },
  shareIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  shareOptionLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  
  // Ad Styles
  sponsoredBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sponsoredText: { color: '#FFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  adCtaBtn: { backgroundColor: '#FFF', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25, marginBottom: 15, flexDirection: 'row', alignItems: 'center' },
  adCtaText: { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  
  // Empty State Styles
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 20 },
  emptySubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 16, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  createBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30, marginTop: 30 },
  createBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});
