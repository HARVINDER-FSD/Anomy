import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../theme/colors';

export interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onCamera?: () => void;
  onGallery?: () => void;
  onEmoji?: () => void;
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
  onVideo?: () => void;
  onLocation?: () => void;
  onGif?: () => void;
  onSticker?: () => void;
  isRecording?: boolean;
  isSending?: boolean;
}

export default function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onCamera,
  onGallery,
  onEmoji,
  onVoiceStart,
  onVoiceEnd,
  isRecording,
  isSending,
}: ChatInputBarProps) {
  const colors = COLORS;
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: colors.background,
        paddingBottom: Math.max(insets.bottom, 12) + 10, // Added 10 to raise it up slightly
      }
    ]}>
      <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onEmoji} style={styles.accessoryBtn}>
          <Ionicons name="happy-outline" size={24} color={colors.subtitle} />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder="Type your message..."
          placeholderTextColor={colors.subtitle}
          multiline
          maxLength={4000}
        />

        <View style={styles.rightAccessories}>
          {!value.trim() && (
            <>
              {onGallery && (
                <TouchableOpacity onPress={onGallery} style={styles.accessoryBtn}>
                  <Ionicons name="image-outline" size={24} color={colors.subtitle} />
                </TouchableOpacity>
              )}
              {onCamera && (
                <TouchableOpacity onPress={onCamera} style={styles.accessoryBtn}>
                  <Ionicons name="camera-outline" size={24} color={colors.subtitle} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      <TouchableOpacity
        onPress={value.trim() ? onSend : (onVoiceStart || onSend)}
        disabled={isSending}
        style={[
          styles.sendBtn,
          { backgroundColor: value.trim() ? colors.primary : colors.subtitle }
        ]}
      >
        {isSending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons 
            name={value.trim() ? "send" : "mic-outline"} 
            size={22} 
            color="#fff" 
            style={value.trim() ? { marginLeft: 3 } : {}}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 1,
    paddingHorizontal: 6,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    paddingHorizontal: 8,
    maxHeight: 120,
  },
  accessoryBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightAccessories: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiIcon: {
    fontSize: 20,
  },
  mediaIcon: {
    fontSize: 20,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sendIconText: {
    color: '#fff',
    fontSize: 18,
    marginLeft: 2,
  },
});
