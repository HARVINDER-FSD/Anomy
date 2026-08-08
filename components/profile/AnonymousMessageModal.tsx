import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';

interface AnonymousMessageModalProps {
  isVisible: boolean;
  onClose: () => void;
  recipientId: string;
  recipientUsername: string;
}

export function AnonymousMessageModal({ isVisible, onClose, recipientId, recipientUsername }: AnonymousMessageModalProps) {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!content.trim()) return;
    try {
      setLoading(true);
      setError('');
      await apiClient.post('/chat/anonymous/request', {
        recipientId,
        content: content.trim()
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setContent('');
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={isVisible} transparent animationType="slide">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Ghost Whisper 👻</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          
          {success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={48} color={COLORS.success || "#2ECC71"} />
              <Text style={styles.successText}>Message Sent Anonymously!</Text>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>Send a secret message to @{recipientUsername}. They won't know it's from you.</Text>
              <TextInput
                style={styles.input}
                placeholder="Type your secret message..."
                placeholderTextColor={COLORS.subtitle}
                multiline
                maxLength={200}
                value={content}
                onChangeText={setContent}
              />
              <Text style={styles.charCount}>{content.length}/200</Text>
              
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity 
                style={[styles.sendBtn, !content.trim() && styles.disabledBtn]} 
                onPress={handleSend}
                disabled={!content.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.sendBtnText}>Send Secretly</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.warningText}>Limit: 3 messages per day.</Text>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  closeBtn: { padding: 5 },
  subtitle: { fontSize: 13, color: COLORS.subtitle, marginBottom: 15 },
  input: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 15, minHeight: 100, textAlignVertical: 'top', fontSize: 15, color: COLORS.text },
  charCount: { textAlign: 'right', fontSize: 11, color: COLORS.subtitle, marginTop: 5 },
  sendBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  disabledBtn: { opacity: 0.5 },
  sendBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  errorText: { color: COLORS.error || '#E74C3C', fontSize: 12, marginTop: 10, textAlign: 'center' },
  warningText: { color: COLORS.subtitle, fontSize: 11, textAlign: 'center', marginTop: 10 },
  successBox: { alignItems: 'center', paddingVertical: 30 },
  successText: { fontSize: 16, fontWeight: '700', color: COLORS.success || '#2ECC71', marginTop: 10 }
});