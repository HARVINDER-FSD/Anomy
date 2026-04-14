import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, SafeAreaView, Image } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { apiClient } from '@/src/api/client';
import { useAuthStore } from '@/src/store/authStore';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/src/theme/colors';

export default function SignupScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSignup = async () => {
    if (!name || !username || !email || !password || !day || !month || !year) {
      setErrorMsg('Please fill in all fields including your full Date of Birth');
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
      const response = await apiClient.post('/auth/register', {
        full_name: name,
        username,
        email,
        password,
        dob: formattedDate,
      });

      const { user, token } = response.data;
      await setAuth(user, token);
      router.replace('/(tabs)');

    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || 'Registration failed! Please try again.';
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
              />
            </View>

            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={COLORS.subtitle}
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
            </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scrollContent: { padding: 24, justifyContent: 'center', minHeight: '100%' },
  headerContainer: { marginBottom: 30, alignItems: 'center', marginTop: 20 },
  logoTextTitle: { width: 300, height: 120, marginBottom: -15 },
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
  dobContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dobBox: { flex: 1, marginBottom: 0 },
  dobYearBox: { flex: 2, marginBottom: 0 },
});
