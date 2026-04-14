import { create } from 'zustand';

export type LayerType = 'video' | 'audio' | 'text' | 'sticker' | 'image' | 'effect' | 'filter';

export interface EditorClip {
  id: string;
  uri: string;
  trimStart: number;
  trimEnd: number;
  speed: number;
  startTime: number; // Timeline position
  duration: number; // Final playback duration (trimmed_len / speed)
  fullDuration: number; // Original file duration
}

export interface EditorLayer {
  id: string;
  type: LayerType;
  startTime: number;
  endTime: number;
  x: number; // Normalized 0-1
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
  content?: string;
  uri?: string;
  color?: string;
  background?: string;
  opacity: number;
  volume?: number;
  fontSize?: number;
}

interface EditorProject {
  clips: EditorClip[];
  layers: EditorLayer[];
  currentTime: number;
  isPlaying: boolean;
  totalDuration: number;
  isMuted: boolean;
  selectedLayerId: string | null;
  activeFilter: number;
  activeMusic: { url: string; volume: number; trimStart: number; trimEnd: number; duration: number } | null;
  history: any[];
}

interface EditorActions {
  addClip: (uri: string, duration?: number) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, updates: Partial<EditorClip>) => void;
  addLayer: (layer: Partial<EditorLayer>) => void;
  updateLayer: (id: string, updates: Partial<EditorLayer>) => void;
  removeLayer: (id: string) => void;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setIsMuted: (isMuted: boolean) => void;
  calculateTimeline: () => void;
  selectLayer: (id: string | null) => void;
  setActiveFilter: (filter: number) => void;
  setMusic: (music: { url: string; volume: number; trimStart?: number; trimEnd?: number; duration?: number } | null) => void;
  updateMusicTrim: (updates: { trimStart?: number; trimEnd?: number }) => void;
  clearProject: () => void;
}

export const useEditorStore = create<EditorProject & EditorActions>((set, get) => ({
  clips: [],
  layers: [],
  currentTime: 0,
  isPlaying: false,
  totalDuration: 0,
  isMuted: false,
  selectedLayerId: null,
  activeFilter: 0,
  activeMusic: null,
  history: [],

  addClip: (uri, duration = 5000) => {
    const { clips } = get();
    const newStartTime = clips.reduce((acc, c) => acc + c.duration, 0);
    const newClip: EditorClip = {
      id: Math.random().toString(36).substr(2, 9),
      uri,
      trimStart: 0,
      trimEnd: duration,
      speed: 1,
      startTime: newStartTime,
      duration: duration,
      fullDuration: duration
    };
    set({ clips: [...clips, newClip] });
    get().calculateTimeline();
  },

  updateClip: (id, updates) => {
    set((state) => ({
      clips: state.clips.map(c => c.id === id ? { ...c, ...updates } : c)
    }));
    get().calculateTimeline();
  },

  removeClip: (id) => {
     set({ clips: get().clips.filter(c => c.id !== id) });
     get().calculateTimeline();
  },

  addLayer: (layer) => {
    const { layers, totalDuration } = get();
    const newLayer: EditorLayer = {
      id: Math.random().toString(36).substr(2, 9),
      type: layer.type || 'text',
      startTime: layer.startTime ?? 0,
      endTime: layer.endTime ?? totalDuration,
      x: layer.x ?? 0.5,
      y: layer.y ?? 0.5,
      scale: layer.scale ?? 1,
      rotation: layer.rotation ?? 0,
      zIndex: layers.length,
      opacity: 1,
      ...layer
    };
    set({ layers: [...layers, newLayer] });
  },

  updateLayer: (id, updates) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, ...updates } : l)
  })),

  removeLayer: (id) => set((state) => ({
    layers: state.layers.filter(l => l.id !== id),
    selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId
  })),

  setCurrentTime: (time) => set({ currentTime: time }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setIsMuted: (isMuted) => set({ isMuted: isMuted }),
  selectLayer: (id) => set({ selectedLayerId: id }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setMusic: (music) => set({ 
    activeMusic: music ? { 
      trimStart: 0, 
      trimEnd: music.duration || 30000, 
      duration: music.duration || 30000,
      ...music 
    } : null 
  }),
  updateMusicTrim: (updates) => set((state) => ({
    activeMusic: state.activeMusic ? { ...state.activeMusic, ...updates } : null
  })),

  calculateTimeline: () => {
    const { clips } = get();
    let currentPos = 0;
    const updatedClips = clips.map(c => {
       const clipDuration = (c.trimEnd - c.trimStart) / c.speed;
       const updatedC = { ...c, startTime: currentPos, duration: clipDuration };
       currentPos += clipDuration;
       return updatedC;
    });
    set({ clips: updatedClips, totalDuration: currentPos });
  },

  clearProject: () => set({ clips: [], layers: [], currentTime: 0, isPlaying: false, totalDuration: 0, isMuted: false, selectedLayerId: null, activeFilter: 0, activeMusic: null })
}));
