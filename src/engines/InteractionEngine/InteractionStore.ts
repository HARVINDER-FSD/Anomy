import { create } from 'zustand';

interface InteractionStoreState {
  likedPosts: Record<string, boolean>;
  bookmarkedPosts: Record<string, boolean>;
  followingUsers: Record<string, boolean>;
  blockedUsers: Record<string, boolean>;

  setLiked: (postId: string, liked: boolean) => void;
  setBookmarked: (postId: string, bookmarked: boolean) => void;
  setFollowing: (userId: string, following: boolean) => void;
  setBlocked: (userId: string, blocked: boolean) => void;
}

export const useInteractionStore = create<InteractionStoreState>((set) => ({
  likedPosts: {},
  bookmarkedPosts: {},
  followingUsers: {},
  blockedUsers: {},

  setLiked: (postId, liked) =>
    set((state) => ({ likedPosts: { ...state.likedPosts, [postId]: liked } })),

  setBookmarked: (postId, bookmarked) =>
    set((state) => ({ bookmarkedPosts: { ...state.bookmarkedPosts, [postId]: bookmarked } })),

  setFollowing: (userId, following) =>
    set((state) => ({ followingUsers: { ...state.followingUsers, [userId]: following } })),

  setBlocked: (userId, blocked) =>
    set((state) => ({ blockedUsers: { ...state.blockedUsers, [userId]: blocked } })),
}));
