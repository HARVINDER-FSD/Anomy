import { BaseRepository } from '../../engines/shared/BaseRepository';
import { ChatApi } from './ChatApi';
import { ChatSocket } from './ChatSocket';
import { ChatMapper } from './ChatMapper';

export class ChatRepository extends BaseRepository {
  readonly name = 'ChatRepository';
  public api: ChatApi;
  public socket: ChatSocket;

  constructor() {
    super();
    this.api = new ChatApi();
    this.socket = new ChatSocket();
  }

  async getConversations(isAnonymous = false) {
    const raw = await this.api.fetchConversations(isAnonymous);
    return raw;
  }

  async getMessages(conversationId: string, limit = 20, before?: string) {
    const raw = await this.api.fetchMessages(conversationId, limit, before);
    return ChatMapper.normalizeMessages(raw);
  }

  sendMessage(payload: any) {
    this.socket.sendMessage(payload);
  }

  editMessage(payload: any) {
    this.socket.editMessage(payload);
  }

  deleteMessage(payload: any) {
    this.socket.deleteMessage(payload);
  }

  reactToMessage(payload: any) {
    this.socket.reactToMessage(payload);
  }

  markRead(payload: any) {
    this.socket.markRead(payload);
  }

  subscribeToEvents(events: Record<string, (data: any) => void>) {
    Object.entries(events).forEach(([event, cb]) => {
      this.socket.on(event, cb);
    });
  }

  unsubscribeFromEvents(events: Record<string, (data: any) => void>) {
    Object.entries(events).forEach(([event, cb]) => {
      this.socket.off(event, cb);
    });
  }
}
