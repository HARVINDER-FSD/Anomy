import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Image, Dimensions, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, Animated,
  KeyboardAvoidingView, Platform, TextInput, Alert, Modal, FlatList, GestureResponderEvent
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { moderateFont, scale, verticalScale } from '@/src/utils/responsive';
import { Audio } from 'expo-av';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import Svg, { Path, G as SvgGroup } from 'react-native-svg';
import { useAuthStore } from '@/src/store/authStore';
import { BlurView } from 'expo-blur';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Viewer canvas matches editor proportions
const VIEWER_CANVAS_WIDTH = SCREEN_WIDTH;
const VIEWER_CANVAS_HEIGHT = SCREEN_HEIGHT * 0.83;

const DEFAULT_IMAGE_DURATION = 7000;  // 7 sec for plain images
const MAX_STORY_DURATION = 60000; // 60 sec hard cap

// ─── Font resolver (must match editor exactly) ─── 
const getFontFamily = (f: string | undefined) => {
  if (!f) return undefined;
  if (Platform.OS === 'android') {
    if (f === 'Serif') return 'serif';
    return 'sans-serif-medium';
  } else {
    if (f === 'Serif') return 'Times New Roman';
    return 'System';
  }
};

// ─── Neon SVG Stroke (exact copy from editor) ───
const NeonStroke = React.memo(({ d, color, width = 6 }: { d: string; color: string; width?: number }) => (
  <SvgGroup>
    <Path d={d} stroke={color} strokeWidth={width * 4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.2} />
    <Path d={d} stroke={color} strokeWidth={width * 2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.5} />
    <Path d={d} stroke="#FFFFFF" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </SvgGroup>
));

// ─── Time ago helper ───
const getTimeAgo = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
};

const SubElementRender = ({ el, displayW, displayH, onElementPress }: { el: any, displayW: number, displayH: number, onElementPress?: (e: GestureResponderEvent, el: any) => void }) => {
  const type = el.type;
  
  if (type === 'reshare_canvas') {
    return (
      <TouchableOpacity activeOpacity={1} style={{ width: displayW, height: displayH }} onPress={(e) => onElementPress?.(e, el)}>
        <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 16, overflow: 'hidden', backgroundColor: 'transparent' }} pointerEvents="box-none">
          {el.children?.map((child: any, index: number) => {
            let cw, ch;
            if (child.type === 'reshare_canvas') {
               cw = displayW; ch = displayH;
            } else if (child.type === 'image' && child.isBase) {
               cw = (child.width && child.height) ? displayW : displayW;
               ch = (child.width && child.height) ? (displayW * (child.height / child.width)) : displayH;
            } else {
               cw = child.type === 'image' ? 200 : 280;
               ch = child.type === 'image' ? 280 : 120;
            }
            return (
              <View key={child.id || child._id || `ch-${index}`} style={{
                position: 'absolute',
                left: (displayW / 2) - (cw / 2) + child.x,
                top: (displayH / 2) - (ch / 2) + child.y,
                width: cw, height: ch,
                justifyContent: 'center',
                alignItems: 'center',
                transform: [ { scale: child.scale }, { rotate: `${child.rotate}deg` } ]
              }}>
                <SubElementRender el={child} displayW={displayW} displayH={displayH} />
              </View>
            );
          })}
          <Svg style={StyleSheet.absoluteFill}>
            {el.doodles?.map((p: any, i: number) => <NeonStroke key={`v-res-p-${i}`} d={p.d} color={p.color} width={p.width} />)}
          </Svg>
        </View>
        
        <View style={{ position: 'absolute', left: 16, top: 16, zIndex: 1000, flexDirection: 'row', alignItems: 'center' }}>
          <Image source={{ uri: resolveAvatarUrl(el.attributionAvatar || '') }} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }} />
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
            {el.attributionName}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <>
      {type === 'text' && (
        <View style={[
          viewerStyles.textWrap,
          el.bgStyle === 'solid' && { backgroundColor: el.color === '#FFF' ? '#000' : '#FFF' },
          el.bgStyle === 'blur' && { backgroundColor: 'rgba(0,0,0,0.5)' },
        ]}>
          <Text style={[viewerStyles.textItem, { color: el.color || '#FFF', fontFamily: getFontFamily(el.fontFamily), fontSize: el.isBase ? 42 : 24 }]}>
            {el.content}
          </Text>
        </View>
      )}

      {type === 'mention' && (
        <TouchableOpacity style={viewerStyles.mentionRow} activeOpacity={0.8} onPress={(e) => onElementPress?.(e, el)}>
          <Text style={viewerStyles.mentionSymbol}>@</Text>
          <Text style={viewerStyles.mentionLabel}>{el.username || el.content || 'user'}</Text>
        </TouchableOpacity>
      )}

      {/* Legacy Attribution (fallback) */}
      {type === 'attribution' && (
        <View style={{ position: 'absolute', left: 14, top: 18, zIndex: 1000, flexDirection: 'row', alignItems: 'center' }}>
          <Image source={{ uri: resolveAvatarUrl(el.attributionAvatar || '') }} style={{ width: 26, height: 26, borderRadius: 13, marginRight: 8 }} />
          <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>{el.attributionName}</Text>
        </View>
      )}

      {type === 'sticker' && (
        <Image source={{ uri: resolveMediaUrl(el.url || el.uri) }} style={viewerStyles.stickerImg} resizeMode="contain" />
      )}

      {type === 'image' && !el.isBase && (
        <Image source={{ uri: resolveMediaUrl(el.url || el.uri) }} style={viewerStyles.imgExtra} resizeMode="cover" />
      )}
      
      {type === 'image' && el.isBase && (
        <Image source={{ uri: resolveMediaUrl(el.url || el.uri) }} style={viewerStyles.baseMedia} resizeMode="cover" />
      )}
      
      {type === 'music' && <View style={{ position: 'absolute', opacity: 0 }} />}
    </>
  );
};

