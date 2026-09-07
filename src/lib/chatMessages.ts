type ChatMessageLike = {
  _id?: string | number;
  id?: string | number;
  content?: string;
  message_type?: string;
  status?: string;
  sender_id?: { _id?: string } | string;
  created_at?: string | Date;
  reactions?: Record<string, any>;
  tempMessageId?: string;
  client_message_id?: string;
  [key: string]: any;
};

export function messageId(m: ChatMessageLike): string {
  const rawId = m._id ?? m.id;
  return (rawId?.toString?.() || String(rawId || '')).toString();
}

export function senderIdOf(m: ChatMessageLike): string {
  const sid = m.sender_id as any;
  return (sid?._id?.toString?.() || sid?.id?.toString?.() || sid?.toString?.() || '').toString();
}

export function messageFingerprint(m: ChatMessageLike): string {
  return `${senderIdOf(m)}|${m.message_type || 'text'}|${(m.content || '').trim()}`;
}

export function dedupeMessages<T extends ChatMessageLike>(msgs: T[]): T[] {
  const seen = new Set<string>();
  return msgs.filter((m) => {
    const id = messageId(m);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function getTime(m: ChatMessageLike): number {
  const raw = m.created_at || (m as any).createdAt || (m as any).timestamp;
  if (!raw) return 0;
  const ts = typeof raw === 'number' ? raw : new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

/** Single Canonical Message Sorter: Oldest first (index 0 = oldest, top) → Newest last (index N-1 = newest, bottom) */
export function sortMessagesOldestFirst<T extends ChatMessageLike>(msgs: T[]): T[] {
  return [...msgs].sort((a, b) => {
    const aTime = getTime(a);
    const bTime = getTime(b);
    if (aTime !== bTime) {
      return aTime - bTime; // Oldest first (index 0) → newest last (index N-1)
    }
    return messageId(a).localeCompare(messageId(b));
  });
}

/** Backwards-compatible aliases mapping to canonical oldest-first sorter */
export function sortMessagesAscending<T extends ChatMessageLike>(msgs: T[]): T[] {
  return sortMessagesOldestFirst(msgs);
}

export function sortMessagesNewestFirst<T extends ChatMessageLike>(msgs: T[]): T[] {
  return sortMessagesOldestFirst(msgs);
}

export function sortMessagesDesc<T extends ChatMessageLike>(msgs: T[]): T[] {
  return sortMessagesOldestFirst(msgs);
}

export function sortMessagesInverted<T extends ChatMessageLike>(msgs: T[]): T[] {
  return sortMessagesOldestFirst(msgs);
}

/** Keep in-flight optimistic sends while refreshing history from API. Returns OLDEST-FIRST array. */
export function mergeMessageHistory<T extends ChatMessageLike>(
  local: T[],
  remote: T[]
): T[] {
  const remoteIds = new Set(remote.map(messageId));
  const remotePrints = new Set(remote.map(messageFingerprint));
  const oldestRemoteTs = remote.reduce<number | null>((oldest, msg) => {
    const ts = msg.created_at ? new Date(msg.created_at).getTime() : NaN;
    if (!Number.isFinite(ts)) return oldest;
    if (oldest === null) return ts;
    return Math.min(oldest, ts);
  }, null);

  // 🚀 Preserve local reactions if remote reactions object is empty/missing
  const localReactionsMap = new Map<string, any>();
  local.forEach((m) => {
    const id = messageId(m);
    if (id && m.reactions && Object.keys(m.reactions).length > 0) {
      localReactionsMap.set(id, m.reactions);
    }
  });

  const keepLocal = local.filter((m) => {
    const id = messageId(m);
    if (remoteIds.has(id)) return false;
    if (m.status === 'sending') {
      return !remotePrints.has(messageFingerprint(m));
    }

    // Preserve newer local messages when the server returns a partial/stale page.
    if (oldestRemoteTs === null) return true;

    const localTs = m.created_at ? new Date(m.created_at).getTime() : NaN;
    return Number.isFinite(localTs) && localTs >= oldestRemoteTs;
  });

  // 🚀 Merge remote messages with local reactions if remote reactions are missing
  const mergedRemote = remote.map((m) => {
    const id = messageId(m);
    const localReactions = localReactionsMap.get(id);
    if (localReactions && (!m.reactions || Object.keys(m.reactions).length === 0)) {
      return { ...m, reactions: localReactions } as T;
    }
    return m;
  });

  const result = sortMessagesOldestFirst(dedupeMessages([...keepLocal, ...mergedRemote]));

  // 🚀 OPTIMIZATION: Reference equality check to return original array if nothing changed.
  // Returning the exact same array reference prevents React & FlashList from re-rendering!
  if (local.length === result.length) {
    let isIdentical = true;
    for (let i = 0; i < local.length; i++) {
      const loc = local[i];
      const res = result[i];
      const locAny = loc as any;
      const resAny = res as any;
      if (
        messageId(loc) !== messageId(res) ||
        loc.status !== res.status ||
        loc.content !== res.content ||
        locAny.media_url !== resAny.media_url ||
        JSON.stringify(loc.reactions || {}) !== JSON.stringify(res.reactions || {})
      ) {
        isIdentical = false;
        break;
      }
    }
    if (isIdentical) {
      return local;
    }
  }

  return result;
}

export function upsertIncomingMessage<T extends ChatMessageLike>(
  prev: T[],
  incoming: T,
  myId?: string
): T[] {
  const incomingId = messageId(incoming);
  const tempId = incoming.tempMessageId?.toString?.() || incoming.tempMessageId || incoming.client_message_id;

  if (tempId) {
    const optimisticIdx = prev.findIndex((m) => messageId(m) === tempId || (m as any).client_message_id === tempId);
    if (optimisticIdx >= 0) {
      const next = [...prev];
      const existing = next[optimisticIdx];
      next[optimisticIdx] = {
        ...existing,
        ...incoming,
        _id: incomingId || existing._id,
        id: incomingId || existing.id,
        tempMessageId: undefined
      } as T;
      return sortMessagesOldestFirst(dedupeMessages(next));
    }
  }

  // Update existing message if already present (e.g. status or reaction changes)
  const existingIdx = prev.findIndex((m) => messageId(m) === incomingId);
  if (existingIdx >= 0) {
    const next = [...prev];
    next[existingIdx] = {
      ...next[existingIdx],
      ...incoming
    } as T;
    return sortMessagesOldestFirst(dedupeMessages(next));
  }

  const mySenderId = myId?.toString?.() || myId;
  const incomingSender = senderIdOf(incoming);
  const incomingPrint = messageFingerprint(incoming);

  if (mySenderId && incomingSender === mySenderId) {
    const withoutStale = prev.filter((m) => {
      if (m.status !== 'sending') return true;
      return messageFingerprint(m) !== incomingPrint;
    });
    return sortMessagesOldestFirst(dedupeMessages([...withoutStale, incoming]));
  }

  return sortMessagesOldestFirst(dedupeMessages([...prev, incoming]));
}
