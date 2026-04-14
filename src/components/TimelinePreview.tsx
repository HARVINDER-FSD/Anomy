import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions, Text, Image, TouchableOpacity, PanResponder, Animated } from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useEditorStore, EditorLayer } from '../store/editorStore';
import { COLORS } from '../theme/colors';

const { width, height } = Dimensions.get('window');
const canvasHeight = height * 0.65;

/**
 * 🎬 ANUFY TIKTOK-PRO PREVIEW ENGINE (REDESIGNED)
 * Handles sequential clips and normalized coordinate rendering.
 */
export const TimelinePreview: React.FC = () => {
  const { 
    layers, currentTime, isPlaying, totalDuration, 
    setCurrentTime, setPlaying, selectedLayerId, removeLayer, clips, activeFilter, activeMusic, isMuted 
  } = useEditorStore();
  
  const mainVideoRef = useRef<Video>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // 🎵 SYNC MUSIC PLAYBACK (v2.0 - HARDENED)
  useEffect(() => {
    let soundObj: Audio.Sound | null = null;
    
    async function loadMusic() {
      if (!activeMusic?.url) return;
      
      console.log('[AudioSync] Loading Pro Soundtrack:', activeMusic.url);
      try {
        if (soundObject.current) {
          await soundObject.current.unloadAsync();
        }
        
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: activeMusic.url },
          { shouldPlay: isPlaying, volume: activeMusic.volume || 1.0, isMuted: false }
        );
        
        soundObject.current = newSound;
        setSound(newSound);
        console.log('[AudioSync] Music Ready to Play');
      } catch (e) {
        console.error('[AudioSync] CRITICAL LOAD FAILURE:', e);
      }
    }

    loadMusic();

    return () => {
      if (soundObject.current) {
        soundObject.current.unloadAsync();
      }
    };
  }, [activeMusic?.url]);

  const soundObject = useRef<Audio.Sound | null>(null);

  // Handle Play/Pause sync for existing music
  useEffect(() => {
    if (sound) {
      if (isPlaying) {
        // 🚀 SYNC START POSITION
        const seekPos = (activeMusic?.trimStart || 0) + currentTime;
        sound.setPositionAsync(seekPos);
        sound.playAsync();
      } else {
        sound.pauseAsync();
      }
    }
  }, [isPlaying, sound, activeMusic?.trimStart]);

  // Handle seeking during pause
  useEffect(() => {
    if (sound && !isPlaying) {
      const seekPos = (activeMusic?.trimStart || 0) + currentTime;
      sound.setPositionAsync(seekPos);
    }
  }, [currentTime, isPlaying, sound, activeMusic?.trimStart]);

  // 1. Calculate which clip is currently active based on currentTime
  const activeClip = clips.find(c => 
    currentTime >= c.startTime && currentTime < (c.startTime + c.duration)
  );

  // 2. Filter ONLY layers active at this millisecond
  const activeLayers = layers.filter(
    (l) => currentTime >= l.startTime && currentTime <= l.endTime
  ).sort((a, b) => a.zIndex - b.zIndex);

  // ⏱️ NATIVE SYNC CLOCK (v2.0 - 60FPS)
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded && status.isPlaying && !status.isBuffering && activeClip) {
      // 🚀 THE SMOOTHNESS KEY:
      // Calculate relative position based on the trimmed clip
      const relativeTime = (status.positionMillis - activeClip.trimStart) / activeClip.speed;
      const timelineTime = activeClip.startTime + relativeTime;
      
      if (Math.abs(timelineTime - currentTime) > 300) {
        setCurrentTime(timelineTime);
      }
      
      // Check if we reached the end of the trimmed clip
      if (status.positionMillis >= activeClip.trimEnd - 100) {
         setPlaying(false);
         setCurrentTime(0);
         mainVideoRef.current?.setPositionAsync(activeClip.trimStart);
      }
    }
  };
   
  // Ensure the video plays for FULL duration
  useEffect(() => {
    if (mainVideoRef.current && totalDuration > 0 && activeClip) {
       if (isPlaying) {
         mainVideoRef.current.playAsync();
       } else {
         mainVideoRef.current.pauseAsync();
         // Sync position during seeking
         const seekPos = activeClip.trimStart + (currentTime - activeClip.startTime) * activeClip.speed;
         mainVideoRef.current.setPositionAsync(seekPos);
       }
    }
  }, [isPlaying, currentTime, activeClip?.id]);

  return (
    <View style={styles.container}>
      {/* 📹 NATIVE VIDEO PLAYER (CLIP SEQUENCE) */}
      {activeClip && totalDuration > 0 && (
        <Video
          ref={mainVideoRef}
          style={StyleSheet.absoluteFill}
          source={{ uri: activeClip.uri }}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isPlaying}
          isMuted={isMuted} // 🚀 FIXED: Video now respects the master mute switch
          rate={activeClip.speed}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          // 🚀 ONLY USE POSITION DURING SEEKING (NOT PLAYBACK) - THIS FIXES THE STUTTER (ATAK-ING)
          {...(!isPlaying ? { positionMillis: activeClip.trimStart + (currentTime - activeClip.startTime) * activeClip.speed } : {})}
        />
      )}

      {/* 🎨 NATIVE VISUAL FILTERS (REAL-TIME OVERLAY) */}
      <View style={[StyleSheet.absoluteFill, styles.activeFilter, { 
          backgroundColor: activeFilter === 1 ? 'rgba(255,200,0,0.1)' : // Warm/Vintage
                           activeFilter === 2 ? 'rgba(0,0,0,0.4)' :      // B&W (Desaturate simulated)
                           activeFilter === 3 ? 'rgba(0,100,255,0.1)' : // Cool/Vivid
                           'transparent' 
      }]} pointerEvents="none" />

      {/* 🎭 NORMALIZED OVERLAY LAYERS */}
      <View style={StyleSheet.absoluteFill}>
        {activeLayers.map((layer) => (
          <NormalizedLayer key={layer.id} layer={layer} canvasW={width || 1} canvasH={canvasHeight || 1} />
        ))}
      </View>
      
      {/* 🗑️ TOP TRASH ICON (Selected Layer only) */}
      {selectedLayerId && (
        <TouchableOpacity 
          style={styles.deleteBtn} 
          onPress={() => removeLayer(selectedLayerId)}
        >
          <Ionicons name="trash-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const NormalizedLayer: React.FC<{ layer: EditorLayer, canvasW: number, canvasH: number }> = ({ layer, canvasW, canvasH }) => {
  const { selectLayer, selectedLayerId, updateLayer } = useEditorStore();
  const isSelected = selectedLayerId === layer.id;
  
  // 🚀 USE STABLE ANIMATED CORE (Same as Story Editor)
  const pan = useRef(new Animated.ValueXY({ 
    x: (layer.x || 0.5) * canvasW, 
    y: (layer.y || 0.5) * canvasH 
  })).current;
  const scale = useRef(new Animated.Value(layer.scale || 1.5)).current;
  const rotate = useRef(new Animated.Value(layer.rotation || 0)).current;

  // Sync when store changes
  useEffect(() => {
    pan.setValue({ x: (layer.x || 0.5) * canvasW, y: (layer.y || 0.5) * canvasH });
    scale.setValue(layer.scale || 1.5);
    rotate.setValue(layer.rotation || 0);
  }, [layer.x, layer.y, layer.scale, layer.rotation]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        selectLayer(layer.id);
        pan.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const finalX = (pan.x as any)._value / canvasW;
        const finalY = (pan.y as any)._value / canvasH;
        updateLayer(layer.id, { x: finalX, y: finalY });
      }
    })
  ).current;

  return (
    <Animated.View
       {...panResponder.panHandlers}
       style={[
         styles.layerWrapper,
         {
           transform: [
             { translateX: Animated.subtract(pan.x, 100) }, // Half of 200 width
             { translateY: Animated.subtract(pan.y, 50) },  // Half of 100 height
             { scale: scale },
             { rotate: rotate.interpolate({
                 inputRange: [-360, 360],
                 outputRange: ['-360deg', '360deg']
               }) 
             }
           ],
           zIndex: layer.zIndex || 100
         }
       ]}
    >
      {layer.type === 'text' && (
        <View style={styles.textCapsule}>
          <Text style={[styles.layerText, { color: layer.color || '#FFF', fontSize: (layer.fontSize || 28) }]}>
            {layer.content || '...'}
          </Text>
        </View>
      )}
      {layer.type === 'sticker' && layer.uri && (
         <Image source={{ uri: layer.uri }} style={styles.stickerImage} resizeMode="contain" />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  activeFilter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  deleteBtn: { position: 'absolute', top: 55, right: 80, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,59,48,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  textCapsule: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  layerText: { fontWeight: '900', fontSize: 28, textAlign: 'center' },
  layerWrapper: { position: 'absolute', width: 200, height: 100, justifyContent: 'center', alignItems: 'center' },
  stickerImage: { width: 120, height: 120 },
});
