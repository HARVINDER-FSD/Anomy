export type BootstrapMode = 'normal' | 'anonymous';

export interface BootstrapUserProfile {
  id: string;
  _id: string;
  username: string;
  name: string;
  avatar: string;
  avatar_url?: string;
  bio?: string;
  isVerified?: boolean;
  isPrivate?: boolean;
  anonymousUsername?: string;
  anonymousAvatar?: string;
  anonymousBio?: string;
  activeMode: BootstrapMode;
}

export interface BootstrapFeedPost {
  _id: string;
  id: string;
  content: string;
  media_urls?: string[];
  media_type?: string;
  thumbnail_url?: string;
  likes_count: number;
  comments_count: number;
  shares_count?: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  is_anonymous?: boolean;
  createdAt: string;
  likers?: Array<{
    _id: string;
    id: string;
    username: string;
    avatar_url?: string;
  }>;
  author: {
    _id: string;
    username: string;
    avatar_url?: string;
    name?: string;
    isVerified?: boolean;
  };
}

export interface BootstrapStory {
  _id: string;
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: string;
  createdAt: string;
  expiresAt: string;
  isViewed?: boolean;
  user: {
    _id: string;
    username: string;
    avatar_url?: string;
  };
}

export interface BootstrapReel {
  _id: string;
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
  is_anonymous?: boolean;
  author: {
    _id: string;
    username: string;
    avatar_url?: string;
  };
}

export interface BootstrapSuggestedUser {
  _id: string;
  id: string;
  username: string;
  name: string;
  avatar_url?: string;
  bio?: string;
  isVerified?: boolean;
  isFollowing?: boolean;
}

export interface BootstrapUserSettings {
  theme: 'light' | 'dark' | 'system';
  pushNotificationsEnabled: boolean;
  messageControls: string;
  privacyMode: string;
  language: string;
}

export interface BootstrapFeatureFlags {
  enableReels: boolean;
  enableAnonymousChat: boolean;
  enableSecretCrush: boolean;
  enableAIModal: boolean;
  enableAgoraCalls: boolean;
}

export interface BootstrapAppConfig {
  minAppVersion: string;
  latestAppVersion: string;
  maintenanceMode: boolean;
  cdnBaseUrl: string;
  supportEmail: string;
}

export interface BootstrapResponseData {
  user: BootstrapUserProfile;
  currentMode: BootstrapMode;
  feed: BootstrapFeedPost[];
  stories: BootstrapStory[];
  shorts: BootstrapReel[];
  unreadNotificationCount: number;
  unreadChatCount: number;
  suggestedUsers: BootstrapSuggestedUser[];
  userSettings: BootstrapUserSettings;
  featureFlags: BootstrapFeatureFlags;
  applicationConfig: BootstrapAppConfig;
  trendingInterests: string[];
}

export interface BootstrapResponse {
  success: boolean;
  mode: BootstrapMode;
  timestamp: number;
  data: BootstrapResponseData;
}
