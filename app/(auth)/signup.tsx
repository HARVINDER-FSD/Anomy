import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, SafeAreaView, Image, FlatList, Modal } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/src/theme/colors';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { scale, verticalScale, moderateFont } from '@/src/utils/responsive';
import { Ionicons } from '@expo/vector-icons';

import { COUNTRY_CODES } from '@/src/constants/countryCodes';


export default function SignupScreen() {
  const router = useSafeRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0].code);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);

  const generateSuggestions = (base: string) => {
    const clean = base.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return [
      `${clean}_${Math.floor(Math.random() * 90 + 10)}`,
      `${clean}_dev`,
      `${clean}_ghost`,
    ];
  };

  const checkUsernameAvailability = async (val: string) => {
    if (!val || val.length < 3) {
      setSuggestions([]);
      setIsUsernameAvailable(null);
      return;
    }
    const usernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!usernameRegex.test(val)) {
      setSuggestions([]);
      setIsUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    try {
      const res = await apiClient.get(`/users/username/${val}`);
      if (res.data) {
        setIsUsernameAvailable(false);
        setSuggestions(generateSuggestions(val));
      } else {
        setIsUsernameAvailable(true);
        setSuggestions([]);
      }
    } catch (err: any) {
      if (err.status === 404 || (err.response && err.response.status === 404)) {
        setIsUsernameAvailable(true);
      } else {
        setIsUsernameAvailable(null);
      }
      setSuggestions([]);
    } finally {
      setCheckingUsername(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (username) {
        checkUsernameAvailability(username);
      } else {
        setSuggestions([]);
        setIsUsernameAvailable(null);
      }
    }, 600);
    return () => clearTimeout(delayDebounce);
  }, [username]);

  const handleSignup = async () => {
    if (!name || !username || !email || !password || !day || !month || !year) {
      setErrorMsg('Please fill in all fields including your full Date of Birth');
      return;
    }

    if (!phone || phone.length < 10) {
      setErrorMsg('Please enter a valid phone number');
      return;
    }

    // Frontend Name validation (must only contain letters, spaces, dots, apostrophes)
    const nameRegex = /^[a-zA-Z\s'.]+$/;
    if (!nameRegex.test(name.trim())) {
      setErrorMsg('Full Name can only contain letters, spaces, dots, and apostrophes (no numbers or special characters).');
      return;
    }

    // Frontend Username validation (no spaces, only letters, numbers, dot, underscore)
    const usernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!usernameRegex.test(username.trim())) {
      setErrorMsg('Username can only contain letters, numbers, underscores (_), and periods (.) without spaces.');
      return;
    }

    if (username.includes(' ')) {
      setErrorMsg('Username cannot contain spaces.');
      return;
    }

    if (username.length < 3 || username.length > 30) {
      setErrorMsg('Username must be between 3 and 30 characters.');
      return;
    }

    // Format YYYY-MM-DD
    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    // Basic date validation
    const d = new Date(formattedDate);
    if (isNaN(d.getTime())) {
      setErrorMsg('Please enter a valid Date of Birth');
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
      const Device = await import('expo-device');

      const deviceInfo = {
        deviceId,
        deviceModel: Device.modelName || 'Unknown Model',
        deviceBrand: Device.brand || 'Unknown Brand',
        deviceType: Platform.OS,
        osVersion: Device.osVersion || 'Unknown OS Version',
        appVersion
      };

      const response = await apiClient.post('/auth/register', {
        full_name: name,
        username,
        email,
        password,
        phone: `${countryCode}${phone}`,
        dob: formattedDate,
        deviceInfo
      });

      const { user, token, refreshToken } = response.data;
      await setAuth(user, token, refreshToken);
      router.replace('/(tabs)');

    } catch (error: any) {
      let errorMessage = 'Registration failed! Please try again.';
      if (error.data?.details && Array.isArray(error.data.details)) {
        errorMessage = error.data.details.join('\n');
      } else if (error.data?.message) {
        errorMessage = error.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
                placeholder="Full Name"
                placeholderTextColor={COLORS.subtitle}
                value={name}
                onChangeText={setName}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
              />
            </View>

            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={COLORS.subtitle}
                autoCapitalize="none"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  if (text.trim().length < 3) {
                    setIsUsernameAvailable(null);
                    setSuggestions([]);
                  }
                }}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                autoCorrect={false}
              />
            </View>

            {username.trim().length >= 3 && !/^[a-zA-Z0-9_.]+$/.test(username.trim()) && (
              <Text style={{ fontSize: 12, color: COLORS.error, marginTop: -10, marginBottom: 12, marginLeft: 5, fontWeight: '600' }}>
                Username can only contain letters, numbers, underscores (_), and periods (.) without spaces.
              </Text>
            )}

            {checkingUsername && username.trim().length >= 3 && /^[a-zA-Z0-9_.]+$/.test(username.trim()) && (
              <Text style={{ fontSize: 12, color: COLORS.subtitle, marginTop: -10, marginBottom: 12, marginLeft: 5 }}>
                Checking username availability...
              </Text>
            )}

            {!checkingUsername && isUsernameAvailable === false && username.trim().length >= 3 && /^[a-zA-Z0-9_.]+$/.test(username.trim()) && (
              <View style={{ marginTop: -10, marginBottom: 16, marginLeft: 5 }}>
                <Text style={{ fontSize: 12, color: COLORS.error, marginBottom: 8 }}>
                  Username is already taken. Try these:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {suggestions.map(sug => (
                    <TouchableOpacity
                      key={sug}
                      onPress={() => setUsername(sug)}
                      style={{
                        backgroundColor: COLORS.white,
                        borderColor: COLORS.secondary,
                        borderWidth: 1,
                        borderRadius: 15,
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={{ color: COLORS.secondary, fontSize: 13, fontWeight: '600' }}>{sug}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!checkingUsername && isUsernameAvailable === true && username.trim().length >= 3 && /^[a-zA-Z0-9_.]+$/.test(username.trim()) && (
              <Text style={{ fontSize: 12, color: '#10B981', marginTop: -10, marginBottom: 12, marginLeft: 5, fontWeight: '600' }}>
                ✨ Username is available!
              </Text>
            )}

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

            <View style={styles.phoneContainer}>
              <TouchableOpacity 
                style={styles.countryCodeInput}
                onPress={() => setShowCountryPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 16, color: COLORS.text }}>
                  {selectedCountry.flag} {selectedCountry.code}
                </Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.subtitle} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
              
              <View style={[styles.inputBox, { flex: 1, marginBottom: 0 }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  placeholderTextColor={COLORS.subtitle}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Date of Birth</Text>
            <View style={styles.dobContainer}>
              <View style={[styles.inputBox, styles.dobBox]}>
                <TextInput
                  style={styles.input}
                  placeholder="DD"
                  placeholderTextColor={COLORS.subtitle}
                  value={day}
                  onChangeText={setDay}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              <View style={[styles.inputBox, styles.dobBox]}>
                <TextInput
                  style={styles.input}
                  placeholder="MM"
                  placeholderTextColor={COLORS.subtitle}
                  value={month}
                  onChangeText={setMonth}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              <View style={[styles.inputBox, styles.dobYearBox]}>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY"
                  placeholderTextColor={COLORS.subtitle}
                  value={year}
                  onChangeText={setYear}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.signupButton}
              onPress={handleSignup}
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
                  <Text style={styles.signupButtonText}>Create Account</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.loginLinkText}>Log In</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCountryPicker(false)}>
          <View style={styles.countryPickerContainer}>
            <View style={styles.countryPickerHeader}>
              <Text style={styles.countryPickerTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(_, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.countryItem}
                  onPress={() => {
                    setSelectedCountry(item);
                    setCountryCode(item.code);
                    setShowCountryPicker(false);
                  }}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryDialCode}>{item.code}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scrollContent: { padding: 24, justifyContent: 'center', minHeight: '100%' },
  headerContainer: { marginBottom: 30, alignItems: 'center', marginTop: 20 },
  logoTextTitle: { width: scale(300), height: verticalScale(120), marginBottom: -15 },
  subtitle: { fontSize: 15, color: COLORS.subtitle, marginTop: -10, textAlign: 'center', lineHeight: 22 },
  formContainer: { width: '100%' },
  errorText: { color: COLORS.error, marginBottom: 16, textAlign: 'center', fontWeight: '600' },
  inputBox: { backgroundColor: COLORS.white, borderRadius: 15, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, elevation: 1, shadowColor: '#000', shadowOpacity: 0.02 },
  input: { padding: 16, fontSize: 16, color: COLORS.text },
  signupButton: { borderRadius: 15, overflow: 'hidden', elevation: 6, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 8, marginTop: 10 },
  gradientBtn: { padding: 18, alignItems: 'center' },
  signupButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  loginContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30, marginBottom: 20 },
  loginText: { color: COLORS.subtitle, fontSize: 15 },
  loginLinkText: { color: COLORS.secondary, fontSize: 15, fontWeight: '800' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: COLORS.subtitle, marginBottom: 8, marginLeft: 5 },
  phoneContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  countryCodeInput: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    fontSize: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.02,
  },
  dobContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dobBox: { flex: 1 },
  dobYearBox: { flex: 1.5 },
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
