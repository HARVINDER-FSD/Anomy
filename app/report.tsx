import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useAppTheme } from '@/src/theme/colors';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/client';
import Toast from 'react-native-toast-message';

export default function ReportScreen() {
  const router = useSafeRouter();
  const COLORS = useAppTheme();
  const { targetId, targetType, targetUsername } = useLocalSearchParams<{ targetId: string, targetType: string, targetUsername: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const reportReasons = [
    "I just don't like it",
    "Bullying or unwanted contact",
    "Suicide, self-injury or eating disorders",
    "Violence, hate or exploitation",
    "Selling or promoting restricted items",
    "Nudity or sexual activity",
    "Scam, fraud or spam",
    "False information",
    "Intellectual property",
  ];

  const handleSelectReason = async (reason: string) => {
    if (submitting) return;
    
    if (!targetId) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Missing target ID. Please try again.',
      });
      return;
    }

    setSubmitting(true);
    
    try {
      await apiClient.post('/reports', {
        target_id: targetId,
        target_type: targetType || 'post',
        reason,
      });
      
      // Notify other screens (like the feed) that this post was reported so it can be hidden
      DeviceEventEmitter.emit('post:reported:local', { postId: targetId });
      
      setSuccess(true);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 
                           error?.response?.data?.message || 
                           error?.message || 
                           'Could not submit report. Please try again.';
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: errorMessage,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/');
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: COLORS.background }]}>
        <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
          <View style={{ width: 34 }} /> 
          <Text style={[styles.headerTitle, { color: COLORS.text }]}>Report</Text>
          <TouchableOpacity onPress={handleDone} style={styles.headerIcon}>
            <Ionicons name="close" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.successIconContainer, { backgroundColor: COLORS.surface }]}>
            <Ionicons name="checkmark" size={40} color={COLORS.text} />
          </View>
          <Text style={[styles.title, { color: COLORS.text }]}>Thanks for your feedback</Text>
          <Text style={[styles.subtitle, { color: COLORS.subtitle, paddingHorizontal: 20 }]}>
            We use these reports to show you less of this kind of content in the future.
          </Text>

          <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Other steps you can take</Text>

          {targetUsername && (
            <>
              <TouchableOpacity style={[styles.actionItem, { borderBottomColor: COLORS.border }]}>
                <Ionicons name="ban-outline" size={24} color={COLORS.text} style={styles.actionIcon} />
                <Text style={[styles.actionText, { color: COLORS.text }]}>Block {targetUsername}</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionItem, { borderBottomColor: COLORS.border }]}>
                <Ionicons name="eye-off-outline" size={24} color={COLORS.text} style={styles.actionIcon} />
                <Text style={[styles.actionText, { color: COLORS.text }]}>Restrict {targetUsername}</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={[styles.actionItem, { borderBottomColor: COLORS.border }]}>
            <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.text} style={styles.actionIcon} />
            <Text style={[styles.actionText, { color: COLORS.text, flex: 1, marginRight: 10 }]}>Learn more about our Community Standards</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
          </TouchableOpacity>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: COLORS.border }]}>
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: COLORS.background }]}>
      <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
        <TouchableOpacity onPress={handleDone} style={styles.headerIcon}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: COLORS.text }]}>Report</Text>
        <TouchableOpacity onPress={handleDone} style={styles.headerIcon}>
          <Ionicons name="close" size={26} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: COLORS.text }]}>Why are you reporting this post?</Text>
        <Text style={[styles.subtitle, { color: COLORS.subtitle }]}>
          Your report is anonymous. If someone is in immediate danger, call the local emergency services – don't wait.
        </Text>

        <View style={styles.reasonsList}>
          {reportReasons.map((reason, index) => (
            <TouchableOpacity 
              key={index} 
              style={[styles.reasonItem, { borderBottomColor: COLORS.border, opacity: submitting ? 0.5 : 1 }]} 
              onPress={() => handleSelectReason(reason)}
              disabled={submitting}
            >
              <Text style={[styles.reasonText, { color: COLORS.text }]}>{reason}</Text>
              {submitting ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  reasonsList: {
    marginTop: 8,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reasonText: {
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    marginRight: 16,
  },
  actionText: {
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
    flex: 1,
  },
  footer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneBtn: {
    backgroundColor: '#4F46E5', // Indigo color matching the screenshot
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
});
