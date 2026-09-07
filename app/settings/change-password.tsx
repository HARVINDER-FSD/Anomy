import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/store/authStore';

export default function ChangePasswordScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();
  const { user } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [logoutOthers, setLogoutOthers] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New password and re-entered password do not match.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters long.");
      return;
    }

    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
        logoutOthers
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error.data?.message || error.message || "Failed to change password.";
      const errors = error.data?.errors;
      const displayMessage = errors && Array.isArray(errors) 
        ? `${message}\n\n${errors.map((err: string) => `• ${err}`).join('\n')}`
        : message;
      Alert.alert("Error", displayMessage);
    } finally {
      setUpdating(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
      borderBottomWidth: 0.5,
      borderBottomColor: COLORS.border,
      paddingTop: verticalScale(6),
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    headerTitle: {
      fontSize: moderateFont(18),
      fontWeight: 'bold',
      color: COLORS.text,
      marginLeft: scale(16),
    },
    scrollContent: {
      paddingHorizontal: scale(20),
      paddingTop: verticalScale(20),
      paddingBottom: verticalScale(40),
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    description: {
      fontSize: moderateFont(14),
      color: COLORS.subtitle,
      marginBottom: verticalScale(24),
      lineHeight: moderateFont(20),
    },
    inputGroup: {
      marginBottom: verticalScale(20),
    },
    label: {
      fontSize: moderateFont(14),
      fontWeight: '600',
      color: COLORS.text,
      marginBottom: verticalScale(8),
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: moderateScale(10),
      paddingHorizontal: scale(12),
      height: verticalScale(48),
    },
    input: {
      flex: 1,
      color: COLORS.text,
      fontSize: moderateFont(15),
      height: '100%',
    },
    eyeIcon: {
      padding: scale(4),
    },
    forgotLink: {
      fontSize: moderateFont(14),
      color: COLORS.primary,
      fontWeight: '600',
      marginTop: verticalScale(8),
      marginBottom: verticalScale(20),
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: verticalScale(8),
      paddingRight: scale(16),
    },
    checkbox: {
      width: scale(20),
      height: scale(20),
      borderWidth: 1.5,
      borderColor: COLORS.subtitle,
      borderRadius: moderateScale(4),
      marginRight: scale(12),
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: verticalScale(2),
    },
    checkboxChecked: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    checkboxLabel: {
      flex: 1,
      fontSize: moderateFont(14),
      color: COLORS.text,
      lineHeight: moderateFont(19),
    },
    button: {
      backgroundColor: COLORS.primary,
      borderRadius: moderateScale(10),
      height: verticalScale(48),
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: verticalScale(32),
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 3,
    },
    buttonDisabled: {
      backgroundColor: COLORS.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    buttonText: {
      color: '#FFF',
      fontSize: moderateFont(16),
      fontWeight: 'bold',
    },
    toastOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 999,
    },
    toastBox: {
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      paddingHorizontal: scale(15),
      paddingVertical: verticalScale(15),
      borderRadius: moderateScale(12),
      alignItems: 'center',
      justifyContent: 'center',
      width: scale(140),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    },
    toastText: {
      color: '#FFF',
      fontSize: moderateFont(11),
      fontWeight: '600',
      textAlign: 'center',
      marginTop: verticalScale(8),
      lineHeight: moderateFont(15),
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={26} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Change Password</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>
            Your password must be at least 6 characters and should include a combination of numbers, letters and special characters (!$@%).
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter current password"
                placeholderTextColor={COLORS.subtitle + '80'}
                secureTextEntry={!showCurrent}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowCurrent(!showCurrent)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showCurrent ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.subtitle}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor={COLORS.subtitle + '80'}
                secureTextEntry={!showNew}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowNew(!showNew)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showNew ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.subtitle}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Re-enter Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Re-enter new password"
                placeholderTextColor={COLORS.subtitle + '80'}
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(!showConfirm)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.subtitle}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={styles.forgotLink}>Forgotten your password?</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.checkboxRow} 
            onPress={() => setLogoutOthers(!logoutOthers)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, logoutOthers && styles.checkboxChecked]}>
              {logoutOthers && <Ionicons name="checkmark" size={14} color="#FFF" />}
            </View>
            <Text style={styles.checkboxLabel}>
              Log out of other devices. Choose this if someone else used your account.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, updating && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Save Password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {success && (
        <View style={styles.toastOverlay}>
          <View style={styles.toastBox}>
            <Ionicons name="checkmark-circle-outline" size={32} color="#FFF" />
            <Text style={styles.toastText}>Password changed successfully</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
