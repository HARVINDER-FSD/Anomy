import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView, Image } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Please fill in all fields');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, token } = response.data;

      await setAuth(user, token);
      router.replace('/(tabs)');

    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || 'Login failed! Please try again.';
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
          <View style={styles.headerContainer}>
            <Image
              source={require('@/assets/images/splashicon.png')}
              style={styles.logoTextTitle}
              resizeMode="contain"
            />
          </View>

          <View style={styles.formContainer}>
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={COLORS.subtitle}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={COLORS.subtitle}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            </Link>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientBtn}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.loginButtonText}>Log In</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don&apos;t have an account? </Text>
              <Link href="/(auth)/signup" asChild>
                <TouchableOpacity>
                  <Text style={styles.signupLinkText}>Sign up</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: moderateScale(24) },
  headerContainer: { marginBottom: verticalScale(40), alignItems: 'center' },
  logoTextTitle: { width: scale(320), height: verticalScale(130), marginBottom: -verticalScale(15) },
  subtitle: { fontSize: moderateFont(16), color: COLORS.subtitle, marginTop: -verticalScale(10), textAlign: 'center' },
  formContainer: { width: '100%' },
  errorText: { color: COLORS.error, marginBottom: verticalScale(16), textAlign: 'center', fontWeight: '600' },
  inputBox: { backgroundColor: COLORS.white, borderRadius: moderateScale(15), marginBottom: verticalScale(16), borderWidth: 1, borderColor: COLORS.border, elevation: 1, shadowColor: '#000', shadowOpacity: 0.02 },
  input: { padding: moderateScale(16), fontSize: moderateFont(16), color: COLORS.text },
  forgotPassword: { alignItems: 'flex-end', marginBottom: verticalScale(24) },
  forgotPasswordText: { color: COLORS.secondary, fontSize: moderateFont(14), fontWeight: '700' },
  loginButton: { borderRadius: moderateScale(15), overflow: 'hidden', elevation: 6, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 8 },
  gradientBtn: { padding: moderateScale(18), alignItems: 'center' },
  loginButtonText: { color: COLORS.white, fontSize: moderateFont(18), fontWeight: 'bold' },
  signupContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: verticalScale(30) },
  signupText: { color: COLORS.subtitle, fontSize: moderateFont(15) },
  signupLinkText: { color: COLORS.secondary, fontSize: moderateFont(15), fontWeight: '800' },
});
