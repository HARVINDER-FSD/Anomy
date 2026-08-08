import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';

export default function PersonalDetailsScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();
  const { user, setAuth } = useAuthStore();

  const [name, setName] = useState(user?.full_name || user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [birthday, setBirthday] = useState(user?.dob || user?.birthday || '');
  const [updating, setUpdating] = useState(false);

  const handleUpdate = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Full Name is required.");
      return;
    }

    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await apiClient.patch('/users/me', {
        name,
        phone,
        birthday
      });

      if (user) {
        setAuth({
          ...user,
          full_name: name,
          name: name,
          phone,
          dob: birthday,
          birthday: birthday
        }, useAuthStore.getState().token || '');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success 🎉", "Personal details updated successfully.", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.response?.data?.message || "Failed to update profile info.");
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
      paddingTop: Platform.OS === 'ios' ? verticalScale(45) : verticalScale(40),
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
    emailContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: moderateScale(10),
      paddingHorizontal: scale(12),
      height: verticalScale(48),
    },
    emailText: {
      color: COLORS.text,
      fontSize: moderateFont(15),
    },
    changeBtn: {
      backgroundColor: COLORS.primary + '15',
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(6),
      borderRadius: moderateScale(6),
    },
    changeBtnText: {
      color: COLORS.primary,
      fontWeight: 'bold',
      fontSize: moderateFont(12),
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
          <Text style={styles.headerTitle}>Personal Details</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Registered Email</Text>
            <View style={styles.emailContainer}>
              <Text style={styles.emailText}>{user?.email || 'No email set'}</Text>
              <TouchableOpacity
                onPress={() => router.push('/settings/email')}
                style={styles.changeBtn}
              >
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                placeholderTextColor={COLORS.subtitle + '80'}
                value={name}
                onChangeText={setName}
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                placeholderTextColor={COLORS.subtitle + '80'}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.subtitle + '80'}
                value={birthday}
                onChangeText={setBirthday}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, updating && styles.buttonDisabled]}
            onPress={handleUpdate}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Save Details</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
