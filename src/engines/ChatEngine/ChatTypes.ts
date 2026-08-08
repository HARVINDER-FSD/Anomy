export interface ChatMessage {
  _id: string;
  id?: string;
  conversation_id: string;
  sender_id: any;
  content: string;
  message_type?: string;
  media_url?: string;
  created_at: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  reactions?: Record<string, string>;
  tempMessageId?: string;
  reply_to_id?: any;
  is_deleted?: boolean;
}

export interface ChatConversation {
  _id: string;
  id?: string;
  participants: any[];
  last_message?: ChatMessage;
  unread_count?: number;
  is_anonymous?: boolean;
}
