import { create } from 'zustand';

// Follow status matching the backend Engine responses
export type FollowRequestStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'active';
export type UpdateSource = 'initial' | 'optimistic' | 'http' | 'socket';

const SOURCE_PRIORITY = {
  initial: 0,
  optimistic: 1,
  http: 2,
  socket: 3,
} as const;

export interface RelationshipState {
  isFollowing: boolean;
  isPending: boolean;
  isMutualFollow: boolean;
  followsBack: boolean;
  followRequestStatus: FollowRequestStatus;
  followersCount: number;
  followingCount: number;
  isFollower: boolean;
  updatedAt: number;
  source: UpdateSource;
}

const defaultState: RelationshipState = {
  isFollowing: false,
  isPending: false,
  isMutualFollow: false,
  followsBack: false,
  followRequestStatus: 'none',
  followersCount: 0,
  followingCount: 0,
  isFollower: false,
  updatedAt: 0,
  source: 'initial'
};

function shouldReplace(existing: RelationshipState, incoming: Partial<RelationshipState> & { updatedAt: number; source: UpdateSource }) {
  if (incoming.source === 'optimistic') return true; // Always allow optimistic updates to apply immediately
  
  if (incoming.updatedAt > existing.updatedAt) {
    // If incoming is significantly newer (e.g. > 2 seconds), trust the timestamp regardless of source
    // to allow HTTP to eventually heal missed socket events
    if (incoming.updatedAt - existing.updatedAt > 2000) return true;
    
    // Otherwise within a small window, trust the higher priority source
    if (SOURCE_PRIORITY[incoming.source] >= SOURCE_PRIORITY[existing.source]) {
      return true;
    }
  }

  if (incoming.updatedAt === existing.updatedAt) {
    return SOURCE_PRIORITY[incoming.source] > SOURCE_PRIORITY[existing.source];
  }

  return false;
}

interface RelationshipStoreState {
  relationships: Record<string, RelationshipState>; // Map of targetUserId -> RelationshipState
  updateRelationship: (targetUserId: string, stateUpdate: Partial<RelationshipState>, source: UpdateSource, timestamp?: number) => void;
  setRelationship: (targetUserId: string, state: RelationshipState) => void;
  getRelationship: (targetUserId: string) => RelationshipState;
}

export const useRelationshipStore = create<RelationshipStoreState>((set, get) => ({
  relationships: {},
  
  updateRelationship: (targetUserId, stateUpdate, source, timestamp = Date.now()) => {
    set((state) => {
      const existing = state.relationships[targetUserId] || defaultState;
      const incoming = { ...stateUpdate, updatedAt: timestamp, source };
      
      if (!shouldReplace(existing, incoming)) {
        return state;
      }

      return {
        relationships: {
          ...state.relationships,
          [targetUserId]: { 
            ...existing, 
            ...stateUpdate,
            updatedAt: timestamp,
            source 
          }
        }
      };
    });
  },

  setRelationship: (targetUserId, newState) => {
    // Route through updateRelationship to enforce unified merge policy
    get().updateRelationship(
      targetUserId,
      newState,
      "initial",
      newState.updatedAt ?? Date.now()
    );
  },

  getRelationship: (targetUserId) => {
    // Return a fresh object reference to avoid accidental mutations
    return {
      ...defaultState,
      ...(get().relationships[targetUserId] ?? {})
    };
  }
}));
