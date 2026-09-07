import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/src/theme/colors';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 4) / 3;

// 🎬 Live Video Preview Component (Runs safely using expo-video)
const LiveVideoPreview = React.memo(({ uri, contentFit }: { uri: string; contentFit: any }) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.muted = false;
    try {
      p.play();
    } catch (_) {}
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
      style={StyleSheet.absoluteFill}
      contentFit={contentFit}
      nativeControls={false}
    />
  );
});

interface GalleryAsset {
  id: string;
  uri: string;
  localUri?: string;
  mediaType: 'photo' | 'video';
  duration?: number;
  width?: number;
  height?: number;
}

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '0:15';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export default function CreateScreen() {
  const COLORS = useAppTheme();
  const router = useSafeRouter();

  // Mode Selection: 'post' | 'shots' | 'story'
  const [activeTab, setActiveTab] = useState<'post' | 'shots' | 'story'>('post');

  // Media Library Assets & Albums
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>('Recents');
  const [showAlbumModal, setShowAlbumModal] = useState<boolean>(false);

  // Selection State
  const [selectedAsset, setSelectedAsset] = useState<GalleryAsset | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<GalleryAsset[]>([]);
  const [isMultiSelect, setIsMultiSelect] = useState<boolean>(false);
  const [aspectRatioMode, setAspectRatioMode] = useState<'1:1' | '4:5' | 'original'>('1:1');

  // Loading & Permission States
  const [loading, setLoading] = useState<boolean>(true);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  // Check if asset is a video
  const isVideoAsset = useCallback((asset: GalleryAsset | null | undefined): boolean => {
    if (!asset) return false;
    if (asset.mediaType === 'video') return true;
    const u = String(asset.uri || asset.localUri || '').toLowerCase();
    return (
      u.endsWith('.mp4') ||
      u.endsWith('.mov') ||
      u.endsWith('.mkv') ||
      u.endsWith('.webm') ||
      u.endsWith('.3gp') ||
      u.includes('video')
    );
  }, []);

  const [resolvedVideoUri, setResolvedVideoUri] = useState<string>('');
  const isCurrentVideo = isVideoAsset(selectedAsset);

  useEffect(() => {
    if (!selectedAsset || !isCurrentVideo) {
      setResolvedVideoUri('');
      return;
    }

    const directUri = selectedAsset.localUri || selectedAsset.uri;
    setResolvedVideoUri(directUri);

    if (selectedAsset.id && !selectedAsset.id.startsWith('file://')) {
      MediaLibrary.getAssetInfoAsync(selectedAsset.id)
        .then(info => {
          if (info && (info.localUri || info.uri)) {
            setResolvedVideoUri(info.localUri || info.uri);
          }
        })
        .catch(() => {});
    }
  }, [selectedAsset, isCurrentVideo]);

  // 1. Load Media Grid from Device Storage
  const loadMediaGrid = useCallback(async (albumName = 'Recents') => {
    try {
      setLoading(true);

      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      if (status !== 'granted') {
        setPermissionGranted(false);
        setLoading(false);
        return false;
      }
      setPermissionGranted(true);

      // Fetch Albums list
      try {
        const fetchedAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
        if (fetchedAlbums && Array.isArray(fetchedAlbums)) {
          setAlbums(fetchedAlbums.filter(a => a.assetCount > 0));
        }
      } catch (_) {}

      // Query Assets
      let albumObj: any;
      if (albumName && albumName !== 'Recents') {
        albumObj = albums.find(a => a.title === albumName);
      }

      const mediaTypeOption =
        activeTab === 'shots'
          ? [MediaLibrary.MediaType.video]
          : [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video];

      const queryOptions: any = {
        first: 120,
        sortBy: MediaLibrary.SortBy.creationTime,
        mediaType: mediaTypeOption,
      };
      if (albumObj) {
        queryOptions.album = albumObj;
      }

      const res = await MediaLibrary.getAssetsAsync(queryOptions);
      let fetchedAssets: GalleryAsset[] = (res?.assets || []).map((a: any) => ({
        id: a.id || a.uri,
        uri: a.uri,
        localUri: a.uri,
        mediaType: a.mediaType === 'video' ? 'video' : 'photo',
        duration: a.duration || 0,
        width: a.width,
        height: a.height,
      }));

      // Fallback for shots: if empty, fetch all and filter video
      if (activeTab === 'shots' && fetchedAssets.length === 0) {
        const fallbackRes = await MediaLibrary.getAssetsAsync({
          first: 150,
          sortBy: MediaLibrary.SortBy.creationTime,
        });
        if (fallbackRes && fallbackRes.assets) {
          fetchedAssets = fallbackRes.assets
            .filter((a: any) => a.mediaType === 'video' || isVideoAsset(a))
            .map((a: any) => ({
              id: a.id || a.uri,
              uri: a.uri,
              localUri: a.uri,
              mediaType: 'video',
              duration: a.duration || 0,
              width: a.width,
              height: a.height,
            }));
        }
      }

      setAssets(fetchedAssets);
      if (fetchedAssets.length > 0) {
        setSelectedAsset(fetchedAssets[0]);
        setSelectedAssets([fetchedAssets[0]]);
      }
      setLoading(false);
      return true;
    } catch (_) {
      setLoading(false);
      return false;
    }
  }, [activeTab, albums, isVideoAsset]);

  // Initial load & Tab change listener
  useEffect(() => {
    loadMediaGrid(selectedAlbum);
  }, [activeTab]);

  // 2. Open System Gallery Picker
  const openDirectPicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: activeTab === 'shots' ? ['videos'] : ['images', 'videos'],
        allowsMultipleSelection: isMultiSelect,
        selectionLimit: 10,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newItems: GalleryAsset[] = result.assets.map((a, idx) => {
          const isVid = a.type === 'video' || (a.mimeType && a.mimeType.includes('video'));
          return {
            id: a.assetId || a.uri || String(Date.now() + idx),
            uri: a.uri,
            localUri: a.uri,
            mediaType: isVid ? 'video' : 'photo',
            duration: a.duration ? a.duration / 1000 : 15,
            width: a.width,
            height: a.height,
          };
        });

        setAssets(newItems);
        setSelectedAsset(newItems[0]);
        setSelectedAssets([newItems[0]]);
        setPermissionGranted(true);
        setShowAlbumModal(false);
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', err?.message || 'Could not open gallery');
    }
  };

  // 3. Open Camera Capture
  const openCamera = async () => {
    try {
      if (activeTab === 'story') {
        router.push('/create-story');
        return;
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'AnuFy requires camera access to capture moments.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: activeTab === 'shots' ? ['videos'] : ['images', 'videos'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const isVid = asset.type === 'video' || (asset.mimeType && asset.mimeType.includes('video'));

        if (activeTab === 'shots' || isVid) {
          router.push({
            pathname: '/post-editor',
            params: {
              mediaUri: asset.uri,
              mediaType: 'video',
              postType: 'shots',
              isReel: 'true',
            },
          } as any);
        } else {
          router.push({
            pathname: '/post-editor',
            params: {
              mediaUri: asset.uri,
              mediaType: 'image',
              postType: 'post',
            },
          } as any);
        }
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Could not launch camera');
    }
  };

  // 4. Handle Asset Tap on Grid
  const handleSelectAsset = useCallback((asset: GalleryAsset) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAsset(asset);

    if (isMultiSelect && activeTab !== 'shots') {
      const existsIndex = selectedAssets.findIndex(a => a.id === asset.id || a.uri === asset.uri);
      if (existsIndex > -1) {
        if (selectedAssets.length === 1) return;
        const updated = selectedAssets.filter(a => a.id !== asset.id && a.uri !== asset.uri);
        setSelectedAssets(updated);
        setSelectedAsset(updated[updated.length - 1]);
      } else {
        if (selectedAssets.length >= 10) {
          Alert.alert('Limit Reached', 'You can select up to 10 photos or videos.');
          return;
        }
        setSelectedAssets(prev => [...prev, asset]);
      }
    } else {
      setSelectedAssets([asset]);
    }
  }, [isMultiSelect, activeTab, selectedAssets]);

  // 5. Proceed to Post Editor or Story Screen
  const handleProceedNext = async () => {
    if (!selectedAsset) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let finalUri = selectedAsset.localUri || selectedAsset.uri;
      const isVid = isVideoAsset(selectedAsset);

      // Attempt resolving local file path if MediaLibrary asset
      if (selectedAsset.id && !selectedAsset.id.startsWith('file://')) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(selectedAsset.id);
          if (info && (info.localUri || info.uri)) {
            finalUri = info.localUri || info.uri;
          }
        } catch (_) {}
      }

      if (activeTab === 'story') {
        router.push({
          pathname: '/create-story',
          params: {
            mediaUrl: finalUri,
            mediaType: isVid ? 'video' : 'image',
          },
        } as any);
      } else if (activeTab === 'shots' || isVid) {
        router.push({
          pathname: '/post-editor',
          params: {
            mediaUri: finalUri,
            mediaType: 'video',
            postType: activeTab === 'shots' ? 'shots' : 'post',
            isReel: activeTab === 'shots' ? 'true' : 'false',
          },
        } as any);
      } else {
        const mediaList = selectedAssets.map(a => a.localUri || a.uri);
        router.push({
          pathname: '/post-editor',
          params: {
            mediaUri: finalUri,
            mediaUrls: JSON.stringify(mediaList),
            mediaType: 'image',
            postType: 'post',
            aspectRatio: aspectRatioMode,
          },
        } as any);
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not prepare selected media: ' + (e.message || ''));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── TOP HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.albumDropdownBtn}
          onPress={() => setShowAlbumModal(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.albumDropdownText} numberOfLines={1}>
            {selectedAlbum}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#FFF" style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextBtn, !selectedAsset && { opacity: 0.4 }]}
          onPress={handleProceedNext}
          disabled={!selectedAsset}
          activeOpacity={0.8}
        >
          <Text style={styles.nextBtnText}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      {/* ── TOP 50% LIVE PREVIEW BOX ── */}
      <View style={styles.previewContainer}>
        {selectedAsset ? (
          isCurrentVideo && resolvedVideoUri ? (
            <View style={styles.previewMediaWrapper}>
              <LiveVideoPreview
                key={resolvedVideoUri}
                uri={resolvedVideoUri}
                contentFit={aspectRatioMode === 'original' ? 'contain' : 'cover'}
              />
            </View>
          ) : (
            <View style={styles.previewMediaWrapper}>
              <Image
                source={{ uri: selectedAsset.uri }}
                style={styles.previewMedia}
                contentFit={aspectRatioMode === 'original' ? 'contain' : 'cover'}
                transition={120}
                cachePolicy="memory-disk"
              />
            </View>
          )
        ) : (
          <TouchableOpacity style={styles.emptyPreviewBox} onPress={openDirectPicker} activeOpacity={0.8}>
            <Ionicons name="image-outline" size={56} color="#64748B" />
            <Text style={styles.emptyPreviewTitle}>No Media Selected</Text>
            <View style={styles.openPickerBtn}>
              <Ionicons name="folder-open-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.openPickerBtnText}>Browse Device Gallery</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Aspect Ratio Toggle (Bottom Left) */}
        {!!selectedAsset && !isCurrentVideo && (
          <TouchableOpacity
            style={styles.aspectRatioBtn}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAspectRatioMode(prev => (prev === '1:1' ? '4:5' : prev === '4:5' ? 'original' : '1:1'));
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name={
                aspectRatioMode === '1:1'
                  ? 'crop-square'
                  : aspectRatioMode === '4:5'
                  ? 'crop-portrait'
                  : 'crop-free'
              }
              size={18}
              color="#FFF"
            />
            <Text style={styles.aspectRatioText}>{aspectRatioMode}</Text>
          </TouchableOpacity>
        )}

        {/* Multi-Select & Camera Shortcuts (Bottom Right) */}
        <View style={styles.previewControlsRight}>
          {activeTab !== 'shots' && (
            <TouchableOpacity
              style={[styles.controlIconBtn, isMultiSelect && styles.controlIconBtnActive]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsMultiSelect(!isMultiSelect);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="copy-outline" size={18} color="#FFF" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.controlIconBtn} onPress={openCamera} activeOpacity={0.8}>
            <Ionicons name="camera-outline" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── BOTTOM 50% GALLERY GRID ── */}
      <View style={styles.gridContainer}>
        {loading && !assets.length ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 13 }}>Loading media...</Text>
          </View>
        ) : (!permissionGranted || assets.length === 0) ? (
          <View style={styles.emptyGridContainer}>
            <Ionicons name="images-outline" size={48} color="#64748B" />
            <Text style={styles.emptyGridText}>Gallery access is restricted</Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={openDirectPicker}>
              <Text style={styles.permissionBtnText}>Open Gallery Picker</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(item) => item.id || item.uri}
            numColumns={3}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 64 }}
            renderItem={({ item }) => {
              const selectedIdx = selectedAssets.findIndex(
                a => a.id === item.id || a.uri === item.uri
              );
              const isSelected = selectedIdx > -1;
              const isVid = isVideoAsset(item);

              return (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.gridCell, isSelected && styles.gridCellSelected]}
                  onPress={() => handleSelectAsset(item)}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.gridImage}
                    contentFit="cover"
                    cachePolicy="disk"
                  />

                  {isMultiSelect && (
                    <View style={[styles.selectBadge, isSelected && styles.selectBadgeActive]}>
                      {isSelected ? (
                        <Text style={styles.selectBadgeText}>{selectedIdx + 1}</Text>
                      ) : null}
                    </View>
                  )}

                  {isVid && (
                    <View style={styles.videoDurationBadge}>
                      <Ionicons name="play" size={10} color="#FFF" style={{ marginRight: 2 }} />
                      <Text style={styles.videoDurationText}>{formatDuration(item.duration)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {/* ── BOTTOM MODE SELECTOR (POST | SHOTS | STORY) ── */}
      <View style={styles.modeTabBar}>
        <TouchableOpacity
          style={[styles.modeTabBtn, activeTab === 'post' && styles.modeTabBtnActive]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('post');
          }}
        >
          <Text style={[styles.modeTabText, activeTab === 'post' && styles.modeTabTextActive]}>
            POST
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTabBtn, activeTab === 'shots' && styles.modeTabBtnActive]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('shots');
            setIsMultiSelect(false);
          }}
        >
          <Text style={[styles.modeTabText, activeTab === 'shots' && styles.modeTabTextActive]}>
            SHOTS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTabBtn, activeTab === 'story' && styles.modeTabBtnActive]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('story');
            setIsMultiSelect(false);
          }}
        >
          <Text style={[styles.modeTabText, activeTab === 'story' && styles.modeTabTextActive]}>
            STORY
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── ALBUMS MODAL ── */}
      <Modal visible={showAlbumModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowAlbumModal(false)}>
          <View style={styles.albumModalContent}>
            <Text style={styles.albumModalHeader}>Select Media Folder</Text>

            <TouchableOpacity
              style={[styles.albumRow, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: 10, paddingHorizontal: 12 }]}
              onPress={openDirectPicker}
            >
              <Ionicons name="images" size={24} color="#3B82F6" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.albumRowText, { color: '#3B82F6', fontWeight: '700' }]}>
                  Open Device Gallery
                </Text>
                <Text style={styles.albumSubText}>Select photos & videos directly</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.albumRow, selectedAlbum === 'Recents' && styles.albumRowActive]}
              onPress={() => {
                setSelectedAlbum('Recents');
                setShowAlbumModal(false);
                loadMediaGrid('Recents');
              }}
            >
              <Ionicons name="folder-outline" size={22} color="#FFF" />
              <Text style={styles.albumRowText}>Recents (All Media)</Text>
            </TouchableOpacity>

            {albums.map(album => (
              <TouchableOpacity
                key={album.id}
                style={[styles.albumRow, selectedAlbum === album.title && styles.albumRowActive]}
                onPress={() => {
                  setSelectedAlbum(album.title);
                  setShowAlbumModal(false);
                  loadMediaGrid(album.title);
                }}
              >
                <Ionicons name="folder-outline" size={22} color="#FFF" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.albumRowText}>{album.title}</Text>
                  <Text style={styles.albumSubText}>{album.assetCount} items</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 52,
    backgroundColor: '#000000',
    borderBottomWidth: 0.5,
    borderBottomColor: '#222',
  },
  headerIconBtn: {
    padding: 4,
  },
  albumDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: SCREEN_WIDTH * 0.45,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
  },
  albumDropdownText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  previewContainer: {
    width: '100%',
    height: SCREEN_WIDTH,
    backgroundColor: '#121212',
    position: 'relative',
    overflow: 'hidden',
  },
  previewMediaWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  previewMedia: {
    width: '100%',
    height: '100%',
    backgroundColor: '#121212',
  },
  videoPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  videoPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  videoDurationBadgeTop: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  videoDurationTextTop: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyPreviewBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyPreviewTitle: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
  openPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  openPickerBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  aspectRatioBtn: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 4,
  },
  aspectRatioText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  previewControlsRight: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  controlIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlIconBtnActive: {
    backgroundColor: '#3B82F6',
  },
  gridContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  gridCell: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    margin: 0.65,
    position: 'relative',
    backgroundColor: '#1E1E1E',
  },
  gridCellSelected: {
    opacity: 0.65,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  selectBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectBadgeActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  selectBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyGridContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyGridText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
  permissionBtn: {
    marginTop: 16,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permissionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modeTabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 48,
    backgroundColor: '#000000',
    borderTopWidth: 0.5,
    borderTopColor: '#222',
  },
  modeTabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  modeTabBtnActive: {
    backgroundColor: '#1E1E1E',
  },
  modeTabText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  modeTabTextActive: {
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  albumModalContent: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
    gap: 12,
  },
  albumModalHeader: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#27272A',
  },
  albumRowActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  albumRowText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
  },
  albumSubText: {
    color: '#A1A1AA',
    fontSize: 12,
    marginTop: 2,
  },
});
