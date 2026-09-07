import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';

export default function ChangeEmailScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();
  const { user, setAuth } = useAuthStore();

  const [step, setStep] = useState<1 | 2>(1); // 1: Enter New Email, 2: Enter OTP sent to Current Email
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSendOtpToCurrent = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      Alert.alert("Error", "Please enter a valid new email address.");
      return;
    }

    if (newEmail.trim().toLowerCase() === user?.email?.toLowerCase()) {
      Alert.alert("Error", "New email must be different from your current email.");
      return;
    }

    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Send OTP to the CURRENT email address for identity verification
      await apiClient.post('/auth/send-verification-otp', { targetEmail: user?.email });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Verification Code Sent", `A verification OTP has been sent to your current email: ${user?.email}`);
      setStep(2);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.data?.message || error.message || "Failed to send verification OTP to current email.");
    } finally {
      setUpdating(false);
    }
  };

  const handleVerifyOtpAndUpdate = async () => {
    if (!otp.trim()) {
      Alert.alert("Error", "Please enter the OTP.");
      return;
    }

    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Verify OTP sent to current email
      const verifyRes = await apiClient.post('/auth/verify-identity-otp', { otp });
      const token = verifyRes.data.verificationToken;

      // 2. Update contact details with new email
      await apiClient.post('/users/me/contact', {
        verificationToken: token,
        email: newEmail.trim()
      });

      if (user) {
        setAuth({ ...user, email: newEmail.trim() }, useAuthStore.getState().token || '');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.data?.message || error.message || "Verification failed. Please check your OTP.");
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
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: moderateScale(10),
      paddingHorizontal: scale(12),
      height: verticalScale(48),
      justifyContent: 'center',
    },
    input: {
      color: COLORS.text,
      fontSize: moderateFont(15),
      height: '100%',
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
          <Text style={styles.headerTitle}>Update Email Address</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={styles.description}>
                Enter the new email address you want to link to your account. We will send a verification code to your current registered email address to authorize this change.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>New Email Address</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="name@example.com"
                    placeholderTextColor={COLORS.subtitle + '80'}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={newEmail}
                    onChangeText={setNewEmail}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.button, updating && styles.buttonDisabled]}
                onPress={handleSendOtpToCurrent}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.description}>
                To authorize changing your email to <Text style={{ fontWeight: 'bold', color: COLORS.text }}>{newEmail}</Text>, please enter the OTP sent to your current email: <Text style={{ fontWeight: 'bold', color: COLORS.text }}>{user?.email}</Text>.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Enter OTP Code</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor={COLORS.subtitle + '80'}
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.button, updating && styles.buttonDisabled]}
                onPress={handleVerifyOtpAndUpdate}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>Verify & Save Email</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {success && (
        <View style={styles.toastOverlay}>
          <View style={styles.toastBox}>
            <Ionicons name="checkmark-circle-outline" size={32} color="#FFF" />
            <Text style={styles.toastText}>Email updated successfully</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
