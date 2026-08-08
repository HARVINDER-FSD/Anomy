export class ChatMapper {
  static normalizeMessage(msg: any): any {
    if (!msg) return msg;
    const idStr = (msg._id || msg.id)?.toString?.() || String(msg._id || msg.id || '');
    const normalizedReactions: Record<string, string> = {};
    if (msg.reactions && typeof msg.reactions === 'object') {
      Object.entries(msg.reactions).forEach(([k, v]) => {
        if (typeof v === 'string') {
          normalizedReactions[k.toString()] = v;
        }
      });
    }

    return {
      ...msg,
      _id: idStr,
      id: idStr,
      media_url: msg.media_url || msg.mediaUrl,
      author_username: msg.author_username || msg.authorUsername,
      author_avatar: msg.author_avatar || msg.authorAvatar,
      message_type: msg.message_type || msg.type || 'text',
      reactions: normalizedReactions,
      created_at: msg.created_at || msg.createdAt || new Date().toISOString(),
    };
  }

  static normalizeMessages(messages: any[]): any[] {
    if (!Array.isArray(messages)) return [];
    return messages.map(ChatMapper.normalizeMessage);
  }
}
