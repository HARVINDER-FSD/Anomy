import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Switch, Alert, ActivityIndicator, StatusBar, FlatList 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { verticalScale, scale, moderateScale } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { LinearGradient } from 'expo-linear-gradient';

const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/png?seed=Ghost',
  'https://api.dicebear.com/7.x/bottts/png?seed=Ninja',
  'https://api.dicebear.com/7.x/bottts/png?seed=Hacker',
  'https://api.dicebear.com/7.x/bottts/png?seed=Shadow',
  'https://api.dicebear.com/7.x/bottts/png?seed=Gamer',
  'https://api.dicebear.com/7.x/bottts/png?seed=Matrix',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Luna',
  'https://api.dicebear.com/7.x/lorelei/png?seed=Alex',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Phantom',
  'https://api.dicebear.com/7.x/micah/png?seed=Vibe',
];

const POPULAR_INTERESTS = [
  { id: 'latenight', label: '🌙 Late Night Thoughts' },
  { id: 'campus', label: '🎓 Campus Secrets' },
  { id: 'anime', label: '🎮 Anime & Gaming' },
  { id: 'love', label: '💔 Heartbreak & Advice' },
  { id: 'hottakes', label: '💡 Hot Takes' },
  { id: 'coding', label: '💻 Tech & Startups' },
];

