import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, StatusBar, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';

const { width, height } = Dimensions.get('window');

export default function MediaViewerScreen() {
  const { url, type } = useLocalSearchParams();
  const router = useRouter();
  const isVideo = type === 'video' || (typeof url === 'string' && (url.endsWith('.mp4') || url.endsWith('.mov')));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={30} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.mediaContainer}>
        {isVideo ? (
          <Video
            source={{ uri: url as string }}
            rate={1.0}
            volume={1.0}
            isMuted={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            useNativeControls
            style={styles.media}
          />
        ) : (
          <Image 
            source={{ uri: url as string }} 
            style={styles.media} 
            resizeMode="contain" 
          />
        )}
      </View>

      <View style={styles.footer}>
         <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="download-outline" size={24} color={COLORS.white} />
         </TouchableOpacity>
         <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="share-social-outline" size={24} color={COLORS.white} />
         </TouchableOpacity>
      </View>
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
    top: 50,
    left: 20,
    zIndex: 10,
  },
  backBtn: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 25,
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: width,
    height: height * 0.8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  actionBtn: {
    marginHorizontal: 20,
    padding: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 30,
  }
});
