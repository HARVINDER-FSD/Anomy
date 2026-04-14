import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';

interface ChatHeaderProps {
  username: string;
  profileImage?: string;
  isTyping?: boolean;
  isOnline?: boolean;
  onBack: () => void;
  onProfile?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onSearch?: () => void;
  onMore?: () => void;
  isAnonymousChat?: boolean;
}

export default function ChatHeader({
  username,
  profileImage,
  isTyping,
  isOnline,
  onBack,
  onProfile,
  onVoiceCall,
  onVideoCall,
  onSearch,
  onMore,
  isAnonymousChat,
}: ChatHeaderProps) {
  const colors = COLORS;

  return (
    <View style={[styles.container, { 
      backgroundColor: isAnonymousChat ? '#121212' : colors.background, 
      borderBottomColor: isAnonymousChat ? '#1A1A1A' : colors.border 
    }]}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={{ color: isAnonymousChat ? '#FFF' : colors.primary, fontSize: 24 }}>‹</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.userInfo} onPress={onProfile}>
        <View style={styles.avatarWrapper}>
          <Image
            source={{ uri: profileImage || `https://ui-avatars.com/api/?name=${username}&background=667eea&color=fff&size=128` }}
            style={styles.avatar}
          />
          {isOnline && <View style={[styles.onlineDot, isAnonymousChat && { borderColor: '#121212' }]} />}
        </View>
        <View>
          <Text style={[styles.username, { color: isAnonymousChat ? '#FFF' : colors.text }]}>{username}</Text>
          <Text style={[styles.status, { color: isAnonymousChat ? '#888' : colors.subtitle }]}>
            {isOnline ? 'Online' : 'last seen recently'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onVoiceCall} style={styles.actionBtn}>
          <Ionicons name="call-outline" size={22} color={isAnonymousChat ? colors.primary : colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onVideoCall} style={styles.actionBtn}>
          <Ionicons name="videocam-outline" size={24} color={isAnonymousChat ? colors.primary : colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onMore} style={styles.actionBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={isAnonymousChat ? '#FFF' : colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
  username: {
    fontWeight: '700',
    fontSize: 16,
  },
  status: {
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
  },
});
