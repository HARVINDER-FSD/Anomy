import React, { useState, useEffect, useRef } from 'react';
import { Image } from 'expo-image';
import { 
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, 
  ActivityIndicator, Animated, Dimensions 
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { socketService } from '@/src/lib/socket';
import { useAuthStore } from '@/src/store/authStore';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';


const { width, height } = Dimensions.get('window');

export default function AnonymousMatchScreen() {
  const router = useSafeRouter();
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<'joining' | 'searching' | 'matched'>('joining');
  const [matchData, setMatchData] = useState<any>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    performanceEngine.startScreenTrace('AnonymousMatchScreen');
    performanceEngine.trackCacheAccess('Explore', false);
    performanceEngine.endScreenTrace('AnonymousMatchScreen', false);

    // Start pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Join Queue
    joinQueue();

    const navigateToChat = (data: any) => {
      const partner = data.partner || data.matchedUser || data.user || {};
      // Use ghost persona name/avatar — not real identity
      const ghostName = partner.name || partner.username || 'Ghost User';
      const ghostAvatar = partner.avatar || partner.avatar_url || resolveAvatarUrl(undefined, ghostName, true);

      setTimeout(() => {
        router.replace('/(tabs)/messages' as any);
        setTimeout(() => {
          router.push({
            pathname: '/chat/[id]',
            params: {
              id: data.conversationId,
              isAnonymousChat: 'true',
              username: ghostName.replace(/^@/, ''),
              profileImage: encodeURIComponent(ghostAvatar)
            }
          } as any);
        }, 50);
      }, 300);
    };

    // Listen for socket match
    const handleMatch = (data: any) => {
      setMatchData(data);
      setStatus('matched');
      navigateToChat(data);
    };

    socketService.on('anonymous:matched', handleMatch);

    return () => {
      socketService.off('anonymous:matched', handleMatch);
      apiClient.post('/chat/anonymous/leave', { interests: [topic] }).catch(() => {});
    };
  }, []);

  const joinQueue = async () => {
    try {
      const res = await apiClient.post('/chat/anonymous/join', { 
        interests: [topic || 'general'] 
      });
      
      if (res.data.status === 'matched') {
        setMatchData(res.data);
        setStatus('matched');
        const partner = res.data.partner || res.data.matchedUser || res.data.user || {};
        // Use ghost persona name/avatar — not real identity
        const ghostName = partner.name || partner.username || 'Ghost User';
        const ghostAvatar = partner.avatar || partner.avatar_url || resolveAvatarUrl(undefined, ghostName, true);

        setTimeout(() => {
          router.replace('/(tabs)/messages' as any);
          setTimeout(() => {
            router.push({
              pathname: '/chat/[id]',
              params: {
                id: res.data.conversationId,
                isAnonymousChat: 'true',
                username: ghostName.replace(/^@/, ''),
                profileImage: encodeURIComponent(ghostAvatar)
              }
            } as any);
          }, 50);
        }, 300);
      } else {
        setStatus('searching');
      }
    } catch (error) {
      // Handle error (e.g. low reputation)
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backBtn}>
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Searching...</Text>
      </View>

      <View style={styles.content}>
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.innerCircle}>
            <MaterialCommunityIcons 
              name={status === 'matched' ? "account-check" : "incognito"} 
              size={60} 
              color={COLORS.primary} 
            />
          </View>
        </Animated.View>

        <Text style={styles.searchingText}>
          {status === 'matched' ? "Match Found!" : `Looking for someone to talk about ${topic}...`}
        </Text>
        <Text style={styles.subText}>
          You will remain anonymous until you choose to reveal yourself.
        </Text>

        {status === 'matched' && (
          <View style={styles.partnerMatchBox}>
            <Image
              source={{ uri: resolveAvatarUrl(matchData?.partner?.avatar || matchData?.partner?.avatar_url, matchData?.partner?.username || 'Ghost', true) }}
              style={styles.partnerAvatar}
            />
            <Text style={styles.partnerUsername}>
              {matchData?.partner?.username ? (matchData.partner.username.startsWith('@') ? matchData.partner.username : `@${matchData.partner.username}`) : 'Ghost User'}
            </Text>
          </View>
        )}

        {status === 'searching' && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.waitText}>Waiting for a stranger...</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
        <Text style={styles.cancelBtnText}>Cancel Search</Text>
      </TouchableOpacity>
      <PerformanceOverlay />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', marginLeft: 15, color: '#000' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  pulseCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(75,0,130,0.05)', justifyContent: 'center', alignItems: 'center' },
  innerCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
  searchingText: { fontSize: 22, fontWeight: '900', color: '#000', textAlign: 'center', marginTop: 40, fontFamily: 'Outfit_800ExtraBold' },
  subText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 15, lineHeight: 20 },
  loadingBox: { marginTop: 50, alignItems: 'center' },
  waitText: { fontSize: 14, color: '#666', fontWeight: '600', marginTop: 15 },
  partnerMatchBox: { marginTop: 25, alignItems: 'center' },
  partnerAvatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 8, borderWidth: 2, borderColor: '#9C27B0' },
  partnerUsername: { fontSize: 18, fontWeight: '800', color: '#000' },
  cancelBtn: { margin: 30, backgroundColor: '#F5F5F5', paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
  cancelBtnText: { color: '#FF3B30', fontSize: 16, fontWeight: '700' },
});