// ─── Element renderer for a single overlay ───
const StoryElement = React.memo(({ el, scaleX, scaleY, displayW, displayH, onElementPress }: {
  el: any; scaleX: number; scaleY: number; displayW: number; displayH: number; onElementPress?: (e: GestureResponderEvent, el: any) => void;
}) => {
  const type = el.type;

  // Element base dimensions (must match editor exactly)
  let baseW = type === 'reshare_canvas' ? VIEWER_CANVAS_WIDTH : 280;
  let baseH = type === 'reshare_canvas' ? VIEWER_CANVAS_HEIGHT : 120;
  
  if (type === 'image') { baseW = 200; baseH = 280; }

  // Scale the translateX/Y from editor to viewer
  const tx = (el.x || 0) * scaleX;
  const ty = (el.y || 0) * scaleY;

  // Overall scaling should account for device difference
  const elScale = (el.scale || 1) * scaleX;
  const elRotate = el.rotate || 0;

  return (
    <View
      style={{
        position: 'absolute',
        left: (displayW / 2) - (baseW / 2),
        top: (displayH / 2) - (baseH / 2),
        width: baseW,
        height: baseH,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 200,
        transform: [
          { translateX: tx },
          { translateY: ty },
          { scale: elScale },
          { rotate: `${elRotate}deg` },
        ],
      }}
    >
       <SubElementRender el={el} displayW={VIEWER_CANVAS_WIDTH} displayH={VIEWER_CANVAS_HEIGHT} onElementPress={onElementPress} />
    </View>
  );
});

// ═══════════════════════════════════════════════════════
// ═══  STORY VIEWER SCREEN  ═══════════════════════════
// ═══════════════════════════════════════════════════════

