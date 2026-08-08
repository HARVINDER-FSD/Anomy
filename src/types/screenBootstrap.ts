import { BootstrapMode } from './bootstrap';

export interface ExploreBootstrapData {
  trendingHashtags: string[];
  exploreGrid: any[];
  searchSuggestions: string[];
  featuredCreators: any[];
}

export interface ReelsBootstrapData {
  reels: any[];
  audioTracks: any[];
  page: number;
  hasNext: boolean;
}

export interface ChatBootstrapData {
  conversations: any[];
  ghostRooms: any[];
  unreadTotal: number;
  onlineFriends: any[];
}

export interface NotificationsBootstrapData {
  notifications: any[];
  followRequests: any[];
  unreadCount: number;
}

export interface ProfileBootstrapData {
  profile: any;
  userPosts: any[];
  bookmarks: any[];
  highlights: any[];
  stats: {
    postsCount: number;
    followersCount: number;
    followingCount: number;
  };
}
