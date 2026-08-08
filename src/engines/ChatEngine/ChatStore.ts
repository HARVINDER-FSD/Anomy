import { create } from 'zustand';
import { ChatMessage, ChatConversation } from './ChatTypes';
import { sortMessagesDesc, dedupeMessages } from '../../lib/chatMessages';

interface ChatStoreState {
  conversations: ChatConversation[];
  activeRoomId: string | null;
  roomMessages: Record<string, ChatMessage[]>;
  typingUsers: Record<string, boolean>;

  setConversations: (conversations: ChatConversation[]) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setRoomMessages: (roomId: string, messages: ChatMessage[]) => void;
  upsertRoomMessage: (roomId: string, message: ChatMessage) => void;
  updateMessageReactions: (roomId: string, messageId: string, reactions: Record<string, string>) => void;
  setTypingUser: (roomId: string, isTyping: boolean) => void;
}

export const useChatEngineStore = create<ChatStoreState>((set) => ({
  conversations: [],
  activeRoomId: null,
  roomMessages: {},
  typingUsers: {},

  setConversations: (conversations) => set({ conversations }),
  setActiveRoomId: (activeRoomId) => set({ activeRoomId }),

  setRoomMessages: (roomId, messages) =>
    set((state) => ({
      roomMessages: {
        ...state.roomMessages,
        [roomId]: sortMessagesDesc(dedupeMessages(messages)),
      },
    })),

  upsertRoomMessage: (roomId, message) =>
    set((state) => {
      const existing = state.roomMessages[roomId] || [];
      const incomingId = (message._id || message.id)?.toString();
      const tempId = message.tempMessageId;

      let next = [...existing];
      if (tempId) {
        const idx = next.findIndex((m) => (m._id || m.id)?.toString() === tempId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...message, _id: incomingId || next[idx]._id, tempMessageId: undefined };
          return { roomMessages: { ...state.roomMessages, [roomId]: sortMessagesDesc(dedupeMessages(next)) } };
        }
      }

      const existingIdx = next.findIndex((m) => (m._id || m.id)?.toString() === incomingId);
      if (existingIdx >= 0) {
        next[existingIdx] = { ...next[existingIdx], ...message };
      } else {
        next = [message, ...next];
      }

      return {
        roomMessages: {
          ...state.roomMessages,
          [roomId]: sortMessagesDesc(dedupeMessages(next)),
        },
      };
    }),

  updateMessageReactions: (roomId, messageId, reactions) =>
    set((state) => {
      const existing = state.roomMessages[roomId] || [];
      const targetId = messageId.toString();
      const updated = existing.map((m) =>
        (m._id || m.id)?.toString() === targetId ? { ...m, reactions } : m
      );

      return {
        roomMessages: {
          ...state.roomMessages,
          [roomId]: updated,
        },
      };
    }),

  setTypingUser: (roomId, isTyping) =>
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [roomId]: isTyping,
      },
    })),
}));
