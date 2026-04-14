import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, 
  Dimensions, StatusBar, Platform, Image, ActivityIndicator, 
  Alert, PanResponder, Animated, ScrollView, Modal, TextInput,
  PanResponderGestureState, GestureResponderEvent, Vibration, FlatList
} from 'react-native';
import { Camera, CameraView, FlashMode, CameraType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path, G as SvgGroup } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { Audio, Video, ResizeMode } from 'expo-av';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/client';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CANVAS_WIDTH = SCREEN_WIDTH; 
const CANVAS_HEIGHT = SCREEN_HEIGHT * 0.83; 
const ROUNDING = 0;

const TRASH_Y = SCREEN_HEIGHT - 180;
const TRASH_X = SCREEN_WIDTH / 2;

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

// Optimized Professional Neon Renderer
const NeonStroke = React.memo(({ d, color, width = 6 }: { d: string, color: string, width?: number }) => (
  <SvgGroup>
    <Path d={d} stroke={color} strokeWidth={width * 4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.2} />
    <Path d={d} stroke={color} strokeWidth={width * 2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.5} />
    <Path d={d} stroke="#FFFFFF" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </SvgGroup>
));

interface StoryElement {
  id: number | string;
  _id?: string;
  type: 'image' | 'text' | 'sticker' | 'music' | 'mention' | 'attribution' | 'reshare_canvas';
  uri?: string;
  content?: string;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  isBase?: boolean;
  isLocked?: boolean; 
  fontFamily?: string;
  avatar_url?: string;
  username?: string;
  width?: number;
  height?: number;
  color?: string;
  bgStyle?: 'none' | 'solid' | 'blur';
  artist?: string;
  songTitle?: string;
  coverArt?: string;
  previewUrl?: string;
  isLocal?: boolean;
  // Pinned Attribution
  attributionName?: string;
  attributionAvatar?: string;
  // Children for reshare_canvas
  children?: StoryElement[];
  doodles?: any[];
}

const SubElementRender = ({ element }: { element: StoryElement }) => {
   const isVideo = (element as any).isVideo;
   
   if (element.type === 'reshare_canvas') {
      return (
         <View style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 0, overflow: 'hidden', backgroundColor: 'transparent' }}>
               {element.children?.map((child, index) => {
                  let cw, ch;
                  if (child.type === 'reshare_canvas') {
                     cw = CANVAS_WIDTH; ch = CANVAS_HEIGHT;
                  } else if (child.type === 'image' && child.isBase) {
                     cw = (child.width && child.height) ? SCREEN_WIDTH : CANVAS_WIDTH;
                     ch = (child.width && child.height) ? (SCREEN_WIDTH * (child.height / child.width)) : CANVAS_HEIGHT;
                  } else {
                     cw = child.type === 'image' ? 200 : 280;
                     ch = child.type === 'image' ? 280 : 120;
                  }

                  return (
                     <View key={(child.id || (child as any)._id || `ch-${index}`).toString()} style={{
                        position: 'absolute',
                        left: (CANVAS_WIDTH / 2) - (cw / 2) + child.x,
                        top: (CANVAS_HEIGHT / 2) - (ch / 2) + child.y,
                        width: cw, height: ch,
                        justifyContent: 'center',
                        alignItems: 'center',
                        transform: [ { scale: child.scale }, { rotate: `${child.rotate}deg` } ]
                     }}>
                        <SubElementRender element={child} />
                     </View>
                  );
               })}
               <Svg style={StyleSheet.absoluteFill}>
                  {element.doodles?.map((p, i) => <NeonStroke key={`res-p-${i}`} d={p.d} color={p.color} width={p.width} />)}
               </Svg>
            </View>
            
            <View style={{ position: 'absolute', left: 16, top: 16, zIndex: 1000, flexDirection: 'row', alignItems: 'center' }}>
               <Image source={{ uri: resolveAvatarUrl(element.attributionAvatar || '', element.attributionName) }} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }} />
               <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                  {element.attributionName}
               </Text>
            </View>
         </View>
      );
   }

   return (
      <>
         {element.type === 'image' && !isVideo && <Image source={{ uri: resolveMediaUrl(element.uri) }} style={element.isBase ? styles.imgBase : styles.imgExtra} resizeMode="cover" />}
         {element.type === 'image' && isVideo && (
            <Video source={{ uri: resolveMediaUrl(element.uri!) }} style={element.isBase ? styles.imgBase : styles.imgExtra} resizeMode={ResizeMode.COVER} shouldPlay isLooping />
         )}
         {element.type === 'text' && (
            <View style={[
               styles.textWrap, 
               element.bgStyle === 'solid' && { backgroundColor: element.isBase ? element.color : (element.color === '#FFF' ? '#000' : '#FFF') }, 
               element.bgStyle === 'blur' && { backgroundColor: 'rgba(0,0,0,0.5)' }
            ]}>
               <Text style={[styles.textItem, { color: element.isBase ? (element.color === '#FFF' ? '#000' : '#FFF') : element.color, fontFamily: getFontFamily(element.fontFamily), fontSize: element.isBase ? 42 : 24 }]}>{element.content}</Text>
            </View>
         )}
         {element.type === 'mention' && (
            <View style={styles.mentionRow}>
               {element.avatar_url && <Image source={{ uri: resolveAvatarUrl(element.avatar_url, element.username || element.content) }} style={styles.mentionAvatar} />}
               <Text style={styles.mentionSymbol}>@</Text>
               <Text style={styles.mentionLabel}>{element.username || element.content}</Text>
            </View>
         )}
         {element.type === 'sticker' && <Image source={{ uri: resolveMediaUrl(element.uri) }} style={styles.stickerImg} resizeMode="contain" />}
         {element.type === 'music' && (
            <BlurView intensity={90} tint="dark" style={styles.musicCard}>
               <Image source={{ uri: resolveMediaUrl(element.coverArt) }} style={styles.artThumb} />
               <View style={styles.artMeta}><Text style={styles.artN} numberOfLines={1}>{element.songTitle}</Text><Text style={styles.artA} numberOfLines={1}>{element.artist}</Text></View>
               <Ionicons name="musical-notes" size={24} color={COLORS.secondary} />
            </BlurView>
         )}
         {element.type === 'attribution' && (
            <BlurView intensity={60} tint="dark" style={styles.attrPill}>
               <Image source={{ uri: resolveMediaUrl(element.attributionAvatar || '') }} style={styles.attrAvatar} />
               <Text style={styles.attrUser}>{element.attributionName}</Text>
            </BlurView>
         )}
      </>
   );
};

