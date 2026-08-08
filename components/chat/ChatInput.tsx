import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import type { Message } from '@/src/lib/types';

interface ChatInputProps {
  input: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  onCamera?: () => void;
  onGallery?: () => void;
  onEmojiPress: () => void;
  showEmojiPicker: boolean;
  isAnonymousChat: boolean;
  uploading: boolean;
  editingMessage: Message | null;
  replyingMessage: Message | null;
  onCancelAction: () => void;
  inputBottomPad: number;
  isKeyboardOpen?: boolean;
  onImageChange?: (event: { nativeEvent: { link: string; uri: string; mime: string } }) => void;
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
  isRecording?: boolean;
}

export const ChatInput = React.memo(React.forwardRef<TextInput, ChatInputProps>(({
  input,
  onChangeText,
  onSend,
  onAttach,
  onCamera,
  onGallery,
  onEmojiPress,
  showEmojiPicker,
  isAnonymousChat,
  uploading,
  editingMessage,
  replyingMessage,
  onCancelAction,
  inputBottomPad,
  isKeyboardOpen,
  onImageChange,
  onVoiceStart,
  onVoiceEnd,
  isRecording,
}, ref) => {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const hasText = !!input.trim();

  const iconColor = isAnonymousChat ? '#9CA3AF' : COLORS.text;

  return (
    <View style={[styles.inputBar, { paddingBottom: inputBottomPad }, isAnonymousChat && styles.inputBarAnon]}>
      {(editingMessage || replyingMessage) && (
        <View style={styles.actionPreview}>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>
              {editingMessage ? 'Edit Message' : `Replying to ${replyingMessage?.sender_id?.username || 'user'}`}
            </Text>
            <Text style={styles.actionContent} numberOfLines={1}>
              {editingMessage?.content ||
                (() => {
                  if (!replyingMessage) return '';
                  if (replyingMessage.is_deleted) return 'Message deleted';
                  const content = replyingMessage.content || '';
                  const isShot = replyingMessage.message_type === 'shot_share' || content.includes('anufy.app/reels/') || content.includes('anufy.app/shots/');
                  const isPost = replyingMessage.message_type === 'post_share' || content.includes('anufy.app/post/');
                  const isProfile = replyingMessage.message_type === 'profile_share' || content.includes('anufy.app/profile/');

                  if (isProfile) return '👤 Profile Card';
                  if (isShot) return '📽️ Shot';
                  if (isPost) return '🖼️ Post';

                  return content;
                })() ||
                (replyingMessage?.media_url ? 'Media' : '')}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelAction}>
            <Ionicons name="close-circle" size={24} color={COLORS.subtitle} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[
        styles.composer,
        {
          marginBottom: isKeyboardOpen ? 0 : 8
        }
      ]}>
        {/* Camera button */}
        {onCamera && (
          <TouchableOpacity
            style={styles.cameraCircle}
            onPress={onCamera}
            disabled={uploading}
          >
            <Ionicons name="camera" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Input area */}
        <TextInput
          ref={ref}
          style={styles.composerInput}
          placeholder="Message…"
          placeholderTextColor={COLORS.subtitle}
          value={input}
          onChangeText={(text) => {
            if (
              text.startsWith('content://') ||
              text.startsWith('file://') ||
              (text.includes('giphy.com') && text.length > 50)
            ) {
              if (onImageChange) {
                onImageChange({ nativeEvent: { uri: text, link: text, mime: 'image/gif' } });
                return;
              }
            }
            onChangeText(text);
          }}
          multiline
          scrollEnabled={false}
          blurOnSubmit={false}
          maxLength={4000}
          // @ts-ignore
          onImageChange={onImageChange}
          contentMediaType={['image/*']}
          contentDescription="GIF, Image and Sticker Support"
        />

        {/* Right buttons */}
        {!hasText ? (
          <View style={styles.iconsRow}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onGallery || onAttach}
              disabled={uploading}
            >
              <Ionicons name="image-outline" size={22} color={iconColor} />
            </TouchableOpacity>

            <TouchableOpacity onPress={onEmojiPress} style={styles.iconBtn}>
              <Ionicons
                name={showEmojiPicker ? 'keypad-outline' : 'happy-outline'}
                size={22}
                color={iconColor}
              />
            </TouchableOpacity>

            {onAttach && (
              <TouchableOpacity onPress={onAttach} style={styles.iconBtn}>
                <Ionicons name="add-circle-outline" size={22} color={iconColor} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.sendTextBtn}
            onPress={onSend}
            disabled={uploading}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}));

const getStyles = (COLORS: any) => StyleSheet.create({
  inputBar: {
    paddingHorizontal: 0,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  inputBarAnon: { backgroundColor: 'transparent' },
  actionPreview: {
    padding: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderRadius: 8,
  },
  actionPreviewAnon: { backgroundColor: '#222', borderColor: '#333' },
  actionInfo: {
    flex: 1,
    marginRight: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    paddingLeft: 8,
  },
  actionTitle: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold' },
  actionContent: { color: COLORS.text, fontSize: 14 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    maxHeight: 120,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 24,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginHorizontal: 8,
  },
  composerAnon: { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' },
  cameraCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#3897F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  cameraCircleAnon: { backgroundColor: '#3897F0' },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 110,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 15,
    color: COLORS.text,
    textAlignVertical: 'top',
  },
  composerInputAnon: { color: COLORS.text },
  // ─── Icon buttons ───────────────────────────────
  iconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 32,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendTextBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    height: 36,
  },
  sendText: {
    color: '#3897F0',
    fontSize: 16,
    fontWeight: '700',
  },
});
