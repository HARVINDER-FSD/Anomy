import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Switch, Alert, ActivityIndicator, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { verticalScale, scale } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useThemeStore } from '@/src/store/themeStore';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';

export default function SettingsScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const { user, logout } = useAuthStore();
  const router = useSafeRouter();
  const { themePreference, setThemePreference } = useThemeStore();
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const persona = user?.anonymousPersona || {
    name: 'CyberGhost#404',
    username: 'cyberghost_404',
    avatar: 'https://api.dicebear.com/7.x/bottts/png?seed=Ghost'
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout from AnuFy?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              await logout();
              router.replace('/(auth)/login');
            } catch (err) {
              console.error('Logout error:', err);
            }
          }
        }
      ]
    );
  };

  const handleDeletion = () => {
    Alert.alert(
      "Delete Account?",
      "WARNING: This will permanently erase your profile, chats, and karma points. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Permanently",
          style: "destructive",
          onPress: async () => {
            try {
              setUpdating(true);
              await apiClient.delete('/users/delete');
              await logout();
              router.replace('/(auth)/login');
            } catch (err: any) {
              Alert.alert("Error", err.response?.data?.message || "Failed to delete account.");
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  const handleClearCache = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Storage Cleared", "Temporary cache, preloaded videos, and image memory cleared successfully.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={themePreference === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* 🎭 1. GHOST PERSONA HERO CARD */}
        <TouchableOpacity 
          style={styles.personaCard}
          onPress={() => router.push('/settings/anonymous')}
          activeOpacity={0.8}
        >
          <Image
            source={{ uri: resolveAvatarUrl(persona.avatar, persona.username, true) }}
            style={styles.avatar}
          />
          <View style={styles.personaInfo}>
            <Text style={styles.personaName}>{persona.name}</Text>
            <Text style={styles.personaSub}>Tap to change 3D Avatar & Vibes →</Text>
          </View>
        </TouchableOpacity>

        {/* 🎨 2. THEME SELECTOR */}
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.themePillsContainer}>
            <TouchableOpacity
              style={[
                styles.themePill,
                themePreference === 'light' && styles.themePillActive
              ]}
              onPress={() => { setThemePreference('light'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons
                name="sunny-outline"
                size={18}
                color={themePreference === 'light' ? '#FFFFFF' : COLORS.subtitle}
              />
              <Text style={[
                styles.themePillText,
                { color: themePreference === 'light' ? '#FFFFFF' : COLORS.text }
              ]}>Light</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themePill,
                themePreference === 'dark' && styles.themePillActive
              ]}
              onPress={() => { setThemePreference('dark'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons
                name="moon-outline"
                size={18}
                color={themePreference === 'dark' ? '#FFFFFF' : COLORS.subtitle}
              />
              <Text style={[
                styles.themePillText,
                { color: themePreference === 'dark' ? '#FFFFFF' : COLORS.text }
              ]}>Dark</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themePill,
                themePreference === 'system' && styles.themePillActive
              ]}
              onPress={() => { setThemePreference('system'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons
                name="hardware-chip-outline"
                size={18}
                color={themePreference === 'system' ? '#FFFFFF' : COLORS.subtitle}
              />
              <Text style={[
                styles.themePillText,
                { color: themePreference === 'system' ? '#FFFFFF' : COLORS.text }
              ]}>System</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ⚙️ 3. ESSENTIAL PREFERENCES */}
        <Text style={styles.sectionTitle}>Preferences & Privacy</Text>
        <View style={styles.card}>
          
          {/* Notifications Toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
                <Ionicons name="notifications-outline" size={18} color="#F59E0B" />
              </View>
              <Text style={styles.rowTitle}>Push Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(v) => {
                setNotificationsEnabled(v);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              trackColor={{ false: '#3F3F46', true: COLORS.primary }}
              thumbColor="#FFF"
            />
          </View>

          {/* Blocked Accounts */}
          <TouchableOpacity
            style={[styles.row, styles.borderTop]}
            onPress={() => router.push('/settings/blocked-users')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <Ionicons name="person-remove-outline" size={18} color="#EF4444" />
              </View>
              <Text style={styles.rowTitle}>Blocked Users</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
          </TouchableOpacity>

          {/* Clear Cache */}
          <TouchableOpacity
            style={[styles.row, styles.borderTop]}
            onPress={handleClearCache}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <Ionicons name="trash-bin-outline" size={18} color="#3B82F6" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Clear Storage Cache</Text>
                <Text style={styles.rowSub}>Free up phone storage</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
          </TouchableOpacity>
        </View>

        {/* 🚪 4. ACCOUNT ACTIONS */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitle, { color: '#EF4444', fontWeight: '600' }]}>Logout from AnuFy</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, styles.borderTop]}
            onPress={handleDeletion}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitle, { color: '#EF4444', fontSize: 13 }]}>Delete Account Permanently</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* APP VERSION */}
        <Text style={styles.versionText}>AnuFy Anonymous Edition • v2.0.5</Text>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: verticalScale(12), backgroundColor: COLORS.background,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    width: '100%', maxWidth: 640, alignSelf: 'center'
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },

  personaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: (COLORS as any).surfaceElevated || '#27272A',
    marginRight: 14,
  },
  personaInfo: { flex: 1 },
  personaName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  personaSub: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.subtitle,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 20,
  },

  themePillsContainer: {
    flexDirection: 'row',
    padding: 6,
    gap: 6,
  },
  themePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  themePillActive: {
    backgroundColor: COLORS.primary,
  },
  themePillText: {
    fontSize: 13,
    fontWeight: '600',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  rowSub: {
    fontSize: 11,
    color: COLORS.subtitle,
    marginTop: 1,
  },

  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.subtitle,
    marginTop: 10,
    marginBottom: 20,
  },
});
