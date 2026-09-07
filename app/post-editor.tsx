import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, ActivityIndicator, Alert, StatusBar, ScrollView,
  Switch, Modal, Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, createVideoPlayer } from 'expo-video';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/src/store/authStore';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useFeedStore } from '@/src/store/feedStore';
import { useReelsStore } from '@/src/store/reelsStore';
import { socketService } from '@/src/lib/socket';

const POPULAR_LOCATIONS = ['Current Location', 'Mumbai, India', 'New Delhi, India', 'Bangalore, India', 'Goa, India', 'Dubai, UAE'];

export default function PostEditorScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const router = useSafeRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const isAnonymous = params.isAnonymous !== undefined
    ? (String(params.isAnonymous) === 'true')
    : !!user?.isAnonymousMode;
  
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaUri, setMediaUri] = useState<string | null>((params.mediaUri as string) || null);
  const [mediaType, setMediaType] = useState<string>((params.mediaType as string) || 'image');
  
  // Instagram Metadata Features
  const [location, setLocation] = useState<string>('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  
  const [musicSongName, setMusicSongName] = useState<string>((params.musicSongName as string) || '');
  const [musicArtist, setMusicArtist] = useState<string>((params.musicArtist as string) || '');
  const [musicArtwork, setMusicArtwork] = useState<string>((params.musicArtwork as string) || '');
  const [musicPreviewUrl, setMusicPreviewUrl] = useState<string>((params.musicPreviewUrl as string) || '');
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [musicSearch, setMusicSearch] = useState('');
  const [musicList, setMusicList] = useState<any[]>([]);
  const [isLoadingMusic, setIsLoadingMusic] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('🔥 Trending');
  const [playingPreviewUrl, setPlayingPreviewUrl] = useState<string | null>(null);
  const previewPlayerRef = useRef<any>(null);

const PostEditorVideoThumb = ({ uri, style }: { uri: string; style: any }) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (player && uri) {
      try {
        player.play();
      } catch (_) {}
    }
  }, [player, uri]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

  const MUSIC_GENRES = [
    { label: '🔥 Trending', query: 'top hits' },
    { label: '🇮🇳 Bollywood', query: 'bollywood top songs' },
    { label: '💃 Punjabi', query: 'punjabi hits' },
    { label: '🎧 Hip-Hop', query: 'hip hop hits' },
    { label: '🎸 Pop', query: 'top pop songs' },
    { label: '🌙 Lo-Fi & Chill', query: 'lofi chill beats' },
    { label: '🕺 EDM & Dance', query: 'dance edm hits' },
  ];

  // Stop audio preview cleanly
  const stopPreview = () => {
    if (previewPlayerRef.current) {
      try {
        previewPlayerRef.current.pause();
      } catch (_) {}
      previewPlayerRef.current = null;
    }
    setPlayingPreviewUrl(null);
  };

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  // Toggle live audio preview using native expo-video
  const togglePlayPreview = (previewUrl: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playingPreviewUrl === previewUrl) {
      stopPreview();
      return;
    }

    stopPreview();
    if (!previewUrl) return;

    try {
      setPlayingPreviewUrl(previewUrl);
      const player = createVideoPlayer(previewUrl);
      try {
        (player as any).keepScreenOnWhilePlaying = false;
      } catch (_) {}
      player.loop = true;
      player.muted = false;
      player.volume = 1.0;
      previewPlayerRef.current = player;
      player.play();
    } catch (e) {
      setPlayingPreviewUrl(null);
    }
  };

  // Real-time iTunes Search
  const fetchMusicTracks = async (term: string) => {
    if (!term || !term.trim()) return;
    setIsLoadingMusic(true);
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term.trim())}&media=music&entity=song&limit=30`
      );
      const data = await res.json();
      if (data && data.results && Array.isArray(data.results)) {
        setMusicList(data.results.filter((item: any) => item.trackName));
      }
    } catch (_) {
    } finally {
      setIsLoadingMusic(false);
    }
  };

  // Real-time Debounced Search & Genre Switching
  useEffect(() => {
    if (musicSearch.trim().length > 1) {
      const timer = setTimeout(() => {
        fetchMusicTracks(musicSearch);
      }, 300);
      return () => clearTimeout(timer);
    } else if (showMusicModal && !musicSearch.trim()) {
      const genre = MUSIC_GENRES.find(g => g.label === selectedGenre);
      fetchMusicTracks(genre ? genre.query : 'top hits');
    }
  }, [musicSearch, selectedGenre, showMusicModal]);

  // Advanced settings toggles
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Sync state with routing params dynamically
  useEffect(() => {
    if (params.mediaType) setMediaType(params.mediaType as string);
    if (params.mediaUri) setMediaUri(params.mediaUri as string);
    if (params.musicSongName) setMusicSongName(params.musicSongName as string);
    if (params.musicArtist) setMusicArtist(params.musicArtist as string);
    if (params.musicArtwork) setMusicArtwork(params.musicArtwork as string);
    if (params.musicPreviewUrl) setMusicPreviewUrl(params.musicPreviewUrl as string);
  }, [params.mediaType, params.mediaUri, params.musicSongName, params.musicArtist, params.musicArtwork, params.musicPreviewUrl]);

  const isReel = params.postType === 'shots' || (mediaType === 'video' && params.postType !== 'post');

  const handlePost = async () => {
    if (!caption.trim() && !mediaUri) {
      Alert.alert('Empty Post', 'Please add a photo, video or write something.');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);

    try {
      let finalMediaUrl: string | null = null;

      // 1. Upload media to Cloudinary via MediaEngine (if local file)
      if (mediaUri) {
        if (mediaUri.startsWith('http')) {
          finalMediaUrl = mediaUri;
        } else {
          const { MediaEngine } = await import('@/src/engines/MediaEngine');
          const category = isReel ? 'shots' : 'posts';
          const uploadedUrl = await MediaEngine.uploadMedia(
            mediaUri,
            mediaType === 'video' ? 'video' : 'image',
            category
          );
          if (!uploadedUrl) {
            Alert.alert('Upload Failed', 'Could not upload media. Please try again.');
            setLoading(false);
            return;
          }
          finalMediaUrl = uploadedUrl;
        }
      }

      // 2. Build JSON body
      const body: Record<string, any> = {
        content: caption.trim(),
        is_anonymous: isAnonymous,
        hide_like_count: hideLikeCount,
        comments_disabled: commentsDisabled,
      };

      if (location) {
        body.location = { name: location };
      }

      if (finalMediaUrl) {
        body.media_urls = [finalMediaUrl];
        body.media_type = mediaType === 'video' ? 'video' : 'image';
      } else {
        body.media_type = 'text';
      }

      // Add music metadata if attached
      if ((musicSongName && musicSongName.trim()) || (musicArtist && musicArtist.trim())) {
        body.music = {
          song_name: musicSongName.trim() || 'Featured Track',
          artist: musicArtist.trim() || 'Artist',
          cover_image: musicArtwork || '',
          preview_url: musicPreviewUrl || '',
        };
      }

      if (isReel && finalMediaUrl) {
        body.video_url = finalMediaUrl;
        body.duration = 15000;
        body.title = caption.trim();
        body.description = caption.trim();
      }

      const endpoint = isReel ? '/reels' : '/posts';
      const res = await apiClient.post(endpoint, body);
      const newPostObj = res.data?.data?.post || res.data?.post || res.data?.data?.reel || res.data?.reel || res.data;

      if (newPostObj) {
        if (!newPostObj.music && body.music) {
          newPostObj.music = body.music;
          newPostObj.music_info = body.music;
        }
        if (!newPostObj.author && !newPostObj.user) {
          newPostObj.author = {
            _id: user?.id || user?._id,
            id: user?.id || user?._id,
            username: user?.username || 'You',
            avatar: user?.avatar || (user as any)?.profilePicture || '',
            avatar_url: user?.avatar || (user as any)?.profilePicture || '',
            is_verified: !!(user as any)?.isPremium,
          };
        }

        if (isReel) {
          const currentReels = useReelsStore.getState().preloadedReels || [];
          useReelsStore.getState().setPreloadedReels([newPostObj, ...currentReels]);
        } else {
          if (isAnonymous) {
            const currentAnon = useFeedStore.getState().cachedAnonymousPosts || [];
            useFeedStore.getState().setCachedAnonymousPosts([newPostObj, ...currentAnon]);
          } else {
            const currentNormal = useFeedStore.getState().cachedPosts || [];
            useFeedStore.getState().setCachedPosts([newPostObj, ...currentNormal]);
          }
        }

        socketService.socket?.emit(isReel ? 'shot:create' : 'post:create', {
          post: newPostObj,
          isAnonymous
        });

        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit(isReel ? 'reel:created:local' : 'post:created:local', newPostObj);
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        isAnonymous ? "Echo Sent" : "Success",
        isAnonymous ? "Your shadow post is now in the void." : `${isReel ? 'Shot' : 'Post'} shared successfully!`
      );
      
      if (isAnonymous) {
        router.replace('/(tabs)/explore');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to share.';
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={COLORS.background === '#121212' || isAnonymous ? 'light-content' : 'dark-content'} />

      {/* ── TOP HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={26} color={isAnonymous ? '#FFF' : COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, isAnonymous && { color: '#FFF' }]}>
            {isAnonymous ? 'New Echo' : (isReel ? 'New Reel' : 'New Post')}
          </Text>
          {isAnonymous && (
            <Text style={styles.anonSubHeader}>POSTING ANONYMOUSLY</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.shareHeaderBtn, (!caption && !mediaUri) && { opacity: 0.5 }]}
          onPress={handlePost}
          disabled={!caption && !mediaUri}
          activeOpacity={0.8}
        >
          <Text style={styles.shareHeaderBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* ── TOP INSTAGRAM ROW: PREVIEW THUMBNAIL + CAPTION INPUT ── */}
        <View style={styles.postInputRow}>
          {mediaUri ? (
            <View style={styles.mediaThumbnailBox}>
              {mediaType === 'video' ? (
                <PostEditorVideoThumb
                  key={mediaUri}
                  uri={mediaUri}
                  style={styles.mediaThumbnail}
                />
              ) : mediaUri ? (
                <Image source={{ uri: mediaUri }} style={styles.mediaThumbnail} contentFit="cover" />
              ) : null}
              {mediaType === 'video' && (
                <View style={styles.thumbVideoBadge}>
                  <Ionicons name="play" size={12} color="#FFF" />
                </View>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.mediaPlaceholderBox}
              onPress={async () => {
                const res = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ['images', 'videos'],
                  allowsEditing: true,
                  aspect: [1, 1],
                  quality: 0.9,
                });
                if (!res.canceled && res.assets[0]) {
                  setMediaUri(res.assets[0].uri);
                  setMediaType(res.assets[0].type === 'video' ? 'video' : 'image');
                }
              }}
            >
              <Ionicons name="image-outline" size={24} color={COLORS.subtitle} />
              <Text style={styles.mediaPlaceholderText}>Add</Text>
            </TouchableOpacity>
          )}

          <TextInput
            style={[styles.captionInput, isAnonymous && { color: '#FFF' }]}
            placeholder={isAnonymous ? "Write a shadow whisper..." : "Write a caption..."}
            placeholderTextColor={isAnonymous ? '#4A4A4A' : COLORS.subtitle}
            multiline
            value={caption}
            onChangeText={setCaption}
          />
        </View>

        {/* ── QUICK POPULAR LOCATION CHIPS ── */}
        <View style={styles.locationChipsSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {POPULAR_LOCATIONS.map((loc) => {
              const isSelected = location === loc;
              return (
                <TouchableOpacity
                  key={loc}
                  style={[styles.chipItem, isSelected && styles.chipItemActive]}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setLocation(isSelected ? '' : loc);
                  }}
                >
                  <Ionicons
                    name="location-sharp"
                    size={13}
                    color={isSelected ? '#FFFFFF' : COLORS.subtitle}
                  />
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{loc}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.sectionDivider} />

        {/* ── METADATA ROWS (INSTAGRAM STYLE) ── */}

        {/* 1. Add Location Row */}
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => setShowLocationModal(true)}
          activeOpacity={0.7}
        >
          <View style={styles.settingLeft}>
            <Ionicons name="location-outline" size={22} color={location ? '#3B82F6' : COLORS.text} />
            <Text style={[styles.settingLabel, location && { color: '#3B82F6', fontWeight: '700' }]}>
              {location || 'Add location'}
            </Text>
          </View>
          {location ? (
            <TouchableOpacity onPress={() => setLocation('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          )}
        </TouchableOpacity>

        {/* 2. Add Music Row */}
        {musicSongName ? (
          <View style={[styles.settingRow, styles.selectedMusicBox]}>
            <View style={styles.settingLeft}>
              {musicArtwork ? (
                <Image source={{ uri: musicArtwork }} style={styles.selectedMusicThumb} />
              ) : (
                <View style={styles.selectedMusicThumbPlaceholder}>
                  <Ionicons name="musical-notes" size={18} color="#FFF" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedMusicTitle} numberOfLines={1}>{musicSongName}</Text>
                <Text style={styles.selectedMusicArtist} numberOfLines={1}>{musicArtist || 'Original Audio'}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {musicPreviewUrl ? (
                <TouchableOpacity
                  style={styles.inlinePlayBtn}
                  onPress={() => togglePlayPreview(musicPreviewUrl)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={playingPreviewUrl === musicPreviewUrl ? 'pause' : 'play'}
                    size={16}
                    color="#FFF"
                  />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => setShowMusicModal(true)}
                style={styles.changeMusicBtn}
              >
                <Text style={styles.changeMusicText}>Change</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  await stopPreview();
                  setMusicSongName('');
                  setMusicArtist('');
                  setMusicArtwork('');
                  setMusicPreviewUrl('');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.subtitle} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setShowMusicModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="musical-notes-outline" size={22} color={COLORS.text} />
              <Text style={styles.settingLabel}>Add music</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>
        )}

        {/* 3. Tag People Row */}
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => Alert.alert('Tag People', 'You can tag friends by mentioning @username in the caption.')}
          activeOpacity={0.7}
        >
          <View style={styles.settingLeft}>
            <Ionicons name="person-add-outline" size={22} color={COLORS.text} />
            <Text style={styles.settingLabel}>Tag people</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
        </TouchableOpacity>

        {/* 4. Audience / Privacy */}
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => Alert.alert('Audience', 'This post will be visible to everyone on AnuFy.')}
          activeOpacity={0.7}
        >
          <View style={styles.settingLeft}>
            <Ionicons name="globe-outline" size={22} color={COLORS.text} />
            <Text style={styles.settingLabel}>Audience</Text>
          </View>
          <Text style={styles.settingValueText}>Everyone</Text>
        </TouchableOpacity>

        <View style={styles.sectionDivider} />

        {/* ── ADVANCED SETTINGS ACCORDION ── */}
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => setShowAdvancedSettings(!showAdvancedSettings)}
          activeOpacity={0.7}
        >
          <View style={styles.settingLeft}>
            <Ionicons name="options-outline" size={22} color={COLORS.text} />
            <Text style={styles.settingLabel}>Advanced settings</Text>
          </View>
          <Ionicons
            name={showAdvancedSettings ? "chevron-up" : "chevron-down"}
            size={20}
            color={COLORS.subtitle}
          />
        </TouchableOpacity>

        {showAdvancedSettings && (
          <View style={styles.advancedBox}>
            {/* Hide Likes */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.toggleTitle}>Hide like and view counts on this post</Text>
                <Text style={styles.toggleSubtitle}>Only you will see the total number of likes and views on this post.</Text>
              </View>
              <Switch
                value={hideLikeCount}
                onValueChange={(val) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setHideLikeCount(val);
                }}
                trackColor={{ false: '#3A3A3C', true: '#3B82F6' }}
              />
            </View>

            {/* Turn off commenting */}
            <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 14 }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.toggleTitle}>Turn off commenting</Text>
                <Text style={styles.toggleSubtitle}>You can change this later by tapping the menu icon at the top of your post.</Text>
              </View>
              <Switch
                value={commentsDisabled}
                onValueChange={(val) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCommentsDisabled(val);
                }}
                trackColor={{ false: '#3A3A3C', true: '#3B82F6' }}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── CUSTOM LOCATION SEARCH MODAL ── */}
      <Modal visible={showLocationModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalFullContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Location</Text>
            <TouchableOpacity
              onPress={() => {
                if (locationSearch.trim()) setLocation(locationSearch.trim());
                setShowLocationModal(false);
              }}
            >
              <Text style={{ color: '#3B82F6', fontWeight: '700', fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalSearchInputBox}>
            <Ionicons name="search" size={18} color={COLORS.subtitle} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search for a city or place..."
              placeholderTextColor={COLORS.subtitle}
              value={locationSearch}
              onChangeText={setLocationSearch}
              autoFocus
            />
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {POPULAR_LOCATIONS.map((item) => (
              <TouchableOpacity
                key={item}
                style={styles.modalLocationRow}
                onPress={() => {
                  setLocation(item);
                  setShowLocationModal(false);
                }}
              >
                <Ionicons name="location-outline" size={20} color="#3B82F6" />
                <Text style={styles.modalLocationText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── REAL-TIME ITUNES MUSIC SEARCH MODAL ── */}
      <Modal visible={showMusicModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalFullContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={async () => {
                await stopPreview();
                setShowMusicModal(false);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Music</Text>
            <View style={{ width: 30 }} />
          </View>

          {/* Search Box */}
          <View style={styles.modalSearchInputBox}>
            <Ionicons name="search" size={18} color={COLORS.subtitle} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search songs, artists, soundtracks..."
              placeholderTextColor={COLORS.subtitle}
              value={musicSearch}
              onChangeText={setMusicSearch}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {!!musicSearch && (
              <TouchableOpacity onPress={() => setMusicSearch('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Chips Carousel */}
          {!musicSearch.trim() && (
            <View style={styles.genreBarContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.genreScrollContent}
              >
                {MUSIC_GENRES.map((genre) => {
                  const isSelected = selectedGenre === genre.label;
                  return (
                    <TouchableOpacity
                      key={genre.label}
                      style={[styles.genreChip, isSelected && styles.genreChipActive]}
                      onPress={async () => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedGenre(genre.label);
                        await stopPreview();
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.genreChipText, isSelected && styles.genreChipTextActive]}>
                        {genre.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Results List */}
          {isLoadingMusic ? (
            <View style={styles.musicCenteredBox}>
              <ActivityIndicator size="large" color="#EC4899" />
              <Text style={styles.musicLoadingText}>Searching iTunes library...</Text>
            </View>
          ) : musicList.length === 0 ? (
            <View style={styles.musicCenteredBox}>
              <Ionicons name="musical-notes-outline" size={48} color={COLORS.subtitle} />
              <Text style={styles.musicEmptyTitle}>No tracks found</Text>
              <Text style={styles.musicEmptySubtitle}>Try searching for a different song or artist name</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1, paddingHorizontal: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {musicList.map((song) => {
                const trackId = song.trackId || song.collectionId || song.trackName;
                const artworkUri = (song.artworkUrl100 || song.artworkUrl60 || '').replace('100x100bb', '300x300bb');
                const isCurrentPlaying = playingPreviewUrl === song.previewUrl;

                return (
                  <TouchableOpacity
                    key={String(trackId)}
                    style={[styles.modalMusicRow, isCurrentPlaying && styles.modalMusicRowActive]}
                    onPress={async () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      await stopPreview();
                      setMusicSongName(song.trackName || 'Featured Track');
                      setMusicArtist(song.artistName || 'Artist');
                      setMusicArtwork(artworkUri);
                      setMusicPreviewUrl(song.previewUrl || '');
                      setShowMusicModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.musicArtWrapper}>
                      {artworkUri ? (
                        <Image source={{ uri: artworkUri }} style={styles.modalMusicThumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.modalMusicThumb, { backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="musical-notes" size={16} color="#666" />
                        </View>
                      )}
                      {isCurrentPlaying && (
                        <View style={styles.musicPlayingOverlay}>
                          <Ionicons name="volume-high" size={16} color="#FFF" />
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                      <Text style={[styles.modalMusicTitle, isCurrentPlaying && { color: '#EC4899' }]} numberOfLines={1}>
                        {song.trackName}
                      </Text>
                      <Text style={styles.modalMusicArtist} numberOfLines={1}>
                        {song.artistName} {song.collectionName ? `• ${song.collectionName}` : ''}
                      </Text>
                    </View>

                    {/* Audio Preview Play/Pause Trigger */}
                    {song.previewUrl ? (
                      <TouchableOpacity
                        style={[styles.musicPlayPreviewBtn, isCurrentPlaying && styles.musicPlayPreviewBtnActive]}
                        onPress={(e) => {
                          e.stopPropagation();
                          togglePlayPreview(song.previewUrl);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isCurrentPlaying ? 'pause' : 'play'}
                          size={14}
                          color={isCurrentPlaying ? '#FFF' : COLORS.text}
                        />
                      </TouchableOpacity>
                    ) : null}

                    {/* Add to Post Icon */}
                    <View style={{ marginLeft: 8 }}>
                      <Ionicons name="add-circle" size={26} color="#EC4899" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── LOADING OVERLAY ── */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Sharing your moment...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  headerBackBtn: {
    padding: 4,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: moderateFont(17),
    fontWeight: '700',
  },
  anonSubHeader: {
    color: '#EC4899',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 1,
  },
  shareHeaderBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(18),
  },
  shareHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: moderateFont(14),
    fontWeight: '700',
  },

  scrollBody: {
    flex: 1,
  },

  // ── Top Input Row ──
  postInputRow: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    alignItems: 'flex-start',
    gap: scale(12),
  },
  mediaThumbnailBox: {
    width: scale(72),
    height: scale(72),
    borderRadius: moderateScale(8),
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    position: 'relative',
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbVideoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    padding: 2,
  },
  mediaPlaceholderBox: {
    width: scale(72),
    height: scale(72),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  mediaPlaceholderText: {
    color: COLORS.subtitle,
    fontSize: moderateFont(11),
    marginTop: 2,
    fontWeight: '600',
  },
  captionInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: moderateFont(15),
    minHeight: verticalScale(68),
    textAlignVertical: 'top',
    paddingTop: 0,
  },

  // ── Quick Location Chips ──
  locationChipsSection: {
    paddingVertical: verticalScale(6),
  },
  chipsScroll: {
    paddingHorizontal: scale(16),
    gap: scale(8),
  },
  chipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: scale(4),
  },
  chipItemActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  chipText: {
    color: COLORS.subtitle,
    fontSize: moderateFont(12),
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: verticalScale(6),
  },

  // ── Setting Rows ──
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    flex: 1,
    paddingRight: scale(10),
  },
  settingLabel: {
    color: COLORS.text,
    fontSize: moderateFont(15),
    fontWeight: '500',
  },
  settingValueText: {
    color: COLORS.subtitle,
    fontSize: moderateFont(13),
    fontWeight: '500',
  },

  // ── Advanced Settings ──
  advancedBox: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    backgroundColor: COLORS.surface,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(10),
  },
  toggleTitle: {
    color: COLORS.text,
    fontSize: moderateFont(14),
    fontWeight: '600',
    marginBottom: verticalScale(2),
  },
  toggleSubtitle: {
    color: COLORS.subtitle,
    fontSize: moderateFont(12),
    lineHeight: 16,
  },

  // ── Modals ──
  modalFullContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: moderateFont(17),
    fontWeight: '700',
  },
  modalSearchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: scale(16),
    marginVertical: verticalScale(12),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: scale(8),
  },
  modalSearchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: moderateFont(14),
  },
  modalLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(14),
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    gap: scale(12),
  },
  modalLocationText: {
    color: COLORS.text,
    fontSize: moderateFont(15),
    fontWeight: '500',
  },
  // ── Selected Music Box ──
  selectedMusicBox: {
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#EC4899',
  },
  selectedMusicThumb: {
    width: scale(38),
    height: scale(38),
    borderRadius: moderateScale(6),
  },
  selectedMusicThumbPlaceholder: {
    width: scale(38),
    height: scale(38),
    borderRadius: moderateScale(6),
    backgroundColor: '#EC4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedMusicTitle: {
    color: COLORS.text,
    fontSize: moderateFont(14),
    fontWeight: '700',
  },
  selectedMusicArtist: {
    color: '#EC4899',
    fontSize: moderateFont(12),
    fontWeight: '500',
    marginTop: 1,
  },
  inlinePlayBtn: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: '#EC4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeMusicBtn: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(6),
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
  },
  changeMusicText: {
    color: '#EC4899',
    fontSize: moderateFont(12),
    fontWeight: '700',
  },

  // ── Genre Chips ──
  genreBarContainer: {
    paddingVertical: verticalScale(6),
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  genreScrollContent: {
    paddingHorizontal: scale(16),
    gap: scale(8),
  },
  genreChip: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(7),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  genreChipActive: {
    backgroundColor: '#EC4899',
    borderColor: '#EC4899',
  },
  genreChipText: {
    color: COLORS.text,
    fontSize: moderateFont(13),
    fontWeight: '600',
  },
  genreChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ── Music Results ──
  musicCenteredBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(32),
    minHeight: verticalScale(250),
  },
  musicLoadingText: {
    color: COLORS.subtitle,
    fontSize: moderateFont(14),
    marginTop: verticalScale(12),
    fontWeight: '500',
  },
  musicEmptyTitle: {
    color: COLORS.text,
    fontSize: moderateFont(16),
    fontWeight: '700',
    marginTop: verticalScale(12),
  },
  musicEmptySubtitle: {
    color: COLORS.subtitle,
    fontSize: moderateFont(13),
    textAlign: 'center',
    marginTop: verticalScale(4),
  },
  modalMusicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  modalMusicRowActive: {
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(8),
    marginHorizontal: scale(-8),
  },
  musicArtWrapper: {
    position: 'relative',
  },
  modalMusicThumb: {
    width: scale(46),
    height: scale(46),
    borderRadius: moderateScale(8),
    backgroundColor: COLORS.surface,
  },
  musicPlayingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: moderateScale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalMusicTitle: {
    color: COLORS.text,
    fontSize: moderateFont(14),
    fontWeight: '600',
  },
  modalMusicArtist: {
    color: COLORS.subtitle,
    fontSize: moderateFont(12),
    marginTop: 2,
  },
  musicPlayPreviewBtn: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  musicPlayPreviewBtnActive: {
    backgroundColor: '#EC4899',
    borderColor: '#EC4899',
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: moderateFont(15),
    fontWeight: '700',
    marginTop: verticalScale(12),
  },
});
