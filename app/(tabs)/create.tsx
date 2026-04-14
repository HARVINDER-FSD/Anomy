import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  Dimensions, SafeAreaView, Platform, StatusBar, ActivityIndicator, 
  Alert, Linking 
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../../src/theme/colors';
import { useEditorStore } from '../../src/store/editorStore';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width / 3 - 1;

const CreateMainScreen = () => {
  const router = useRouter();
  const { addLayer, clearProject, addClip } = useEditorStore();
  
  const [activeTab, setActiveTab] = useState<'post' | 'shots'>('shots');
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [isNativeGridBlocked, setIsNativeGridBlocked] = useState(false);

  // 1. Logic to Load Native Media Grid
  const loadMediaGrid = useCallback(async () => {
    try {
      setLoading(true);
      const { assets: fetchedAssets } = await MediaLibrary.getAssetsAsync({
        mediaType: activeTab === 'shots' ? ['video'] : ['video', 'photo'],
        sortBy: ['creationTime'],
        first: 60,
      });
      setAssets(fetchedAssets);
      setIsNativeGridBlocked(false);
    } catch (e: any) {
      console.warn('[loadMediaGrid] Failed:', e.message);
      // If it fails with the "AUDIO" error, we mark it as blocked but show fallback
      if (e.message.includes('AUDIO')) {
        setIsNativeGridBlocked(true);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // 2. Initial Permission Check & Request (SAFER VERSION)
  const checkAndRequestPermissions = async () => {
    try {
      setLoading(true);
      // 🛡️ CRITICAL: We use ImagePicker to check permissions because MediaLibrary crashes 
      // if the manifest is missing the AUDIO entry. ImagePicker is safer.
      const { status: existingStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
      
      if (existingStatus === 'granted') {
        setPermissionStatus('granted' as any);
        loadMediaGrid();
      } else {
        const { status: newStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setPermissionStatus(newStatus as any);
        if (newStatus === 'granted') {
          loadMediaGrid();
        }
      }
    } catch (err: any) {
      console.error('[Permissions] Safer check failed, falling back:', err.message);
      // If even ImagePicker fails, we just show the manual picker button
      setIsNativeGridBlocked(true);
      setPermissionStatus('granted' as any); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAndRequestPermissions();
  }, []);

  // 3. Tab Change Effect
  useEffect(() => {
    if (permissionStatus === 'granted' && !isNativeGridBlocked) {
      loadMediaGrid();
    }
  }, [activeTab, permissionStatus, isNativeGridBlocked, loadMediaGrid]);

  // 4. Fallback Gallery Picker (Always works, even with manifest bugs)
  const openDirectPicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: activeTab === 'shots' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.All,
        allowsEditing: activeTab === 'post',
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const durationMs = asset.duration ? asset.duration : 15000;
        handleAssetSelection(asset.uri, activeTab === 'shots', durationMs);
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', 'Could not open gallery: ' + err.message);
    }
  };

  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'AnuFy needs camera access to capture moments.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: activeTab === 'shots' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
        allowsEditing: activeTab === 'post',
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const durationMs = asset.duration ? asset.duration : 15000;
        handleAssetSelection(asset.uri, activeTab === 'shots', durationMs);
      }
    } catch (err: any) {
      Alert.alert('Camera Error', 'Could not open camera: ' + err.message);
    }
  };

  const handleAssetSelection = (uri: string, isVideo: boolean, duration: number = 15000) => {
    if (activeTab === 'shots' && isVideo) {
      clearProject();
      addClip(uri, duration); // 🚀 SYNC ACTUAL VIDEO DURATION
      router.push('/editor');
    } else {
      // 📝 Go to Post Editor for 'POST' tab or image selection
      router.push({
        pathname: '/post-editor',
        params: { 
          mediaUri: uri, 
          mediaType: isVideo ? 'video' : 'image',
          postType: activeTab // Pass tab context to post screen
        }
      } as any);
    }
  };

  const handleGridAssetPress = async (asset: MediaLibrary.Asset) => {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      const uri = info.localUri || info.uri;
      const durationMs = asset.duration ? Math.round(asset.duration * 1000) : 15000;
      handleAssetSelection(uri, asset.mediaType === 'video', durationMs);
    } catch (err) {
      Alert.alert('Error', 'Could not load this file. Please try the "Other Albums" button.');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // --- SUB-COMPONENTS ---

  const renderPermissionScreen = () => (
    <View style={styles.centerContainer}>
      <View style={styles.iconCircle}>
        <Ionicons name="images" size={50} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Access Your Gallery</Text>
      <Text style={styles.description}>
        To share your photos and videos, AnuFy needs your permission to access the media library.
      </Text>
      <TouchableOpacity style={styles.actionBtn} onPress={checkAndRequestPermissions}>
        <Text style={styles.actionBtnText}>Grant Access</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ marginTop: 20 }} onPress={() => Linking.openSettings()}>
        <Text style={{ color: COLORS.subtitle, textDecorationLine: 'underline' }}>Open System Settings</Text>
      </TouchableOpacity>
    </View>
  );

  const renderBlockedGridFallback = () => (
    <View style={styles.centerContainer}>
      <Ionicons name="shield-checkmark-outline" size={70} color={COLORS.secondary} />
      <Text style={styles.title}>Deep Access Required</Text>
      <Text style={styles.description}>
        Your current app version needs a native update to show the full grid. You can still access everything via the picker below!
      </Text>
      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.secondary }]} onPress={openDirectPicker}>
        <Ionicons name="image" size={20} color="#FFF" style={{ marginRight: 8 }} />
        <Text style={styles.actionBtnText}>Open Gallery Picker</Text>
      </TouchableOpacity>
      <Text style={styles.fixHint}>
        Fix: npx expo prebuild --clean
      </Text>
    </View>
  );

  // --- MAIN RENDER ---

  if (loading && !assets.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* 🧭 HEADER & TABS */}
      <View style={styles.header}>
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'post' && styles.tabActive]} 
            onPress={() => setActiveTab('post')}
          >
            <Text style={[styles.tabText, activeTab === 'post' && styles.tabTextActive]}>POST</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'shots' && styles.tabActive]} 
            onPress={() => setActiveTab('shots')}
          >
            <Text style={[styles.tabText, activeTab === 'shots' && styles.tabTextActive]}>SHOTS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🖼️ CONTENT AREA */}
      {permissionStatus !== 'granted' ? renderPermissionScreen() : (
        <>
          {isNativeGridBlocked ? renderBlockedGridFallback() : (
            <FlatList
              data={assets}
              numColumns={3}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  activeOpacity={0.85} 
                  style={styles.gridItem} 
                  onPress={() => handleGridAssetPress(item)}
                >
                  <Image source={{ uri: item.uri }} style={styles.gridImage} />
                  {item.mediaType === 'video' && (
                    <View style={styles.videoBadge}>
                      <Ionicons name="play" size={10} color="#FFF" />
                      <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={() => (
                <TouchableOpacity style={styles.albumHeader} onPress={openDirectPicker}>
                   <View style={styles.albumIconBox}>
                      <Ionicons name="albums" size={20} color="#FFF" />
                   </View>
                   <Text style={styles.albumHeaderText}>Select from other albums</Text>
                   <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                   <Ionicons name="images-outline" size={60} color="#333" />
                   <Text style={styles.emptyText}>No media found in your gallery</Text>
                   <TouchableOpacity style={styles.retryBtn} onPress={openDirectPicker}>
                      <Text style={styles.retryBtnText}>Try Direct Picker</Text>
                   </TouchableOpacity>
                </View>
              )}
            />
          )}
        </>
      )}

      {/* 📸 CAMERA BUTTON */}
      <TouchableOpacity style={styles.cameraFab} onPress={openCamera}>
         <View style={styles.fabGlow} />
         <Ionicons name="camera" size={32} color="#FFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { 
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 15, 
    alignItems: 'center', 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#222' 
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 25,
    padding: 3,
    width: width * 0.65,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 22,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: { color: '#666', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  tabTextActive: { color: '#FFF' },
  
  listContent: { paddingBottom: 100 },
  gridItem: { width: ITEM_WIDTH, height: ITEM_WIDTH, margin: 0.5 },
  gridImage: { width: '100%', height: '100%' },
  
  albumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0A0A0A',
    marginBottom: 1,
  },
  albumIconBox: {
    width: 36, height: 36, borderRadius: 8, 
    backgroundColor: '#222', justifyContent: 'center', 
    alignItems: 'center', marginRight: 12
  },
  albumHeaderText: { color: '#FFF', fontWeight: '600', flex: 1, fontSize: 15 },

  videoBadge: { 
    position: 'absolute', bottom: 8, right: 8, 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  durationText: { color: '#FFF', fontSize: 9, fontWeight: '900', marginLeft: 3 },

  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  iconCircle: { 
    width: 100, height: 100, borderRadius: 50, 
    backgroundColor: '#111', justifyContent: 'center', 
    alignItems: 'center', marginBottom: 24 
  },
  title: { color: '#FFF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  description: { 
    color: COLORS.subtitle, fontSize: 15, textAlign: 'center', 
    marginTop: 12, lineHeight: 22, marginBottom: 30 
  },
  actionBtn: { 
    backgroundColor: COLORS.primary, paddingVertical: 16, 
    paddingHorizontal: 35, borderRadius: 30, flexDirection: 'row', alignItems: 'center' 
  },
  actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  fixHint: { color: '#333', fontSize: 10, marginTop: 50, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  emptyContainer: { flex: 1, alignItems: 'center', marginTop: 100, padding: 20 },
  emptyText: { color: '#444', marginTop: 15, fontSize: 16, textAlign: 'center' },
  retryBtn: { marginTop: 20, padding: 10 },
  retryBtnText: { color: COLORS.secondary, fontWeight: 'bold' },

  cameraFab: {
     position: 'absolute', bottom: 40, right: 25,
     width: 70, height: 70, borderRadius: 35,
     backgroundColor: COLORS.primary, justifyContent: 'center',
     alignItems: 'center', zIndex: 1000, elevation: 10,
     shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 5 },
     shadowOpacity: 0.5, shadowRadius: 10
  },
  fabGlow: {
    ...StyleSheet.absoluteFillObject, borderRadius: 35,
    backgroundColor: COLORS.primary, opacity: 0.3,
    transform: [{ scale: 1.25 }], zIndex: -1
  }
});

export default CreateMainScreen;
