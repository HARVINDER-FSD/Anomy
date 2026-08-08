import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageCircleDashed, Forward } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/src/theme/colors';
import { FollowButton } from '@/src/components/common/FollowButton';
import { scale, verticalScale, moderateScale, moderateFont, SIZES } from '@/src/utils/responsive';
import { resolveAvatarUrl, resolveMediaUrl } from '@/src/utils/imageUtils';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { apiClient } from '@/src/api/client';
import { socketService } from '@/src/lib/socket';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
// Time ago helper
const getTimeAgo = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
};

interface PostAuthor {
  _id?: string;
  id?: string;
  username?: string;
  avatar?: string;
  avatar_url?: string;
  is_verified?: boolean;
  badge_type?: string | null;
  is_following?: boolean;
}

interface PostItem {
  _id?: string;
  id?: string;
  author?: PostAuthor;
  user?: PostAuthor;
  user_id?: string;
  location?: { name?: string };
  isBookmarked?: boolean;
  media_urls?: string[];
  media?: { url: string }[];
  media_type?: 'image' | 'video';
  isLiked?: boolean;
  reactionEmoji?: string;
  user_reaction?: string;
  userReaction?: string;
  likes_count?: number;
  comments_count?: number;
  content?: string;
  caption?: string;
  music?: {
    song_name?: string;
    artist?: string;
    title?: string;
  };
  music_info?: {
    song_name?: string;
    artist?: string;
    title?: string;
  };
  created_at?: string;
  title?: string;
}

export type HomeFeedPostRowProps = {
  item: PostItem;
  isAnonymous: boolean;
  user: { id?: string; _id?: string } | null;
  shouldPlayVideo: boolean;
  likers?: PostAuthor[];
  reactingToPost: string | null;
  onToggleReacting: (postId: string) => void;
  onOpenComments: (postId: string, ownerId: string | undefined) => void;
  onOpenLikers: (postId: string) => void;
  onLike: (postId: string, isLiked: boolean, emoji?: string) => void;
  onEmojiReaction: (postId: string, emoji: string) => void;
  onBookmark: (postId: string, isBookmarked: boolean) => void;
  onPostOptions: (postId: string, isOwn: boolean) => void;
  onShare: (
    postId: string,
    content?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video',
    authorUsername?: string,
    authorAvatar?: string
  ) => void;
  router: { push: (href: any) => void };
};

import { useReelsStore } from '@/src/store/reelsStore';

