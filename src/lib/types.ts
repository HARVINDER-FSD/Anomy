export interface User {
  id?: string;
  _id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  avatar?: string;
  is_verified?: boolean;
  badge_type?: string | null;
  is_online?: boolean;
  last_seen?: string;
  isAnonymousMode?: boolean;
  anonymousPersona?: {
    name: string;
    username: string;
    avatar: string;
  };
}

export interface Message {
  id?: string;
  _id: string;
  conversation_id: string;
  sender_id: any; // Can be string or UserDetails object
  content: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'location' | 'file' | 'sticker' | 'post' | 'reel' | 'lottie_voice' | 'story_reply' | 'shot_share' | 'post_share' | 'profile_share';
  media_url?: string;
  author_username?: string;
  author_avatar?: string;
  attachments?: Array<{ url: string; type: string }>;
  is_deleted: boolean;
  deleted_for?: string[];
  reactions?: Record<string, string> | any;
  reply_to_id?: any;
  is_edited?: boolean;
  is_pinned?: boolean;
  is_forwarded?: boolean;
  created_at: string | Date;
  updated_at?: string | Date;
  status?: 'sent' | 'delivered' | 'read' | 'sending' | 'error';
  uploadProgress?: number; // 🚀 Real-time upload progress (0-100)
  delivered_to?: Array<{ user_id: string }>;
  read_by?: Array<{ user_id: string }>;
  tempMessageId?: string;
  isNew?: boolean;
}


export interface Conversation {
  id?: string;
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  participants: any[]; // Flexible to handle {user: User} or just User
  last_message?: Message;
  unread_count?: number;
  unread_counts?: Record<string, number>;
  pinned_by?: string[];
  muted_by?: string[];
  is_disappearing?: boolean;
  theme_id?: string;
  wallpaper_url?: string;
  created_at: string | Date;
  updated_at: string | Date;
  is_anonymous?: boolean;
}

