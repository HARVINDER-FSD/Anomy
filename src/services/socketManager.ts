import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBootstrapStore } from '../store/bootstrapStore';
import { getAuthToken } from '../utils/tokenUtils';
import { getBaseUrl } from '../api/config';

class SocketManager {
  private socket: Socket | null = null;

  /**
   * Connect Socket.io with Auth Token on App Launch / Bootstrap
   */
  async connect(): Promise<Socket | null> {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    try {
      const token = await getAuthToken();
      if (!token) return null;

      const socketUrl = getBaseUrl(false);

      this.socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
      });

      // Real-time Notification Badge Counter Listener
      this.socket.on('notification_unread_count', (data: { count: number }) => {
        if (data && typeof data.count === 'number') {
          useBootstrapStore.getState().setUnreadNotificationCount(data.count);
        }
      });

      // Real-time Chat Unread Counter Listener
      this.socket.on('chat_unread_count', (data: { count: number }) => {
        if (data && typeof data.count === 'number') {
          useBootstrapStore.getState().setUnreadChatCount(data.count);
        }
      });

      this.socket.on('disconnect', (reason) => {
      });

      return this.socket;
    } catch (e) {
      return null;
    }
  }

  /**
   * Disconnect Socket on Logout
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketManager = new SocketManager();
