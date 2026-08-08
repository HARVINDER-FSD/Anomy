import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  SafeAreaView, Platform, Switch, Alert, ActivityIndicator, 
  StatusBar 
} from 'react-native';
import { Image } from 'expo-image';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';

export default function AnonymousSettingsScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const { user } = useAuthStore();
  const router = useSafeRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [settings, setSettings] = useState({
    nsfwEnabled: false,
  });

  const persona = user?.anonymousPersona || { name: 'Anonymous Ghost', username: 'ghost', avatar: '' };

  useEffect(() => {
    const fetchSettings = async () => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      try {
        const res = await apiClient.get('/settings');
        if (res.data?.success && res.data.settings) {
          setSettings({
            nsfwEnabled: res.data.settings.nsfwEnabled || false,
          });
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const updateSetting = async (key: string, value: any) => {
    const previousValue = settings[key as keyof typeof settings];
    setSettings((prev) => ({ ...prev, [key]: value }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      setUpdating(true);
      await apiClient.patch('/settings', { [key]: value });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setSettings((prev) => ({ ...prev, [key]: previousValue }));
      Alert.alert("Error", "Failed to update setting. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerNode}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 10, color: COLORS.subtitle }}>Loading ghost settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ghost Settings</Text>
        <View style={{ width: 40 }}>
          {updating && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* 👻 GHOST PERSONA VIEW CARD */}
        <View style={styles.personaCard}>
          <Image
            source={{ uri: resolveAvatarUrl(persona.avatar, persona.username, true) }}
            style={styles.avatar}
          />
          <Text style={styles.personaName}>{persona.name}</Text>
        </View>

        {/* 🔞 CONTENT CONTROL */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.sectionHeaderText}>Content Control</Text>
        </View>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="eye-outline" size={18} color={COLORS.error} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Enable 18+ NSFW Content</Text>
                <Text style={styles.settingSub}>Show adult-themed posts and explore adult realms</Text>
              </View>
            </View>
            <Switch 
              value={settings.nsfwEnabled} 
              onValueChange={(v) => updateSetting('nsfwEnabled', v)}
              trackColor={{ false: '#E5E7EB', true: COLORS.primary + '80' }}
              thumbColor={settings.nsfwEnabled ? COLORS.primary : '#F9FAFB'}
              disabled={updating}
            />
          </View>
        </View>

        {/* INFO CARD */}
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} style={{ marginBottom: 8 }} />
          <Text style={styles.infoTitle}>Safety First</Text>
          <Text style={styles.infoText}>
            Ghost mode protects your identity. Even with NSFW content enabled, posting illegal content or violating our community guidelines will lead to permanent account suspension.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 20, paddingVertical: verticalScale(14), backgroundColor: COLORS.background,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(55)
  },
  headerTitle: { fontSize: 18, fontFamily: 'Outfit_500Medium', color: COLORS.text },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40 },
  
  personaCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.background,
    marginBottom: 14,
  },
  personaName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    fontFamily: 'Outfit_700Bold',
  },
  personaUsername: {
    fontSize: 13,
    color: COLORS.subtitle,
    marginTop: 2,
    fontFamily: 'Outfit_400Regular',
  },

  sectionHeaderContainer: { 
    paddingHorizontal: 8, marginTop: 24, marginBottom: 12
  },
  sectionHeaderText: { 
    fontSize: 12, color: '#6B7280', fontFamily: 'Outfit_500Medium', 
    textTransform: 'uppercase', letterSpacing: 1.2 
  },
  sectionCard: { 
    backgroundColor: COLORS.surface, borderRadius: 24, overflow: 'hidden', 
    borderWidth: 1, borderColor: COLORS.border
  },

  settingRow: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 16, paddingVertical: 18, 
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBox: { 
    width: 36, height: 36, borderRadius: 12, 
    justifyContent: 'center', alignItems: 'center', marginRight: 14 
  },
  settingTextContainer: { flex: 1, marginRight: 8 },
  settingTitle: { fontSize: 14, color: COLORS.text, fontFamily: 'Outfit_400Regular' },
  settingSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontFamily: 'Outfit_400Regular' },

  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    marginTop: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.subtitle,
    textAlign: 'center',
    lineHeight: 18,
  },

  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
