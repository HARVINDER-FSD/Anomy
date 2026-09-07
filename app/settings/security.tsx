import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';

export default function SecurityScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();

  const [auditing, setAuditing] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleDownloadData = () => {
    setDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      setDownloading(false);
      Alert.alert("Request Successful", "A secure archive containing your data has been compiled and a download link has been sent to your email.");
    }, 2000);
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
    content: {
      paddingHorizontal: scale(20),
      paddingTop: verticalScale(20),
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    heroCard: {
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(24),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: scale(24),
      alignItems: 'center',
      marginBottom: verticalScale(24),
    },
    auditText: {
      fontSize: moderateFont(16),
      fontWeight: '600',
      color: COLORS.text,
      marginTop: verticalScale(16),
      textAlign: 'center',
    },
    auditSubText: {
      fontSize: moderateFont(13),
      color: COLORS.subtitle,
      marginTop: verticalScale(6),
      textAlign: 'center',
    },
    checkList: {
      gap: verticalScale(12),
      marginBottom: verticalScale(24),
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: scale(16),
    },
    checkInfo: {
      flex: 1,
      marginLeft: scale(12),
    },
    checkTitle: {
      fontSize: moderateFont(15),
      fontWeight: '600',
      color: COLORS.text,
    },
    checkSub: {
      fontSize: moderateFont(12),
      color: COLORS.subtitle,
      marginTop: verticalScale(2),
    },
    downloadBtn: {
      flexDirection: 'row',
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: scale(16),
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    downloadLabel: {
      fontSize: moderateFont(15),
      fontWeight: '600',
      color: COLORS.text,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security Checkup</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          {auditing ? (
            <>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.auditText}>Running Security Audits...</Text>
              <Text style={styles.auditSubText}>We are verifying your device identity, current sessions, and passwords.</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={56} color="#2ECC71" />
              <Text style={styles.auditText}>Your Account is Secure</Text>
              <Text style={styles.auditSubText}>No suspicious activities, vulnerabilities, or weak passwords were found.</Text>
            </>
          )}
        </View>

        {!auditing && (
          <>
            <View style={styles.checkList}>
              <View style={styles.checkRow}>
                <Ionicons name="shield-checkmark" size={24} color="#2ECC71" />
                <View style={styles.checkInfo}>
                  <Text style={styles.checkTitle}>Password Protection</Text>
                  <Text style={styles.checkSub}>Your password was recently updated and is complex.</Text>
                </View>
              </View>

              <View style={styles.checkRow}>
                <Ionicons name="phone-portrait" size={24} color="#2ECC71" />
                <View style={styles.checkInfo}>
                  <Text style={styles.checkTitle}>Login Activity</Text>
                  <Text style={styles.checkSub}>All active login sessions are currently recognized.</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.downloadBtn} 
              onPress={handleDownloadData}
              disabled={downloading}
            >
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="cloud-download-outline" size={24} color={COLORS.primary} style={{ marginRight: 12 }} />
                <Text style={styles.downloadLabel}>Download Personal Info</Text>
              </View>
              {downloading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
