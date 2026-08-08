import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, FlatList, TextInput, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { ANIMATED_STICKERS } from '@/src/constants/animated-stickers';
import { useChatStore } from '@/src/store/chatStore';

interface MessageActionModalProps {
  visible: boolean;
  selectedMessage: any;
  isAnonymousChat: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: (type: 'me' | 'everyone') => void;
  myId: string;
  showFullEmojiTray: boolean;
  setShowFullEmojiTray: (show: boolean) => void;
  TRAY_CATEGORIES: any[];
  activeCategory: number;
  setActiveCategory: (index: number) => void;
  trayListRef: any;
  insetsBottom: number;
}

export const MessageActionModal = React.memo(({
  visible,
  selectedMessage,
  isAnonymousChat,
  onClose,
  onReact,
  onReply,
  onCopy,
  onPin,
  onEdit,
  onDelete,
  myId,
  showFullEmojiTray,
  setShowFullEmojiTray,
  TRAY_CATEGORIES,
  activeCategory,
  setActiveCategory,
  trayListRef,
  insetsBottom,
}: MessageActionModalProps) => {
  const mine = selectedMessage?.sender_id?._id === myId || selectedMessage?.sender_id === myId;
  const { quickReactions, setQuickReactions } = useChatStore();
  const [isEditingReactions, setIsEditingReactions] = useState(false);
  const [selectedReactionIndex, setSelectedReactionIndex] = useState<number | null>(null);

  const handleEmojiSelect = (emoji: string) => {
    if (selectedReactionIndex !== null) {
      // Customization mode
      const newReactions = [...quickReactions];
      newReactions[selectedReactionIndex] = emoji;
      setQuickReactions(newReactions);
      setSelectedReactionIndex(null);
      setIsEditingReactions(false);
      setShowFullEmojiTray(false);
      return;
    }
    // Normal reaction mode
    onReact(emoji);
  };

  const handleClose = () => {
    setIsEditingReactions(false);
    setSelectedReactionIndex(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.modalBackdrop} onPress={handleClose}>
        <View style={[styles.modalSheet, isAnonymousChat && styles.modalSheetAnon, showFullEmojiTray && { padding: 0, paddingBottom: 0 }]} onStartShouldSetResponder={() => true}>
          {showFullEmojiTray ? (
            <View style={{ height: 600 }}>
              <View style={[styles.dragHandle, { backgroundColor: isAnonymousChat ? '#444' : '#ccc' }]} />
              <View style={styles.trayHeader}>
                <TouchableOpacity onPress={() => setShowFullEmojiTray(false)} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color={isAnonymousChat ? '#ccc' : COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.trayTitle, { color: isAnonymousChat ? '#fff' : COLORS.text }]}>
                  {selectedReactionIndex !== null ? 'Choose new reaction' : 'All Emojis'}
                </Text>
                <View style={{ width: 40 }} />
              </View>
              <View style={[styles.searchBar, { backgroundColor: isAnonymousChat ? '#222' : '#f0f0f0' }]}>
                <Ionicons name="search" size={16} color="#888" />
                <TextInput 
                  placeholder="Search" 
                  placeholderTextColor="#888"
                  style={[styles.searchInput, { color: isAnonymousChat ? '#eee' : COLORS.text }]}
                />
              </View>
              <FlatList
                ref={trayListRef}
                data={TRAY_CATEGORIES}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                onViewableItemsChanged={({ viewableItems }) => {
                  if (viewableItems.length > 0) {
                    setActiveCategory(viewableItems[0].index || 0);
                  }
                }}
                viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
                renderItem={({ item }) => {
                  const stickers = ANIMATED_STICKERS.slice(item.range[0], item.range[1] + 1);
                  return (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={styles.categoryTitle}>{item.title}</Text>
                      <View style={styles.emojiGrid}>
                        {stickers.map((sticker) => (
                          <TouchableOpacity
                            key={sticker.emoji}
                            style={styles.emojiItem}
                            onPress={() => handleEmojiSelect(sticker.emoji)}
                          >
                            <Text style={{ fontSize: 40 }}>{sticker.emoji}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                }}
              />
              <View style={[styles.categoryBar, { borderTopColor: isAnonymousChat ? '#222' : '#eee', paddingBottom: Math.max(insetsBottom, 8) }]}>
                {TRAY_CATEGORIES.map((cat, index) => (
                  <TouchableOpacity 
                    key={cat.id} 
                    onPress={() => {
                      setActiveCategory(index);
                      trayListRef.current?.scrollToIndex({ index, animated: true });
                    }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons 
                      name={cat.icon as any} 
                      size={20} 
                      color={activeCategory === index ? (isAnonymousChat ? '#fff' : COLORS.primary) : '#888'} 
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <>
              <View style={[styles.modalReactionRow, { borderBottomColor: isAnonymousChat ? '#333' : COLORS.border }]}>
                <View style={styles.reactionContainer}>
                  {quickReactions.map((emoji: string, index: number) => (
                    <TouchableOpacity 
                      key={`${emoji}-${index}`} 
                      style={[
                        styles.modalReactBtn, 
                        isEditingReactions && styles.editingReactBtn,
                        selectedReactionIndex === index && styles.selectedReactBtn
                      ]} 
                      onPress={() => {
                        if (isEditingReactions) {
                          setSelectedReactionIndex(index);
                          setShowFullEmojiTray(true);
                        } else {
                          onReact(emoji);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 28 }}>{emoji}</Text>
                      {isEditingReactions && (
                        <View style={styles.editBadge}>
                          <Ionicons name="pencil" size={10} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity 
                    style={[styles.modalReactBtn, isEditingReactions && { backgroundColor: COLORS.primary }]} 
                    onPress={() => {
                      if (isEditingReactions) {
                        setIsEditingReactions(false);
                        setSelectedReactionIndex(null);
                      } else {
                        setIsEditingReactions(true);
                      }
                    }}
                  >
                    <Ionicons 
                      name={isEditingReactions ? "checkmark" : "settings-outline"} 
                      size={24} 
                      color={isEditingReactions ? '#fff' : (isAnonymousChat ? '#ccc' : COLORS.text)} 
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.modalReactBtn} onPress={() => setShowFullEmojiTray(true)}>
                  <Ionicons name="add" size={28} color={isAnonymousChat ? '#ccc' : COLORS.text} />
                </TouchableOpacity>
              </View>
          
              <View style={styles.modalActions}>
                {isEditingReactions ? (
                  <View style={styles.editHintBox}>
                    <Text style={[styles.editHintText, { color: isAnonymousChat ? '#aaa' : COLORS.subtitle }]}>
                      Tap a reaction to customize it
                    </Text>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.modalActionBtn} onPress={onReply}>
                      <Ionicons name="arrow-undo-outline" size={24} color={isAnonymousChat ? '#ccc' : COLORS.text} />
                      <Text style={[styles.modalActionText, isAnonymousChat && { color: '#ccc' }]}>Reply</Text>
                    </TouchableOpacity>

                    {selectedMessage?.content && selectedMessage.content !== 'Photo' ? (
                      <TouchableOpacity style={styles.modalActionBtn} onPress={onCopy}>
                        <Ionicons name="copy-outline" size={24} color={isAnonymousChat ? '#ccc' : COLORS.text} />
                        <Text style={[styles.modalActionText, isAnonymousChat && { color: '#ccc' }]}>Copy</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity style={styles.modalActionBtn} onPress={onPin}>
                      <Ionicons name={selectedMessage?.is_pinned ? "pin" : "pin-outline"} size={24} color={isAnonymousChat ? '#ccc' : COLORS.text} />
                      <Text style={[styles.modalActionText, isAnonymousChat && { color: '#ccc' }]}>{selectedMessage?.is_pinned ? 'Unpin' : 'Pin'}</Text>
                    </TouchableOpacity>

                    {mine && (
                      <>
                        <TouchableOpacity style={styles.modalActionBtn} onPress={onEdit}>
                          <Ionicons name="pencil-outline" size={24} color={isAnonymousChat ? '#ccc' : COLORS.text} />
                          <Text style={[styles.modalActionText, isAnonymousChat && { color: '#ccc' }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalActionBtn} onPress={() => onDelete('everyone')}>
                          <Ionicons name="trash-outline" size={24} color="#ef4444" />
                          <Text style={[styles.modalActionText, { color: '#ef4444' }]}>Delete for everyone</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    
                    <TouchableOpacity style={styles.modalActionBtn} onPress={() => onDelete('me')}>
                      <Ionicons name="trash-bin-outline" size={24} color="#ef4444" />
                      <Text style={[styles.modalActionText, { color: '#ef4444' }]}>Delete for me</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalSheetAnon: { backgroundColor: '#1C1C24' },
  dragHandle: { width: 40, height: 4, alignSelf: 'center', marginTop: 16, borderRadius: 2 },
  trayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10 },
  backBtn: { padding: 8 },
  trayTitle: { fontSize: 16, fontWeight: 'bold' },
  searchBar: { flexDirection: 'row', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 16, marginVertical: 10, alignItems: 'center' },
  searchInput: { marginLeft: 6, flex: 1, fontSize: 14, padding: 0 },
  categoryTitle: { fontSize: 14, color: COLORS.subtitle, fontWeight: '600', marginBottom: 10 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiItem: { width: '16.66%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', padding: 2 },
  categoryBar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, borderTopWidth: 1 },
  modalReactionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1 },
  reactionContainer: { flexDirection: 'row', flex: 1, justifyContent: 'space-around', alignItems: 'center' },
  modalReactBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 22 },
  editingReactBtn: { backgroundColor: 'rgba(0,0,0,0.05)', borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed' },
  selectedReactBtn: { backgroundColor: 'rgba(108, 92, 231, 0.1)', borderColor: COLORS.primary, borderStyle: 'solid' },
  editBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.primary, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  editHintBox: { padding: 10, alignItems: 'center', justifyContent: 'center' },
  editHintText: { fontSize: 14, fontStyle: 'italic' },
  modalActions: { gap: 4 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  modalActionText: { fontSize: 16, color: COLORS.text, marginLeft: 16, fontWeight: '500' },
});

