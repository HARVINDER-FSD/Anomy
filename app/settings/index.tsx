import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform, Switch, Alert, ActivityIndicator } from 'react-native';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';

export default function SettingsScreen() {
  const { user, setAuth, logout, toggleAnonymousMode: toggleAnonymous } = useAuthStore();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(user?.isAnonymousMode || false);
  const [isPrivate, setIsPrivate] = useState(user?.is_private || false);

  const handleToggleAnonymous = async () => {
    try {
      setLoading(true);
      await toggleAnonymous();
      const currentMode = useAuthStore.getState().user?.isAnonymousMode;
      setIsAnonymous(!!currentMode);
      
      Alert.alert(
        currentMode ? "Anonymous Mode ON 🎭" : "Anonymous Mode OFF ✨",
        currentMode ? "Your identity is now hidden." : "Your real profile is now visible."
      );
    } catch (error) {
      console.error("Error toggling anonymous:", error);
      Alert.alert("Error", "Could not toggle anonymous mode.");
    } finally {
      setLoading(false);
    }
  };

  const togglePrivacy = async () => {
    try {
      setLoading(true);
      const newPrivacy = !isPrivate;
      // Using the dedicated privacy endpoint for better consistency
      const res = await apiClient.put('/users/privacy', { isPrivate: newPrivacy });
      
      const serverPrivacy = res.data.isPrivate !== undefined ? res.data.isPrivate : newPrivacy;
      setIsPrivate(serverPrivacy);
      
      if (user) {
        setAuth({ ...user, is_private: serverPrivacy }, useAuthStore.getState().token || '');
      }
      
      Alert.alert(
        "Privacy Updated", 
        `Your account is now ${serverPrivacy ? 'Private 🔒' : 'Public 🌍'}.`
      );
    } catch (error) {
      console.error("Error toggling privacy:", error);
      Alert.alert("Error", "Could not update privacy settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        } 
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account Management</Text>
          
          <TouchableOpacity style={styles.optionItem} onPress={() => router.push('/profile/edit')}>
            <View style={styles.optionLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#F0F9FF' }]}>
                <Ionicons name="person-outline" size={22} color="#3498db" />
              </View>
              <Text style={styles.optionTitle}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionItem} onPress={() => router.push('/settings/blocked-users')}>
            <View style={styles.optionLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="ban-outline" size={22} color="#EF4444" />
              </View>
              <Text style={styles.optionTitle}>Blocked Users</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>

          <View style={styles.optionItem}>
            <View style={styles.optionLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#FFF9E6' }]}>
                <Ionicons name="eye-off-outline" size={22} color={COLORS.secondary} />
              </View>
              <View>
                <Text style={styles.optionTitle}>Anonymous Mode</Text>
                <Text style={styles.optionSub}>Post without revealing identity</Text>
              </View>
            </View>
            <Switch 
              value={isAnonymous} 
              onValueChange={handleToggleAnonymous}
              trackColor={{ false: '#eee', true: COLORS.primary }}
              thumbColor={isAnonymous ? COLORS.secondary : '#f4f3f4'}
            />
          </View>

          <View style={styles.optionItem}>
            <View style={styles.optionLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#E6FFFA' }]}>
                <Ionicons name="lock-closed-outline" size={22} color="#2ecc71" />
              </View>
              <View>
                <Text style={styles.optionTitle}>Private Account</Text>
                <Text style={styles.optionSub}>Only followers can see your posts</Text>
              </View>
            </View>
            <Switch 
              value={isPrivate} 
              onValueChange={togglePrivacy}
              trackColor={{ false: '#eee', true: COLORS.primary }}
              thumbColor={isPrivate ? COLORS.secondary : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Preferences</Text>
          
          <TouchableOpacity style={styles.optionItem}>
            <View style={styles.optionLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#F3E8FF' }]}>
                <Ionicons name="notifications-outline" size={22} color="#9061F9" />
              </View>
              <Text style={styles.optionTitle}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionItem}>
            <View style={styles.optionLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color="#0EA5E9" />
              </View>
              <Text style={styles.optionTitle}>Security & Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color={COLORS.secondary} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingVertical: verticalScale(15), backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    borderBottomWidth: 1, borderBottomColor: COLORS.border
  },
  headerTitle: { fontSize: moderateFont(19), fontWeight: 'bold', color: COLORS.text },
  backBtn: { padding: 4 },
  
  section: { marginTop: verticalScale(25), paddingHorizontal: scale(20) },
  sectionLabel: { fontSize: moderateFont(14), color: COLORS.subtitle, fontWeight: '700', textTransform: 'uppercase', marginBottom: verticalScale(12), letterSpacing: 1 },

  optionItem: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, padding: moderateScale(15), borderRadius: moderateScale(18), marginBottom: verticalScale(10),
    borderWidth: 1, borderColor: COLORS.border
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: scale(15) },
  iconContainer: { width: scale(40), height: scale(40), borderRadius: scale(20), justifyContent: 'center', alignItems: 'center' },
  optionTitle: { fontSize: moderateFont(16), fontWeight: '700', color: COLORS.text },
  optionSub: { fontSize: moderateFont(12), color: COLORS.subtitle, marginTop: verticalScale(2) },

  logoutBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(10),
    backgroundColor: '#FFEBEB', paddingVertical: verticalScale(15), borderRadius: moderateScale(18),
    borderWidth: 1, borderColor: '#FFD1D1', marginTop: verticalScale(10)
  },
  logoutText: { color: COLORS.error, fontWeight: '800', fontSize: moderateFont(16) },

  loaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }
});
