import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ScrollView, Alert, Dimensions, Image, TextInput, ActivityIndicator, Vibration, PanResponder } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEditorStore } from '../../src/store/editorStore';
import { TimelinePreview } from '../../src/components/TimelinePreview';
import { ExporterService } from '../../src/services/ExporterService';
import { COLORS } from '../../src/theme/colors';

const { width, height } = Dimensions.get('window');

/**
 * 🎥 ANUFY TIKTOK-PRO EDITOR (REDESIGNED)
 * Follows the 70/10/20 Layout architecture.
 */
const TikTokEditorScreen = () => {
  const router = useRouter();
  const { 
     clips, layers, addClip, addLayer, setPlaying, setCurrentTime, isPlaying, totalDuration, 
     setActiveFilter, setMusic, currentTime, selectLayer, updateLayer, selectedLayerId, activeFilter, activeMusic,
     isMuted, setIsMuted, updateClip, updateMusicTrim 
  } = useEditorStore();
  
  const [showStickers, setShowStickers] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showTrim, setShowTrim] = useState(false);
  const [showMusicTrim, setShowMusicTrim] = useState(false);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [musicList, setMusicList] = useState<any[]>([]);
  const [musicQuery, setMusicQuery] = useState('');
  const [isLoadingMusic, setIsLoadingMusic] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const MIN_TRIM_DURATION = 5000; // 5 seconds minimum

  // 🛡️ REFS FOR RESPONDERS (Prevents closure staleness)
  const clipsRef = useRef(clips);
  const originalDurationRef = useRef(originalDuration);
  const totalDurationRef = useRef(totalDuration);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { originalDurationRef.current = originalDuration; }, [originalDuration]);
  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);

  useEffect(() => {
    if (showTrim && clips[0] && originalDuration === 0) {
      // Use the actual full duration of the video file for trimming
      setOriginalDuration(clips[0].fullDuration);
    }
    if (!showTrim) {
      setOriginalDuration(0); // Reset when leaving
    }
  }, [showTrim, clips, originalDuration]);

  const activeMusicRef = useRef(activeMusic);
  useEffect(() => { activeMusicRef.current = activeMusic; }, [activeMusic]);

  const musicDurationRef = useRef(30000);
  useEffect(() => {
    if (activeMusic?.duration) {
      musicDurationRef.current = activeMusic.duration;
    }
  }, [activeMusic?.duration]);

  const startMusicTrimResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setPlaying(false);
        Vibration.vibrate(10);
      },
      onPanResponderMove: (evt, gestureState) => {
        const screenWidth = Dimensions.get('window').width;
        const scrubberWidth = screenWidth - 40;
        const touchX = evt.nativeEvent.pageX;
        const newProgress = Math.max(0, Math.min(1, (touchX - 20) / scrubberWidth));
        
        const music = activeMusicRef.current;
        if (music) {
          const newTime = newProgress * musicDurationRef.current;
          if (newTime < music.trimEnd - 2000) {
            updateMusicTrim({ trimStart: newTime });
            // 🚀 SYNC PREVIEW TO MUSIC START
            setCurrentTime(0);
          }
        }
      }
    })
  ).current;

  const endMusicTrimResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setPlaying(false);
        Vibration.vibrate(10);
      },
      onPanResponderMove: (evt, gestureState) => {
        const screenWidth = Dimensions.get('window').width;
        const scrubberWidth = screenWidth - 40;
        const touchX = evt.nativeEvent.pageX;
        const newProgress = Math.max(0, Math.min(1, (touchX - 20) / scrubberWidth));
        
        const music = activeMusicRef.current;
        if (music) {
          const newTime = newProgress * musicDurationRef.current;
          if (newTime > music.trimStart + 2000) {
            updateMusicTrim({ trimEnd: newTime });
          }
        }
      }
    })
  ).current;

  const startTrimResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setPlaying(false);
        Vibration.vibrate(10);
      },
      onPanResponderMove: (evt, gestureState) => {
        const screenWidth = Dimensions.get('window').width;
        const scrubberWidth = screenWidth - 40; 
        const touchX = evt.nativeEvent.pageX;
        const newProgress = Math.max(0, Math.min(1, (touchX - 20) / scrubberWidth));
        
        const clip = clipsRef.current[0];
        const baseDuration = originalDurationRef.current;

        if (clip && baseDuration > 0) {
          const newTime = newProgress * baseDuration;
          if (newTime < clip.trimEnd - MIN_TRIM_DURATION) {
            updateClip(clip.id, { trimStart: newTime });
            // 🚀 SYNC PREVIEW TO TRIM START
            setCurrentTime(0); 
          } else {
            Vibration.vibrate(1); 
          }
        }
      }
    })
  ).current;

  const endTrimResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setPlaying(false);
        Vibration.vibrate(10);
      },
      onPanResponderMove: (evt, gestureState) => {
        const screenWidth = Dimensions.get('window').width;
        const scrubberWidth = screenWidth - 40;
        const touchX = evt.nativeEvent.pageX;
        const newProgress = Math.max(0, Math.min(1, (touchX - 20) / scrubberWidth));
        
        const clip = clipsRef.current[0];
        const baseDuration = originalDurationRef.current;

        if (clip && baseDuration > 0) {
          const newTime = newProgress * baseDuration;
          if (newTime > clip.trimStart + MIN_TRIM_DURATION) {
            updateClip(clip.id, { trimEnd: newTime });
            // 🚀 SYNC PREVIEW TO TRIM END
            const relativeEndTime = (newTime - clip.trimStart) / clip.speed;
            setCurrentTime(relativeEndTime - 100); 
          } else {
            Vibration.vibrate(1); 
          }
        }
      }
    })
  ).current;

  const STICKER_LIST = [
    'https://cdn-icons-png.flaticon.com/128/742/742751.png',
    'https://cdn-icons-png.flaticon.com/128/742/742752.png',
    'https://cdn-icons-png.flaticon.com/128/742/742753.png',
    'https://cdn-icons-png.flaticon.com/128/927/927567.png',
    'https://cdn-icons-png.flaticon.com/128/927/927561.png',
    'https://cdn-icons-png.flaticon.com/128/927/927546.png',
    'https://cdn-icons-png.flaticon.com/128/1312/1312217.png',
    'https://cdn-icons-png.flaticon.com/128/1312/1312212.png',
  ];

  // 🎵 STORY-LEVEL MUSIC ENGINE (iTunes Search)
  const searchMusic = async (q: string) => {
    if (!q) return;
    setIsLoadingMusic(true);
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=20`);
      const data = await res.json();
      setMusicList(data.results || []);
    } catch (e) {
      console.error('Music search failed', e);
    } finally {
      setIsLoadingMusic(false);
    }
  };

  useEffect(() => {
    if (musicQuery.length > 2) {
      const delay = setTimeout(() => searchMusic(musicQuery), 500);
      return () => clearTimeout(delay);
    }
  }, [musicQuery]);

  // --- HANDLERS ---
  const handleAddText = () => {
    const id = Math.random().toString(36).substr(2, 9);
    addLayer({
      id: id,
      type: 'text',
      content: '',
      startTime: currentTime,
      endTime: totalDuration,
      x: 0.5, y: 0.4, scale: 1.5, rotation: 0,
      background: 'rgba(0,0,0,0.5)',
      color: '#FFF'
    });
    setEditingTextId(id);
  };

  const onAddSticker = (url: string) => {
    addLayer({
      type: 'sticker',
      uri: url,
      startTime: currentTime,
      endTime: totalDuration,
      x: 0.5, y: 0.5, scale: 1.4, rotation: 0
    });
    setShowStickers(false);
  };

  const onAddMusic = (url: string) => {
    console.log('[MusicSelect] Tapped Preview URL:', url);
    if (!url) {
      Alert.alert('Selection Error', 'This track preview is currently unavailable.');
      return;
    }
    setMusic({ url, volume: 1.0 });
    Vibration.vibrate(10); 
    setShowMusic(false);
    Alert.alert('Soundtrack Locked', '30-second preview added to your track!');
  };

  const cycleFilter = () => {
     setActiveFilter((activeFilter + 1) % 4);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
     if (clips.length === 0) return;
     
     setIsExporting(true);
     try {
       // 🚀 Start Export (Hybrid: calls server-side FFmpeg if possible)
       const finalUri = await ExporterService.startExport();
       
       if (!finalUri) {
         Alert.alert("Export Failed", "Could not process video. Please try again.");
         return;
       }

       // 🚀 Navigate to create screen with the final rendered video
       router.push({
         pathname: '/post-editor',
         params: { 
           mediaUri: finalUri,
           mediaType: 'video',
           // We pass these for metadata/fallback, but finalUri is already rendered
           trimStart: Math.floor(clips[0].trimStart).toString(),
           trimEnd: Math.floor(clips[0].trimEnd).toString(),
           isMuted: isMuted ? 'true' : 'false',
           musicUrl: activeMusic?.url || '',
           musicTrimStart: activeMusic?.trimStart?.toString() || '0',
           musicVolume: activeMusic?.volume?.toString() || '1'
         }
       } as any);
     } catch (e) {
       console.error("[Editor] Export error:", e);
       Alert.alert("Error", "Failed to export video.");
     } finally {
       setIsExporting(false);
     }
  };

  // --- RENDERING ---
  const scrubberPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setPlaying(false);
      },
      onPanResponderMove: (evt: any, gestureState: any) => {
        const screenWidth = Dimensions.get('window').width;
        const scrubberWidth = screenWidth - 40; // Accounting for 20px padding on each side
        const horizontalTouch = evt.nativeEvent.locationX;
        const newProgress = Math.max(0, Math.min(1, horizontalTouch / scrubberWidth));
        setCurrentTime(newProgress * totalDuration);
      },
      onPanResponderRelease: (evt: any) => {
        const screenWidth = Dimensions.get('window').width;
        const scrubberWidth = screenWidth - 40;
        const horizontalTouch = evt.nativeEvent.locationX;
        const newProgress = Math.max(0, Math.min(1, horizontalTouch / scrubberWidth));
        setCurrentTime(newProgress * totalDuration);
      }
    })
  ).current;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* 🛡️ DISABLE SWIPE-TO-GO-BACK (Prevents accidental exit during dragging) */}
      <Stack.Screen options={{ 
        gestureEnabled: false,
        headerShown: false,
        animation: 'fade'
      }} />

      {/* 🎬 1. TOP: VIDEO PREVIEW (70%) - IMMERSIVE CANVAS */}
      <View style={styles.previewSection}>
        <TimelinePreview />
        
        {/* 🛠️ QUICK VERTICAL TOOLS (RIGHT SIDE) */}
        <View style={styles.verticalToolbar}>
           <ToolIcon icon="format-text" label="Text" onPress={handleAddText} type="MCI" />
           <ToolIcon icon="sticker-emoji" label="Stickers" onPress={() => setShowStickers(true)} type="MCI" />
           <ToolIcon icon="color-filter-outline" label="Filters" onPress={cycleFilter} type="ION" />
           <ToolIcon icon="musical-notes-outline" label="Music" onPress={() => setShowMusic(true)} type="ION" />
           <ToolIcon icon="flash-outline" label="Effects" onPress={() => {}} type="ION" />
        </View>

        {/* ❌ CLOSE BUTTON */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>

        {/* ⌨️ FULL-SCREEN TEXT EDITOR (INSTAGRAM-STYLE) */}
        {editingTextId && (
          <View style={styles.textEditorModal}>
             <TouchableOpacity style={styles.modalDone} onPress={() => setEditingTextId(null)}>
                <Text style={styles.modalDoneText}>Done</Text>
             </TouchableOpacity>
             <View style={styles.inputWrapper}>
                <TextInput
                  autoFocus
                  multiline
                  style={styles.modalInput}
                  placeholder="Type here..."
                  placeholderTextColor="#999"
                  value={layers.find(l => l.id === editingTextId)?.content || ''}
                  onChangeText={(val) => updateLayer(editingTextId, { content: val })}
                />
             </View>
          </View>
        )}

        {/* 🎭 STICKER PICKER DRAWER */}
        {showStickers && (
          <View style={styles.proDrawer}>
             <View style={styles.drawerHandle} />
             <Text style={styles.drawerTitle}>PICK A STICKER</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerRow}>
                {STICKER_LIST.map((url, i) => (
                   <TouchableOpacity key={i} onPress={() => onAddSticker(url)} style={styles.stickerCircle}>
                      <Image source={{ uri: url }} style={{ width: 60, height: 60 }} resizeMode="contain" />
                   </TouchableOpacity>
                ))}
             </ScrollView>
             <TouchableOpacity style={styles.cancelLink} onPress={() => setShowStickers(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
             </TouchableOpacity>
          </View>
        )}

        {/* 🎵 MUSIC PICKER DRAWER */}
        {showMusic && (
          <View style={styles.proDrawer}>
             <View style={styles.drawerHandle} />
             <Text style={styles.drawerTitle}>ADD 30s PREVIEW</Text>
             
             {/* 🎤 SEARCH INPUT */}
             <TextInput 
               style={styles.searchBar}
               placeholder="Search songs..."
               placeholderTextColor="#999"
               value={musicQuery}
               onChangeText={setMusicQuery}
             />

             {isLoadingMusic ? (
               <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
             ) : (
               <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {musicList.map((song: any) => (
                    <TouchableOpacity 
                      key={song.trackId || song.previewUrl} 
                      onPress={() => onAddMusic(song.previewUrl)} 
                      style={styles.musicRow}
                      activeOpacity={0.7}
                    >
                        <Image source={{ uri: song.artworkUrl100 || song.artworkUrl60 }} style={styles.musicThumb} />
                        <View style={{ marginLeft: 16, flex: 1 }}>
                          <Text style={{ color: '#FFF', fontWeight: 'bold' }} numberOfLines={1}>{song.trackName}</Text>
                          <Text style={{ color: '#666', fontSize: 12 }}>{song.artistName} • 0:30</Text>
                        </View>
                        <Ionicons name="play-circle" size={32} color={COLORS.primary} />
                    </TouchableOpacity>
                  ))}
               </ScrollView>
             )}
             
             <TouchableOpacity style={styles.cancelLink} onPress={() => setShowMusic(false)}>
                <Text style={styles.cancelText}>CANCEL</Text>
             </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 📅 2. MIDDLE: TIMELINE SCRUBBER (10%) */}
      <View style={styles.timelineSection}>
         <View style={styles.timeLabels}>
            <Text style={styles.timeText}>{Math.floor(currentTime/1000)}s</Text>
            <Text style={styles.timeText}>{Math.floor(totalDuration/1000)}s</Text>
         </View>
         
         <View style={styles.scrubberContainer} {...(!showTrim && !showMusicTrim ? scrubberPanResponder.panHandlers : {})}>
            {/* 🎬 VIDEO FILMSTRIP TRACK (THE "BOX") */}
            <View style={styles.videoTrackContainer}>
               <View style={[styles.videoTrack, showTrim && { borderColor: COLORS.primary, borderStyle: 'dashed' }]}>
                  <View style={styles.filmstripRow}>
                     {clips.length > 0 && Array.from({ length: 8 }).map((_, i) => (
                       <Image 
                         key={i} 
                         source={{ uri: clips[0].uri }} 
                         style={styles.filmstripFrame} 
                         resizeMode="cover"
                       />
                     ))}
                     <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
                  </View>
               </View>

               {/* 🎞️ VIDEO TRIM OVERLAY */}
               {showTrim && clips[0] && originalDuration > 0 && (
                  <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                     <View style={[
                        styles.trimSelectionOverlay,
                        {
                           left: `${(clips[0].trimStart / originalDuration) * 100}%`,
                           right: `${100 - (clips[0].trimEnd / originalDuration) * 100}%`
                        }
                     ]} />

                     <View 
                        {...startTrimResponder.panHandlers}
                        style={[styles.trimHandle, { left: `${(clips[0].trimStart / originalDuration) * 100}%`, transform: [{translateX: -17}] }]} 
                     >
                        <View style={styles.trimGripper} />
                     </View>

                     <View 
                        {...endTrimResponder.panHandlers}
                        style={[styles.trimHandle, { left: `${(clips[0].trimEnd / originalDuration) * 100}%`, transform: [{translateX: -17}] }]} 
                     >
                        <View style={styles.trimGripper} />
                     </View>
                  </View>
               )}
            </View>
            
            {/* 🎵 DEDICATED MUSIC TRACK (BELOW VIDEO) */}
            {activeMusic && (
               <View style={styles.musicTrackWrapper}>
                  <View style={[styles.musicTrackContainer, showMusicTrim && { borderColor: COLORS.primary, borderStyle: 'dashed', borderWidth: 1.5 }]}>
                     <View style={styles.musicTrackWave}>
                        <Ionicons name="musical-note" size={12} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={styles.musicTrackText} numberOfLines={1}>Soundtrack: 30s Preview</Text>
                     </View>
                  </View>

                  {/* 🎞️ MUSIC TRIM OVERLAY */}
                  {showMusicTrim && (
                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                        <View style={[
                          styles.musicTrimOverlay,
                          {
                            left: `${(activeMusic.trimStart / activeMusic.duration) * 100}%`,
                            right: `${100 - (activeMusic.trimEnd / activeMusic.duration) * 100}%`,
                          }
                        ]} />

                        <View 
                          {...startMusicTrimResponder.panHandlers}
                          style={[styles.musicTrimHandle, { left: `${(activeMusic.trimStart / activeMusic.duration) * 100}%`, transform: [{translateX: -17}] }]} 
                        >
                          <View style={styles.trimGripper} />
                        </View>

                        <View 
                          {...endMusicTrimResponder.panHandlers}
                          style={[styles.musicTrimHandle, { left: `${(activeMusic.trimEnd / activeMusic.duration) * 100}%`, transform: [{translateX: -17}] }]} 
                        >
                          <View style={styles.trimGripper} />
                        </View>
                    </View>
                  )}
               </View>
            )}

            {/* 🔴 UNIFIED PLAYHEAD (SYNCED ACROSS ALL TRACKS) */}
            <View style={[
              styles.playhead, 
              { 
                left: showTrim && originalDuration > 0 && clips[0]
                  ? `${((clips[0].trimStart + currentTime) / originalDuration) * 100}%` 
                  : totalDuration > 0 
                    ? `${(currentTime / totalDuration) * 100}%` 
                    : '0%' 
              }
            ]} />
         </View>
      </View>

      {/* �️ 3. BOTTOM: EDITING TOOLS (20%) */}
      <View style={styles.controlsSection}>
          <View style={styles.actionRow}>
             <TouchableOpacity style={styles.playBtnSmall} onPress={() => setPlaying(!isPlaying)}>
                <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#FFF" />
             </TouchableOpacity>

             <TouchableOpacity style={styles.toolItemSmall} onPress={() => setIsMuted(!isMuted)}>
                <Ionicons name={isMuted ? "volume-mute" : "volume-medium"} size={20} color={isMuted ? COLORS.primary : "#FFF"} />
                <Text style={[styles.toolLabelSmall, isMuted && { color: COLORS.primary }]}>Mute</Text>
             </TouchableOpacity>

             <TouchableOpacity style={styles.toolItemSmall} onPress={() => {
                setShowMusicTrim(!showMusicTrim);
                setShowTrim(false);
             }}>
                <Ionicons name="musical-notes" size={20} color={showMusicTrim ? COLORS.primary : "#FFF"} />
                <Text style={styles.toolLabelSmall}>Music</Text>
             </TouchableOpacity>

             <TouchableOpacity style={styles.toolItemSmall} onPress={() => {
                setShowTrim(!showTrim);
                setShowMusicTrim(false);
             }}>
                <Ionicons name="cut-outline" size={20} color={showTrim ? COLORS.primary : "#FFF"} />
                <Text style={styles.toolLabelSmall}>Trim</Text>
             </TouchableOpacity>

             <TouchableOpacity style={styles.nextBtnSmall} onPress={handleExport} disabled={isExporting}>
                {isExporting ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <>
                    <Text style={styles.nextBtnText}>Next</Text>
                    <Ionicons name="chevron-forward" size={16} color="#FFF" />
                  </>
                )}
             </TouchableOpacity>
          </View>
      </View>
    </SafeAreaView>
  );
};

// --- SUB-COMPONENTS ---
const ToolIcon = ({ icon, label, onPress, type }: any) => (
  <TouchableOpacity style={styles.toolIcon} onPress={onPress}>
    <View style={styles.iconBox}>
      {type === 'MCI' ? 
        <MaterialCommunityIcons name={icon} size={24} color="#FFF" /> : 
        <Ionicons name={icon} size={24} color="#FFF" />
      }
    </View>
    <Text style={styles.toolLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  
  previewSection: { height: '65%', width: '100%', position: 'relative' },
  
  verticalToolbar: {
    position: 'absolute',
    right: 15,
    top: 60,
    zIndex: 100,
    gap: 15,
    alignItems: 'center',
    padding: 10,
    borderRadius: 20
  },
  toolIcon: { alignItems: 'center', gap: 4 },
  iconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  toolLabel: { color: '#FFF', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  
  closeBtn: { position: 'absolute', top: 50, left: 20, width: 44, height: 44, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  timelineSection: { height: '10%', justifyContent: 'center' },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 20 },
  timeText: { color: '#666', fontSize: 10, fontWeight: '800' },
  // --- SCRUBBER TRACKS ---
  scrubberContainer: { 
    height: 120, // 🛡️ TALLER TO SEPARATE TRACKS
    paddingHorizontal: 20, 
    justifyContent: 'center', 
    overflow: 'visible' 
  },
  videoTrackContainer: { height: 44, width: '100%', position: 'relative', overflow: 'visible' },
  videoTrack: { 
    height: '100%', 
    backgroundColor: '#1A1A1A', 
    borderRadius: 8, 
    position: 'relative', 
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333'
  },
  filmstripRow: { flexDirection: 'row', width: '100%', height: '100%' },
  filmstripFrame: { width: (width - 40) / 8, height: '100%', opacity: 0.6 },
  
  musicTrackWrapper: { height: 32, width: '100%', position: 'relative', marginTop: 12, overflow: 'visible' },
  musicTrackContainer: { 
    height: '100%', 
    backgroundColor: 'rgba(255, 60, 110, 0.15)', 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: 'rgba(255, 60, 110, 0.3)',
    justifyContent: 'center',
    paddingHorizontal: 10,
    overflow: 'hidden'
  },
  musicTrackWave: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  musicTrackText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },

  // --- HANDLES (TRACK-SPECIFIC) ---
  trimHandle: { 
    position: 'absolute', top: -6, bottom: -6, width: 34, 
    backgroundColor: '#FFEB3B', borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 8, elevation: 15,
    zIndex: 10000,
    borderWidth: 2, borderColor: '#000'
  } ,
  musicTrimHandle: { 
    position: 'absolute', top: -4, bottom: -4, width: 34, 
    backgroundColor: '#FF4081', borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 8, elevation: 15,
    zIndex: 10000,
    borderWidth: 2, borderColor: '#000'
  } ,
  trimGripper: { width: 4, height: 18, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 2 },
  trimSelectionOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(255, 235, 59, 0.25)', 
    borderTopWidth: 3, borderBottomWidth: 3, borderColor: '#FFEB3B',
    zIndex: 500
  },
  musicTrimOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(255, 64, 129, 0.25)', 
    borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#FF4081',
    zIndex: 500
  },
  playhead: { 
    position: 'absolute', 
    top: -10, 
    width: 3, 
    height: 100, // 🛡️ SPANS BOTH
    backgroundColor: '#FFF', 
    zIndex: 1000, 
    shadowColor: '#000', 
    shadowOpacity: 0.5, 
    shadowRadius: 5,
    borderRadius: 1.5
  },

  controlsSection: { 
    height: '18%', 
    backgroundColor: '#000', 
    borderTopWidth: 0.5, 
    borderTopColor: '#222', 
    paddingHorizontal: 15,
    paddingBottom: 20, // 🛡️ LOWERED THE TRAY
    justifyContent: 'center'
  },
  actionRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10 // 🛡️ PUSHED DOWN FURTHER
  },
  playBtnSmall: {
    width: 40, // 🛡️ SLIGHTLY SMALLER
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333'
  },
  toolItemSmall: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44
  },
  toolLabelSmall: {
    color: '#FFF',
    fontSize: 9, // 🛡️ SMALLER TEXT
    fontWeight: '600',
    marginTop: 2
  },
  nextBtnSmall: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6, // 🛡️ COMPACT NEXT
    paddingHorizontal: 14,
    borderRadius: 18,
    gap: 3
  },
  nextBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13
  },

  // --- PRO DRAWERS ---
  proDrawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 320,
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    padding: 24,
    zIndex: 5000,
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 30
  },
  drawerHandle: { width: 40, height: 6, backgroundColor: '#333', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  drawerTitle: { color: '#888', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 25, fontSize: 12 },
  stickerRow: { gap: 15, paddingRight: 40 },
  stickerCircle: { width: 90, height: 90, backgroundColor: '#2a2a2a', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  musicRow: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: '#2a2a2a', borderRadius: 18, marginBottom: 12 },
  musicTrackBar: { 
    height: 4, 
    width: '100%', 
    backgroundColor: COLORS.primary, 
    marginTop: 4, 
    borderRadius: 2,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.8,
    shadowRadius: 5
  },
  searchBar: { backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, marginVertical: 10, fontSize: 16 },
  musicThumb: { width: 50, height: 50, borderRadius: 4, backgroundColor: '#333' },
  trimContainer: { height: 60, marginVertical: 10, position: 'relative', justifyContent: 'center' },
  trimBase: { height: 40, backgroundColor: '#1a1a1a', borderRadius: 8, width: '100%' },
  trimSelection: { height: 44, backgroundColor: 'rgba(255, 60, 110, 0.3)', borderLeftWidth: 4, borderRightWidth: 4, borderColor: COLORS.primary, position: 'absolute', borderRadius: 4 },
  actionBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  toolItem: { alignItems: 'center', marginHorizontal: 15 },
  cancelLink: { marginTop: 20, alignSelf: 'center' },
  cancelText: { color: COLORS.primary, fontWeight: '900' },

  // --- TEXT EDITOR MODAL ---
  textEditorModal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 6000,
    justifyContent: 'center',
    padding: 30
  },
  modalDone: { position: 'absolute', top: 60, right: 25 },
  modalDoneText: { color: COLORS.primary, fontWeight: '900', fontSize: 18 },
  inputWrapper: { width: '100%', alignItems: 'center' },
  modalInput: { 
    color: '#FFF', 
    fontSize: 40, 
    fontWeight: '900', 
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 15
  }
});

export default TikTokEditorScreen;
