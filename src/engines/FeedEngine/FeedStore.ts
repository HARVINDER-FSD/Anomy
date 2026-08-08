import { create } from 'zustand';

export interface PostItem {
  _id: string;
  id?: string;
  author: any;
  content: string;
  media_urls?: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
}

interface FeedStoreState {
  posts: PostItem[];
  isLoading: boolean;
  hasMore: boolean;

  setPosts: (posts: PostItem[]) => void;
  appendPosts: (posts: PostItem[]) => void;
  updatePostLike: (postId: string, liked: boolean, newCount: number) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useFeedStore = create<FeedStoreState>((set) => ({
  posts: [],
  isLoading: false,
  hasMore: true,

  setPosts: (posts) => set({ posts }),
  appendPosts: (newPosts) =>
    set((state) => ({ posts: [...state.posts, ...newPosts] })),

  updatePostLike: (postId, liked, newCount) =>
    set((state) => ({
      posts: state.posts.map((p) =>
        (p._id || p.id)?.toString() === postId.toString()
          ? { ...p, is_liked: liked, likes_count: newCount }
          : p
      ),
    })),

  setLoading: (isLoading) => set({ isLoading }),
}));
