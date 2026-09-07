import { useEffect, useState, useCallback, useRef } from 'react';
import { useRelationshipStore, RelationshipState } from '../store/relationshipStore';
import api from '../api/client';
import { socketService } from '../lib/socket';
import * as Haptics from 'expo-haptics';

// Global deduper for fetch calls to prevent multiple hooks from hammering the API
const pendingFetches = new Map<string, Promise<any>>();

const STATIC_DEFAULT_STATE: RelationshipState = {
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

export const useFollowStatus = (
  targetUserId: string, 
  initialData?: Partial<RelationshipState> & { isPrivate?: boolean },
  options?: { syncOnMount?: boolean }
) => {
  const { getRelationship, updateRelationship } = useRelationshipStore();
  
  // Safe reactive selection using a referentially stable default state to prevent re-render loops
  const relationship = useRelationshipStore(state => 
    state.relationships[targetUserId] ?? STATIC_DEFAULT_STATE
  );
  
  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  // Track whether we've already done an HTTP fetch so we don't re-fetch on every store update
  const hasFetchedRef = useRef(false);
  const prevTargetIdRef = useRef<string>('');

  // Destructure initialData into primitive variables with snake_case fallbacks
  const initialFollowing = initialData?.isFollowing ?? (initialData as any)?.is_following ?? (initialData as any)?.isFollowingUser;
  const initialPending = initialData?.isPending ?? (initialData as any)?.is_pending ?? (initialData as any)?.isPendingFromTarget;
  const initialMutual = initialData?.isMutualFollow ?? (initialData as any)?.is_mutual ?? (initialData as any)?.isMutual;
  const initialFollowsBack = initialData?.followsBack ?? (initialData as any)?.follows_back;
  const initialRequestStatus = initialData?.followRequestStatus;
  const initialFollowersCount = initialData?.followersCount ?? (initialData as any)?.followers_count;
  const initialFollowingCount = initialData?.followingCount ?? (initialData as any)?.following_count;
  const initialIsFollower = initialData?.isFollower ?? (initialData as any)?.is_follower;

  // 1. Initialize from props ONLY if we don't have fresh data
  useEffect(() => {
    if (targetUserId) {
      const currentInStore = getRelationship(targetUserId);
      if (currentInStore.updatedAt === 0 || currentInStore.source === 'initial') {
        updateRelationship(targetUserId, {
          isFollowing: initialFollowing !== undefined ? !!initialFollowing : currentInStore.isFollowing,
          isPending: initialPending !== undefined ? !!initialPending : currentInStore.isPending,
          isMutualFollow: initialMutual !== undefined ? !!initialMutual : currentInStore.isMutualFollow,
          followsBack: initialFollowsBack !== undefined ? !!initialFollowsBack : currentInStore.followsBack,
          followRequestStatus: initialRequestStatus || currentInStore.followRequestStatus || 'none',
          followersCount: initialFollowersCount !== undefined ? initialFollowersCount : currentInStore.followersCount,
          followingCount: initialFollowingCount !== undefined ? initialFollowingCount : currentInStore.followingCount,
          isFollower: initialIsFollower !== undefined ? !!initialIsFollower : currentInStore.isFollower,
        }, 'initial', 1);
      }
    }
  }, [
    targetUserId,
    initialFollowing,
    initialPending,
    initialMutual,
    initialFollowsBack,
    initialRequestStatus,
    initialFollowersCount,
    initialFollowingCount,
    initialIsFollower,
    getRelationship,
    updateRelationship
  ]);

  // 2. Fetch fresh state from API (Sync) with Global Deduplication
  const fetchStatus = useCallback(async () => {
    if (!targetUserId || targetUserId === 'undefined' || targetUserId === 'null' || !targetUserId.trim()) return;
    
    // If a request is already flying for this user, wait for it instead of sending another
    if (pendingFetches.has(targetUserId)) {
      try {
        await pendingFetches.get(targetUserId);
      } catch (e) {}
      return;
    }

    try {
      const promise = api.get(`/users/${targetUserId}/follow-status`);
      pendingFetches.set(targetUserId, promise);
      const response = await promise;
      if (response?.data) {
        updateRelationship(targetUserId, response.data, 'http');
      }
    } catch (error: any) {
      if (__DEV__) {
      }
    } finally {
      pendingFetches.delete(targetUserId);
    }
  }, [targetUserId, updateRelationship]);

  // Sync on mount ONCE per targetUserId — never re-run just because updatedAt changed
  useEffect(() => {
    if (!targetUserId || targetUserId === 'undefined' || targetUserId === 'null') return;

    // Reset fetch gate when target changes
    if (prevTargetIdRef.current !== targetUserId) {
      prevTargetIdRef.current = targetUserId;
      hasFetchedRef.current = false;
    }

    // Only hit the network if: forced, or first time for this user
    const needsFetch = options?.syncOnMount || !hasFetchedRef.current;
    if (needsFetch && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId, options?.syncOnMount]);

  // 3. Socket event listener for real-time sync
  useEffect(() => {
    const socket = socketService.socket;
    if (!socket || !targetUserId) return;

    const handleRelationshipUpdate = (payload: any) => {
      if (payload.targetUserId === targetUserId) {
        const timestamp = payload.timestamp || Date.now();
        updateRelationship(targetUserId, payload, 'socket', timestamp);
      } else if (payload.currentUserId === targetUserId) {
        fetchStatus();
      }
    };

    const handleLegacyUpdate = (payload: any) => {
      if (payload.followingId === targetUserId || payload.followerId === targetUserId) {
        fetchStatus();
      }
    };

    socket.on('relationship:updated', handleRelationshipUpdate);
    socket.on('follow_status_changed', handleLegacyUpdate);

    return () => {
      socket.off('relationship:updated', handleRelationshipUpdate);
      socket.off('follow_status_changed', handleLegacyUpdate);
    };
  }, [targetUserId, fetchStatus, updateRelationship]);

  // 4. Helper: light haptic feedback
  const taptic = useCallback((style = 'light') => {
    try {
      if ((style as any) === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.impactAsync((Haptics.ImpactFeedbackStyle as any)[style.toUpperCase()] || Haptics.ImpactFeedbackStyle.Light);
    } catch { }
  }, []);

  // 5. Action Handlers
  
  const toggleFollow = useCallback(async () => {
    if (isActionRunning || !targetUserId) return;
    setIsActionRunning(true);
    setIsLoading(true);
    taptic('light');

    const isCurrentlyFollowingOrPending = relationship.isFollowing || relationship.isPending;
    const prevSnapshot = { ...relationship };

    // ─── OPTIMISTIC UPDATE FIRST ───
    if (isCurrentlyFollowingOrPending) {
      updateRelationship(targetUserId, {
        isFollowing: false,
        isPending: false,
        isMutualFollow: false,
        followRequestStatus: 'none',
      }, 'optimistic');
    } else {
      // UX Improvement: Assume public account (isFollowing: true) for immediate feedback.
      // If private, the backend response will instantly correct it to 'pending'.
      const isPrivate = initialData?.isPrivate;
      updateRelationship(targetUserId, {
        isFollowing: !isPrivate,
        isPending: !!isPrivate,
        followRequestStatus: isPrivate ? 'pending' : 'active',
      }, 'optimistic');
    }

    try {
      if (isCurrentlyFollowingOrPending) {
        const res = await api.delete(`/users/${targetUserId}/follow`);
        if (res?.data) updateRelationship(targetUserId, res.data, 'http');
      } else {
        const res = await api.post(`/users/${targetUserId}/follow`);
        if (res?.data) updateRelationship(targetUserId, res.data, 'http');
      }
      taptic('success');
    } catch (error: any) {
      // Rollback strictly with a fresh timestamp so it applies immediately
      updateRelationship(targetUserId, {
        isFollowing: prevSnapshot.isFollowing,
        isPending: prevSnapshot.isPending,
        followRequestStatus: prevSnapshot.followRequestStatus
      }, 'optimistic', Date.now());
      fetchStatus();
    } finally {
      setIsActionRunning(false);
      setIsLoading(false);
    }
  }, [targetUserId, isActionRunning, relationship, updateRelationship, fetchStatus, taptic, initialData]);

  const acceptFollowRequest = useCallback(async () => {
    if (isActionRunning || !targetUserId) return;
    setIsActionRunning(true);
    setIsLoading(true);
    taptic('medium');

    const prevSnapshot = { ...relationship };
    updateRelationship(targetUserId, {
      followsBack: true,
      isPending: false,
      followRequestStatus: 'approved',
    }, 'optimistic');

    try {
      const res = await api.post(`/users/follow-requests/${targetUserId}/accept`);
      if (res?.data) {
        updateRelationship(targetUserId, {
          followsBack: true,
          isPending: false,
          followRequestStatus: 'approved',
          followersCount: res.data.followersCount,
          isMutualFollow: !!res.data.isMutual,
        }, 'http');
      }
      taptic('success');
    } catch (error: any) {
      updateRelationship(targetUserId, {
        followsBack: prevSnapshot.followsBack,
        isPending: prevSnapshot.isPending,
        followRequestStatus: prevSnapshot.followRequestStatus
      }, 'optimistic', Date.now());
      fetchStatus();
    } finally {
      setIsActionRunning(false);
      setIsLoading(false);
    }
  }, [targetUserId, isActionRunning, relationship, updateRelationship, fetchStatus, taptic]);

  const rejectFollowRequest = useCallback(async () => {
    if (isActionRunning || !targetUserId) return;
    setIsActionRunning(true);
    setIsLoading(true);
    taptic('medium');

    const prevSnapshot = { ...relationship };
    updateRelationship(targetUserId, {
      isPending: false,
      followRequestStatus: 'rejected',
    }, 'optimistic');

    try {
      await api.post(`/users/follow-requests/${targetUserId}/reject`);
      taptic('success');
    } catch (error) {
      updateRelationship(targetUserId, {
        isPending: prevSnapshot.isPending,
        followRequestStatus: prevSnapshot.followRequestStatus
      }, 'optimistic', Date.now());
      fetchStatus();
    } finally {
      setIsActionRunning(false);
      setIsLoading(false);
    }
  }, [targetUserId, isActionRunning, relationship, updateRelationship, fetchStatus, taptic]);

  const cancelFollowRequest = useCallback(async () => {
    if (isActionRunning || !targetUserId) return;
    setIsActionRunning(true);
    setIsLoading(true);
    taptic('light');

    const prevSnapshot = { ...relationship };
    updateRelationship(targetUserId, { isFollowing: false, isPending: false, followRequestStatus: 'none' }, 'optimistic');

    try {
      await api.post(`/users/follow-requests/${targetUserId}/cancel`);
      taptic('success');
    } catch (error) {
      updateRelationship(targetUserId, {
        isFollowing: prevSnapshot.isFollowing,
        isPending: prevSnapshot.isPending,
        followRequestStatus: prevSnapshot.followRequestStatus
      }, 'optimistic', Date.now());
      fetchStatus();
    } finally {
      setIsActionRunning(false);
      setIsLoading(false);
    }
  }, [targetUserId, isActionRunning, relationship, updateRelationship, fetchStatus, taptic]);

  const removeFollower = useCallback(async () => {
    if (isActionRunning || !targetUserId) return;
    setIsActionRunning(true);
    setIsLoading(true);
    taptic('medium');

    const prevSnapshot = { ...relationship };
    updateRelationship(targetUserId, {
      followsBack: false,
    }, 'optimistic');

    try {
      const res = await api.delete(`/users/followers/${targetUserId}`);
      if (res?.data?.followersCount != null) {
        updateRelationship(targetUserId, { followersCount: res.data.followersCount }, 'http');
      }
      taptic('success');
    } catch (error) {
      updateRelationship(targetUserId, prevSnapshot, 'optimistic');
      fetchStatus();
    } finally {
      setIsActionRunning(false);
      setIsLoading(false);
    }
  }, [targetUserId, isActionRunning, relationship, updateRelationship, fetchStatus, taptic]);

  return {
    ...relationship,
    isLoading,
    isActionRunning,
    toggleFollow,
    acceptFollowRequest,
    rejectFollowRequest,
    cancelFollowRequest,
    removeFollower,
    fetchStatus,
  };
};

