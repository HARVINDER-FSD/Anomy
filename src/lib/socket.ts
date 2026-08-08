import { io, Socket } from 'socket.io-client';
import { getBaseUrl } from '../api/config';

class SocketService {
  public socket: Socket | null = null;
  private token: string | null;
  private pendingRooms: string[]; // Queue for rooms to join after connect

  constructor() {
    this.token = null;
    this.pendingRooms = [];
  }

  connect(token: string) {
    if (this.socket?.connected && this.token !== token) {
      this.disconnect();
    }
    this.token = token;

    if (this.socket?.connected) {
      this._flushPendingRooms();
      return;
    }

    if (this.socket && !this.socket.disconnected) {
      return;
    }

    const url = getBaseUrl(false);

    this.socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this._flushPendingRooms();
    });

    this.socket.on('connect_error', (_error) => {
      // Silent in production
    });

    this.socket.on('disconnect', (_reason) => {
      // Silent in production
    });
  }

  // ✅ Internal: emit all pending room joins after socket is ready
  private _flushPendingRooms() {
    while (this.pendingRooms.length > 0) {
      const chatId = this.pendingRooms.shift()!;
      this.socket?.emit('chat:join', { chatId });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.pendingRooms = [];
    }
  }

  // ✅ FIXED: If socket not yet connected, queue the join — emit after connect
  joinRoom(chatId: string) {
    if (this.socket?.connected) {
      this.socket.emit('chat:join', { chatId });
    } else {
      if (!this.pendingRooms.includes(chatId)) {
        this.pendingRooms.push(chatId);
      }
    }
  }

  leaveRoom(chatId: string) {
    this.pendingRooms = this.pendingRooms.filter(r => r !== chatId);
    this.socket?.emit('chat:leave', { chatId });
  }

  sendMessage(payload: {
    chatId: string;
    recipientId: string;
    content: string;
    type?: string;
    mediaUrl?: string;
    authorUsername?: string;
    authorAvatar?: string;
    attachments?: Array<{ url: string; type: 'image' | 'video' | 'audio' | 'file' }>;
    replyTo?: string;
    tempMessageId?: string;
    isVanish?: false | 'on_read' | '24h';
  }) {
    if (!this.socket?.connected) return;
    this.socket.emit('message:send', payload);
  }

  editMessage(payload: { messageId: string; chatId: string; newContent: string }) {
    this.socket?.emit('message:edit', payload);
  }

  deleteMessage(payload: { messageId: string; chatId: string; deleteType: 'me' | 'everyone' }) {
    this.socket?.emit('message:delete', payload);
  }

  reactToMessage(payload: { messageId: string; chatId: string; emoji: string; forceAdd?: boolean }) {
    this.socket?.emit('message:react', payload);
  }

  removeReaction(payload: { messageId: string; chatId: string; emoji: string }) {
    this.socket?.emit('message:remove_reaction', payload);
  }

  pinMessage(payload: { messageId: string; chatId: string; isPinned: boolean }) {
    this.socket?.emit('message:pin', payload);
  }

  sendTypingStatus(payload: { chatId: string; isTyping: boolean }) {
    this.socket?.emit('chat:typing', payload);
  }

  markRead(payload: { chatId: string; messageIds?: string[]; status: 'read' | 'delivered' }) {
    this.socket?.emit('message:status', payload);
  }

  // ✅ Run callback immediately if connected, or after connect fires
  onReady(callback: () => void) {
    if (this.socket?.connected) {
      callback();
    } else {
      this.socket?.once('connect', callback);
    }
  }

  // ✅ Generic event listener
  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  // ✅ Generic event remover
  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }

  // ✅ Generic event emitter
  emit(event: string, ...args: any[]) {
    this.socket?.emit(event, ...args);
  }

  // ✅ Query server for a user's live online status
  queryOnlineStatus(targetUserId: string) {
    const emitAction = () => this.socket?.emit('user:status', { targetUserId });
    if (this.socket?.connected) {
      emitAction();
    } else {
      this.socket?.once('connect', emitAction);
    }
  }
}

export const socketService = new SocketService();
