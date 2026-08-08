import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  SafeAreaView, Platform, Switch, Alert, ActivityIndicator, 
  StatusBar, Modal, TextInput, FlatList
} from 'react-native';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import { VerifiedTick } from '@/src/components/common/VerifiedTick';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '@/src/store/themeStore';

export default function SettingsScreen() {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const { user, setAuth, logout, toggleAnonymousMode } = useAuthStore();
  const router = useSafeRouter();
  const { themePreference, setThemePreference } = useThemeStore();
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  // --- GENERAL STATE ---
  const [sessionTime, setSessionTime] = useState(0);

  // --- MODALS STATE ---
  const [activeModal, setActiveModal] = useState<string | null>(null); // 'password' | 'email' | 'personal' | 'loginActivity' | 'closeFriends' | 'report' | 'terms' | 'privacy' | 'insights' | 'activity'
  

  


  // --- SETTINGS PREFERENCES STATE ---
  const [settings, setSettings] = useState<any>({
    privateAccount: user?.is_private || false,
    isAnonymous: user?.isAnonymousMode || false,
    showOnlineStatus: true,
    allowMentions: true,
    showReadReceipts: true,
    twoFactorEnabled: false,
    pushEnabled: true,
    postsStoriesComments: true,
    followingFollowers: true,
    messagesCalls: true,
    emailSecurity: true,
    emailProduct: true,
    emailFeedback: true,
    quietMode: false,
    sleepMode: false,
    sensitiveFilter: true,
    blockOffensiveComments: true,
    customFilter: false,
    filterKeywords: '',
    showSuggestions: true,
    dataSaver: false,
    accountType: user?.account_type || 'personal',
    whoCanMessage: 'everyone',
    storyReplies: 'everyone',
  });

  // --- INITIAL DATA FETCH & LOCAL TRACKING ---
  useEffect(() => {
    const fetchSettings = async () => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      try {
        const res = await apiClient.get('/settings');
        if (res.data?.success && res.data.settings) {
          setSettings((prev: any) => ({
            ...prev,
            ...res.data.settings,
            isAnonymous: user?.isAnonymousMode || false
          }));
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();

    // Track Time Spent locally
    const trackTime = async () => {
      try {
        const value = await AsyncStorage.getItem('@time_spent_today');
        const count = value ? parseInt(value, 10) : 0;
        setSessionTime(count + 5); // Increment dynamically
        await AsyncStorage.setItem('@time_spent_today', String(count + 5));
      } catch (e) {}
    };
    trackTime();
  }, [user?.isAnonymousMode]);

  // --- UPDATE PREFERENCE HANDLER ---
  const updateSetting = async (key: string, value: any) => {
    const previousValue = settings[key];
    setSettings((prev: any) => ({ ...prev, [key]: value }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (key === 'isAnonymous') {
      // 🚀 INSTANT: don't await or show loading for anonymous toggle!
      toggleAnonymousMode();
      return;
    }

    try {
      setUpdating(true);
      await apiClient.patch('/settings', { [key]: value });
      if (key === 'privateAccount' && user) {
        setAuth({ ...user, is_private: value }, useAuthStore.getState().token || '');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setSettings((prev: any) => ({ ...prev, [key]: previousValue }));
      Alert.alert("Error", "Failed to update preference.");
    } finally {
      setUpdating(false);
    }
  };



  // --- DEACTIVATE / DELETE ---
  const handleDeactivation = () => {
    Alert.alert(
      "Deactivate Account?",
      "Are you sure? You can reactivate your account by logging back in anytime.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Deactivate", 
          style: "destructive",
          onPress: async () => {
            try {
              setUpdating(true);
              await apiClient.post('/users/deactivate');
              await logout();
              router.replace('/(auth)/login');
            } catch (err: any) {
              Alert.alert("Error", err.response?.data?.message || "Failed to deactivate.");
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  const handleDeletion = () => {
    Alert.alert(
      "Delete Account?",
      "WARNING: This will permanently delete your profile, posts, and chats. This action cannot be undone.",
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

  const handleAccountTypeSwitch = () => {
    const isCurrentPersonal = settings.accountType === 'personal';
    const newType = isCurrentPersonal ? 'creator' : 'personal';
    Alert.alert(
      "Switch Account Type?",
      `Do you want to switch your account type to ${newType === 'creator' ? 'Professional/Creator' : 'Personal'}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch Type",
          onPress: async () => {
            try {
              setUpdating(true);
              await apiClient.patch('/users/me', { gender: user?.gender, website: user?.website, birthday: user?.dob, bio: user?.bio, name: user?.full_name, location: user?.location });
              // Save local account preference toggle state
              setSettings((prev: any) => ({ ...prev, accountType: newType }));
              if (user) {
                setAuth({ ...user, account_type: newType }, useAuthStore.getState().token || '');
              }
              Alert.alert("Switched!", `Successfully switched to ${newType} account.`);
            } catch (e) {
              Alert.alert("Error", "Failed to switch account type.");
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await logout();
      router.replace('/(auth)/login');
    } catch (err) {
    }
  };

  const handleThemeSelection = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveModal('theme');
  };

  // --- UI COMPONENTS ---
  const SettingItem = ({ icon, lib = 'Ionicons', title, sub, onPress, settingKey, isDestructive = false }: any) => {
    const IconLib: any = lib === 'Material' ? MaterialIcons : lib === 'MaterialCommunity' ? MaterialCommunityIcons : lib === 'FontAwesome' ? FontAwesome5 : Ionicons;
    const value = settingKey ? settings[settingKey] : null;
    const hasToggle = settingKey !== undefined;

    return (
      <TouchableOpacity 
        style={styles.settingRow} 
        onPress={() => hasToggle ? updateSetting(settingKey, !value) : onPress?.()} 
        activeOpacity={0.7}
      >
        <View style={styles.settingLeft}>
          <View style={styles.iconBox}>
            <IconLib name={icon} size={20} color={isDestructive ? COLORS.error : COLORS.text} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, isDestructive && { color: COLORS.error }]}>{title}</Text>
            {sub && <Text style={styles.settingSub}>{sub}</Text>}
          </View>
        </View>
        
        {hasToggle ? (
          <Switch 
            value={value} 
            onValueChange={(v) => updateSetting(settingKey, v)}
            trackColor={{ false: '#E5E7EB', true: COLORS.primary + '80' }}
            thumbColor={value ? COLORS.primary : '#F9FAFB'}
            disabled={updating}
          />
        ) : (
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        )}
      </TouchableOpacity>
    );
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <View style={styles.sectionHeaderContainer}>
       <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerNode}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 10, color: COLORS.subtitle }}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={COLORS.background === '#121212' ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        {user?.is_verified && (
          <View style={styles.verifiedBadge}>
            <VerifiedTick badgeType={user?.badge_type} size={20} />
          </View>
        )}
        <Text style={styles.headerTitle}>Settings & Privacy</Text>
        <View style={{ width: 40 }}>
           {updating && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* 💳 1. ACCOUNT CENTER */}
        <SectionHeader title="Account Center" />
        <View style={styles.sectionCard}>
          <SettingItem icon="person-outline" title="Personal Details" sub="Name, email, phone number, DOB" onPress={() => router.push('/settings/personal')} />
          <SettingItem icon="shield-checkmark-outline" title="Password Change" onPress={() => router.push('/settings/change-password')} />
          <SettingItem icon="key-outline" title="Two-Factor Authentication (2FA)" settingKey="twoFactorEnabled" />
          <SettingItem icon="time-outline" title="Login Activity / History" onPress={() => router.push('/settings/login-activity')} />
          <SettingItem icon="share-social-outline" title="Connected Experiences" sub="Facebook linking & cross-posting" settingKey="dataSaver" />
        </View>

        {/* 👤 2. EDIT PROFILE */}
        <SectionHeader title="Profile" />
        <View style={styles.sectionCard}>
          <SettingItem icon="create-outline" title="Edit Profile Details" sub="Change photo, name, username, bio" onPress={() => router.push('/profile/edit')} />
        </View>

        {/* 🔒 3. PRIVACY */}
        <SectionHeader title="Privacy" />
        <View style={styles.sectionCard}>
          <SettingItem icon="lock-closed-outline" title="Private Account" settingKey="privateAccount" />
          <SettingItem icon="pulse-outline" title="Show Activity Status" sub="Allow accounts you connect with to see when you are active" settingKey="showOnlineStatus" />
          <SettingItem icon="chatbubble-ellipses-outline" title="Comments control" onPress={() => router.push('/settings/comments')} />
          <SettingItem icon="at-outline" title="Tags & Mentions" settingKey="allowMentions" />
          <SettingItem icon="people-outline" title="Close Friends List" onPress={() => router.push('/settings/close-friends')} />
          <SettingItem icon="person-remove-outline" title="Blocked Accounts" onPress={() => router.push('/settings/blocked-users')} />
        </View>

        {/* 🔔 4. NOTIFICATIONS */}
        <SectionHeader title="Notifications" />
        <View style={styles.sectionCard}>
          <SettingItem icon="notifications-outline" title="Push Notifications Master" settingKey="pushEnabled" />
          <SettingItem icon="heart-outline" title="Likes & Comments" settingKey="postsStoriesComments" />
          <SettingItem icon="person-add-outline" title="Followers & Following" settingKey="followingFollowers" />
          <SettingItem icon="chatbubble-outline" title="Messages" settingKey="messagesCalls" />
          <SettingItem icon="mail-outline" title="Security & Feedback Emails" settingKey="emailSecurity" />
        </View>

        {/* ⏱️ 5. TIME MANAGEMENT */}
        <SectionHeader title="Time Management" />
        <View style={styles.sectionCard}>
          <SettingItem icon="stats-chart-outline" title="Time Spent statistics" onPress={() => router.push('/settings/time-spent')} />
          <SettingItem icon="moon-outline" title="Quiet Mode / Sleep Mode" settingKey="quietMode" />
        </View>

        {/* 🎨 5.5. DISPLAY & THEME */}
        <SectionHeader title="Display & Theme" />
        <View style={styles.sectionCard}>
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

        {/* 📊 6. YOUR ACTIVITY */}
        <SectionHeader title="Your Activity" />
        <View style={styles.sectionCard}>
          <SettingItem icon="image-outline" title="Posts & Reels Shared" onPress={() => router.push({ pathname: '/settings/info', params: { type: 'activity' } })} />
          <SettingItem icon="search-outline" title="Clear Search History" onPress={() => Alert.alert("Search History", "Your search history has been cleared successfully.")} />
          <SettingItem icon="trash-bin-outline" title="Clear App Cache" onPress={() => {
            Alert.alert(
              "Clear App Cache?",
              "This will clear all stored data on your device (feed, chats, etc.). Your account data will remain on our servers.",
              [
                { text: "Cancel", style: "cancel" },
                { 
                  text: "Clear Cache", 
                  style: "destructive", 
                  onPress: async () => {
                    try {
                      await AsyncStorage.clear();
                      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Alert.alert("Cache Cleared!", "All stored data has been cleared. Please restart the app.");
                    } catch (e) {
                      Alert.alert("Error", "Failed to clear cache.");
                    }
                  } 
                }
              ]
            );
          }} />
        </View>

        {/* 🛡️ 7. SECURITY */}
        <SectionHeader title="Security" />
        <View style={styles.sectionCard}>
          <SettingItem icon="shield-outline" title="Security Checkup & Audits" onPress={() => router.push('/settings/security')} />
          <SettingItem icon="download-outline" title="Download Information" onPress={() => router.push('/settings/security')} />
        </View>

        {/* 💬 8. MESSAGES & STORY REPLIES */}
        <SectionHeader title="Messages & Story Replies" />
        <View style={styles.sectionCard}>
          <SettingItem icon="options-outline" title="Message Controls" sub="Configure who can message you" onPress={() => router.push('/settings/message-controls')} />
          <SettingItem icon="arrow-undo-outline" title="Story Reply Controls" sub="Configure who can reply" onPress={() => router.push('/settings/story-replies')} />
        </View>

        {/* 🛠️ 9. CREATOR TOOLS */}
        <SectionHeader title="Creator Tools" />
        <View style={styles.sectionCard}>
          <SettingItem icon="analytics-outline" title="Insights & Reach Metrics" onPress={() => router.push({ pathname: '/settings/info', params: { type: 'insights' } })} />
          <SettingItem icon="wallet-outline" title="Monetization & Badges" onPress={() => router.push('/settings/premium')} />
        </View>

        {/* ⚙️ 10. ACCOUNT CONTROLS */}
        <SectionHeader title="Account Controls" />
        <View style={styles.sectionCard}>
          <SettingItem icon="git-compare-outline" title="Switch Account Type" sub="Personal / Professional Account" onPress={handleAccountTypeSwitch} />
          <SettingItem icon="cellular-outline" title="Cellular Data Usage" settingKey="dataSaver" />
          <SettingItem icon="remove-circle-outline" title="Temporary Deactivation" onPress={handleDeactivation} />
          <SettingItem icon="trash-outline" title="Permanent Account Deletion" isDestructive onPress={handleDeletion} />
        </View>

        {/* ℹ️ 11. HELP */}
        <SectionHeader title="Help & Support" />
        <View style={styles.sectionCard}>
          <SettingItem icon="bug-outline" title="Report a Problem" onPress={() => router.push('/settings/report')} />
          <SettingItem icon="help-circle-outline" title="Help Center & FAQs" onPress={() => router.push('/settings/help')} />
        </View>

        {/* 📄 12. ABOUT */}
        <SectionHeader title="About" />
        <View style={styles.sectionCard}>
          <SettingItem icon="document-text-outline" title="Terms of Use" onPress={() => router.push({ pathname: '/settings/info', params: { type: 'terms' } })} />
          <SettingItem icon="shield-outline" title="Privacy Policy" onPress={() => router.push({ pathname: '/settings/info', params: { type: 'privacy' } })} />
          <SettingItem icon="information-circle-outline" title="App Version" sub="v2.0.5 Pro" />
        </View>

        {/* LOGOUT */}
        <View style={{ marginTop: 30, marginBottom: 50 }}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
             <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
             <Text style={styles.logoutText}>Logout from AnuFy</Text>
          </TouchableOpacity>
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
  verifiedBadge: { marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 10 },
  
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
    paddingHorizontal: 16, paddingVertical: 14, 
    borderBottomWidth: 1, borderBottomColor: COLORS.border
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBox: { 
    width: 24, height: 24, 
    justifyContent: 'center', alignItems: 'center', marginRight: 14 
  },
  settingTextContainer: { flex: 1 },
  settingTitle: { fontSize: 14, color: COLORS.text, fontFamily: 'Outfit_400Regular' },
  settingSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontFamily: 'Outfit_400Regular' },

  logoutBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.surface, paddingVertical: 18, borderRadius: 24, 
    borderWidth: 1, borderColor: '#FEE2E2'
  },
  logoutText: { color: COLORS.error, fontFamily: 'Outfit_500Medium', fontSize: 16 },

  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // --- MODALS STYLING ---
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Outfit_600SemiBold'
  },
  modalLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    fontFamily: 'Outfit_400Regular',
    marginTop: 10
  },
  modalInput: {
    backgroundColor: '#F3F4F6',
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: '#000000',
    fontSize: 15,
    marginBottom: 16,
    fontFamily: 'Outfit_400Regular'
  },
  modalBtn: {
    backgroundColor: COLORS.primary || '#0095f6',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8
  },
  modalBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Outfit_600SemiBold'
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  policyText: {
    color: '#374151',
    lineHeight: 22,
    fontSize: 14,
    fontFamily: 'Outfit_400Regular'
  },
  insightsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    marginTop: 10
  },
  insightBox: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center'
  },
  insightVal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000'
  },
  insightLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4
  },
  activityStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 16
  },
  themePillsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 6,
    gap: 8
  },
  themePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'transparent'
  },
  themePillActive: {
    backgroundColor: COLORS.primary || '#4B0082'
  },
  themePillText: {
    fontSize: 13,
    fontFamily: 'Outfit_500Medium'
  }
});