export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams();
  const router = useSafeRouter();

  const { user: currentUser } = useAuthStore();
  const [stories, setStories] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentStory = (stories && stories[currentIndex]) || null;
  const storyOwnerId = (currentStory?.user_id as any)?._id?.toString() || currentStory?.user_id?.toString() || '';
  const isOwner = (currentUser as any)?.id === storyOwnerId || (currentUser as any)?._id === storyOwnerId;
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showViewersModal, setShowViewersModal] = useState(false);
  const [viewersList, setViewersList] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserStories, setCurrentUserStories] = useState<any[]>([]);
  const [elementTooltip, setElementTooltip] = useState<{ x: number, y: number, username: string, type: 'reshare' | 'mention' } | null>(null);

  const handleElementPress = React.useCallback((e: GestureResponderEvent, el: any) => {
    const { pageX, pageY } = e.nativeEvent;
    setIsPaused(true);
    if (el.type === 'reshare_canvas') {
      setElementTooltip({ x: pageX, y: pageY, username: el.attributionName, type: 'reshare' });
    } else if (el.type === 'mention') {
      setElementTooltip({ x: pageX, y: pageY, username: el.username || el.content, type: 'mention' });
    }
  }, []);

  const progress = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [storyDuration, setStoryDuration] = useState(DEFAULT_IMAGE_DURATION);
  const isFocused = useIsFocused();
  const viewerMusicReqId = useRef(0); // 🚀 Track audio requests to prevent race conditions

  const videoUrl = currentStory?.media_type === 'video' ? resolveMediaUrl(currentStory.media_url) : '';
  const player = useVideoPlayer(videoUrl, p => {
    p.loop = false;
  });

  // Observe player status and end events
  useEffect(() => {
    if (currentStory?.media_type !== 'video') return;

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        const durMs = player.duration * 1000 || DEFAULT_IMAGE_DURATION;
        const capped = Math.min(durMs, MAX_STORY_DURATION);
        setStoryDuration(capped);
        startAnimation(capped);
      }
    });

    const endSub = player.addListener('playToEnd', () => {
      nextStory();
    });

    return () => {
      statusSub.remove();
      endSub.remove();
    };
  }, [player, currentStory]);

  // 🚀 Auto-Cleanup when screen is NOT focused (prevents background ghost playback)
  useEffect(() => {
    if (!isFocused) {
      setIsPaused(true);
      viewerMusicReqId.current += 1; // 🛑 Invalidate any loading requests immediately
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      player.pause();
    }
  }, [isFocused, player]);


  // ── Audio Mode Setup & Fetch stories ──
  useEffect(() => {
    // Enable audio even if phone is on silent
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    fetchUserStories();
    if (currentUser) fetchCurrentUserStories();
    return () => {
      viewerMusicReqId.current += 1; // 🛑 Invalidate any in-flight requests
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => { });
        soundRef.current = null;
      }
      if (animRef.current) animRef.current.stop();
    };
  }, [userId, currentUser]);

  const fetchCurrentUserStories = async () => {
    try {
      const res = await apiClient.get('/stories');
      if (res.data.success) {
        setCurrentUserStories(res.data.data.filter((s: any) => (s.user_id === (currentUser?.id || (currentUser as any)?._id))));
      }
    } catch (e) { }
  };

  const fetchUserStories = async () => {
    const hasCache = stories.length > 0;
    performanceEngine.startScreenTrace('StoryViewerScreen');
    performanceEngine.trackCacheAccess('Stories', hasCache);
    try {
      setLoading(true);
      const res = await apiClient.get(`/stories/user/${userId}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (res.data.success && res.data.data.stories.length > 0) {
        const fetchedStories = res.data.data.stories.reverse();
        setStories(fetchedStories);

        // 🚀 Smart Start: Find first unseen story index
        const firstUnseen = fetchedStories.findIndex((s: any) => !s.is_viewed);
        if (firstUnseen !== -1) {
          setCurrentIndex(firstUnseen);
        }
      } else {
        router.back();
      }
      performanceEngine.endScreenTrace('StoryViewerScreen', hasCache);
    } catch (error) {
      router.back();
    } finally {
      setLoading(false);
    }
  };

  // recursively locate nested music object in reshare canvases
  const findMusicElement = React.useCallback((elements: any[]): any | null => {
    if (!elements || !Array.isArray(elements)) return null;
    for (const el of elements) {
      if (el.type === 'music' && (el.previewUrl || el.preview_url || el.url || el.uri)) {
        return el;
      }
      if (el.type === 'reshare_canvas' && el.children) {
        const found = findMusicElement(el.children);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // ── Music playback ──
  const playStoryMusic = async (story: any, activeMusic: any): Promise<number> => {
    viewerMusicReqId.current += 1;
    const currentReqId = viewerMusicReqId.current;

    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => { });
      soundRef.current = null;
    }

    const musicUrl = activeMusic?.previewUrl || activeMusic?.preview_url || activeMusic?.url || activeMusic?.uri;

    if (musicUrl) {
      try {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri: resolveMediaUrl(musicUrl) },
          { shouldPlay: false, isLooping: false } // Don't play yet!
        );

        // Only proceed if this is still the LATEST request
        if (currentReqId === viewerMusicReqId.current) {
          soundRef.current = sound;
          await sound.playAsync(); // Play now
          const durationMs = (status as any)?.durationMillis || 30000;
          return Math.min(durationMs, MAX_STORY_DURATION);
        } else {
          // Navigated away or skipped while loading; silent kill
          await sound.unloadAsync().catch(() => { });
          return 0;
        }
      } catch (e) {
      }
    }
    return 0; // no music
  };

  // ── Build renderable elements & owner check ──

  const currentMusic = useMemo(() => {
    if (currentStory?.music) return currentStory.music;
    if (currentStory?.elements) return findMusicElement(currentStory.elements);
    return null;
  }, [currentStory, findMusicElement]);

  // ── Progress animation ──
  useEffect(() => {
    if (stories.length === 0 || loading) return;
    if (!currentStory) return;

    const isVideo = currentStory?.media_type === 'video';

    if (!isPaused) {
      // Always handle music playback (if exists) regardless of media type
      playStoryMusic(currentStory, currentMusic).then(musicDuration => {
        if (isVideo) {
          // For video: duration is driven by onPlaybackStatusUpdate/onLoad
          progress.setValue(0);
          player.play();
        } else {
          // For image: determine duration from music or default
          const dur = musicDuration > 0 ? musicDuration : DEFAULT_IMAGE_DURATION;
          setStoryDuration(dur);
          startAnimation(dur);
        }
      });
      markViewed(currentStory);
    } else {
      if (animRef.current) animRef.current.stop();
      if (soundRef.current) soundRef.current.pauseAsync().catch(() => { });
      player.pause();
    }
  }, [currentIndex, stories, loading, isPaused, isOwner, player]);

  async function markViewed(story: any) {
    try {
      const storyId = story._id || story.id;
      if (storyId) await apiClient.post(`/stories/${storyId}/view`);
    } catch (e) { /* silent */ }
  }

  function startAnimation(duration: number = DEFAULT_IMAGE_DURATION) {
    if (animRef.current) animRef.current.stop();
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) nextStory();
    });
  }


  function nextStory() {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      router.back();
    }
  }

  function restartStory() {
    setCurrentIndex(0);
    progress.setValue(0);
    startAnimation();
  }

  function prevStory() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      progress.setValue(0);
      startAnimation();
    }
  }

  const handleTap = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_WIDTH / 3) prevStory();
    else nextStory();
  };

  const handleReply = async () => {
    if (!reply.trim()) return;
    try {
      const currentStory = stories[currentIndex];
      const storyId = currentStory._id || currentStory.id;
      await apiClient.post(`/stories/${storyId}/reply`, { content: reply.trim() });
      setReply('');
      const username = currentStory.user_id?.username || currentStory.username || 'user';
      Alert.alert('Sent', 'Reply sent to ' + username);
    } catch (error) {
    }
  };

  // ── 3-dot menu handlers ──
  const handleMoreOptions = () => {
    setIsPaused(true);
    setShowOptionsModal(true);
  };

  const closeOptions = () => {
    setShowOptionsModal(false);
    setIsPaused(false);
  };

  const fetchUserViewers = async (storyId: string) => {
    try {
      setLoadingViewers(true);
      const res = await apiClient.get(`/stories/${storyId}/viewers`);
      if (res.data.success) {
        setViewersList(res.data.data.viewers || []);
      }
    } catch (e) {
    } finally {
      setLoadingViewers(false);
    }
  };

  const handleOpenViewers = () => {
    const story = stories[currentIndex];
    if (!story) return;
    setIsPaused(true);
    fetchUserViewers(story._id || story.id);
    setShowViewersModal(true);
  };

  const closeViewers = () => {
    setShowViewersModal(false);
    setIsPaused(false);
  };

  const handleDeleteStory = async () => {
    const story = stories[currentIndex];
    if (!story) return;
    setIsDeleting(true);
    try {
      const storyId = story._id || story.id;
      await apiClient.delete(`/stories/${storyId}`);
      setShowOptionsModal(false);

      // Update local deck
      const newStories = stories.filter((_: any, i: number) => i !== currentIndex);

      // 🚀 Sync: Also update currentUserStories so "Added" buttons revert to "Add to Story"
      setCurrentUserStories(prev => prev.filter(s => (s._id || s.id) !== storyId));

      if (newStories.length === 0) {
        router.back();
      } else {
        setStories(newStories);
        setCurrentIndex(prev => Math.min(prev, newStories.length - 1));
        setIsPaused(false);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not delete story.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReportStory = () => {
    setShowOptionsModal(false);
    setIsPaused(false);
    Alert.alert('Reported', 'Story has been reported. We will review it shortly.');
  };

  // ── Build renderable elements from the story data ──
  // (Must be before any early returns to maintain hook order)
  const renderElements = useMemo(() => {
    if (!currentStory) return [];
    const elems: any[] = [];

    // From elements array (primary source — complete ordered list)
    if (currentStory.elements && currentStory.elements.length > 0) {
      return currentStory.elements
        .filter((el: any) => !el.isBase)
        .map((el: any, idx: number) => ({
          ...el,
          // Ensure every element has a unique ID for the key prop
          id: el.id || el._id || `el-${idx}`
        }));
    }

    // Fallback: build from individual arrays (backward compat)
    if (currentStory.texts) {
      currentStory.texts.forEach((t: any, i: number) => elems.push({ ...t, type: 'text', id: t.id || `txt-${i}` }));
    }
    if (currentStory.stickers) {
      currentStory.stickers.forEach((s: any, i: number) => elems.push({ ...s, type: 'sticker', id: s.id || `stk-${i}` }));
    }
    if (currentStory.mentions) {
      currentStory.mentions.forEach((m: any, i: number) => elems.push({ ...m, type: 'mention', id: m.id || `mnt-${i}` }));
    }
    if (currentStory.music) {
      elems.push({ ...currentStory.music, type: 'music', id: currentStory.music.id || 'mus-0' });
    }

    return elems;
  }, [currentStory]);

  const isMentioned = useMemo(() => {
    if (!currentUser || !renderElements) return false;
    const myId = currentUser.id || (currentUser as any)._id;
    return renderElements.some((el: any) =>
      el.type === 'mention' && (el.userId === myId || el.username === currentUser.username)
    );
  }, [renderElements, currentUser]);

  const isReshared = useMemo(() => {
    if (!currentStory || currentUserStories.length === 0) return false;
    return currentUserStories.some((s: any) => s.ref_id === (currentStory._id || currentStory.id));
  }, [currentStory, currentUserStories]);

  // ── Calculate display dimensions (match aspect ratio) ──
  const editorW = currentStory?.canvas_width || SCREEN_WIDTH;
  const editorH = currentStory?.canvas_height || (SCREEN_HEIGHT * 0.83);

  const displayW = SCREEN_WIDTH;
  const displayH = displayW * (editorH / editorW);

  // Center the canvas vertically when height is dynamic
  const canvasTopOffset = useMemo(() => {
    return Math.max((VIEWER_CANVAS_HEIGHT - displayH) / 2, 0);
  }, [displayH, VIEWER_CANVAS_HEIGHT]);

  const scaleX = displayW / editorW;
  const scaleY = displayH / editorH;

  // ── Loading ──
  if (loading) {
    return (
      <View style={viewerStyles.centered}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!currentStory) {
    router.back();
    return null;
  }

  // ── Resolve user info (handles both populated and flat formats) ──
  const storyUser = currentStory?.user_id && typeof currentStory.user_id === 'object'
    ? currentStory.user_id
    : { username: (currentStory as any)?.username, avatar_url: (currentStory as any)?.avatar_url };


  // ── Doodle paths ──
  const doodles = currentStory.doodles || [];

  // ── Filter overlay color ──
  const filterColor = currentStory.filter_color || 'transparent';

  // Find base element to apply its transforms (x, y, scale, rotate)
  const baseEl = currentStory.elements?.find((el: any) => el.isBase);
  const baseW = baseEl && baseEl.width && baseEl.height ? SCREEN_WIDTH : VIEWER_CANVAS_WIDTH;
  const baseH = baseEl && baseEl.width && baseEl.height ? (SCREEN_WIDTH * (baseEl.height / baseEl.width)) : displayH;

  // Determine if we should show the full-screen base media.
  // If this is a pure reshare, the base media belongs inside the reshare_canvas card, not the full screen.
  const hasReshare = renderElements.some((el: any) => el.type === 'reshare_canvas');
  const showBaseMedia = !!baseEl || !hasReshare;

  return (
    <View style={viewerStyles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ═══════════════════════════════════════════════
           MAIN CANVAS — exactly matching editor layout 
         ═══════════════════════════════════════════════ */}
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <TouchableOpacity
          activeOpacity={1}
          style={[viewerStyles.canvasContainer, { height: displayH, alignSelf: 'center', marginTop: 10 }]}
          onPress={handleTap}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
        >
          {/* Layer 1: Base media — Video or Image (Skipped if nested in reshare card) */}
          {showBaseMedia && (
            currentStory.media_type === 'video' ? (
              <VideoView
                player={player}
                style={[
                  viewerStyles.baseMedia,
                  baseEl && {
                    width: baseW,
                    height: baseH,
                    position: 'absolute',
                    left: (displayW / 2) - (baseW / 2),
                    top: (displayH / 2) - (baseH / 2),
                    transform: [
                      { translateX: (baseEl.x || 0) * scaleX },
                      { translateY: (baseEl.y || 0) * scaleY },
                      { scale: (baseEl.scale || 1) * scaleX },
                      { rotate: `${baseEl.rotate || 0}deg` }
                    ]
                  }
                ]}
                contentFit="cover"
                nativeControls={false}
              />
          ) : (
            <Image
              source={{ uri: resolveMediaUrl(currentStory.media_url) }}
              style={[
                viewerStyles.baseMedia,
                baseEl && {
                  width: baseW,
                  height: baseH,
                  position: 'absolute',
                  left: (displayW / 2) - (baseW / 2),
                  top: (displayH / 2) - (baseH / 2),
                  transform: [
                    { translateX: (baseEl.x || 0) * scaleX },
                    { translateY: (baseEl.y || 0) * scaleY },
                    { scale: (baseEl.scale || 1) * scaleX },
                    { rotate: `${baseEl.rotate || 0}deg` }
                  ]
                }
              ]}
              resizeMode="cover"
            />
          ))}

          {/* Layer 2: Filter overlay (matches editor) */}
          {filterColor !== 'transparent' && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: filterColor }]} pointerEvents="none" />
          )}

          {/* Layer 3: All interactive elements (text, stickers, mentions, music, images) */}
          {renderElements.map((el: any) => (
            <StoryElement
              key={el.id}
              el={el}
              scaleX={scaleX}
              scaleY={scaleY}
              displayW={displayW}
              displayH={displayH}
              onElementPress={handleElementPress}
            />
          ))}

          {/* Layer 4: Doodle SVG overlay (neon strokes, highest z-index) */}
          {doodles.length > 0 && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents="none">
              <Svg
                width={displayW}
                height={displayH}
                viewBox={`0 0 ${editorW} ${editorH}`}
                preserveAspectRatio="none"
              >
                {doodles.map((p: any, i: number) => (
                  <NeonStroke key={p.id || `doodle-${i}`} d={p.d} color={p.color} width={p.width} />
                ))}
              </Svg>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ─── Progress bars (Absolute on top) ─── */}
      <View style={viewerStyles.progressContainer}>
        {stories.map((s, index) => (
          <View key={s.id || index} style={viewerStyles.progressBarBg}>
            <Animated.View
              style={[
                viewerStyles.progressBarFg,
                {
                  width: index === currentIndex
                    ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : index < currentIndex ? '100%' : '0%'
                }
              ]}
            />
          </View>
        ))}
      </View>

      {/* ─── Header (Absolute on top) ─── */}
      <View style={viewerStyles.header}>
        <TouchableOpacity
          style={viewerStyles.userInfo}
          onPress={restartStory}
          activeOpacity={0.7}
        >
          <ProfileAvatar
            url={storyUser.avatar_url}
            username={storyUser.username}
            size={40}
            borderWidth={2}
          />
          <View style={{ marginLeft: 10 }}>
            <Text style={viewerStyles.username}>{storyUser.username}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={viewerStyles.timestamp}>{getTimeAgo(currentStory.created_at)}</Text>
              {currentMusic && (
                <>
                  <Text style={viewerStyles.dotDivider}> • </Text>
                  <View style={viewerStyles.headerMusicInfo}>
                    <Ionicons name="musical-notes" size={12} color="rgba(255,255,255,0.8)" style={{ marginRight: 4 }} />
                    <Text style={viewerStyles.headerMusicText} numberOfLines={1}>
                      {currentMusic.songTitle || 'Audio'} - {currentMusic.artist || 'Unknown'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={viewerStyles.closeBtn}>
          <Ionicons name="close" size={30} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* ─── Mention Reshare Button ─── */}
      {isMentioned && !isOwner && (
        <View style={viewerStyles.reshareStoryBtn}>
          <TouchableOpacity
            style={[
              viewerStyles.reshareStoryInner,
              isReshared && { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0 }
            ]}
            disabled={isReshared}
            onPress={() => {
              setIsPaused(true);
              player.pause();
              router.replace(`/create-story?refId=${currentStory._id || currentStory.id}`);
            }}
          >
            <Ionicons name={isReshared ? "checkmark-circle" : "share-social"} size={16} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={[viewerStyles.reshareStoryTxt, isReshared && { color: 'rgba(255,255,255,0.6)' }]}>
              {isReshared ? 'Added to story' : 'Add to your story'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Reply bar ─── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={viewerStyles.footer}
      >
        {isOwner ? (
          <TouchableOpacity
            style={viewerStyles.viewsBtn}
            onPress={handleOpenViewers}
            activeOpacity={0.7}
          >
            <View style={viewerStyles.viewsAvatarGroup}>
              {viewersList.slice(0, 3).map((v, i) => (
                <View key={v.id || v._id || `vmini-${i}`} style={{ marginLeft: i > 0 ? -12 : 0 }}>
                  <ProfileAvatar
                    url={v.avatar_url}
                    username={v.username}
                    size={28}
                    borderWidth={1.5}
                  />
                </View>
              ))}
            </View>
            <Text style={viewerStyles.viewsTxt}>
              {currentStory.views_count || 0} Views
            </Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            style={viewerStyles.replyInput}
            placeholder="Send message"
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={reply}
            onChangeText={setReply}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
          />
        )}

        {isOwner ? <View style={{ flex: 1 }} /> : null}

        <TouchableOpacity style={viewerStyles.sendBtn} onPress={handleReply}>
          <Ionicons name={isOwner ? "share-outline" : "paper-plane"} size={24} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity style={viewerStyles.moreBtn} onPress={handleMoreOptions}>
          <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* ─── Element Tooltip Popup ─── */}
      {elementTooltip && (
        <TouchableOpacity
          activeOpacity={1}
          style={[StyleSheet.absoluteFill, { zIndex: 5000 }]}
          onPress={() => { setElementTooltip(null); setIsPaused(false); }}
        >
          <TouchableOpacity
            style={[
              viewerStyles.tooltipBox,
              {
                top: Math.min(elementTooltip.y, SCREEN_HEIGHT - 100),
                left: Math.max(20, Math.min(elementTooltip.x - 70, SCREEN_WIDTH - 220))
              }
            ]}
            onPress={() => {
              setElementTooltip(null);
              setIsPaused(false);
              router.push(`/user/${elementTooltip.username}`);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <ProfileAvatar url={undefined} username={elementTooltip.username} size={36} />
               <View style={{ marginLeft: 10 }}>
                 <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>@{elementTooltip.username}</Text>
                 <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                   {elementTooltip.type === 'reshare' ? 'View Story Profile >' : 'View Profile >'}
                 </Text>
               </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* ─── Options Bottom Sheet ─── */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="slide"
        onRequestClose={closeOptions}
      >
        <TouchableOpacity style={viewerStyles.modalBackdrop} activeOpacity={1} onPress={closeOptions}>
          <TouchableOpacity activeOpacity={1} style={viewerStyles.modalSheet}>
            {/* Drag handle */}
            <View style={viewerStyles.dragHandle} />

            <Text style={viewerStyles.modalTitle}>
              {isOwner ? 'Your Story' : `@${storyUser.username}'s Story`}
            </Text>

            {isOwner ? (
              // ── Owner: Delete only ──
              <>
                <TouchableOpacity
                  style={viewerStyles.optionRowDanger}
                  onPress={handleDeleteStory}
                  disabled={isDeleting}
                >
                  <View style={viewerStyles.optionIconBox}>
                    <Ionicons name="trash" size={22} color="#FF3B30" />
                  </View>
                  <View style={viewerStyles.optionTextBox}>
                    <Text style={viewerStyles.optionTitleDanger}>Delete Story</Text>
                    <Text style={viewerStyles.optionSub}>This story will be permanently removed</Text>
                  </View>
                  {isDeleting
                    ? <ActivityIndicator color="#FF3B30" size="small" />
                    : <Ionicons name="chevron-forward" size={18} color="#FF3B30" />}
                </TouchableOpacity>

                <TouchableOpacity style={viewerStyles.cancelRow} onPress={closeOptions}>
                  <Text style={viewerStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              // ── Viewer: Report only ──
              <>
                <TouchableOpacity style={viewerStyles.optionRow} onPress={handleReportStory}>
                  <View style={[viewerStyles.optionIconBox, { backgroundColor: 'rgba(255,149,0,0.12)' }]}>
                    <Ionicons name="flag" size={22} color="#FF9500" />
                  </View>
                  <View style={viewerStyles.optionTextBox}>
                    <Text style={viewerStyles.optionTitle}>Report Story</Text>
                    <Text style={viewerStyles.optionSub}>Let us know if something's wrong</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>

                <TouchableOpacity style={viewerStyles.cancelRow} onPress={closeOptions}>
                  <Text style={viewerStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ─── Viewers Bottom Sheet ─── */}
      <Modal
        visible={showViewersModal}
        transparent
        animationType="slide"
        onRequestClose={closeViewers}
      >
        <TouchableOpacity style={viewerStyles.modalBackdrop} activeOpacity={1} onPress={closeViewers}>
          <TouchableOpacity activeOpacity={1} style={viewerStyles.modalSheetLarge}>
            <View style={viewerStyles.dragHandle} />
            <Text style={viewerStyles.modalTitleLarge}>Story Viewers</Text>

            {loadingViewers ? (
              <ActivityIndicator color={COLORS.secondary} style={{ marginVertical: 30 }} />
            ) : viewersList.length === 0 ? (
              <View style={viewerStyles.emptyBox}>
                <Ionicons name="eye-off-outline" size={40} color="rgba(255,255,255,0.2)" />
                <Text style={viewerStyles.emptyTxt}>No views yet</Text>
              </View>
            ) : (
              <FlatList
                data={viewersList}
                keyExtractor={(item) => item.id || item._id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={viewerStyles.viewerRow}
                    onPress={() => {
                      closeViewers();
                      router.push(`/user/${item.username}`);
                    }}
                  >
                    <ProfileAvatar
                      url={item.avatar_url}
                      username={item.username}
                      size={44}
                      borderWidth={2}
                    />
                    <View style={viewerStyles.viewerMeta}>
                      <Text style={viewerStyles.viewerUser}>{item.username}</Text>
                      <Text style={viewerStyles.viewerName}>{item.full_name}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}

            <TouchableOpacity style={viewerStyles.cancelRow} onPress={closeViewers}>
              <Text style={viewerStyles.cancelText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <PerformanceOverlay />
    </View>
  );
}

// ═══════════════════════════════════════════
// ═══  STYLES (matching editor exactly)  ═══
// ═══════════════════════════════════════════

const viewerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },

  // ─── Progress ───
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginTop: Platform.OS === 'ios' ? 45 : 35,
    height: 3,
    gap: 5,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2000,
  },
  progressBarBg: {
    flex: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFg: {
    height: '100%',
    backgroundColor: COLORS.white,
  },

  // ─── Header ───
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 10,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timestamp: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateFont(11),
    fontWeight: '500',
  },
  attrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  attrAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 8,
  },
  attrUser: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dotDivider: {
    color: 'rgba(255,255,255,0.4)',
    marginHorizontal: 4,
    fontSize: 12,
  },
  headerMusicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: SCREEN_WIDTH * 0.45,
  },
  headerMusicText: {
    color: '#FFF',
    fontSize: moderateFont(10.5),
    fontWeight: '700',
  },
  closeBtn: {
    padding: 5,
  },

  // ─── Canvas ───
  canvasContainer: {
    width: VIEWER_CANVAS_WIDTH,
    height: VIEWER_CANVAS_HEIGHT,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#111',
    position: 'relative',
  },
  baseMedia: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  pinnedAttrPill: {
    position: 'absolute',
    top: 15,
    left: 15,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 100,
  },


  // ─── Element styles (pixel-match with editor) ───
  textWrap: {
    minWidth: 60,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  textItem: {
    fontSize: 42,
    fontWeight: '900',
    textAlign: 'center',
  },
  mentionRow: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mentionSymbol: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 18,
    marginRight: 2,
  },
  mentionLabel: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 16,
  },
  stickerImg: {
    width: 140,
    height: 140,
  },
  imgExtra: {
    width: scale(200),
    height: verticalScale(280),
    borderRadius: 20,
  },
  musicCard: {
    width: scale(220),
    height: verticalScale(75),
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  artThumb: {
    width: 55,
    height: 55,
    borderRadius: 8,
  },
  artMeta: {
    flex: 1,
    marginLeft: 12,
  },
  artN: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
  },
  artA: {
    color: '#AAA',
    fontSize: 11,
  },

  // ─── Footer ───
  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 35,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 10,
    zIndex: 2000,
  },
  replyInput: {
    flex: 1,
    height: 42,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 20,
    color: COLORS.white,
    fontSize: moderateFont(12),
    marginRight: 10,
  },
  sendBtn: {
    padding: 10,
  },
  moreBtn: {
    padding: 10,
  },

  // ─── Options Bottom Sheet ───
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateFont(13),
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  optionRowDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)',
    padding: 16,
    marginBottom: 10,
  },
  optionIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionTextBox: {
    flex: 1,
  },
  optionTitle: {
    color: '#FFF',
    fontSize: moderateFont(15),
    fontWeight: '700',
  },
  optionTitleDanger: {
    color: '#FF3B30',
    fontSize: moderateFont(15),
    fontWeight: '700',
  },
  optionSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: moderateFont(12),
    marginTop: 2,
  },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateFont(15),
    fontWeight: '600',
  },

  // ─── Views Button ───
  viewsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
  },
  viewsAvatarGroup: {
    flexDirection: 'row',
    marginRight: 8,
  },
  viewsTxt: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── Viewer Modal ───
  modalSheetLarge: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    height: SCREEN_HEIGHT * 0.7,
  },
  modalTitleLarge: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyTxt: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    marginTop: 10,
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  viewerMeta: {
    marginLeft: 12,
  },
  viewerUser: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  viewerName: {
    color: '#888',
    fontSize: 12,
  },
  reshareStoryBtn: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 120 : 105,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3000,
  },
  reshareStoryInner: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  reshareStoryTxt: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tooltipBox: {
    position: 'absolute',
    backgroundColor: '#1C1C1E',
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});
