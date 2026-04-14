import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { apiClient } from '@/src/api/client';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/src/store/authStore';
import { COLORS } from '@/src/theme/colors';

type ResetStep = 'EMAIL' | 'OTP' | 'PASSWORD';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  
  const [step, setStep] = useState<ResetStep>('EMAIL');
  
  // Data States
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. STEP ONE: Send OTP
  const handleRequestOTP = async () => {
    if (!email) {
      setErrorMsg('Please enter your email'); return;
    }
    setLoading(true); setErrorMsg(''); setSuccessMsg('');

    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSuccessMsg('OTP sent to your email!');
      
      setTimeout(() => {
        setStep('OTP');
        setSuccessMsg('');
      }, 1500);
      
    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || 'Failed to send OTP. Try again.';
      setErrorMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 2. STEP TWO: Verify OTP
  const handleVerifyOTP = async () => {
    if (!otp || otp.length < 6) {
      setErrorMsg('Please enter a valid 6-digit OTP'); return;
    }
    setLoading(true); setErrorMsg(''); setSuccessMsg('');

    try {
      await apiClient.post('/auth/verify-otp', { email, otp });
      setSuccessMsg('Awesome! OTP Verified.');
      
      setTimeout(() => {
        setStep('PASSWORD');
        setSuccessMsg('');
      }, 1000);

    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || 'Invalid or expired OTP.';
      setErrorMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 3. STEP THREE: Sets New Password
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Password should be at least 6 characters'); return;
    }
    setLoading(true); setErrorMsg(''); setSuccessMsg('');

    try {
      const response = await apiClient.post('/auth/reset-password-otp', { 
        email, 
        otp, 
        newPassword 
      });

      const { user, token } = response.data;
      await setAuth(user, token);
      
      Alert.alert('Success', 'Your password was reset successfully!', [
        { text: 'Let’s Go', onPress: () => router.replace('/(tabs)') }
      ]);
      
    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || 'Failed to update password.';
      setErrorMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
           <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
           </TouchableOpacity>

          <View style={styles.headerContainer}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
               {step === 'EMAIL' ? 'Enter email to receive an OTP code' : 
                step === 'OTP' ? 'Enter the 6-digit OTP sent to your email' :
                'Create a strong new password' }
            </Text>
          </View>

          <View style={styles.formContainer}>
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            {successMsg ? <Text style={styles.successText}>{successMsg}</Text> : null}

            {/* DYNAMIC FORM BASED ON STEP */}
            {step === 'EMAIL' && (
              <>
                <View style={styles.inputBox}>
                  <TextInput style={styles.input} placeholder="Email address" placeholderTextColor={COLORS.subtitle}
                    keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
                </View>
                <TouchableOpacity style={styles.resetButton} onPress={handleRequestOTP} disabled={loading}>
                  <LinearGradient colors={[COLORS.primary, COLORS.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientBtn}>
                    {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.resetButtonText}>Send OTP</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {step === 'OTP' && (
              <>
                <View style={styles.inputBox}>
                  <TextInput style={styles.input} placeholder="6-digit OTP" placeholderTextColor={COLORS.subtitle}
                    keyboardType="numeric" maxLength={6} value={otp} onChangeText={setOtp} />
                </View>
                <TouchableOpacity style={styles.resetButton} onPress={handleVerifyOTP} disabled={loading}>
                   <LinearGradient colors={[COLORS.primary, COLORS.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientBtn}>
                    {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.resetButtonText}>Verify OTP</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {step === 'PASSWORD' && (
              <>
                <View style={styles.inputBox}>
                  <TextInput style={styles.input} placeholder="New Password" placeholderTextColor={COLORS.subtitle}
                    secureTextEntry value={newPassword} onChangeText={setNewPassword} />
                </View>
                <TouchableOpacity style={styles.resetButton} onPress={handleResetPassword} disabled={loading}>
                   <LinearGradient colors={[COLORS.primary, COLORS.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientBtn}>
                    {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.resetButtonText}>Confirm & Login</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.backContainer}>
              <Text style={styles.backText}>Remembered your password? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.backLinkText}>Log in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import { Ionicons } from '@expo/vector-icons';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  backBtn: { position: 'absolute', top: 40, left: 24, padding: 8 },
  headerContainer: { marginBottom: 40, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: 15, color: COLORS.subtitle, fontWeight: '400', textAlign: 'center', lineHeight: 22 },
  formContainer: { width: '100%' },
  errorText: { color: COLORS.error, marginBottom: 16, textAlign: 'center', fontWeight: '600' },
  successText: { color: COLORS.success, marginBottom: 16, textAlign: 'center', fontWeight: '600' },
  inputBox: { backgroundColor: COLORS.white, borderRadius: 15, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, elevation: 1 },
  input: { padding: 16, fontSize: 16, color: COLORS.text },
  resetButton: { borderRadius: 15, overflow: 'hidden', elevation: 4, shadowColor: COLORS.secondary, shadowOpacity: 0.2 },
  gradientBtn: { padding: 18, alignItems: 'center' },
  resetButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  backContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
  backText: { color: COLORS.subtitle, fontSize: 14 },
  backLinkText: { color: COLORS.secondary, fontSize: 14, fontWeight: '800' },
});
