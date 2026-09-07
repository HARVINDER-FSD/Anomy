import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import * as Device from 'expo-device';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRY_CODES } from '@/src/constants/countryCodes';


export default function LoginScreen() {
  const router = useSafeRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setErrorMsg('Please fill in all fields');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      // Retrieve or create persistent device identifier
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      let deviceId = await AsyncStorage.getItem('anufy_device_id');
      if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await AsyncStorage.setItem('anufy_device_id', deviceId);
      }

      const Constants = (await import('expo-constants')).default;
      const appVersion = Constants.expoConfig?.version || '1.0.0';

      const deviceInfo = {
        deviceId,
        deviceModel: Device.modelName || Device.deviceName || (Platform.OS === 'android' ? 'Android Phone' : 'iPhone'),
        deviceBrand: Device.brand || Device.manufacturer || (Platform.OS === 'android' ? 'Android' : 'Apple'),
        deviceType: Platform.OS,
        osVersion: Device.osVersion || String(Platform.Version),
        appVersion,
        deviceName: Device.deviceName || Device.modelName || (Platform.OS === 'android' ? 'Android Device' : 'iPhone'),
        platform: Platform.OS,
        manufacturer: Device.manufacturer || Device.brand || 'Unknown'
      };

      const response = await apiClient.post('/auth/login', { 
        email: identifier.trim(), // Backend handles email, username, or phone via 'email' parameter
        password, 
        deviceInfo 
      });
      const { user, token, refreshToken } = response.data;

      await setAuth(user, token, refreshToken);
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
                placeholder="Username, Email or Phone"
                placeholderTextColor={COLORS.subtitle}
                keyboardType="default"
                autoCapitalize="none"
                value={identifier}
                onChangeText={setIdentifier}
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
  content: { flex: 1, justifyContent: 'center', padding: moderateScale(24), width: '100%', maxWidth: 540, alignSelf: 'center' },
  headerContainer: { marginBottom: verticalScale(30), alignItems: 'center' },
  logoTextTitle: { width: Math.min(scale(300), 280), height: Math.min(verticalScale(120), 120), maxWidth: '90%', marginBottom: -verticalScale(10) },
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
  loginMethodToggle: { flexDirection: 'row', marginBottom: verticalScale(16), backgroundColor: COLORS.white, borderRadius: moderateScale(15), padding: 4, borderWidth: 1, borderColor: COLORS.border },
  toggleButton: { flex: 1, paddingVertical: verticalScale(12), alignItems: 'center', borderRadius: moderateScale(12) },
  activeToggle: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: moderateFont(14), fontWeight: '600', color: COLORS.subtitle },
  activeToggleText: { color: COLORS.white },
  phoneContainer: { flexDirection: 'row', gap: scale(10), marginBottom: verticalScale(16) },
  countryCodeInput: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(15),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: moderateScale(16),
    fontSize: moderateFont(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.02,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  countryPickerContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '70%',
  },
  countryPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countryPickerTitle: {
    fontSize: moderateFont(16),
    fontWeight: 'bold',
    color: COLORS.text,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  countryFlag: {
    fontSize: 24,
    marginRight: 15,
  },
  countryName: {
    flex: 1,
    fontSize: moderateFont(15),
    color: COLORS.text,
  },
  countryDialCode: {
    fontSize: moderateFont(15),
    color: COLORS.subtitle,
    fontWeight: '600',
  },
});
