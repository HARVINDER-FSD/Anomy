import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { BlurView } from 'expo-blur';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';
import { PerformanceOverlay } from '@/src/components/common/PerformanceOverlay';

export default function EditProfileScreen() {
  const { user, setAuth } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [name, setName] = useState(user?.full_name || user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar_url || user?.avatar || '');
  const [isPrivate, setIsPrivate] = useState(user?.is_private || false);

  useEffect(() => {
    const hasCache = !!user;
    performanceEngine.startScreenTrace('EditProfileScreen');
    performanceEngine.trackCacheAccess('Profile', hasCache);
    performanceEngine.endScreenTrace('EditProfileScreen', hasCache);
  }, [user]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please allow gallery access to change your photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatar(base64Image);
    }
  };

  const getLastUsernameChange = () => {
    const lastChanged = (user as any)?.last_username_change || (user as any)?.username_last_changed;
    if (!lastChanged) return 100; // far in the past
    const diffTime = new Date().getTime() - new Date(lastChanged).getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const diffDays = getLastUsernameChange();
  const isUsernameLocked = diffDays < 15 && !!((user as any)?.last_username_change || (user as any)?.username_last_changed);
  const remainingDays = 15 - diffDays;

  const handleUpdate = async () => {
    if (!name || !username) {
      Alert.alert("Error", "Name and Username are required.");
      return;
    }

    if (username.trim() !== (user?.username || '').trim() && isUsernameLocked) {
      Alert.alert(
        "Username Locked",
        `You changed your username recently. You can change it again in ${remainingDays} day${remainingDays > 1 ? 's' : ''}.`
      );
      return;
    }

    setLoading(true);
    try {
      // Use /users/profile for main profile updates including avatar
      const res = await apiClient.put('/users/profile', {
        name,
        username,
        bio,
        avatar,
        is_private: isPrivate
      });

      // Update local storage and store immediately
      const freshData = res.data.user || res.data;
      if (user) {
        await setAuth({
          ...user,
          ...freshData,
          id: freshData.id || freshData._id || user.id
        }, useAuthStore.getState().token || '');
      }

      setShowSuccess(true);
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleUpdate} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.secondary} />
          ) : (
            <Text style={styles.saveBtn}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: resolveAvatarUrl(avatar, user?.username) }}
              style={styles.avatarImage}
            />
          </View>
          <TouchableOpacity style={styles.changePhotoBtn} onPress={pickImage}>
            <Text style={styles.changePhotoText}>Change Profile Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.label, { marginBottom: 0 }]}>Username</Text>
            {isUsernameLocked ? (
              <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>
                Locked ({remainingDays} day{remainingDays > 1 ? 's' : ''} left)
              </Text>
            ) : (
              <Text style={{ fontSize: 11, color: COLORS.subtitle }}>
                Can change once in 15 days
              </Text>
            )}
          </View>
          <TextInput
            style={[styles.input, isUsernameLocked && { opacity: 0.6, backgroundColor: '#F9F9F9' }]}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="Choose a unique username"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            autoCorrect={false}
            editable={!isUsernameLocked}
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
            placeholder="Tell us something about yourself..."
          />

          <View style={styles.privacyOption}>
            <View>
              <Text style={styles.label}>Private Account</Text>
              <Text style={styles.privacySub}>Only followers can see your posts</Text>
            </View>
            <TouchableOpacity onPress={() => setIsPrivate(!isPrivate)}>
              <Ionicons
                name={isPrivate ? "toggle" : "toggle-outline"}
                size={40}
                color={isPrivate ? COLORS.secondary : COLORS.subtitle}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {showSuccess && (
        <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark">
          <View style={styles.successContainer}>
            <View style={styles.successCard}>
              <Text style={styles.successText}>Changes Applied</Text>
            </View>
          </View>
        </BlurView>
      )}
      <PerformanceOverlay />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingBottom: verticalScale(15), borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    backgroundColor: COLORS.white
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: 'bold', color: COLORS.text },
  saveBtn: { color: COLORS.secondary, fontWeight: 'bold', fontSize: moderateFont(16) },

  content: { padding: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 25 },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    marginBottom: 20,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  changePhotoBtn: {},
  changePhotoText: { color: COLORS.secondary, fontWeight: '700', fontSize: 14 },

  form: { width: '100%' },
  label: { fontSize: 14, color: COLORS.subtitle, marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 15,
    fontSize: 16, color: COLORS.text, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border
  },
  bioInput: { height: 100, textAlignVertical: 'top' },

  privacyOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border
  },
  privacySub: { fontSize: 12, color: COLORS.subtitle, marginTop: 2 },

  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  successCard: {
    backgroundColor: COLORS.white,
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  successText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 15,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 14,
    color: COLORS.subtitle,
    marginTop: 8,
    textAlign: 'center',
  },
});
