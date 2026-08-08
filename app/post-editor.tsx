import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, ActivityIndicator, SafeAreaView, Alert, StatusBar } from 'react-native';
import { Audio } from 'expo-av';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/src/store/authStore';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useFeedStore } from '@/src/store/feedStore';
import { useReelsStore } from '@/src/store/reelsStore';
import { socketService } from '@/src/lib/socket';


export default function PostEditorScreen() {
  const router = useSafeRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const isAnonymous = !!user?.isAnonymousMode;
  
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaUri, setMediaUri] = useState<string | null>((params.mediaUri as string) || null);
  const [mediaType, setMediaType] = useState<string>('image');
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Sync state with routing params dynamically
  useEffect(() => {
    if (params.mediaType) {
      setMediaType(params.mediaType as string);
    }
    if (params.mediaUri) {
      setMediaUri(params.mediaUri as string);
    }
  }, [params.mediaType, params.mediaUri]);

  // Parse editing parameters from editor
  const trimStart = params.trimStart ? parseInt(params.trimStart as string) : 0;
  const trimEnd = params.trimEnd ? parseInt(params.trimEnd as string) : 0;
  const isMuted = params.isMuted === 'true';
  const musicUrl = params.musicUrl as string;
  const musicTrimStart = params.musicTrimStart ? parseInt(params.musicTrimStart as string) : 0;
  const musicVolume = params.musicVolume ? parseFloat(params.musicVolume as string) : 1;
  const musicSongName = params.musicSongName as string;
  const musicArtist = params.musicArtist as string;
  const musicArtwork = params.musicArtwork as string;

  const player = useVideoPlayer(mediaUri || '', p => {
    p.loop = true;
    p.muted = isMuted;
  });

  // Observe player status and loop within trim range
  useEffect(() => {
    if (mediaType !== 'video' || !player) return;
    
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && trimStart > 0) {
        player.currentTime = trimStart / 1000;
      }
    });

    const timeSub = player.addListener('timeUpdate', (event) => {
      const posMs = event.currentTime * 1000;
      if (trimEnd > 0 && posMs >= trimEnd) {
        player.currentTime = trimStart / 1000;
      }
    });

    const endSub = player.addListener('playToEnd', () => {
      if (trimStart > 0) {
        player.currentTime = trimStart / 1000;
        player.play();
      } else {
        setIsPlaying(false);
      }
    });

    return () => {
      statusSub.remove();
      timeSub.remove();
      endSub.remove();
    };
  }, [player, mediaType, trimStart, trimEnd]);



  // 🎵 Load Music if exists
  useEffect(() => {
    if (musicUrl) {
      loadMusic();
    }
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [musicUrl]);

  const loadMusic = async () => {
    try {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: musicUrl },
        { shouldPlay: false, volume: musicVolume }
      );
      setSound(newSound);
    } catch (e) {
    }
  };

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        player.pause();
        await sound?.pauseAsync().catch(() => {});
      } else {
        // Sync positions before play
        await sound?.setPositionAsync(musicTrimStart).catch(() => {});
        player.currentTime = trimStart / 1000;
        player.play();
        await sound?.playAsync().catch(() => {});
      }
    } catch (e) {
    }
    setIsPlaying(!isPlaying);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaType(asset.type === 'video' ? 'video' : 'image');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    });

    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const handlePost = async () => {
    if (!caption && !mediaUri) return;
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('content', caption);
      formData.append('title', caption); // Backend reels expects title
      formData.append('description', caption); // and description
      formData.append('is_anonymous', isAnonymous ? 'true' : 'false');

      // Add music metadata if available (check for non-empty strings)
      if ((musicSongName && musicSongName.trim()) || (musicArtist && musicArtist.trim())) {
        const musicData = {
          song_name: (musicSongName && musicSongName.trim()) ? musicSongName : 'Unknown Song',
          artist: (musicArtist && musicArtist.trim()) ? musicArtist : 'Unknown Artist',
          ...(musicArtwork ? { cover_image: musicArtwork } : {}),
        };
        formData.append('music', JSON.stringify(musicData));
        formData.append('music_info', JSON.stringify(musicData));
      }

      
      const isReel = params.postType === 'shots' || (mediaType === 'video' && params.postType !== 'post');

      if (mediaUri) {
         if (mediaUri.startsWith('http')) {
            // 🚀 If it's already a remote URL (from server-side export)
            formData.append(isReel ? 'video_url' : 'media_url', mediaUri);
         } else {
            // 🏠 If it's a local file
            const filename = mediaUri.split('/').pop() || (isReel ? 'video.mp4' : 'media.jpg');
            const match = /\.(\w+)$/.exec(filename);
            let mimeType = '';
            if (isReel) {
              mimeType = match ? `video/${match[1]}` : 'video/mp4';
            } else {
              mimeType = match ? `image/${match[1]}` : 'image/jpeg';
            }
            
            // @ts-ignore
            formData.append(isReel ? 'video' : 'media', {
              uri: mediaUri,
              name: filename,
              type: mimeType,
            });
         }
         formData.append('media_type', mediaType);
         if (isReel) {
           formData.append('duration', (trimEnd - trimStart || 15000).toString());
         }
      } else {
         formData.append('media_type', 'text');
      }

      const endpoint = isReel ? '/reels' : '/posts';

      
      const res = await apiClient.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const newPostObj = res.data?.data?.post || res.data?.post || res.data?.data?.reel || res.data?.reel || res.data;

      // 🚀 CACHE INJECTION SYSTEM: Inject new posts/reels directly into stores for instant zero-server load display!
      if (newPostObj) {
        // Guarantee author data is fully present even for private/protected users!
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
          // Add to preloadedReels store
          const currentReels = useReelsStore.getState().preloadedReels || [];
          useReelsStore.getState().setPreloadedReels([newPostObj, ...currentReels]);
        } else {
          // Add to normal or anonymous Feed caches
          if (isAnonymous) {
            const currentAnon = useFeedStore.getState().cachedAnonymousPosts || [];
            useFeedStore.getState().setCachedAnonymousPosts([newPostObj, ...currentAnon]);
          } else {
            const currentNormal = useFeedStore.getState().cachedPosts || [];
            useFeedStore.getState().setCachedPosts([newPostObj, ...currentNormal]);
          }
        }
        // Emit via socket to broadcast real-time updates to existing followers
        socketService.socket?.emit(isReel ? 'shot:create' : 'post:create', {
          post: newPostObj,
          isAnonymous
        });

        // 🚀 Emit locally to update feed and profile tabs instantly!
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit(isReel ? 'reel:created:local' : 'post:created:local', newPostObj);

      }

      Alert.alert(
        isAnonymous ? "Echo Sent" : "Success", 
        isAnonymous ? "Your shadow post is now in the void." : `${isReel ? 'Shot' : 'Post'} shared successfully!`
      );
      
      // 🛡️ STRONG BOUNDARY: After posting, force a refresh of the correct feed
      if (isAnonymous) {
        router.replace('/(tabs)/explore'); // Or wherever anonymous feed lives
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.data?.message || error.message || `Failed to share ${mediaType === 'video' ? 'shot' : 'post'}.`;
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, isAnonymous && { backgroundColor: '#000' }]}>
      <StatusBar barStyle={isAnonymous ? "light-content" : "dark-content"} />

      <View style={[styles.header, isAnonymous && { borderBottomColor: '#1A1A1A' }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={isAnonymous ? '#FFF' : COLORS.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
           <Text style={[styles.headerTitle, isAnonymous && { color: '#FFF' }]}>{isAnonymous ? 'New Echo' : 'New Post'}</Text>
           {isAnonymous && <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>POSTING ANONYMOUSLY</Text>}
        </View>
        <TouchableOpacity onPress={handlePost} disabled={!caption && !mediaUri}>
          <Text style={[styles.postBtn, isAnonymous && { color: '#FFF' }, (!caption && !mediaUri) && {opacity: 0.5}]}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.captionInput, isAnonymous && { color: '#FFF' }]}
          placeholder={isAnonymous ? "What's in the void?" : "What's on your mind?"}
          placeholderTextColor={isAnonymous ? '#333' : COLORS.subtitle}
          multiline
          value={caption}
          onChangeText={setCaption}
        />
      </View>

      {mediaUri ? (
        <View style={styles.mediaPreview}>
          {mediaType === 'video' ? (
            <View style={styles.videoContainer}>
              <VideoView
                player={player}
                style={styles.previewImage}
                contentFit="cover"
                nativeControls={false}
              />
              <TouchableOpacity style={styles.playOverlay} onPress={togglePlayback}>
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={50} 
                  color="rgba(255,255,255,0.8)" 
                />
              </TouchableOpacity>
            </View>
          ) : (
            <Image source={{ uri: mediaUri }} style={styles.previewImage} />
          )}
          <TouchableOpacity style={styles.removeMedia} onPress={() => setMediaUri(null)}>
            <Ionicons name="close-circle" size={24} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mediaActions}>
           <TouchableOpacity style={[styles.actionBtn, isAnonymous && { backgroundColor: '#0A0A0A', borderColor: '#1A1A1A' }]} onPress={pickImage}>
             <Ionicons name="image-outline" size={28} color={isAnonymous ? '#FFF' : COLORS.secondary} />
             <Text style={[styles.actionText, isAnonymous && { color: '#FFF' }]}>Photo/Video</Text>
           </TouchableOpacity>
           <TouchableOpacity style={[styles.actionBtn, isAnonymous && { backgroundColor: '#0A0A0A', borderColor: '#1A1A1A' }]} onPress={takePhoto}>
             <Ionicons name="camera-outline" size={28} color={isAnonymous ? '#FF3B30' : COLORS.primary} />
             <Text style={[styles.actionText, isAnonymous && { color: '#FFF' }]}>Camera</Text>
           </TouchableOpacity>
        </View>
      )}

      {loading && (
        <View style={[styles.loaderOverlay, isAnonymous && { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
          <ActivityIndicator size="large" color={isAnonymous ? '#FFF' : COLORS.secondary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingBottom: verticalScale(15),
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
  },
  headerTitle: { color: COLORS.text, fontSize: moderateFont(19), fontWeight: 'bold' },
  postBtn: { color: COLORS.secondary, fontSize: moderateFont(17, 0.2), fontWeight: 'bold' },
  inputContainer: { paddingHorizontal: scale(20), paddingVertical: verticalScale(15) },
  captionInput: { color: COLORS.text, fontSize: moderateFont(18), minHeight: verticalScale(100), textAlignVertical: 'top' },
  mediaActions: { flexDirection: 'row', gap: scale(15), paddingHorizontal: scale(20), marginTop: verticalScale(10) },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: moderateScale(12), borderRadius: moderateScale(15), gap: scale(8), borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.text, fontSize: moderateFont(15), fontWeight: '700' },
  mediaPreview: { paddingHorizontal: scale(20), marginTop: verticalScale(10), position: 'relative' },
  videoContainer: { width: '100%', height: verticalScale(350), borderRadius: moderateScale(20), overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  previewImage: { width: '100%', height: verticalScale(350), borderRadius: moderateScale(20), backgroundColor: COLORS.surface },
  playOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.1)' },
  removeMedia: { position: 'absolute', top: 10, right: 30, backgroundColor: COLORS.white, borderRadius: 15, zIndex: 10 },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }
});
