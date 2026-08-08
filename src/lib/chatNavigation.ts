import { Image } from 'expo-image';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useChatStore } from '@/src/store/chatStore';

export type OpenChatParams = {
  chatId: string;
  recipientId: string;
  username: string;
  profileImage?: string;
  isOnline?: boolean;
  isAnonymous?: boolean;
  isNewThread?: boolean;
  isDisappearing?: boolean;
};

type RouterLike = { push: (href: any) => void; prefetch?: (href: any) => void };

// Keep avatars out of route params (long URLs slow navigation serialization).
const stagedAvatars = new Map<string, string>();

export function getStagedChatAvatar(recipientId?: string): string | undefined {
  if (!recipientId) return undefined;
  return stagedAvatars.get(recipientId);
}

export function buildChatHref(params: OpenChatParams) {
  return {
    pathname: `/chat/${params.chatId}` as const,
    params: {
      recipientId: params.recipientId,
      username: params.username,
      isOnline: String(!!params.isOnline),
      isAnonymous: String(!!params.isAnonymous),
      newThread: String(!!params.isNewThread),
      fromList: 'true',
      isDisappearing: String(!!params.isDisappearing),
    },
  };
}

export function prepareChatFromUser(user: any, existingConversation?: any): OpenChatParams {
  const uId = (user.id || user._id)?.toString() || '';
  const chatId = existingConversation
    ? (existingConversation._id || existingConversation.id)?.toString()
    : 'new';

  return {
    chatId: chatId || 'new',
    recipientId: uId,
    username: user.username || '',
    profileImage: user.avatar || user.avatar_url || '',
    isOnline: !!user.is_online,
    isAnonymous: false,
    isNewThread: !existingConversation,
  };
}

export function prepareChatFromConversation(item: any, other: any, currentUserId: string): OpenChatParams {
  let chatId = item._id?.toString?.() || item.id;
  if (item.type === 'private') {
    const otherId = (other?._id || other?.id)?.toString?.() || '';
    chatId = `secret_crush_${[currentUserId, otherId].sort().join('_')}`;
  }

  return {
    chatId: chatId || 'new',
    recipientId: (other?._id || other?.id)?.toString() || '',
    username: other?.username || other?.anonymousPersona?.username || 'Chat',
    profileImage: other?.avatar_url || other?.avatar || other?.anonymousPersona?.avatar || '',
    isOnline: !!(item.is_online || other?.is_online),
    isAnonymous: !!item?.is_anonymous,
    isNewThread: chatId === 'new' || !item.last_message,
    isDisappearing: !!item.is_disappearing,
  };
}

export function prefetchChatAssets(params: Pick<OpenChatParams, 'profileImage' | 'username' | 'isAnonymous' | 'recipientId'>) {
  if (params.recipientId && params.profileImage) {
    stagedAvatars.set(params.recipientId, params.profileImage);
  }
  const avatarUrl = resolveAvatarUrl(
    params.profileImage || '',
    params.username,
    !!params.isAnonymous
  );
  if (avatarUrl) {
    Image.prefetch(avatarUrl).catch(() => {});
  }
}

export function prefetchChatMessages(chatId: string) {
  if (!chatId || chatId === 'new') return;
  void useChatStore.getState().prefetchMessages(chatId);
}

export function warmChatIntent(params: OpenChatParams) {
  prefetchChatAssets(params);
  if (params.chatId !== 'new') {
    prefetchChatMessages(params.chatId);
  }
}

export function openChat(router: RouterLike, params: OpenChatParams) {
  if (params.recipientId && params.profileImage) {
    stagedAvatars.set(params.recipientId, params.profileImage);
  }
  // Navigate first — never block the transition on prefetch/haptics work.
  router.push(buildChatHref(params));
}

export function prefetchChatRoute(router: RouterLike) {
  router.prefetch?.(buildChatHref({
    chatId: 'new',
    recipientId: 'warm',
    username: 'warm',
    isNewThread: true,
  }));
}

export function prefetchSearchResultChats(
  searchResults: any[],
  userIdToConversation: Map<string, any>,
  limit = 5
) {
  for (const user of searchResults.slice(0, limit)) {
    const uId = (user.id || user._id)?.toString();
    const existing = uId ? userIdToConversation.get(uId) : undefined;
    const params = prepareChatFromUser(user, existing);
    prefetchChatAssets(params);
    if (params.chatId !== 'new') {
      prefetchChatMessages(params.chatId);
    }
  }
}
