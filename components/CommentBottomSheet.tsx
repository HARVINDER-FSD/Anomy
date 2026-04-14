import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Modal, Pressable, Dimensions, Alert, PanResponder
} from 'react-native';
import { Ionicons, AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { socketService } from '@/src/lib/socket';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CommentBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  postId: string;
  postOwnerId?: string;
  onCommentAdded?: (count: number) => void;
}

export const CommentBottomSheet: React.FC<CommentBottomSheetProps> = ({
  isVisible, onClose, postId, postOwnerId, onCommentAdded
}) => {
  const router = useRouter();
  const { user } = useAuthStore();
  const currentUserId = (user?.id || user?._id)?.toString();
  const isPostOwner = postOwnerId && currentUserId === postOwnerId?.toString();

  const [comments, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'top'>('newest');
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Helper to sort comments (Pinned first)
  const sortComments = (list: any[]) => {
    return [...list].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return 0; // Maintain existing order for others
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10; // Only capture downward drags
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          closeSheet();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8
          }).start();
        }
      },
    })
  ).current;

  const closeSheet = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true
    }).start(() => onClose());
  };

  // Real-time comments
  useEffect(() => {
    if (!isVisible || !postId || !socketService.socket) return;

    const eventName = `post:${postId}:comment`;
    const handleNewComment = (newComment: any) => {
      if (newComment.user_id === currentUserId) return;

      if (newComment.parent_comment_id) {
        setPosts(prev => prev.map(c => {
          const cId = c._id || c.id;
          if (cId === newComment.parent_comment_id) {
            return {
              ...c,
              replies: [newComment, ...(c.replies || [])],
              replies_count: (c.replies_count || 0) + 1
            };
          }
          return c;
        }));
      } else {
        setPosts(prev => sortComments([newComment, ...prev]));
      }
    };

    socketService.socket.on(eventName, handleNewComment);
    return () => {
      socketService.socket?.off(eventName, handleNewComment);
    };
  }, [isVisible, postId, currentUserId]);

  useEffect(() => {
    if (isVisible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8
      }).start();
      fetchComments(1, true);
    }
  }, [isVisible, sortBy]);

  const fetchComments = useCallback(async (pageNum: number, isRefresh = false) => {
    try {
      if (isRefresh) setLoading(true);
      else setLoadingMore(true);

      const res = await apiClient.get(`/posts/${postId}/comments?page=${pageNum}&sort=${sortBy}`);
      const newComments = res.data.data || [];

      if (isRefresh) setPosts(sortComments(newComments));
      else setPosts(prev => sortComments([...prev, ...newComments]));

      setHasMore(res.data.pagination?.hasNext || false);
      setPage(pageNum);
    } catch (err) {
      console.error('Fetch comments error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [postId, sortBy]);

  const handlePostComment = useCallback(async () => {
    if (!inputText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/posts/${postId}/comments`, {
        content: inputText.trim(),
        parent_comment_id: replyTo?.id
      });

      const newComment = res.data.data.comment;
      
      if (replyTo) {
        setPosts(prev => prev.map((c: any) => {
          const cId = c._id || c.id;
          if (cId === replyTo.id) {
            return {
              ...c,
              replies: [newComment, ...(c.replies || [])],
              replies_count: (c.replies_count || 0) + 1
            };
          }
          return c;
        }));
        setExpandedReplies(prev => ({ ...prev, [replyTo.id]: true }));
      } else {
        setPosts(prev => sortComments([newComment, ...prev]));
      }

      setInputText('');
      setReplyTo(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (onCommentAdded) onCommentAdded(1);
    } catch (err) {
      Alert.alert('Error', 'Could not post comment');
    } finally {
      setSubmitting(false);
    }
  }, [postId, inputText, submitting, replyTo, onCommentAdded]);

  const handleTogglePin = useCallback(async (commentId: string) => {
    if (!commentId || commentId === 'undefined') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const res = await apiClient.post(`/posts/comments/${commentId}/pin`);
      // Use result from API, fallback to toggle if not provided
      const isPinned = (res.data as any).isPinned !== undefined ? (res.data as any).isPinned : true;

      setPosts(prev => {
        const updated = prev.map(c => {
          const cId = c._id || c.id;
          if (cId === commentId) {
            return { ...c, is_pinned: isPinned };
          }
          // Only one comment can be pinned? (Optional: unpin others if needed)
          // For now, multiple pins allowed or managed by server
          return c;
        });
        return sortComments(updated);
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Pin error:', err);
      Alert.alert('Error', 'Could not update pin status');
    }
  }, [postId]);

  const handleReact = useCallback(async (commentId: string, type: string, isReply = false, parentId?: string) => {
    if (!commentId || commentId === 'undefined') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const updateList = (list: any[]): any[] => list.map((c: any) => {
      const cId = c._id || c.id;
      if (cId === commentId) {
        const oldReaction = c.user_reaction;
        const reactions = { ...(c.reactions || {}) } as any;
        
        if (oldReaction === type) {
          delete reactions[type];
          return { ...c, user_reaction: null, reactions, likes_count: type === 'like' ? ((c.likes_count || 1) - 1) : (c.likes_count || 0) };
        } else {
          if (oldReaction) reactions[oldReaction] = (reactions[oldReaction] || 1) - 1;
          reactions[type] = (reactions[type] || 0) + 1;
          
          let newLikesCount = c.likes_count || 0;
          if (type === 'like' && oldReaction !== 'like') newLikesCount++;
          else if (oldReaction === 'like' && type !== 'like') newLikesCount--;
          
          return { ...c, user_reaction: type, reactions, likes_count: newLikesCount };
        }
      }
      if (c.replies && c.replies.length > 0) return { ...c, replies: updateList(c.replies) };
      return c;
    });

    const previousComments = [...comments];
    setPosts(prev => updateList(prev));

    try {
      await apiClient.post(`/posts/comments/${commentId}/react`, { type });
    } catch (err) {
      setPosts(previousComments);
    }
  }, [comments]);

  const handleDeleteComment = useCallback(async (commentId: string, parentId?: string) => {
    if (!commentId || commentId === 'undefined') return;
    
    try {
      await apiClient.delete(`/posts/comments/${commentId}`);
      
      setPosts(prev => {
        if (parentId) {
          return prev.map(c => {
            const cId = c._id || c.id;
            if (cId === parentId) {
              return {
                ...c,
                replies: c.replies?.filter((r: any) => (r._id || r.id) !== commentId),
                replies_count: Math.max((c.replies_count || 1) - 1, 0)
              };
            }
            return c;
          });
        } else {
          return prev.filter(c => (c._id || c.id) !== commentId);
        }
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
       if (onCommentAdded) onCommentAdded(-1);
     } catch (err) {
       console.error('Delete error:', err);
       // Silent fail or minimal toast if needed, but keeping original error handle logic
       // Alert.alert('Error', 'Could not delete comment');
     }
   }, [onCommentAdded]);

  const toggleReplies = useCallback((commentId: string) => {
    if (!commentId) return;
    setExpandedReplies(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  }, []);

  const renderCommentItem = useCallback(({ item, isReply = false, parentId }: { item: any, isReply?: boolean, parentId?: string }) => {
    const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true }).replace('about ', '').replace('less than a minute ago', 'just now');
    const isMyComment = item.user_id === currentUserId;
    const itemId = item._id || item.id;
    const isMenuOpen = activeMenuId === itemId;

    return (
      <View style={[styles.commentContainer, isReply && styles.replyContainer]}>
        <TouchableOpacity onPress={() => router.push(`/user/${item.user?.username}`)}>
          <Image 
            source={{ uri: resolveAvatarUrl(item.user?.avatar_url, item.user?.username) }} 
            style={isReply ? styles.replyAvatar : styles.commentAvatar} 
          />
        </TouchableOpacity>
        
        <View style={styles.commentContent}>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity 
              activeOpacity={0.9}
              onLongPress={() => {
                if (isMyComment || isPostOwner) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setActiveMenuId(itemId);
                }
              }}
              onPress={() => setActiveMenuId(null)}
              style={[styles.commentTextBubble, isMenuOpen && { backgroundColor: COLORS.surface + '99' }]}
            >
              <View style={styles.commentHeader}>
                <Text style={styles.usernameText}>{item.user?.username}</Text>
                {item.is_pinned && <MaterialCommunityIcons name="pin" size={12} color={COLORS.secondary} style={{marginLeft: 4}} />}
              </View>
              <Text style={styles.commentText}>{item.content}</Text>
            </TouchableOpacity>

            {/* --- FLOATING MINI MENU --- */}
            {isMenuOpen && (
              <View style={styles.miniMenu}>
                {isPostOwner && !isReply && (
                  <TouchableOpacity 
                    style={styles.miniMenuBtn} 
                    onPress={() => {
                      handleTogglePin(itemId);
                      setActiveMenuId(null);
                    }}
                  >
                    <MaterialCommunityIcons name={item.is_pinned ? "pin" : "pin-outline"} size={20} color={COLORS.secondary} />
                    <Text style={[styles.miniMenuText, { color: COLORS.secondary }]}>
                      {item.is_pinned ? "Unpin" : "Pin"}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {(isMyComment || isPostOwner) && (
                  <TouchableOpacity 
                    style={styles.miniMenuBtn} 
                    onPress={() => {
                      handleDeleteComment(itemId, parentId);
                      setActiveMenuId(null);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    <Text style={[styles.miniMenuText, { color: COLORS.error }]}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.commentActions}>
            <Text style={styles.actionText}>{timeAgo}</Text>
            {item.likes_count > 0 && <Text style={styles.actionTextBold}>{item.likes_count} likes</Text>}
            <TouchableOpacity onPress={() => {
              setReplyTo({ id: parentId || itemId, username: item.user?.username });
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}>
              <Text style={styles.actionTextBold}>Reply</Text>
            </TouchableOpacity>
          </View>

          {!isReply && item.replies_count > 0 && (
            <TouchableOpacity style={styles.viewRepliesBtn} onPress={() => toggleReplies(itemId)}>
              <View style={styles.replyLine} />
              <Text style={styles.viewRepliesText}>
                {expandedReplies[itemId] ? 'Hide replies' : `View ${item.replies_count} replies`}
              </Text>
            </TouchableOpacity>
          )}

          {!isReply && expandedReplies[itemId] && item.replies?.map((reply: any, index: number) => (
            <React.Fragment key={reply.id || reply._id || `reply-${index}`}>
              {renderCommentItem({ item: reply, isReply: true, parentId: itemId })}
            </React.Fragment>
          ))}
        </View>

        <View style={styles.rightActions}>
          <TouchableOpacity onPress={() => handleReact(itemId, 'like', isReply, parentId)}>
            <Ionicons 
              name={item.user_reaction === 'like' ? "heart" : "heart-outline"} 
              size={16} 
              color={item.user_reaction === 'like' ? COLORS.error : COLORS.subtitle} 
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [currentUserId, isPostOwner, comments, expandedReplies, activeMenuId, handleTogglePin, handleDeleteComment, handleReact]);

  return (
    <Modal visible={isVisible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.backdrop} onPress={() => {
          if (activeMenuId) setActiveMenuId(null);
          else closeSheet();
        }} />
        <Animated.View 
          style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.sheetHeader}>
            <View style={styles.dragHandle} />
            <Text style={styles.sheetTitle}>Comments</Text>
            <View style={styles.sortContainer}>
              <TouchableOpacity onPress={() => {
                const next = sortBy === 'newest' ? 'top' : 'newest';
                setSortBy(next);
                fetchComments(1, true);
              }}>
                <Text style={styles.sortText}>{sortBy === 'newest' ? 'Newest' : 'Top'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={comments}
            keyExtractor={(item, index) => item.id || item._id || String(index)}
            renderItem={renderCommentItem}
            contentContainerStyle={styles.listContent}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator size="small" color={COLORS.secondary} style={{ marginTop: 40 }} />
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="chatbubble-outline" size={48} color={COLORS.border} />
                  <Text style={styles.emptyText}>No comments yet</Text>
                  <Text style={styles.emptySub}>Start the conversation!</Text>
                </View>
              )
            }
            onEndReached={() => hasMore && fetchComments(page + 1)}
            onEndReachedThreshold={0.3}
          />

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
            {replyTo && (
              <View style={styles.replyingBar}>
                <Text style={styles.replyingText}>Replying to @{replyTo.username}</Text>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.inputArea}>
              <View style={styles.mainInputRow}>
                <Image source={{ uri: resolveAvatarUrl(user?.avatar_url, user?.username) }} style={styles.inputAvatar} />
                <TextInput
                  style={styles.textInput}
                  placeholder={replyTo ? "Write a reply..." : "Add a comment..."}
                  placeholderTextColor={COLORS.subtitle}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <TouchableOpacity 
                  disabled={!inputText.trim() || submitting} 
                  onPress={handlePostComment}
                  style={styles.sendBtn}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={COLORS.secondary} />
                  ) : (
                    <Ionicons 
                      name="arrow-up-circle" 
                      size={32} 
                      color={inputText.trim() ? COLORS.secondary : COLORS.border} 
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetContainer: {
    height: SCREEN_HEIGHT * 0.75,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden'
  },
  sheetHeader: {
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'center'
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    position: 'absolute',
    top: 8
  },
  sheetTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  sortContainer: { position: 'absolute', right: 16 },
  sortText: { color: COLORS.secondary, fontWeight: '600', fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 100 },
  commentContainer: { flexDirection: 'row', marginBottom: 20 },
  replyContainer: { marginLeft: 44, marginTop: 12, marginBottom: 8 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  replyAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 10 },
  commentContent: { flex: 1 },
  commentTextBubble: {
    backgroundColor: COLORS.surface,
    padding: 10,
    borderRadius: 15,
    alignSelf: 'flex-start',
    maxWidth: '95%'
  },
  miniMenu: {
    position: 'absolute',
    left: 40,
    top: 10,
    backgroundColor: COLORS.white,
    flexDirection: 'column',
    borderRadius: 15,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 1000,
    minWidth: 120,
  },
  miniMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  miniMenuText: {
    fontSize: 15,
    fontWeight: '600',
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  usernameText: { fontWeight: 'bold', fontSize: 13, color: COLORS.text },
  commentText: { fontSize: 14, color: COLORS.text, lineHeight: 18 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 6, paddingLeft: 4 },
  actionText: { fontSize: 12, color: COLORS.subtitle },
  actionTextBold: { fontSize: 12, fontWeight: 'bold', color: COLORS.subtitle },
  rightActions: { paddingLeft: 10, alignItems: 'center', gap: 4 },
  viewRepliesBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingLeft: 4 },
  replyLine: { width: 30, height: 1, backgroundColor: COLORS.border, marginRight: 10 },
  viewRepliesText: { fontSize: 12, fontWeight: 'bold', color: COLORS.subtitle },
  inputArea: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  mainInputRow: { flexDirection: 'row', alignItems: 'center' },
  inputAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  textInput: { flex: 1, maxHeight: 100, fontSize: 14, color: COLORS.text, paddingVertical: 8 },
  sendBtn: { marginLeft: 10 },
  replyingBar: { backgroundColor: COLORS.surface, padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  replyingText: { fontSize: 12, color: COLORS.subtitle },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: COLORS.subtitle, marginTop: 4 },
});
