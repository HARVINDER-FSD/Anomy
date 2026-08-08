import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';

interface CreateGhostRoomModalProps {
  isVisible: boolean;
  onClose: () => void;
  onRoomCreated?: () => void;
}

export function CreateGhostRoomModal({ isVisible, onClose, onRoomCreated }: CreateGhostRoomModalProps) {
  const router = useSafeRouter();
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!topic.trim()) return;
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.post('/chat/anonymous/group/create', {
        topic: topic.trim()
      });
      
      const convId = res.data?.conversation?._id || res.data?.conversation?.id;
      
      onClose();
      setTopic('');
      if (onRoomCreated) onRoomCreated();
      
      if (convId) {
        router.push(`/chat/${convId}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create room. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={isVisible} transparent animationType="slide">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Ghost Room 👻</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.subtitle}>Start a new anonymous group chat. Everyone who joins will be assigned a random Ghost identity.</Text>
          <TextInput
            style={styles.input}
            placeholder="Room Topic (e.g. Late Night Talks)"
            placeholderTextColor={COLORS.subtitle}
            maxLength={50}
            value={topic}
            onChangeText={setTopic}
            autoFocus
          />
          <Text style={styles.charCount}>{topic.length}/50</Text>
          
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity 
            style={[styles.createBtn, !topic.trim() && styles.disabledBtn]} 
            onPress={handleCreate}
            disabled={!topic.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.createBtnText}>Create Room</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  closeBtn: { padding: 5 },
  subtitle: { fontSize: 13, color: COLORS.subtitle, marginBottom: 20, lineHeight: 20 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 15, fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: '#EEE' },
  charCount: { textAlign: 'right', fontSize: 11, color: COLORS.subtitle, marginTop: 5 },
  createBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  disabledBtn: { opacity: 0.5 },
  createBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  errorText: { color: '#E74C3C', fontSize: 12, marginTop: 10, textAlign: 'center' }
});