export default function AnonymousSettingsScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const { user, setAuth } = useAuthStore();
  const router = useSafeRouter();
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [settings, setSettings] = useState({
    nsfwEnabled: false,
    disappearingChats: true,
    antiScreenshot: true,
  });

  const [selectedInterests, setSelectedInterests] = useState<string[]>(['latenight', 'campus', 'anime']);

  const persona = user?.anonymousPersona || {
    name: 'CyberGhost#404',
    username: 'cyberghost_404',
    avatar: 'https://api.dicebear.com/7.x/bottts/png?seed=Ghost'
  };

  const handleSelectAvatar = async (avatarUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setUpdating(true);
      const res = await apiClient.post('/users/anonymous/persona', {
        name: persona.name,
        avatar: avatarUrl
      });
      const updatedUser = {
        ...user!,
        anonymousPersona: {
          ...persona,
          avatar: avatarUrl
        }
      };
      await setAuth(updatedUser, useAuthStore.getState().token || '');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      // Offline fallback
      const updatedUser = {
        ...user!,
        anonymousPersona: {
          ...persona,
          avatar: avatarUrl
        }
      };
      await setAuth(updatedUser, useAuthStore.getState().token || '');
    } finally {
      setUpdating(false);
    }
  };

  const toggleInterest = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedInterests.includes(id)) {
      if (selectedInterests.length > 1) {
        setSelectedInterests(selectedInterests.filter(item => item !== id));
      }
    } else {
      setSelectedInterests([...selectedInterests, id]);
    }
  };

  const copyStoryLink = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const link = `https://anufy.me/u/${persona.username || 'ghost'}`;
    await Clipboard.setStringAsync(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#09090B" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ghost Persona & Settings</Text>
        <View style={{ width: 40 }}>
          {updating && <ActivityIndicator size="small" color="#A855F7" />}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* 🎭 GHOST PERSONA HERO CARD */}
        <LinearGradient
          colors={['#1E1B4B', '#0F172A', '#09090B']}
          style={styles.personaCard}
        >
          <View style={styles.avatarGlow}>
            <Image
              source={{ uri: resolveAvatarUrl(persona.avatar, persona.username, true) }}
              style={styles.avatar}
            />
          </View>
          <Text style={styles.personaName}>{persona.name}</Text>
          <Text style={styles.personaUsername}>@{persona.username || 'ghost'}</Text>
          
          <View style={styles.badgesRow}>
            <View style={styles.badgePill}>
              <Ionicons name="flash" size={14} color="#FBBF24" />
              <Text style={styles.badgeText}>240 Sparks</Text>
            </View>
            <View style={styles.badgePill}>
              <Ionicons name="shield-checkmark" size={14} color="#34D399" />
              <Text style={styles.badgeText}>100% Encrypted</Text>
            </View>
          </View>
        </LinearGradient>

        {/* 📲 VIRAL INSTAGRAM STORY SECRET LINK */}
        <LinearGradient
          colors={['#833AB4', '#FD1D1D', '#FCB045']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.storyCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.storyTitle}>Ask Me Anonymously Sticker</Text>
            <Text style={styles.storySub}>Share secret link on your Instagram Story to get confessions</Text>
          </View>
          <TouchableOpacity onPress={copyStoryLink} style={styles.copyBtn} activeOpacity={0.8}>
            <Ionicons name={copiedLink ? "checkmark-circle" : "copy-outline"} size={16} color="#000" />
            <Text style={styles.copyBtnText}>{copiedLink ? 'Copied!' : 'Copy Link'}</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* 🎨 3D AVATAR SELECTOR */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.sectionHeaderText}>Choose Ghost Avatar</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarList}>
          {PRESET_AVATARS.map((uri, idx) => {
            const isSelected = persona.avatar === uri;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => handleSelectAvatar(uri)}
                style={[styles.avatarChoice, isSelected && styles.avatarChoiceSelected]}
              >
                <Image source={{ uri }} style={styles.avatarChoiceImg} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 🎯 INTEREST PREFERENCES */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.sectionHeaderText}>My Vibes & Interests</Text>
        </View>
        <View style={styles.interestsWrap}>
          {POPULAR_INTERESTS.map((item) => {
            const isActive = selectedInterests.includes(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => toggleInterest(item.id)}
                style={[styles.interestChip, isActive && styles.interestChipActive]}
              >
                <Text style={[styles.interestChipText, isActive && styles.interestChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 🔒 PRIVACY CONTROLS */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.sectionHeaderText}>Ghost Privacy & Security</Text>
        </View>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
                <Ionicons name="timer-outline" size={18} color="#A855F7" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Disappearing Ghost Chats</Text>
                <Text style={styles.settingSub}>Auto-delete 1-on-1 chats after 24 hours</Text>
              </View>
            </View>
            <Switch 
              value={settings.disappearingChats} 
              onValueChange={(v) => setSettings(p => ({ ...p, disappearingChats: v }))}
              trackColor={{ false: '#27272A', true: '#9333EA' }}
              thumbColor="#FFF"
            />
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)' }]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(52,211,153,0.15)' }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#34D399" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Anti-Screenshot Shield</Text>
                <Text style={styles.settingSub}>Notify when someone captures chat screen</Text>
              </View>
            </View>
            <Switch 
              value={settings.antiScreenshot} 
              onValueChange={(v) => setSettings(p => ({ ...p, antiScreenshot: v }))}
              trackColor={{ false: '#27272A', true: '#10B981' }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 20, paddingVertical: verticalScale(12), backgroundColor: '#09090B',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    width: '100%', maxWidth: 640, alignSelf: 'center'
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' },
  
  personaCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
  },
  avatarGlow: {
    padding: 4,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#A855F7',
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#18181B',
  },
  personaName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.2,
  },
  personaUsername: {
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '600',
  },

  storyCard: {
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  storyTitle: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15,
  },
  storySub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  copyBtn: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 12,
  },

  sectionHeaderContainer: { 
    paddingHorizontal: 4, marginTop: 24, marginBottom: 12
  },
  sectionHeaderText: { 
    fontSize: 12, color: '#A1A1AA', fontWeight: '700', 
    textTransform: 'uppercase', letterSpacing: 1.2 
  },
  
  avatarList: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  avatarChoice: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#18181B',
    marginRight: 10,
    padding: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChoiceSelected: {
    borderColor: '#A855F7',
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  avatarChoiceImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  interestsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestChip: {
    backgroundColor: '#18181B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  interestChipActive: {
    backgroundColor: 'rgba(168,85,247,0.2)',
    borderColor: '#A855F7',
  },
  interestChipText: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '500',
  },
  interestChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },

  sectionCard: { 
    backgroundColor: '#18181B', borderRadius: 20, overflow: 'hidden', 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'
  },
  settingRow: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 16, paddingVertical: 14, 
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBox: { 
    width: 36, height: 36, borderRadius: 12, 
    justifyContent: 'center', alignItems: 'center', marginRight: 14 
  },
  settingTextContainer: { flex: 1, marginRight: 8 },
  settingTitle: { fontSize: 14, color: '#FFF', fontWeight: '600' },
  settingSub: { fontSize: 11, color: '#71717A', marginTop: 2 },
});