const InteractiveLayer = ({ 
   element, isFocus, onFocus, onUpdate, onDragStart, onDragEnd, onDoubleTap, onDelete
}: {
   element: StoryElement, isFocus: boolean, onFocus: () => void, onUpdate: (data: Partial<StoryElement>) => void,
   onDragStart: (isBase: boolean) => void, onDragEnd: (g: PanResponderGestureState) => void,
   onDoubleTap?: (el: StoryElement) => void, onDelete: (id: number | string) => void
}) => {
   const pan = useRef(new Animated.ValueXY({ x: element.x, y: element.y })).current;
   const scale = useRef(new Animated.Value(element.scale)).current;
   const rotate = useRef(new Animated.Value(element.rotate)).current;
   const opacity = useRef(new Animated.Value(1)).current;

   const baseW = element.type === 'reshare_canvas' ? CANVAS_WIDTH : (
      (element.type === 'image' && element.isBase) 
         ? (element.width && element.height ? SCREEN_WIDTH : CANVAS_WIDTH) 
         : (element.type === 'image' ? 200 : 280)
   );
    
   const baseH = element.type === 'reshare_canvas' ? CANVAS_HEIGHT : (
      (element.type === 'image' && element.isBase) 
         ? (element.width && element.height ? (SCREEN_WIDTH * (element.height / element.width)) : CANVAS_HEIGHT) 
         : (element.type === 'image' ? 280 : 120)
   );

   const _isPinching = useRef(false);
   const _initialDist = useRef(0);
   const _initialScale = useRef(element.scale);
   const _initialRotate = useRef(element.rotate);
   const _initialAngle = useRef(0);

   const panResponder = useRef(
      PanResponder.create({
         onStartShouldSetPanResponder: () => !element.isLocked, 
         onPanResponderGrant: (e) => {
            onFocus(); onDragStart(!!element.isBase);
            pan.extractOffset();
            _isPinching.current = false;
         },
         onPanResponderMove: (e, g) => {
            const touches = e.nativeEvent.touches;
            if (touches.length === 1 && !_isPinching.current) {
               const distToTrash = Math.sqrt(Math.pow(g.moveX - TRASH_X, 2) + Math.pow(g.moveY - TRASH_Y, 2));
               if (!element.isBase && distToTrash < 100) {
                  if (!(pan as any)._near) { (pan as any)._near = true; Vibration.vibrate(10); }
                  const pull = Math.max(0.1, distToTrash / 110);
                  scale.setValue(element.scale * pull);
                  opacity.setValue(pull);
               } else {
                  if ((pan as any)._near) { (pan as any)._near = false; Animated.spring(scale, { toValue: element.scale, useNativeDriver: true }).start(); Animated.spring(opacity, { toValue: 1, useNativeDriver: true }).start(); }
               }
               pan.x.setValue(g.dx); pan.y.setValue(g.dy);
            } else if (touches.length === 2) {
               const d = Math.sqrt(Math.pow(touches[0].pageX - touches[1].pageX, 2) + Math.pow(touches[0].pageY - touches[1].pageY, 2));
               const angle = Math.atan2(touches[1].pageY - touches[0].pageY, touches[1].pageX - touches[0].pageX) * 180 / Math.PI;
               if (!_isPinching.current) {
                  _isPinching.current = true;
                  _initialDist.current = d; _initialAngle.current = angle; _initialScale.current = (scale as any)._value; _initialRotate.current = (rotate as any)._value;
               } else {
                  scale.setValue(_initialScale.current * (d / _initialDist.current));
                  rotate.setValue(_initialRotate.current + (angle - _initialAngle.current));
               }
            }
         },
         onPanResponderRelease: (e, g) => {
            if ((pan as any)._near && !element.isBase) {
               Animated.parallel([
                  Animated.timing(scale, { toValue: 0, duration: 250, useNativeDriver: true }),
                  Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
                  Animated.timing(pan, { toValue: { x: g.moveX - SCREEN_WIDTH/2, y: g.moveY - SCREEN_HEIGHT/2 }, duration: 250, useNativeDriver: true })
               ]).start(() => { onDelete(element.id); onDragEnd(g); });
               return;
            }
            pan.flattenOffset();
            onUpdate({ x: (pan.x as any)._value, y: (pan.y as any)._value, scale: (scale as any)._value, rotate: (rotate as any)._value });
            onDragEnd(g);
         },
         onPanResponderTerminate: () => { pan.flattenOffset(); onDragEnd({} as any); }
      })
   ).current;

   return (
      <Animated.View
         {...panResponder.panHandlers}
         style={{
            position: 'absolute',
            left: (SCREEN_WIDTH / 2) - (baseW / 2),
            top: (CANVAS_HEIGHT / 2) - (baseH / 2),
            width: baseW, height: baseH,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: element.isBase ? (isFocus ? 50 : 10) : (isFocus ? 600 : 200),
            opacity: opacity,
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: scale }, { rotate: rotate.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) }],
         }}
      >
         <View style={[element.isBase && { ...StyleSheet.absoluteFillObject, borderRadius: ROUNDING, overflow: 'hidden' }, { justifyContent: 'center', alignItems: 'center' }]} pointerEvents="none">
            <SubElementRender element={element} />
         </View>
      </Animated.View>
   );
};

