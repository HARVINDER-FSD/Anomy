import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Image, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '@/src/store/authStore';
import { socketService } from '@/src/lib/socket';
import { COLORS } from '@/src/theme/colors';
import { moderateScale, moderateFont, verticalScale, scale } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';


export default function RandomChatScreen() {
  const router = useSafeRouter();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<'idle' | 'searching' | 'matched'>('idle');
  const [partner, setPartner] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Start rotate animation
    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();

    // Socket Listeners
    socketService.on('anonymous:matched', handleMatch);
    socketService.on('anonymous:waiting', () => setStatus('searching'));
    socketService.on('anonymous:partner_skipped', handlePartnerSkipped);

    // Initial Join
    joinQueue();

    return () => {
      socketService.off('anonymous:matched');
      socketService.off('anonymous:waiting');
      socketService.off('anonymous:partner_skipped');
      socketService.emit('anonymous:leave');
    };
  }, []);

  const joinQueue = () => {
    setStatus('searching');
    socketService.emit('anonymous:join');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleMatch = (data: { conversationId: string; partnerPersona: any }) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPartner(data.partnerPersona);
    setConversationId(data.conversationId);
    setStatus('matched');
    
    // Auto-navigate to chat after 300ms delay to show the match
    setTimeout(() => {
      const q = new URLSearchParams({
        isRandomChat: 'true',
        isAnonymousChat: 'true',
      });
      if (data.partnerPersona?.name) q.set('username', String(data.partnerPersona.name));
      if (data.partnerPersona?.avatar) q.set('profileImage', String(data.partnerPersona.avatar));
      router.replace(`/chat/${data.conversationId}?${q.toString()}` as any);
    }, 300);
  };

  const handlePartnerSkipped = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setStatus('searching');
    setPartner(null);
    setConversationId(null);
    // Auto-rejoin is handled by server on skip? No, let's rejoin manually if needed
    joinQueue();
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#000', '#1A1A1A']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={30} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Random Chat</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {status === 'searching' ? (
          <View style={styles.centerBox}>
            <Animated.View style={[styles.outerCircle, { transform: [{ scale: pulseAnim }] }]}>
              <Animated.View style={[styles.innerCircle, { transform: [{ rotate: spin }] }]}>
                <LinearGradient
                  colors={[COLORS.secondary, '#9C27B0']}
                  style={styles.gradientCircle}
                >
                  <MaterialCommunityIcons name="ghost" size={60} color="#FFF" />
                </LinearGradient>
              </Animated.View>
            </Animated.View>
            
            <Text style={styles.statusText}>Searching for a soul...</Text>
            <Text style={styles.subText}>Millions of ghosts are wandering. Finding one for you.</Text>
          </View>
        ) : status === 'matched' ? (
          <View style={styles.centerBox}>
            <View style={styles.matchBox}>
              <View style={styles.avatarPair}>
                <View style={styles.avatarContainer}>
                  <Image source={{ uri: user?.anonymousPersona?.avatar }} style={styles.avatar} />
                  <Text style={styles.avatarLabel}>You</Text>
                </View>
                <Ionicons name="flash" size={40} color={COLORS.secondary} style={styles.matchIcon} />
                <View style={styles.avatarContainer}>
                  <Image source={{ uri: partner?.avatar }} style={styles.avatar} />
                  <Text style={styles.avatarLabel}>Stranger</Text>
                </View>
              </View>
              
              <Text style={styles.matchTitle}>It's a Match!</Text>
              <Text style={styles.partnerName}>You are chatting with {partner?.name}</Text>
              
              <ActivityIndicator color={COLORS.secondary} style={{ marginTop: 20 }} />
              <Text style={styles.connectingText}>Entering the void...</Text>
            </View>
          </View>
        ) : (
          <ActivityIndicator color="#FFF" size="large" />
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHint}>
          Stay safe. Chats are wiped instantly on skip.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(10),
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: moderateFont(20),
    fontWeight: 'bold',
    color: '#FFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBox: {
    alignItems: 'center',
    paddingHorizontal: scale(40),
  },
  outerCircle: {
    width: moderateScale(180),
    height: moderateScale(180),
    borderRadius: moderateScale(90),
    borderWidth: 2,
    borderColor: 'rgba(156, 39, 176, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(40),
  },
  innerCircle: {
    width: moderateScale(140),
    height: moderateScale(140),
    borderRadius: moderateScale(70),
    overflow: 'hidden',
  },
  gradientCircle: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: moderateFont(24),
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: verticalScale(10),
  },
  subText: {
    fontSize: moderateFont(16),
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
  },
  matchBox: {
    alignItems: 'center',
    width: '100%',
  },
  avatarPair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(20),
    marginBottom: verticalScale(40),
  },
  avatarContainer: {
    alignItems: 'center',
    gap: verticalScale(10),
  },
  avatar: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    borderWidth: 3,
    borderColor: '#FFF',
  },
  avatarLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateFont(12),
    fontWeight: 'bold',
  },
  matchIcon: {
    marginTop: -20,
  },
  matchTitle: {
    fontSize: moderateFont(32),
    fontWeight: '900',
    color: '#FFF',
    marginBottom: verticalScale(10),
  },
  partnerName: {
    fontSize: moderateFont(18),
    color: COLORS.secondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  connectingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: moderateFont(14),
    marginTop: verticalScale(10),
  },
  footer: {
    paddingBottom: verticalScale(40),
    alignItems: 'center',
  },
  footerHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: moderateFont(12),
    fontStyle: 'italic',
  }
});
