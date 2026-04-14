import { io, Socket } from 'socket.io-client';
import { getBaseUrl } from '../api/config';

class SocketService {
  public socket: Socket | null = null;
  private token: string | null = null;
  private pendingRooms: string[] = []; // Queue for rooms to join after connect

  connect(token: string) {
    if (this.socket?.connected && this.token !== token) {
      console.log('🔄 Token changed, reconnecting socket...');
      this.disconnect();
    }
    this.token = token;

    // ✅ Already connected — no need to reconnect
    if (this.socket?.connected) {
      console.log('Socket already connected');
      // Flush any pending room joins
      this._flushPendingRooms();
      return;
    }

    // ✅ Already connecting — don't create a second socket
    if (this.socket && !this.socket.disconnected) {
      console.log('Socket is already connecting...');
      return;
    }

    const url = getBaseUrl(false);
    console.log('🔌 Connecting to socket at:', url);

    this.socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('🚀 Socket connected:', this.socket?.id);
      // ✅ Flush all rooms that were queued before connection was ready
      this._flushPendingRooms();
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('⚠️ Socket disconnected:', reason);
    });
  }

  // ✅ Internal: emit all pending room joins after socket is ready
  private _flushPendingRooms() {
    while (this.pendingRooms.length > 0) {
      const chatId = this.pendingRooms.shift()!;
      console.log(`📥 Flushing pending room join: ${chatId}`);
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
      console.log(`📌 Socket not ready — queuing room join: ${chatId}`);
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
    attachments?: Array<{ url: string; type: 'image' | 'video' | 'audio' | 'file' }>;
    replyTo?: string;
    tempMessageId?: string;
  }) {
    if (!this.socket?.connected) {
      console.warn('⚠️ Cannot send message: socket not connected');
      return;
    }
    this.socket.emit('message:send', payload);
  }

  editMessage(payload: { messageId: string; chatId: string; newContent: string }) {
    this.socket?.emit('message:edit', payload);
  }

  deleteMessage(payload: { messageId: string; chatId: string; deleteType: 'me' | 'everyone' }) {
    this.socket?.emit('message:delete', payload);
  }

  reactToMessage(payload: { messageId: string; chatId: string; emoji: string }) {
    this.socket?.emit('message:react', payload);
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

  // ✅ Query server for a user's live online status
  queryOnlineStatus(targetUserId: string) {
    const emit = () => this.socket?.emit('user:status', { targetUserId });
    if (this.socket?.connected) {
      emit();
    } else {
      this.socket?.once('connect', emit);
    }
  }
}

export const socketService = new SocketService();