export default function AnuFyNeonEditorPro() {
  const router = useRouter();
  const params = useLocalSearchParams<{ 
    refId?: string, 
    shotId?: string, 
    videoUrl?: string,
    postId?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video'
  }>();
  const { refId, shotId, videoUrl, postId, mediaUrl, mediaType } = params;

  const cameraRef = useRef<any>(null);
  const filterScrollRef = useRef<ScrollView>(null);
  const [mode, setMode] = useState<'capture' | 'edit'>( (refId || shotId || postId) ? 'edit' : 'capture' );
  const [facing, setFacing] = useState<CameraType>('back');
  
  const [elements, setElements] = useState<StoryElement[]>([]);
  const [focusedId, setFocusedId] = useState<number | string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [txtVal, setTxtVal] = useState('');
  const [txtColor, setTxtColor] = useState('#FFFFFF');
  const [txtBg, setTxtBg] = useState<'none'|'solid'|'blur'>('none');
  const [flash, setFlash] = useState<FlashMode>('off');

  // Mention State
  const [userSearch, setUserSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  
  // Doodle State
  const [paths, setPaths] = useState<any[]>([]);
  const [activePath, setActivePath] = useState('');
  const [brushColor, setBrushColor] = useState('#FFD700'); 
  const [brushSize, setBrushSize] = useState(6);
  
  const activeToolRef = useRef(activeTool);
  const brushColorRef = useRef(brushColor);
  const brushSizeRef = useRef(brushSize);
  const tempPath = useRef('');

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { brushColorRef.current = brushColor; }, [brushColor]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);

  const [searchMusic, setSearchMusic] = useState('');
  const [songs, setSongs] = useState<any[]>([]);
  const [isLoadingMusic, setIsLoadingMusic] = useState(false);
  const player = useRef<Audio.Sound | null>(null);
  const musicReqId = useRef(0);
  const [themeIdx, setThemeIdx] = useState(0);

  const cinematicThemes = [ 
    { name: 'Natural', color: 'transparent', preview: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=200' }, 
    { name: 'Warm', color: 'rgba(255, 120, 0, 0.15)', preview: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200' }, 
    { name: 'Cool', color: 'rgba(0, 150, 255, 0.15)', preview: 'https://images.unsplash.com/photo-1502481851512-e9e2529bbbf9?w=200' },
    { name: 'Flashy', color: 'rgba(255, 255, 0, 0.12)', preview: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200' },
    { name: 'Noir', color: 'rgba(0, 0, 0, 0.4)', preview: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=200' },
    { name: 'Vintage', color: 'rgba(139, 69, 19, 0.2)', preview: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=200' },
    { name: 'Cyber', color: 'rgba(255, 0, 255, 0.15)', preview: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200' }
  ];

  const stickers = [
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Cool_Sticker.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Fire_Sticker.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Heart_Sticker.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Cat_Vibe.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Stay_Strong.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Neon_Glow.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Music_Vibes.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690000/stickers/Chill_Out.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690005/stickers/sticker1.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690005/stickers/sticker2.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690005/stickers/sticker3.png',
    'https://res.cloudinary.com/dcm470yhl/image/upload/v1711690005/stickers/sticker4.png'
  ];

  const addSticker = (url: string) => {
    setElements(prev => [...prev, { id: Date.now(), type: 'sticker', uri: url, x: 0, y: 0, scale: 0.8, rotate: 0 }]);
    setActiveTool(null);
  };

  const fetchMusic = async (q: string) => {
    if (!q) return; setIsLoadingMusic(true);
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=15`);
      const data = await res.json(); setSongs(data.results || []);
    } catch(e) {} finally { setIsLoadingMusic(false); }
  };

  const selectSong = async (song: any) => {
    // 🚀 Robust Audio Handling: Track request to prevent overlapping
    musicReqId.current += 1;
    const currentId = musicReqId.current;

    if (player.current) {
      try {
        await player.current.unloadAsync();
      } catch (e) {}
      player.current = null;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: song.previewUrl }, 
        { shouldPlay: true, isLooping: true }
      );
      
      // Only assign and play if this is still the LATEST request
      if (currentId === musicReqId.current) {
        player.current = sound;
        setElements(prev => [
          ...prev.filter(e => e.type !== 'music'), 
          { 
            id: Date.now(), type: 'music', artist: song.artistName, 
            songTitle: song.trackName, coverArt: song.artworkUrl100, 
            previewUrl: song.previewUrl, x: 0, y: -200, scale: 1, rotate: 0 
          }
        ]);
      } else {
        // A newer song was selected while this one was loading; kill this one
        await sound.unloadAsync();
      }
    } catch(err) {
      console.error('Audio select error:', err);
    } 
    setActiveTool(null); 
    setSearchMusic('');
  };

  const fetchFoundUsers = useCallback(async (q: string) => {
    setIsSearchingUsers(true);
    try {
      if (!q) {
        // Fetch mutual friends (mutual followers) by default when no query
        const res = await apiClient.get('/users/list?mutual=true&limit=20');
        if (res.data && res.data.data && res.data.data.users) {
           setFoundUsers(res.data.data.users);
        }
      } else {
        // Search users when query is provided
        const res = await apiClient.get(`/search?q=${q}&limit=10`);
        if (res.data && res.data.users) {
          setFoundUsers(res.data.users);
        }
      }
    } catch (e) {
      console.error('Fetch users error:', e);
    } finally {
      setIsSearchingUsers(false);
    }
  }, []);

  const addMention = (user: any) => {
    const userId = user.id || user._id || user.user_id;
    if (!userId) {
       console.error('No userId found for user:', user);
       return;
    }

    setElements(prev => [...prev, { 
       id: Date.now(), 
       type: 'mention', 
       content: user.username, 
       uri: userId.toString(), 
       x: 0, y: 0, scale: 1, rotate: 0 
    }]);
    setActiveTool(null); 
    setUserSearch('');
  };

  useEffect(() => {
    if (activeTool === 'mention') {
      fetchFoundUsers(userSearch);
    }
  }, [activeTool, userSearch, fetchFoundUsers]);

  const [giphyStickers, setGiphyStickers] = useState<any[]>([]);
  const [stickerSearch, setStickerSearch] = useState('');
  const [isLoadingStickers, setIsLoadingStickers] = useState(false);

  const fetchGiphyStickers = useCallback(async (q: string) => {
    setIsLoadingStickers(true);
    try {
      const res = await apiClient.get(`/stickers/giphy?q=${q}`);
      if (res.data.success) {
        setGiphyStickers(res.data.data);
      }
    } catch (e) {
      console.error('Fetch stickers error:', e);
    } finally {
      setIsLoadingStickers(false);
    }
  }, []);

  useEffect(() => {
    if (activeTool === 'sticker' && giphyStickers.length === 0) {
      fetchGiphyStickers(''); // Load trending if empty
    }
  }, [activeTool, fetchGiphyStickers, giphyStickers.length]);

  useEffect(() => {
    const checkReshare = async () => {
       if (refId) {
          try {
             const res = await apiClient.get(`/stories/${refId}`);
             if (res.data.success) {
                const s = res.data.data;
                
                // 1. Resolve base media (unlocked & floating)
                const baseMedia: StoryElement = { 
                   id: Date.now(), 
                   type: 'image', 
                   uri: s.media_url, 
                   x: 0, y: 0, scale: 1.0, rotate: 0, isBase: true, isLocked: false,
                   attributionName: s.username,
                   attributionAvatar: s.avatar_url,
                   // @ts-ignore
                   isVideo: s.media_type === 'video',
                   width: s.canvas_width || CANVAS_WIDTH,
                   height: s.canvas_height || CANVAS_HEIGHT
                };

                // Check dimensions
                const originalBase = s.elements?.find((e: any) => e.isBase);
                if (originalBase) {
                   baseMedia.width = originalBase.width || s.canvas_width || CANVAS_WIDTH;
                   baseMedia.height = originalBase.height || s.canvas_height || CANVAS_HEIGHT;
                   baseMedia.scale = originalBase.scale || 1.0;
                   baseMedia.rotate = originalBase.rotate || 0;
                   baseMedia.x = originalBase.x || 0;
                   baseMedia.y = originalBase.y || 0;
                }

                // 2. Import all other elements and lock them
                let importedElements: StoryElement[] = [];
                if (s.elements && s.elements.length > 0) {
                   importedElements = s.elements
                      .filter((e: any) => !e.isBase)
                      .map((e: any, idx: number) => ({
                         ...e,
                         id: Date.now() + 100 + idx,
                         uri: e.url || e.uri, 
                         content: e.type === 'mention' ? (e.username || e.content) : e.content, 
                         isLocked: true, 
                      }));
                } else {
                   // Legacy fallback support for older stories
                   if (s.texts) s.texts.forEach((e: any, i: number) => importedElements.push({...e, type: 'text', id: Date.now()+100+i, isLocked: true}));
                   if (s.stickers) s.stickers.forEach((e: any, i: number) => importedElements.push({...e, type: 'sticker', id: Date.now()+200+i, uri: e.url, isLocked: true}));
                   if (s.mentions) s.mentions.forEach((e: any, i: number) => importedElements.push({...e, type: 'mention', id: Date.now()+300+i, content: e.username, isLocked: true}));
                   if (s.music) importedElements.push({...s.music, type: 'music', id: Date.now()+400, isLocked: true});
                }

                // Assemble everything into a single Parent Reshare Canvas
                const reshareCanvas: StoryElement = {
                   id: 'reshare_' + Date.now(),
                   type: 'reshare_canvas',
                   x: 0, y: 0, scale: 0.7, rotate: 0,
                   attributionName: s.username,
                   attributionAvatar: s.avatar_url,
                   width: CANVAS_WIDTH,
                   height: CANVAS_HEIGHT,
                   children: [baseMedia, ...importedElements],
                   doodles: s.doodles || []
                };

                setElements([reshareCanvas]);
                
                // 3. No need to set global doodles or paths if they are in the canvas
                // We keep paths empty for the user's NEW drawings
                setPaths([]);

                // 4. Import Filter
                if (s.filter_color) {
                   const themeIdx = cinematicThemes.findIndex(t => t.color === s.filter_color);
                   if (themeIdx !== -1) setThemeIdx(themeIdx);
                }

                // 5. Auto-play music 
                const originalMusic = s.elements?.find((e: any) => e.type === 'music');
                if (originalMusic && originalMusic.previewUrl) {
                    const playMusic = async () => { 
                        musicReqId.current += 1; 
                        const currentId = musicReqId.current;
                        try {
                            if (player.current) { await player.current.unloadAsync(); }
                            const { sound } = await Audio.Sound.createAsync(
                                { uri: originalMusic.previewUrl },
                                { shouldPlay: true, isLooping: true }
                            );
                            if (currentId === musicReqId.current) { player.current = sound; } else { await sound.unloadAsync(); }
                        } catch (err) { console.error("Failed to play reshared music", err); }
                    };
                    playMusic();
                }

                setMode('edit');
             }
          } catch (e) { console.error('Reshare fetch error:', e); }
       }
    };
    checkReshare();
  }, [refId]);

  useEffect(() => {
    if (shotId && videoUrl) {
       // Clear any previous elements
       setElements([
          // 1. Background Placeholder (Gradient/Blur color)
          { 
             id: 'bg_' + Date.now(),
             type: 'text', content: ' ', // Empty text as background
             color: '#000', bgStyle: 'solid', // Now uses #000 directly for base background
             x: 0, y: 0, scale: 10, rotate: 0, isBase: true, isLocked: true
          },
          // 2. The Shot as a scalable Reshare Card
          { 
             id: 'shot_' + Date.now(), 
             type: 'image', 
             uri: videoUrl, 
             x: 0, y: 0, scale: 0.7, rotate: 0,
             // @ts-ignore
             isVideo: true,
             isLocked: false,
             width: CANVAS_WIDTH * 0.8,
             height: CANVAS_HEIGHT * 0.7
          }
       ]);
       setMode('edit');
       setActiveTool(null);
    }
  }, [shotId, videoUrl]);

  useEffect(() => {
    if (postId && mediaUrl) {
       // Clear any previous elements
       setElements([
          // 1. Background Placeholder
          { 
             id: 'bg_' + Date.now(),
             type: 'text', content: ' ', 
             color: '#000', bgStyle: 'solid', // Now uses #000 directly
             x: 0, y: 0, scale: 10, rotate: 0, isBase: true, isLocked: true
          },
          // 2. The Post as a scalable Reshare Card
          { 
             id: 'post_' + Date.now(), 
             type: 'image', 
             uri: mediaUrl, 
             x: 0, y: 0, scale: 0.7, rotate: 0,
             // @ts-ignore
             isVideo: mediaType === 'video',
             isLocked: false,
             width: CANVAS_WIDTH * 0.8,
             height: CANVAS_HEIGHT * 0.7
          }
       ]);
       setMode('edit');
       setActiveTool(null);
    }
  }, [postId, mediaUrl, mediaType]);

  useEffect(() => { return () => { if (player.current) player.current.unloadAsync(); }; }, []);

  const handleCapture = async () => {
    if (cameraRef.current) {
      const p = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      setElements([{ id: Date.now(), type: 'image', uri: p.uri, x: 0, y: 0, scale: 1, rotate: 0, isBase: true }]); setMode('edit');
    }
  };

  const pickImage = async () => {
    // First pass: let user pick any image or video (no forced crop)
    const r = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9, 
      allowsEditing: false,
      videoMaxDuration: 60,
    });

    if (r.canceled) return;
    const asset = r.assets[0];
    const isVideo = asset.type === 'video';

    // Directly proceed regardless of original duration
    // The viewer is already capped to play max 60 seconds
    if (mode === 'capture') {
      setElements([{ 
        id: Date.now(), type: 'image', uri: asset.uri, 
        x: 0, y: 0, scale: 1, rotate: 0, isBase: true,
        // @ts-ignore
        isVideo, duration: asset.duration,
        width: asset.width, height: asset.height
      }]);
      setMode('edit');
    } else {
      setElements(prev => [...prev, { 
        id: Date.now(), type: 'image', uri: asset.uri, 
        x: 0, y: 0, scale: 0.8, rotate: 0,
        // @ts-ignore
        isLocal: true
      }]);
    }
  };


  const commitText = () => {
    if (txtVal) {
      if (editingId) setElements(prev => prev.map(e => e.id === editingId ? { ...e, content: txtVal, color: txtColor, bgStyle: txtBg } : e));
      else setElements(prev => [...prev, { id: Date.now(), type: 'text', content: txtVal, x: 0, y: 0, scale: 1, rotate: 0, color: txtColor, bgStyle: txtBg }]);
    }
    setTxtVal(''); setEditingId(null); setActiveTool(null);
  };

  const handleShareStory = async () => {
    try {
      setIsUploading(true);
      
      const reshareCanvas = elements.find(e => e.type === 'reshare_canvas');
      const baseEl = elements.find(e => e.isBase) || (reshareCanvas?.children?.find(c => c.isBase));
      
      if (!baseEl || !baseEl.uri) throw new Error('No base image');

      const formData = new FormData();
      const isRemoteBase = baseEl.uri.startsWith('http');

      if (isRemoteBase) {
        formData.append('media_url', baseEl.uri);
      } else {
        const filename = baseEl.uri.split('/').pop() || 'story.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const isVideoEl = (baseEl as any).isVideo || /\.(mp4|mov|avi|mkv|webm)$/i.test(filename);
        const mimeType = isVideoEl 
          ? `video/${match ? match[1] : 'mp4'}`
          : `image/${match ? match[1] : 'jpeg'}`;
        
        // @ts-ignore
        formData.append('media', {
          uri: Platform.OS === 'android' ? baseEl.uri : baseEl.uri.replace('file://', ''),
          name: filename,
          type: mimeType,
        });
      }

      const isVideoEl = (baseEl as any).isVideo || (isRemoteBase && (baseEl as any).isVideo);
      formData.append('media_type', isVideoEl ? 'video' : 'image');

      // Texts with full transform data
      formData.append('texts', JSON.stringify(elements.filter(e => e.type === 'text').map(e => ({ content: e.content, x: e.x, y: e.y, scale: e.scale, rotate: e.rotate, color: e.color, bgStyle: e.bgStyle, fontFamily: e.fontFamily }))));

      // Stickers
      formData.append('stickers', JSON.stringify(elements.filter(e => e.type === 'sticker').map(e => ({ url: e.uri, x: e.x, y: e.y, scale: e.scale, rotate: e.rotate }))));

      // Extra images
      const extraImages = elements.filter(e => e.type === 'image' && !e.isBase);
      const extraRemoteUrls: string[] = [];
      extraImages.forEach((e, idx) => {
        if (e.uri) {
          if (e.uri.startsWith('http')) {
            extraRemoteUrls.push(e.uri);
          } else if ((e as any).isLocal) {
            const fname = e.uri.split('/').pop() || `extra_${idx}.jpg`;
            // @ts-ignore
            formData.append('extra_media', {
              uri: Platform.OS === 'android' ? e.uri : e.uri.replace('file://', ''),
              name: fname,
              type: 'image/jpeg',
            });
          }
        }
      });
      
      if (extraRemoteUrls.length > 0) {
        formData.append('extra_remote_urls', JSON.stringify(extraRemoteUrls));
      }

      // Mentions
      formData.append('mentions', JSON.stringify(elements.filter(e => e.type === 'mention').map(e => ({ user_id: e.uri, username: e.content, x: e.x, y: e.y, scale: e.scale, rotate: e.rotate }))));

      // Doodles
      formData.append('doodles', JSON.stringify(paths.map(p => ({ d: p.d, color: p.color, width: p.width }))));

      // Music
      const musicEl = elements.find(e => e.type === 'music');
      if (musicEl) {
        formData.append('music', JSON.stringify({ songTitle: musicEl.songTitle, artist: musicEl.artist, coverArt: musicEl.coverArt, previewUrl: musicEl.previewUrl, x: musicEl.x, y: musicEl.y, scale: musicEl.scale, rotate: musicEl.rotate }));
      }

      // ─── Recursive Serialization Helper ───
      const serializeElements = (els: StoryElement[]): any[] => {
         return els.map(e => ({
            type: e.type, x: e.x, y: e.y, scale: e.scale, rotate: e.rotate,
            isBase: e.isBase,
            width: e.width,
            height: e.height,
            isLocal: (e as any).isLocal,
            attributionName: e.attributionName,
            attributionAvatar: e.attributionAvatar,
            ...(e.type === 'text' ? { content: e.content, color: e.color, bgStyle: e.bgStyle, fontFamily: e.fontFamily } : {}),
            ...(e.type === 'sticker' ? { url: e.uri } : {}),
            ...(e.type === 'mention' ? { user_id: e.uri, username: e.content } : {}),
            ...(e.type === 'music' ? { songTitle: e.songTitle, artist: e.artist, coverArt: e.coverArt, previewUrl: e.previewUrl } : {}),
            ...(e.type === 'image' ? { url: e.uri } : {}),
            ...(e.type === 'reshare_canvas' ? { 
               children: serializeElements(e.children || []),
               doodles: e.doodles 
            } : {}),
         }));
      };

      formData.append('elements', JSON.stringify(serializeElements(elements)));

      formData.append('canvas_width', String(CANVAS_WIDTH));
      formData.append('canvas_height', String(CANVAS_HEIGHT));
      formData.append('filter', cinematicThemes[themeIdx].name);
      formData.append('filter_color', cinematicThemes[themeIdx].color);

      if (refId) {
        formData.append('ref_id', refId as string);
        formData.append('ref_type', 'story');
        
        // Find attribution info from pinned base or reshare canvas
        const attrSource = elements.find(e => e.isBase) || elements.find(e => e.type === 'reshare_canvas');
        if (attrSource) {
           formData.append('original_creator_username', attrSource.attributionName || '');
           formData.append('original_creator_avatar', attrSource.attributionAvatar || '');
        }
      }

      const res = await apiClient.post('/stories', formData, {
        headers: {
          'Accept': 'application/json',
        }
      });

      if (res.data.success) {
        Alert.alert('Success', 'Story shared successfully!');
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to share story');
    } finally {
      setIsUploading(false);
    }
  };

  const onDiscard = () => { 
    setElements([]); 
    setPaths([]); 
    setMode('capture'); 
    setShowDiscardModal(false); 
    setThemeIdx(0); 
    musicReqId.current += 1; // 🚀 Invalidate all in-flight audio requests
    if (player.current) {
      player.current.unloadAsync(); 
      player.current = null;
    }
  };

  const undoLastStroke = () => { setPaths(prev => prev.slice(0, -1)); Vibration.vibrate(10); };

  const drawResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => activeToolRef.current === 'brush',
      onMoveShouldSetPanResponder: () => activeToolRef.current === 'brush',
      onPanResponderGrant: (e) => {
        const touch = e.nativeEvent.touches[0] || e.nativeEvent;
        tempPath.current = `M${touch.locationX.toFixed(1)},${touch.locationY.toFixed(1)}`;
        setActivePath(tempPath.current);
      },
      onPanResponderMove: (e) => {
        const touch = e.nativeEvent.touches[0] || e.nativeEvent;
        if (!isNaN(touch.locationX) && !isNaN(touch.locationY)) {
          tempPath.current += ` L${touch.locationX.toFixed(1)},${touch.locationY.toFixed(1)}`;
          setActivePath(tempPath.current);
        }
      },
      onPanResponderRelease: () => {
        if (tempPath.current && tempPath.current.length > 5) {
          const newStroke = { d: tempPath.current, color: brushColorRef.current, width: brushSizeRef.current };
          setPaths(prev => [...prev, newStroke]);
        }
        tempPath.current = '';
        setActivePath('');
      }
    })
  ).current;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent />
      
      {mode === 'capture' ? (
        <View style={StyleSheet.absoluteFill}>
           <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} flash={flash} facing={facing} />
           <View style={[StyleSheet.absoluteFill, { backgroundColor: cinematicThemes[themeIdx].color, pointerEvents: 'none' }]} />
           <SafeAreaView style={styles.captureUI}>
              <View style={styles.topNav}><TouchableOpacity onPress={()=>router.back()} style={styles.iconBtn}><Ionicons name="close" size={30} color="#FFF" /></TouchableOpacity><TouchableOpacity onPress={()=>setFlash(f=>f==='on'?'off':'on')} style={[styles.iconBtn, flash==='on'&&{backgroundColor:'#FFD700'}]}><Ionicons name={flash==='on'?"flash":"flash-off"} size={22} color={flash==='on'?"#000":"#FFF"}/></TouchableOpacity></View>
              <View style={{flex:1}} />
              <View style={styles.filterBar}>
                 <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={false} snapToInterval={90} decelerationRate="fast" onScroll={(e)=>{let i=Math.round(e.nativeEvent.contentOffset.x/90); if(i!==themeIdx&&i>=0&&i<cinematicThemes.length){setThemeIdx(i); Vibration.vibrate(5);}}} scrollEventThrottle={16} contentContainerStyle={{paddingHorizontal:SCREEN_WIDTH/2-45}}>
                    {cinematicThemes.map((f, i) => (
                       <TouchableOpacity key={i} onPress={()=>i===themeIdx?handleCapture():filterScrollRef.current?.scrollTo({x:i*90, animated:true})} style={styles.filterWrap}>
                           <View style={[styles.ring, themeIdx===i&&styles.ringA]}><Image source={{uri:f.preview}} style={styles.ringImg} /><View style={[styles.ringO, {backgroundColor:f.color}]} /></View>
                       </TouchableOpacity>
                    ))}
                 </ScrollView>
              </View>
              <View style={styles.bottomNav}><TouchableOpacity onPress={pickImage}><Ionicons name="images" size={28} color="#FFF" /></TouchableOpacity><Text style={styles.storyModeTxt}>STORY</Text><TouchableOpacity onPress={()=>setFacing(f=>f==='back'?'front':'back')}><Ionicons name="camera-reverse" size={28} color="#FFF" /></TouchableOpacity></View>
           </SafeAreaView>
        </View>
      ) : (
        <View style={styles.editorRoot}>
          <View style={styles.canvasContainer}>
             {elements.map(el => (
                <InteractiveLayer 
                  key={el.id} element={el} isFocus={focusedId === el.id} onFocus={() => setFocusedId(el.id)}
                  onUpdate={(d) => setElements(p => p.map(e => e.id === el.id ? { ...e, ...d } : e))}
                  onDragStart={(b) => { if (!b) setShowTrash(true); setIsInteracting(true); }}
                  onDragEnd={() => { setShowTrash(false); setIsInteracting(false); }}
                  onDoubleTap={(e)=>{setTxtVal(e.content||''); setTxtColor(e.color||'#FFF'); setTxtBg(e.bgStyle||'none'); setEditingId(e.id); setActiveTool('text');}}
                  onDelete={(id) => {
                     const el = elements.find(e => e.id === id);
                     if (el?.type === 'music' && player.current) { player.current.unloadAsync(); player.current = null; }
                     setElements(p => p.filter(e => e.id !== id));
                  }}
                />
             ))}
             
             <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', zIndex: 1000 }]}>
                <Svg style={StyleSheet.absoluteFill}>
                   {paths.map((p, i) => <NeonStroke key={`path-${i}`} d={p.d} color={p.color} width={p.width} />)}
                   {activePath ? <NeonStroke d={activePath} color={brushColor} width={brushSize} /> : null}
                </Svg>
             </View>

             <View {...(activeTool === 'brush' ? drawResponder.panHandlers : {})} style={[StyleSheet.absoluteFill, { zIndex: activeTool === 'brush' ? 5000 : 1, backgroundColor: 'transparent' }]} />

             <View style={[StyleSheet.absoluteFill, { backgroundColor: cinematicThemes[themeIdx].color, pointerEvents: 'none', zIndex: 40, borderRadius: ROUNDING }]} />
          </View>

          <SafeAreaView style={[styles.editorOverlays, isInteracting && { opacity: 0 }]} pointerEvents="box-none">
             <View style={styles.editorHeader}>
                {activeTool === 'brush' ? (
                   <View style={styles.brushHeader}>
                      <TouchableOpacity onPress={undoLastStroke} style={styles.hdrIcon}><Ionicons name="arrow-undo" size={26} color="#FFF" /></TouchableOpacity>
                      <View style={styles.sizeSwitcher}>
                         {[
                           { s: 3, icon: 'pencil' },
                           { s: 8, icon: 'brush' },
                           { s: 16, icon: 'pencil-sharp' }
                         ].map(b => (
                            <TouchableOpacity key={b.s} onPress={() => setBrushSize(b.s)} style={[styles.sizeItem, brushSize === b.s && styles.sizeItemActive]}>
                               <Ionicons name={b.icon as any} size={b.s === 16 ? 28 : (b.s === 8 ? 24 : 20)} color={brushSize === b.s ? COLORS.secondary : "#FFF"} />
                            </TouchableOpacity>
                         ))}
                      </View>
                      <TouchableOpacity onPress={() => setActiveTool(null)} style={styles.hdrIcon}><Ionicons name="checkmark-circle" size={36} color={COLORS.secondary} /></TouchableOpacity>
                   </View>
                ) : (
                   <>
                     <TouchableOpacity onPress={() => setShowDiscardModal(true)} style={styles.hdrBtn}><Ionicons name="chevron-back" size={32} color="#FFF" /></TouchableOpacity>
                     <BlurView intensity={70} tint="dark" style={styles.originalTools}>
                        {[ { id: 'text', n: 'text' }, { id: 'music', n: 'musical-notes' }, { id: 'brush', n: 'brush' }, { id: 'sticker', n: 'happy' }, { id: 'mention', n: 'at' } ].map(t => (
                           <TouchableOpacity key={t.id} style={[styles.tIcon, activeTool === t.id && styles.tIconA]} onPress={()=>setActiveTool(t.id)}>
                              <Ionicons name={t.n as any} size={22} color={activeTool === t.id ? COLORS.secondary : "#FFF"} />
                           </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.tIcon} onPress={pickImage}><Ionicons name="images" size={22} color="#FFF" /></TouchableOpacity>
                     </BlurView>
                   </>
                )}
             </View>
             
             <View style={{ flex: 1 }} />

             <View style={styles.bottomSection}>
                {activeTool === 'brush' ? (
                   <View style={styles.brushBottomBar}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorPlates}>
                         {['#FFD700', '#FF4500', '#ADFF2F', '#00FFFF', '#FF00FF', '#FFFFFF', '#000000', '#FF3B30', '#34C759', '#007AFF'].map(c => (
                            <TouchableOpacity key={c} onPress={() => setBrushColor(c)} style={[styles.plate, { backgroundColor: c }, brushColor === c && styles.plateActive]} />
                         ))}
                      </ScrollView>
                   </View>
                ) : (
                   <View style={styles.actionSection}>
                      <TouchableOpacity style={styles.privateBtn} onPress={()=>handleShareStory()}>
                         <Text style={styles.privateBtnT}>Private Share</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.shareBtn, styles.glowShare]} onPress={()=>handleShareStory()}>
                         <Text style={styles.shareBtnT}>Share to Story</Text>
                      </TouchableOpacity>
                   </View>
                )}
             </View>
          </SafeAreaView>

          {showTrash && (
             <View style={styles.trashCircleContainer}>
                <BlurView intensity={20} tint="dark" style={styles.trashCircle}>
                   <Ionicons name="trash" size={36} color={COLORS.error} />
                </BlurView>
             </View>
          )}

          <Modal visible={activeTool === 'music'} animationType="slide" transparent>
             <View style={styles.mFull}>
                <View style={styles.mTRow}>
                   <Text style={styles.mT}>Music Library</Text>
                   <TouchableOpacity onPress={()=>setActiveTool(null)}><Ionicons name="close-circle" size={32} color="#FFF" /></TouchableOpacity>
                </View>
                <TextInput placeholder="Search songs..." placeholderTextColor="#666" style={styles.mInp} value={searchMusic} onChangeText={(t)=>{setSearchMusic(t); fetchMusic(t);}} />
                {isLoadingMusic ? (
                   <View style={{flex: 1, justifyContent: 'center'}}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
                ) : (
                   <FlatList data={songs} keyExtractor={(i)=>i.trackId} renderItem={({item})=>(
                      <TouchableOpacity style={styles.sRow} onPress={()=>selectSong(item)}>
                         <Image source={{uri:item.artworkUrl100}} style={styles.sArt} />
                         <View style={styles.sInfo}><Text style={styles.sN}>{item.trackName}</Text><Text style={styles.sA}>{item.artistName}</Text></View>
                         <Ionicons name="play-circle" size={30} color={COLORS.secondary} />
                      </TouchableOpacity>
                   )} />
                )}
             </View>
          </Modal>

          <Modal visible={activeTool === 'text'} animationType="slide" transparent>
             <View style={styles.txtOverlay}>
                <SafeAreaView style={{flex:1}}>
                   <View style={styles.txtHdr}>
                      <TouchableOpacity onPress={()=>setTxtBg(b=>b==='none'?'solid':(b==='solid'?'blur':'none'))} style={styles.txtOpt}><Ionicons name={txtBg==='none'?"square-outline":(txtBg==='solid'?"square":"contrast-outline")} size={24} color="#FFF"/></TouchableOpacity>
                      <TouchableOpacity onPress={commitText}><Text style={styles.txtDone}>Done</Text></TouchableOpacity>
                   </View>
                   <View style={styles.txtCent}><TextInput autoFocus multiline value={txtVal} onChangeText={setTxtVal} style={[styles.txtInp, { color: txtColor }, txtBg==='solid'&&{backgroundColor:txtColor==='#FFF'?'#000':'#FFF', paddingHorizontal:20, borderRadius:10}]} /></View>
                   <View style={styles.paletteHolder}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20, gap:15}}>
                         {['#FFF', '#000', '#FFD700', '#FF4500', '#32CD32', '#1E90FF', '#FF00FF', '#00FFFF'].map(c=>(<TouchableOpacity key={c} onPress={()=>setTxtColor(c)} style={[styles.cDot, {backgroundColor:c}, txtColor===c&&styles.cDotA]}/>))}
                      </ScrollView>
                   </View>
                </SafeAreaView>
             </View>
          </Modal>

          <Modal visible={activeTool === 'mention'} animationType="slide" transparent>
             <View style={styles.stickerFull}>
                <View style={styles.mTRow}>
                   <Text style={styles.mT}>Mention User</Text>
                   <TouchableOpacity onPress={()=>setActiveTool(null)}><Ionicons name="close-circle" size={32} color="#FFF" /></TouchableOpacity>
                </View>
                <TextInput 
                   placeholder="Type username..." 
                   placeholderTextColor="#666" 
                   style={styles.stickerSearchInp}
                   value={userSearch}
                   onChangeText={setUserSearch}
                />
                {isSearchingUsers ? (
                   <View style={{flex: 1, justifyContent: 'center'}}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
                ) : (
                   <FlatList 
                      data={foundUsers} 
                      keyExtractor={(i)=>i.id || i._id} 
                      renderItem={({item})=>(
                         <TouchableOpacity style={styles.sRow} onPress={()=>addMention(item)}>
                            <Image source={{uri: item.avatar || item.avatar_url}} style={styles.sArt} />
                            <View style={styles.sInfo}>
                               <Text style={styles.sN}>{item.username}</Text>
                               <Text style={styles.sA}>{item.fullName || item.full_name || item.name}</Text>
                            </View>
                            {item.verified && <Ionicons name="checkmark-circle" size={20} color={COLORS.secondary} />}
                         </TouchableOpacity>
                      )} 
                   />
                )}
             </View>
          </Modal>

          <Modal visible={activeTool === 'sticker'} animationType="slide" transparent>
             <View style={styles.stickerFull}>
                <View style={styles.mTRow}>
                   <Text style={styles.mT}>GIPHY Stickers</Text>
                   <TouchableOpacity onPress={()=>setActiveTool(null)}><Ionicons name="close-circle" size={32} color="#FFF" /></TouchableOpacity>
                </View>
                
                <TextInput 
                   placeholder="Search animated stickers..." 
                   placeholderTextColor="#666" 
                   style={styles.stickerSearchInp}
                   value={stickerSearch}
                   onChangeText={(t) => {
                     setStickerSearch(t);
                     fetchGiphyStickers(t);
                   }}
                />

                {isLoadingStickers ? (
                   <View style={{flex: 1, justifyContent: 'center'}}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
                ) : (
                   <FlatList 
                      data={giphyStickers} 
                      keyExtractor={(i)=>i.id} 
                      numColumns={3}
                      columnWrapperStyle={{gap: 15, marginBottom: 15}}
                      renderItem={({item})=>(
                         <TouchableOpacity style={{ flex: 1, height: 110 }} onPress={()=>addSticker(item.url)}>
                            <Image source={{uri: item.preview_url || item.url}} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                         </TouchableOpacity>
                      )} 
                   />
                )}
             </View>
          </Modal>

          <Modal visible={showDiscardModal} transparent animationType="slide"><View style={styles.alertO}><BlurView intensity={95} tint="dark" style={styles.alertB}><Text style={styles.alertT}>Discard Story?</Text><View style={styles.alertActs}><TouchableOpacity style={styles.alertD} onPress={onDiscard}><Text style={styles.alertDT}>Discard</Text></TouchableOpacity><TouchableOpacity style={styles.alertG} onPress={()=>setShowDiscardModal(false)}><Text style={styles.alertGT}>Keep Editing</Text></TouchableOpacity></View></BlurView></View></Modal>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  captureUI: { flex: 1, zIndex: 100 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 25 },
  iconBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  filterBar: { height: 120, justifyContent: 'center' },
  filterWrap: { width: 90, height: 90, justifyContent: 'center', alignItems: 'center' },
  ring: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  ringA: { width: 85, height: 85, borderRadius: 42.5, borderColor: '#FFF' },
  ringImg: { width: '100%', height: '100%' },
  ringO: { ...StyleSheet.absoluteFillObject },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 40, paddingHorizontal: 30 },
  storyModeTxt: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  editorRoot: { flex: 1, backgroundColor: '#000' },
  canvasContainer: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundColor: '#111', borderRadius: 0, overflow: 'hidden', marginTop: 10, zIndex: 1 },
  imgBase: { width: '100%', height: '100%' },
  imgExtra: { width: 200, height: 280, borderRadius: 0 },
  textWrap: { minWidth: 60, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12 },
  textItem: { fontSize: 42, fontWeight: '900', textAlign: 'center' },
  mentionRow: { backgroundColor: COLORS.secondary, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 30, flexDirection: 'row', alignItems: 'center' },
  mentionAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  mentionSymbol: { color: '#FFF', fontWeight: '900', fontSize: 18, marginRight: 2 },
  mentionLabel: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  musicCard: { width: 220, height: 75, borderRadius: 15, flexDirection: 'row', alignItems: 'center', padding: 10, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  artThumb: { width: 55, height: 55, borderRadius: 8 },
  artMeta: { flex: 1, marginLeft: 12 },
  artN: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  artA: { color: '#AAA', fontSize: 11 },
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
  editorOverlays: { ...StyleSheet.absoluteFillObject, zIndex: 10000 },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 40, alignItems: 'center', height: 100 },
  hdrBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  originalTools: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 30, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.4)' },
  tIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  tIconA: { backgroundColor: 'rgba(255,255,255,0.15)' },
  brushHeader: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 50, paddingHorizontal: 15, paddingVertical: 5, marginHorizontal: 20 },
  hdrIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sizeSwitcher: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  sizeItem: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  sizeItemActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  bottomSection: { height: 120, justifyContent: 'center' },
  actionSection: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 15 },
  privateBtn: { flex: 1, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.11)', justifyContent: 'center', alignItems: 'center' },
  privateBtnT: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  shareBtn: { flex: 1.4, height: 60, borderRadius: 30, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center' },
  shareBtnT: { color: '#FFF', fontWeight: '900', fontSize: 17 },
  glowShare: { shadowColor: COLORS.secondary, shadowRadius: 15, elevation: 15 },
  brushBottomBar: { height: 60, justifyContent: 'center' },
  colorPlates: { paddingHorizontal: 15, paddingVertical: 10, gap: 12, alignItems: 'center' },
  plate: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#333' },
  plateActive: { borderColor: '#FFF', transform: [{ scale: 1.15 }] },
  trashCircleContainer: { position: 'absolute', bottom: 150, alignSelf: 'center', zIndex: 11000 },
  trashCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.error },
  mFull: { flex: 1, padding: 30, paddingTop: 60, zIndex: 12000 },
  mTRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  mT: { color: '#FFF', fontSize: 26, fontWeight: '900' },
  mInp: { backgroundColor: 'rgba(255,255,255,0.1)', height: 56, borderRadius: 15, paddingHorizontal: 20, color: '#FFF', marginBottom: 20 },
  sRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  sArt: { width: 55, height: 55, borderRadius: 8 },
  sInfo: { flex: 1, marginLeft: 15 },
  sN: { color: '#FFF', fontWeight: '800' },
  sA: { color: '#888' },
  txtOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 12000 },
  txtHdr: { flexDirection: 'row', justifyContent: 'space-between', padding: 25 },
  txtDone: { color: COLORS.secondary, fontSize: 22, fontWeight: '900' },
  txtCent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  txtInp: { fontSize: 50, fontWeight: '900', textAlign: 'center', width: '90%' },
  paletteHolder: { height: 80, paddingBottom: 20 },
  cDot: { width: 35, height: 35, borderRadius: 17.5, borderWidth: 2, borderColor: '#FFF' },
  cDotA: { transform: [{ scale: 1.2 }], borderColor: COLORS.secondary },
  alertO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 13000 },
  alertB: { width: '80%', padding: 30, borderRadius: 30, overflow: 'hidden', alignItems: 'center' },
  alertT: { color: '#FFF', fontSize: 22, fontWeight: '900', marginBottom: 25 },
  alertActs: { width: '100%', gap: 10 },
  alertD: { height: 55, borderRadius: 27.5, backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center' },
  alertG: { height: 55, borderRadius: 27.5, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  alertDT: { color: '#FFF', fontWeight: '900' },
  alertGT: { color: '#FFF', fontWeight: '800' },
  txtOpt: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  stickerImg: { width: 140, height: 140 },
  stickerFull: { flex: 1, padding: 25, paddingTop: 60, zIndex: 12000, backgroundColor: '#121212' },
  stickerSearchInp: { backgroundColor: 'rgba(255,255,255,0.1)', height: 50, borderRadius: 15, paddingHorizontal: 20, color: '#FFF', marginBottom: 20 },
  giphyItem: { flex: 1, height: 110, justifyContent: 'center', alignItems: 'center' },
  giphyPreview: { width: '100%', height: '100%' },
});
