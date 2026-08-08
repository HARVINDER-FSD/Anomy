import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, StatusBar, Dimensions, FlatList, Alert, Text, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

interface MediaViewerVideoItemProps {
  uri: string;
  style: any;
}

const MediaViewerVideoItem = ({ uri, style }: MediaViewerVideoItemProps) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.play();
  });
  
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="contain"
      nativeControls={true}
    />
  );
};

const { width, height } = Dimensions.get('window');

export default function MediaViewerScreen() {
  const params = useLocalSearchParams();
  const router = useSafeRouter();
  
  // Support single 'url' or multiple 'urls' (comma separated)
  const mediaUrls = useMemo(() => {
    if (params.urls) return (params.urls as string).split(',');
    if (params.url) return [params.url as string];
    return [];
  }, [params.urls, params.url]);

  const mediaTypes = useMemo(() => {
    if (params.types) return (params.types as string).split(',');
    return [];
  }, [params.types]);

  const [currentIndex, setCurrentIndex] = useState(parseInt(params.initialIndex as string || '0', 10));
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    const url = mediaUrls[currentIndex];
    if (!url) return;

    setDownloading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need permission to save photos to your library.');
        return;
      }

      const filename = url.split('/').pop() || 'image.jpg';
      const fileUri = ((FileSystem as any).documentDirectory || '') + filename;

      const downloadRes = await FileSystem.downloadAsync(url, fileUri);
      
      if (downloadRes.status === 200) {
        await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
        Alert.alert('Success', 'Image saved to gallery!');
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to download image.');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    const url = mediaUrls[currentIndex];
    if (!url) return;

    try {
      const filename = url.split('/').pop() || 'image.jpg';
      const fileUri = ((FileSystem as any).cacheDirectory || '') + filename;
      const downloadRes = await FileSystem.downloadAsync(url, fileUri);
      
      if (downloadRes.status === 200) {
        await Sharing.shareAsync(downloadRes.uri);
      }
    } catch (error) {
    }
  };

  const renderItem = ({ item: url, index }: { item: string; index: number }) => {
    const mediaType = mediaTypes[index] || params.type;
    const isVideo = url.endsWith('.mp4') || url.endsWith('.mov') || url.includes('/video/upload/') || mediaType === 'video';

    return (
      <View style={styles.mediaWrapper}>
        {isVideo ? (
          <MediaViewerVideoItem
            uri={url}
            style={styles.media}
          />
        ) : (
          <Image 
            source={{ uri: url }} 
            style={styles.media} 
            resizeMode="contain" 
          />
        )}
      </View>
    );
  };

  const onScroll = useCallback((event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <SafeAreaView style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={28} color={COLORS.white} />
        </TouchableOpacity>
        
        {mediaUrls.length > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{currentIndex + 1} / {mediaUrls.length}</Text>
          </View>
        )}
      </SafeAreaView>

      <FlatList
        data={mediaUrls}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item}-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialScrollIndex={currentIndex}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        style={styles.list}
      />

      <SafeAreaView edges={['bottom']} style={styles.footer}>
         <TouchableOpacity 
           style={[styles.actionBtn, downloading && { opacity: 0.5 }]} 
           onPress={handleDownload}
           disabled={downloading}
         >
            <Ionicons name="download-outline" size={24} color={COLORS.white} />
         </TouchableOpacity>
         <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={24} color={COLORS.white} />
         </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 0 : 40,
  },
  backBtn: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  countText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  mediaWrapper: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: width,
    height: height,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 30,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  actionBtn: {
    marginHorizontal: 20,
    padding: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 30,
  }
});