function HomeFeedPostRowInner({
  item,
  isAnonymous,
  user,
  shouldPlayVideo,
  likers,
  reactingToPost,
  onToggleReacting,
  onOpenComments,
  onOpenLikers,
  onLike,
  onEmojiReaction,
  onBookmark,
  onPostOptions,
  onShare,
  router,
}: HomeFeedPostRowProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const authorData = (item as any).author || (item as any).user;
  const rawUserId = (item as any).user_id;
  const targetAuthorId = String(
    authorData?._id || authorData?.id || (typeof rawUserId === 'string' ? rawUserId : (rawUserId?._id || rawUserId?.id)) || ''
  );
  const initialIsFollowing = authorData?.is_following !== undefined 
    ? !!authorData.is_following 
    : ((item as any).is_following !== undefined ? !!(item as any).is_following : ((item as any).isFollowing !== undefined ? !!(item as any).isFollowing : undefined));

  const { isFollowing, isPending, toggleFollow, isLoading: isFollowLoading } = useFollowStatus(
    targetAuthorId,
    { isFollowing: initialIsFollowing }
  );

  const videoUrl = (item as any).video_url || (item as any).videoUrl || (item as any).content_url || item.media_urls?.[0] || item.media?.[0]?.url || '';
  const player = useVideoPlayer(videoUrl ? resolveMediaUrl(videoUrl) : '', p => {
    p.loop = true;
    p.muted = isMuted;
  });

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (shouldPlayVideo) {
      try {
        if (typeof (player as any).seekBy === 'function' && player.currentTime > 0) {
          (player as any).seekBy(-player.currentTime);
        } else {
          player.currentTime = 0;
        }
      } catch (_) {}
      player.play();
    } else {
      player.pause();
    }
  }, [shouldPlayVideo, player]);

  useEffect(() => {
    if (player.status === 'readyToPlay') {
      setIsVideoReady(true);
    }
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        setIsVideoReady(true);
      } else {
        setIsVideoReady(false);
      }
    });
    return () => sub.remove();
  }, [player]);

  const postId = useMemo(() => String(item._id || item.id), [item._id, item.id]);

  // 🛡️ IRON WALL: Post-level anonymous flag — must be explicitly true
  // Normal mode mein koi bhi post anonymous nahi dikhegi, chahe flag kuch bhi ho
  const isAnonymousPost = (item as any).is_anonymous === true;

  // 🛡️ FINAL WALL: Normal mode = ALWAYS real identity, no exceptions
  const shouldShowAnonymousIdentity = isAnonymous === true && isAnonymousPost === true;

  const isOwnPost = useMemo(() => {
    const authorId =
      item.author?._id || item.author?.id || item.user?._id || item.user?.id || item.user_id;
    return !!(
      user?.id &&
      authorId &&
      (authorId === user.id || authorId?.toString() === user.id?.toString())
    );
  }, [item, user?.id]);

  // 🛡️ WALL: Normal mode = always real username. Anonymous mode = ghost only if post is anonymous.
  const displayUsername = shouldShowAnonymousIdentity
    ? (isOwnPost ? 'You (Ghost)' : 'Anonymous Ghost')
    : (item.author?.username || item.user?.username || 'AnuFy_User');

  const displayAvatar = shouldShowAnonymousIdentity
    ? resolveAvatarUrl(undefined, 'anonymous', true)
    : resolveAvatarUrl(
      item.author?.avatar_url ||
      item.author?.avatar ||
      item.user?.avatar_url ||
      item.user?.avatar,
      item.author?.username || item.user?.username
    );

  let parsedMusic = item.music;
  let parsedMusicInfo = item.music_info;
  if (typeof parsedMusic === 'string') {
    try { parsedMusic = JSON.parse(parsedMusic); } catch (_) { }
  }
  if (typeof parsedMusicInfo === 'string') {
    try { parsedMusicInfo = JSON.parse(parsedMusicInfo); } catch (_) { }
  }
  const songName = parsedMusic?.song_name || parsedMusicInfo?.song_name || parsedMusic?.title || parsedMusicInfo?.title || item.title || (item as any).audio_title || (item as any).song_name || '';
  const artist = parsedMusic?.artist || parsedMusicInfo?.artist || (item as any).artist || '';

  return (
    <View
      style={[
        styles.postCard,
        isAnonymous && {
          backgroundColor: COLORS.background,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        },
      ]}
    >
      <View style={styles.postHeader}>
        <View
          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: verticalScale(2) }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center' }}
              disabled={shouldShowAnonymousIdentity && !isOwnPost} // Don't allow visiting profile of ghosts
              onPress={() =>
                router.push(`/user/${item.author?.username || item.user?.username}`)
              }
            >
              <Image
                source={{ uri: displayAvatar }}
                style={[styles.postAvatar, isAnonymous && { borderColor: '#111' }]}
                contentFit="cover"
                transition={200}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: scale(6) }}>
                <Text style={[styles.postUsername, isAnonymous && { color: '#000' }]}>
                  {displayUsername}
                </Text>
                {!isAnonymousPost && (item.author?.is_verified || item.user?.is_verified) && (
                  <VerifiedTick
                    badgeType={item.author?.badge_type || item.user?.badge_type}
                    size={14}
                  />
                )}
              </View>
            </TouchableOpacity>

            {!isOwnPost && !isAnonymousPost && (
              <FollowButton
                targetUserId={targetAuthorId}
                onToggle={toggleFollow}
                isLoading={isFollowLoading}
                variant="primary"
                size="sm"
                style={[
                  { marginLeft: scale(4), borderRadius: moderateScale(8) },
                  isFollowing ? { 
                    backgroundColor: '#F3F4F6', 
                    borderWidth: 1, 
                    borderColor: '#E5E7EB' 
                  } : {}
                ]}
                textStyle={[
                  { fontSize: moderateFont(12), fontWeight: '600' },
                  isFollowing ? { color: '#374151' } : {}
                ]}
              />
            )}
          </View>
          <View style={{ marginTop: verticalScale(2) }}>
            {!isAnonymousPost && item.location?.name && (
              <Text
                style={[styles.postLocation, isAnonymous && { color: COLORS.subtitle }]}
              >
                {item.location.name}
              </Text>
            )}
          </View>
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: scale(16) }}
        >
          <TouchableOpacity
            onPress={() => onBookmark(postId, !!item.isBookmarked)}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons
              name={item.isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={item.isBookmarked ? COLORS.secondary : COLORS.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onPostOptions(postId, isOwnPost)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={isAnonymous ? '#000' : COLORS.subtitle}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ position: 'relative' }}>
        {((item.media_type === 'video' || (item as any).type === 'reel' || (item as any).is_reel === true || !!(item as any).video_url || !!(item as any).videoUrl) && !!videoUrl) ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              // ⚡ IMMEDIATE FEEDBACK
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

              const thumbnailUrl = (item as any).thumbnail_url || (item as any).video_thumbnail || (item as any).thumbnail;

              // 🚀 ULTRA LIGHTNING SPEED: Use global store for instant data transfer
              useReelsStore.getState().setActiveReelData({
                ...item,
                videoUrl,
                thumbnailUrl,
                author: item.author || item.user
              });

              router.push(`/reels/${postId}`);
            }}
          >
            <VideoView
              player={player}
              style={styles.postImage}
              contentFit="cover"
              nativeControls={false}
            />
            {!isVideoReady && ((item as any).thumbnail_url || (item as any).video_thumbnail || (item as any).thumbnail) ? (
              <Image
                source={{ uri: (item as any).thumbnail_url || (item as any).video_thumbnail || (item as any).thumbnail }}
                style={[styles.postImage, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                contentFit="cover"
              />
            ) : null}
            <TouchableOpacity
              style={styles.muteButton}
              onPress={(e) => {
                e.stopPropagation();
                setIsMuted(!isMuted);
              }}
            >
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={20}
                color="#FFF"
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : item.media_urls && item.media_urls.length > 0 ? (
          <Image
            source={{ uri: resolveMediaUrl(item.media_urls[0]) }}
            style={styles.postImage}
            contentFit="cover"
            transition={300}
          />
        ) : item.media && item.media.length > 0 ? (
          <Image
            source={{ uri: resolveMediaUrl(item.media[0].url) }}
            style={styles.postImage}
            contentFit="cover"
            transition={300}
          />
        ) : null}
      </View>

      <View style={styles.actionRowContainer}>
        <View style={styles.actionPillContainer}>
          <TouchableOpacity
            style={styles.pillActionBtn}
            onPress={() => onLike(postId, !!item.isLiked)}
            onLongPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onToggleReacting(postId);
            }}
            delayLongPress={300}
            activeOpacity={0.7}
          >
            {(() => {
              const reaction = item.user_reaction || item.userReaction;
              const isLiked = !!(item.isLiked || (item as any).is_liked || reaction);
              const isEmojiReaction = reaction && reaction !== '❤️' && reaction !== '👍';

              if (isEmojiReaction) {
                return <Text style={{ fontSize: 18 }}>{reaction}</Text>;
              }
              return (
                <MaterialCommunityIcons
                  name={isLiked ? 'thumb-up' : 'thumb-up-outline'}
                  size={23}
                  color={isLiked ? '#FF3040' : COLORS.text}
                />
              );
            })()}
            <Text style={[styles.pillActionText, { color: COLORS.text }]}>
              {item.likes_count || 0}
            </Text>
          </TouchableOpacity>

          <View style={styles.pillDivider} />

          <TouchableOpacity
            style={styles.pillActionBtn}
            onPress={() =>
              onOpenComments(
                postId,
                item.user_id || item.user?.id || item.user?._id
              )
            }
          >
            <MessageCircleDashed size={18} color={COLORS.text} />
            <Text style={[styles.pillActionText, { color: COLORS.text }]}>
              {item.comments_count || 0}
            </Text>
          </TouchableOpacity>

          <View style={styles.pillDivider} />

          <TouchableOpacity
            style={styles.pillActionBtn}
            onPress={() => {
              const mediaUrl = (item as any).thumbnail_url || (item as any).video_thumbnail || (item as any).thumbnail || item.media_urls?.[0] || item.media?.[0]?.url;
              const authorUsername = item.author?.username || item.user?.username;
              const authorAvatar = item.author?.avatar_url || item.author?.avatar || item.user?.avatar_url || item.user?.avatar;
              onShare(postId, item.content || item.caption, mediaUrl, item.media_type, authorUsername, authorAvatar);
            }}
          >
            <Ionicons name="arrow-redo-outline" size={20} color={COLORS.text} />
          </TouchableOpacity>

          {isAnonymous && (
            <>
              <View style={styles.pillDivider} />
              <TouchableOpacity
                style={styles.pillActionBtn}
                onPress={() => {
                  const authorId =
                    item.author?._id ||
                    item.author?.id ||
                    item.user?._id ||
                    item.user?.id;
                  if (authorId === user?.id) return;
                  router.push({
                    pathname: '/chat/new',
                    params: {
                      recipientId: String(authorId),
                      username: item.author?.username || item.user?.username || '',
                      isAnonymousChat: 'true',
                    },
                  } as any);
                }}
              >
                <MessageCircleDashed size={18} color={COLORS.secondary} />
                <Text style={[styles.pillActionText, { color: COLORS.secondary }]}>DM Author</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 🎵 Music Album Cover / Square Thumbnail Box on Right Corner */}
        {!!(songName || parsedMusic || parsedMusicInfo) && (
          <View style={styles.musicSquareBox}>
            <Image
              source={{
                uri: resolveMediaUrl(
                  (parsedMusic as any)?.cover_image ||
                  (parsedMusicInfo as any)?.cover_image ||
                  (parsedMusic as any)?.cover_url ||
                  (parsedMusicInfo as any)?.cover_url ||
                  (parsedMusic as any)?.album_art ||
                  (parsedMusicInfo as any)?.album_art ||
                  (parsedMusic as any)?.artwork ||
                  (parsedMusicInfo as any)?.artwork ||
                  (item as any).music_cover ||
                  (item as any).audio_cover ||
                  displayAvatar
                ),
              }}
              style={styles.musicSquareImage}
              contentFit="cover"
            />
            <View style={styles.musicSquareBadge}>
              <Ionicons name="musical-notes" size={9} color="#FFFFFF" />
            </View>
          </View>
        )}
      </View>

      {reactingToPost === postId && (
        <View style={styles.reactionBar}>
          {['❤️', '😂', '😮', '😢', '🔥', '👏'].map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => onEmojiReaction(postId, emoji)}
              style={styles.reactionEmojiBtn}
            >
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={[styles.postFooter, { paddingTop: verticalScale(6) }]}>
        {(() => {
          const effectiveLikers = (likers && likers.length > 0)
            ? likers
            : ((item as any).likers || (item as any).likedBy || (item as any).liked_by || (item as any).likedByUsers);
          if (!effectiveLikers || effectiveLikers.length === 0) return null;

          if (isAnonymousPost) {
            return (
              <Text style={[styles.likedByText, { color: COLORS.subtitle }]}>
                Liked by {item.likes_count || effectiveLikers.length} people
              </Text>
            );
          }

          return (
            <Text style={[styles.likedByText, isAnonymous && { color: COLORS.subtitle }]}>
              Liked by{' '}
              {effectiveLikers.slice(0, 2).map((liker: any, idx: number) => (
                <React.Fragment key={liker._id || liker.id || idx}>
                  <Text
                    style={[styles.likedByUsername, isAnonymous && { color: '#000' }]}
                    onPress={() => router.push(`/user/${liker.username}`)}
                  >
                    {liker.username}
                  </Text>
                  {idx === 0 && effectiveLikers.length > 1 && (
                    <Text style={[styles.likedByText, isAnonymous && { color: COLORS.subtitle }]}>
                      {' '}
                      and{' '}
                    </Text>
                  )}
                </React.Fragment>
              ))}
              {(item.likes_count || effectiveLikers?.length || 0) > 2 && (
                <Text
                  style={[styles.likedByMore, isAnonymous && { color: COLORS.subtitle }]}
                  onPress={() => onOpenLikers(postId)}
                >
                  {' '}
                  and {(item.likes_count || effectiveLikers?.length || 0) - 2} more
                </Text>
              )}
            </Text>
          );
        })()}

        {item.content || item.caption ? (() => {
          const fullCaption = item.content || item.caption || '';
          const isLong = fullCaption.length > 35;
          return (
            <TouchableOpacity
              onPress={() => setIsCaptionExpanded(!isCaptionExpanded)}
              activeOpacity={0.7}
              style={{ marginTop: verticalScale(4) }}
            >
              <Text style={[styles.captionText, isAnonymous && { color: '#333' }]}>
                <Text style={[styles.boldText, isAnonymous && { color: '#000' }]}>
                  {displayUsername}{' '}
                </Text>
                {!isCaptionExpanded && isLong ? (
                  <>
                    {fullCaption.slice(0, 35).trim()}
                    <Text style={{ fontWeight: 'bold', color: isAnonymous ? '#555' : COLORS.subtitle }}>...more</Text>
                  </>
                ) : (
                  <>
                    {fullCaption}
                    {isLong && (
                      <Text style={{ fontWeight: 'bold', color: isAnonymous ? '#555' : COLORS.subtitle }}> less</Text>
                    )}
                  </>
                )}
              </Text>
            </TouchableOpacity>
          );
        })() : null}

        {/* Time here */}
        {item.created_at && (
          <Text style={[styles.timeAgo, isAnonymous && { color: COLORS.subtitle }]}>
            {getTimeAgo(item.created_at)}
          </Text>
        )}
      </View>
    </View>
  );
}

export const HomeFeedPostRow = React.memo(HomeFeedPostRowInner);

const styles = StyleSheet.create({
  postCard: {
    backgroundColor: COLORS.background,
    marginBottom: verticalScale(16),
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(8),
  },
  postUser: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  postAvatar: {
    width: moderateScale(30),
    height: moderateScale(30),
    borderRadius: moderateScale(15),
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  postUsername: {
    fontSize: moderateFont(13),
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
  },
  followButtonHeader: {
    marginLeft: scale(4),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    backgroundColor: 'transparent',
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  followButtonHeaderText: {
    fontSize: moderateFont(12),
    fontWeight: '600',
    color: '#000',
  },
  postLocation: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle,
    marginTop: verticalScale(2),
  },
  musicInfoText: {
    fontSize: moderateFont(11),
    color: COLORS.primary,
    fontWeight: '500',
    maxWidth: scale(150),
  },
  postImage: {
    width: SIZES.width - scale(32),
    height: (SIZES.width - scale(32)) * (16 / 9),
    backgroundColor: COLORS.surface,
    alignSelf: 'center',
    borderRadius: moderateScale(24),
  },
  muteButton: {
    position: 'absolute',
    bottom: 8,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  actionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: scale(6),
    marginTop: verticalScale(10),
  },
  actionPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    alignSelf: 'flex-start',
    marginLeft: scale(16),
    gap: scale(2),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  musicSquareBox: {
    width: scale(25),
    height: scale(25),
    borderRadius: moderateScale(5),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  musicSquareImage: {
    width: '100%',
    height: '100%',
  },
  musicSquareBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    padding: scale(2),
    borderTopLeftRadius: scale(4),
  },
  pillActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(3),
  },
  pillActionText: {
    fontSize: moderateFont(12),
    fontWeight: '700',
  },
  pillDivider: {
    width: 1,
    height: 16,
    backgroundColor: COLORS.border,
    marginHorizontal: scale(4),
  },
  reactionBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 25,
    padding: 6,
    marginHorizontal: scale(16),
    marginTop: 6,
    gap: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: scale(20),
  },
  reactionEmojiBtn: {
    padding: 2,
    marginHorizontal: 4,
  },
  postFooter: {
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(8),
    paddingTop: verticalScale(8),
  },
  captionText: {
    color: COLORS.text,
    fontSize: moderateFont(14),
    lineHeight: moderateFont(22),
  },
  boldText: { fontWeight: '700', color: COLORS.primary },
  likedByText: {
    fontSize: moderateFont(13),
    color: COLORS.subtitle,
    lineHeight: moderateFont(20),
    marginBottom: verticalScale(4),
  },
  likedByUsername: {
    fontSize: moderateFont(13),
    fontWeight: '700',
    color: COLORS.primary,
  },
  likedByMore: {
    fontSize: moderateFont(13),
    fontWeight: '600',
    color: COLORS.subtitle,
  },
  timeAgo: {
    fontSize: moderateFont(12),
    color: COLORS.subtitle,
    marginTop: verticalScale(4),
  },
});
