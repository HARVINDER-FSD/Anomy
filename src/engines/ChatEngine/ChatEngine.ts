import { BaseEngine } from '../shared/BaseEngine';
import { ChatRepository } from '../../repositories/ChatRepository/ChatRepository';
import { useChatEngineStore } from './ChatStore';
import { ChatMessage } from './ChatTypes';
import { ChatEvents } from './ChatEvents';
import { EventBus } from '../../shared/EventBus';
import { Logger } from '../../shared/Logger';
import { v4 as uuidv4 } from 'uuid';

export class ChatEngineClass extends BaseEngine {
  readonly name = 'ChatEngine';
  public repository: ChatRepository;

  constructor() {
    super();
    this.repository = new ChatRepository();
  }

  protected async onInitialize(): Promise<void> {
    this.repository.subscribeToEvents({
      'message:received': this.handleMessageReceived,
      'message:new': this.handleMessageReceived,
      'message:sent': this.handleMessageSent,
      'message:reactions_updated': this.handleReactionsUpdated,
      'chat:typing': this.handleTypingStatus,
    });
    Logger.info(this.name, 'Subscribed to ChatRepository events');
  }

  protected async onDestroy(): Promise<void> {
    this.repository.unsubscribeFromEvents({
      'message:received': this.handleMessageReceived,
      'message:new': this.handleMessageReceived,
      'message:sent': this.handleMessageSent,
      'message:reactions_updated': this.handleReactionsUpdated,
      'chat:typing': this.handleTypingStatus,
    });
  }

  // ── BUSINESS ACTIONS ──────────────────────────────────────────────────

  async enterRoom(conversationId: string): Promise<void> {
    useChatEngineStore.getState().setActiveRoomId(conversationId);
    this.repository.socket.joinRoom(conversationId);
  }

  async leaveRoom(conversationId: string): Promise<void> {
    this.repository.socket.leaveRoom(conversationId);
    useChatEngineStore.getState().setActiveRoomId(null);
  }

  async sendMessage(conversationId: string, recipientId: string, content: string, user: any, replyToId?: string): Promise<void> {
    const tempMessageId = uuidv4();
    const now = new Date().toISOString();

    const optimisticMessage: ChatMessage = {
      _id: tempMessageId,
      conversation_id: conversationId,
      sender_id: {
        _id: user.id || user._id,
        username: user.username,
        avatar_url: user.avatar_url,
      },
      content,
      message_type: 'text',
      created_at: now,
      status: 'sending',
      reactions: {},
      tempMessageId,
      reply_to_id: replyToId ? { _id: replyToId, content: 'Replying...' } : null,
    };

    // 🚀 Optimistic update in ChatStore on Frame #1 (0ms)
    useChatEngineStore.getState().upsertRoomMessage(conversationId, optimisticMessage);

    // Send payload via Repository
    this.repository.sendMessage({
      chatId: conversationId,
      recipientId,
      content,
      type: 'text',
      replyTo: replyToId,
      tempMessageId,
    });

    EventBus.emit(ChatEvents.MESSAGE_SENT, { conversationId, tempMessageId });
  }

  reactToMessage(conversationId: string, messageId: string, emoji: string, currentUserId: string): void {
    const activeMessages = useChatEngineStore.getState().roomMessages[conversationId] || [];
    const targetMsg = activeMessages.find((m) => (m._id || m.id)?.toString() === messageId.toString());

    if (targetMsg) {
      const currentReactions = { ...(targetMsg.reactions || {}) };
      if (currentReactions[currentUserId] === emoji) {
        delete currentReactions[currentUserId];
      } else {
        currentReactions[currentUserId] = emoji;
      }
      useChatEngineStore.getState().updateMessageReactions(conversationId, messageId, currentReactions);
    }

    this.repository.reactToMessage({ messageId, chatId: conversationId, emoji });
  }

  // ── EVENT HANDLERS ────────────────────────────────────────────────────

  private handleMessageReceived = (message: any) => {
    if (!message?.conversation_id) return;
    const roomId = message.conversation_id.toString();
    useChatEngineStore.getState().upsertRoomMessage(roomId, message);
    EventBus.emit(ChatEvents.MESSAGE_RECEIVED, message);
  };

  private handleMessageSent = ({ tempMessageId, messageId, conversationId }: any) => {
    if (!conversationId || !tempMessageId || !messageId) return;
    useChatEngineStore.getState().upsertRoomMessage(conversationId, {
      _id: messageId,
      tempMessageId,
      status: 'sent',
    } as any);
  };

  private handleReactionsUpdated = ({ messageId, chatId, reactions }: any) => {
    if (!chatId || !messageId) return;
    useChatEngineStore.getState().updateMessageReactions(chatId, messageId, reactions || {});
    EventBus.emit(ChatEvents.REACTION_UPDATED, { messageId, chatId, reactions });
  };

  private handleTypingStatus = ({ chatId, isTyping }: any) => {
    if (!chatId) return;
    useChatEngineStore.getState().setTypingUser(chatId, !!isTyping);
  };
}

export const ChatEngine = new ChatEngineClass();
