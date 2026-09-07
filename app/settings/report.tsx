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

export default function ReportProblemScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();
  const { user } = useAuthStore();

  const [reportReason, setReportReason] = useState('Support Ticket');
  const [reportDescription, setReportDescription] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleSubmitReport = async () => {
    if (!reportDescription.trim()) {
      Alert.alert("Error", "Please write a description of the problem.");
      return;
    }

    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await apiClient.post('/reports', {
        target_id: user?.id,
        target_type: 'user',
        reason: reportReason,
        description: reportDescription
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Ticket Submitted", "Thanks for reporting. Our developers will review your report.", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err.response?.data?.error || "Failed to submit report.");
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
    textAreaContainer: {
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: moderateScale(10),
      paddingHorizontal: scale(12),
      paddingTop: verticalScale(12),
      height: verticalScale(140),
    },
    textArea: {
      color: COLORS.text,
      fontSize: moderateFont(15),
      height: '100%',
      textAlignVertical: 'top',
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
          <Text style={styles.headerTitle}>Report a Problem</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>
            Found a bug? Or have a suggestion for improving AnuFy? Let us know the details below. Our development team will review it.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Subject</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="e.g. Bug, Suggestion, Account Issue"
                placeholderTextColor={COLORS.subtitle + '80'}
                value={reportReason}
                onChangeText={setReportReason}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>What went wrong?</Text>
            <View style={styles.textAreaContainer}>
              <TextInput
                style={styles.textArea}
                placeholder="Please describe the issue in detail..."
                placeholderTextColor={COLORS.subtitle + '80'}
                multiline
                numberOfLines={6}
                value={reportDescription}
                onChangeText={setReportDescription}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, updating && styles.buttonDisabled]}
            onPress={handleSubmitReport}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Submit Support Ticket</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
