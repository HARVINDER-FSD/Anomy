import { create } from 'zustand';
import {
  ExploreBootstrapData,
  ReelsBootstrapData,
  ChatBootstrapData,
  NotificationsBootstrapData,
  ProfileBootstrapData,
} from '../types/screenBootstrap';

export const SCREEN_TTLS = {
  explore: 2 * 60 * 1000,       // 2 mins
  reels: 60 * 1000,             // 1 min
  chat: 15 * 1000,              // 15 secs
  notifications: 15 * 1000,     // 15 secs
  profile: 5 * 60 * 1000,       // 5 mins
  stories: 30 * 1000,           // 30 secs
  search: 5 * 60 * 1000,        // 5 mins
  anonymous: 60 * 1000,         // 60 secs
};

export interface ScreenEnvelope<T> {
  data: T;
  lastFetched: number;
}

interface MultiScreenStoreState {
  explore: ScreenEnvelope<ExploreBootstrapData> | null;
  reels: ScreenEnvelope<ReelsBootstrapData> | null;
  chat: ScreenEnvelope<ChatBootstrapData> | null;
  notifications: ScreenEnvelope<NotificationsBootstrapData> | null;
  profile: ScreenEnvelope<ProfileBootstrapData> | null;
  stories: ScreenEnvelope<any> | null;
  search: ScreenEnvelope<any> | null;
  anonymous: ScreenEnvelope<any> | null;

  setExploreData: (data: ExploreBootstrapData) => void;
  setReelsData: (data: ReelsBootstrapData) => void;
  setChatData: (data: ChatBootstrapData) => void;
  setNotificationsData: (data: NotificationsBootstrapData) => void;
  setProfileData: (data: ProfileBootstrapData) => void;
  setStoriesData: (data: any) => void;
  setSearchData: (data: any) => void;
  setAnonymousData: (data: any) => void;

  isStale: (screen: 'explore' | 'reels' | 'chat' | 'notifications' | 'profile' | 'stories' | 'search' | 'anonymous') => boolean;
}

export const useMultiScreenStore = create<MultiScreenStoreState>((set, get) => ({
  explore: null,
  reels: null,
  chat: null,
  notifications: null,
  profile: null,
  stories: null,
  search: null,
  anonymous: null,

  setExploreData: (data) => set({ explore: { data, lastFetched: Date.now() } }),
  setReelsData: (data) => set({ reels: { data, lastFetched: Date.now() } }),
  setChatData: (data) => set({ chat: { data, lastFetched: Date.now() } }),
  setNotificationsData: (data) => set({ notifications: { data, lastFetched: Date.now() } }),
  setProfileData: (data) => set({ profile: { data, lastFetched: Date.now() } }),
  setStoriesData: (data) => set({ stories: { data, lastFetched: Date.now() } }),
  setSearchData: (data) => set({ search: { data, lastFetched: Date.now() } }),
  setAnonymousData: (data) => set({ anonymous: { data, lastFetched: Date.now() } }),

  isStale: (screen) => {
    const envelope = get()[screen];
    if (!envelope) return true;
    const ttl = SCREEN_TTLS[screen];
    return Date.now() - envelope.lastFetched > ttl;
  },
}));
