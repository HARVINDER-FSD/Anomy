import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, ActivityIndicator, SafeAreaView, Alert, StatusBar } from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/src/store/authStore';

export default function PostEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const videoRef = useRef<Video>(null);
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
      console.warn("Failed to load preview music:", e);
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      await videoRef.current?.pauseAsync();
      await sound?.pauseAsync();
    } else {
      // Sync positions before play
      await sound?.setPositionAsync(musicTrimStart);
      await videoRef.current?.setPositionAsync(trimStart);
      await videoRef.current?.playAsync();
      await sound?.playAsync();
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
              uri: Platform.OS === 'android' ? mediaUri : mediaUri.replace('file://', ''),
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
      
      await apiClient.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      Alert.alert(
        isAnonymous ? "Echo Sent" : "Success", 
        isAnonymous ? "Your shadow post is now in the void." : `${isReel ? 'Shot' : 'Post'} shared successfully!`
      );
      
      router.replace(isAnonymous ? '/(tabs)/shots' : '/(tabs)');
    } catch (error: any) {
      console.error("Post error:", error);
      const errorMessage = error.data?.message || error.message || `Failed to share ${mediaType === 'video' ? 'shot' : 'post'}.`;
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
              <Video
                ref={videoRef}
                source={{ uri: mediaUri }}
                style={styles.previewImage}
                resizeMode={ResizeMode.COVER}
                isLooping
                isMuted={isMuted}
                positionMillis={trimStart}
                onPlaybackStatusUpdate={(status: any) => {
                  if (status.didJustFinish) setIsPlaying(false);
                  // Loop within trim range if possible
                  if (trimEnd > 0 && status.positionMillis >= trimEnd) {
                    videoRef.current?.setPositionAsync(trimStart);
                  }
                }}
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
