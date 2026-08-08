import { apiClient } from '../../api/client';

export class ChatApi {
  async fetchConversations(isAnonymous = false) {
    const endpoint = isAnonymous ? '/chat/conversations?anonymous=true' : '/chat/conversations';
    const response = await apiClient.get(endpoint);
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  }

  async fetchMessages(conversationId: string, limit = 20, before?: string) {
    let url = `/chat/conversations/${conversationId}/messages?limit=${limit}`;
    if (before) {
      url += `&before=${encodeURIComponent(before)}`;
    }
    const response = await apiClient.get(url);
    return Array.isArray(response.data) ? response.data : [];
  }

  async fetchConversationDetails(conversationId: string) {
    const response = await apiClient.get(`/chat/conversations/${conversationId}`);
    return response.data;
  }
}
