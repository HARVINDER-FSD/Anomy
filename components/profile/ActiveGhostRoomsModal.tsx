import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, 
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, 
  Dimensions, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { CreateGhostRoomModal } from './CreateGhostRoomModal';

const { height } = Dimensions.get('window');

interface ActiveGhostRoomsModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export function ActiveGhostRoomsModal({ isVisible, onClose }: ActiveGhostRoomsModalProps) {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const router = useSafeRouter();

  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateRoomVisible, setIsCreateRoomVisible] = useState(false);

  const fetchRooms = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const res = await apiClient.get('/chat/anonymous/groups');
      setRooms(res.data.data || []);
    } catch (error) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      fetchRooms();
    }
  }, [isVisible, fetchRooms]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRooms(false);
  };

  const handleJoin = async (roomId: string) => {
    try {
      await apiClient.post('/chat/anonymous/group/join', {
        conversationId: roomId
      });
      onClose();
      router.push(`/chat/${roomId}`);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to join room');
    }
  };

  const filteredRooms = rooms.filter(room => 
    room.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.title}>Active Ghost Rooms 👻</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.subtitle} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search rooms..."
              placeholderTextColor={COLORS.subtitle}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
              </TouchableOpacity>
            )}
          </View>

          {/* Create New Room Row */}
          <TouchableOpacity 
            style={styles.createRoomRow} 
            onPress={() => setIsCreateRoomVisible(true)}
          >
            <Ionicons name="add-circle" size={24} color={COLORS.primary} />
            <Text style={styles.createRoomText}>Create New Ghost Room</Text>
          </TouchableOpacity>

          {/* List or Loading */}
          {loading && rooms.length === 0 ? (
            <View style={styles.centerNode}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading rooms...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredRooms}
              keyExtractor={(item) => item._id || item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
              }
              renderItem={({ item }) => (
                <View style={styles.roomCard}>
                  <View style={styles.roomIconBox}>
                    <Ionicons name="people" size={22} color="#FFF" />
                  </View>
                  <View style={styles.roomInfo}>
                    <Text style={styles.roomName}>{item.name}</Text>
                    <Text style={styles.roomMembers}>{item.participants?.length || 1} Ghosts inside</Text>
                  </View>
                  <TouchableOpacity style={styles.joinBtn} onPress={() => handleJoin(item._id || item.id)}>
                    <Text style={styles.joinBtnText}>Join</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={48} color={COLORS.subtitle} style={{ opacity: 0.5 }} />
                  <Text style={styles.emptyText}>No rooms found</Text>
                  <Text style={styles.emptySubText}>Tap "Create New Ghost Room" to start one!</Text>
                </View>
              }
            />
          )}
        </View>

        <CreateGhostRoomModal 
          isVisible={isCreateRoomVisible} 
          onClose={() => setIsCreateRoomVisible(false)}
          onRoomCreated={() => {
            fetchRooms();
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end' 
  },
  modalContent: { 
    backgroundColor: COLORS.background, 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    height: height * 0.85, 
    padding: 20, 
    paddingBottom: Platform.OS === 'ios' ? 40 : 20 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  title: { 
    fontSize: 20, 
    fontWeight: '800', 
    color: COLORS.text,
    fontFamily: 'Outfit_800ExtraBold' 
  },
  closeBtn: { 
    padding: 5,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchBar: {
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.surface, 
    borderRadius: 16, 
    paddingHorizontal: 15, 
    height: 48, 
    borderWidth: 1, 
    borderColor: COLORS.border,
    marginBottom: 15
  },
  searchInput: { 
    flex: 1, 
    marginLeft: 10, 
    fontSize: 15, 
    color: COLORS.text, 
    fontFamily: 'Outfit_400Regular' 
  },
  createRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    marginBottom: 20,
    gap: 10
  },
  createRoomText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: 'Outfit_700Bold'
  },
  listContent: { 
    paddingBottom: 20 
  },
  roomCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.surface, 
    padding: 15, 
    borderRadius: 16, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: COLORS.border 
  },
  roomIconBox: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: COLORS.primary, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 15 
  },
  roomInfo: { 
    flex: 1 
  },
  roomName: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: COLORS.text, 
    marginBottom: 4,
    fontFamily: 'Outfit_700Bold'
  },
  roomMembers: { 
    fontSize: 13, 
    color: COLORS.subtitle,
    fontFamily: 'Outfit_400Regular'
  },
  joinBtn: { 
    backgroundColor: COLORS.primary, 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 12 
  },
  joinBtnText: { 
    color: '#FFF', 
    fontWeight: '700', 
    fontSize: 13,
    fontFamily: 'Outfit_700Bold'
  },
  centerNode: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtitle,
    fontSize: 14,
    fontFamily: 'Outfit_400Regular'
  },
  emptyState: { 
    alignItems: 'center', 
    marginTop: 50,
    gap: 10
  },
  emptyText: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: COLORS.text,
    fontFamily: 'Outfit_700Bold'
  },
  emptySubText: {
    fontSize: 13,
    color: COLORS.subtitle,
    textAlign: 'center',
    fontFamily: 'Outfit_400Regular'
  }
});
