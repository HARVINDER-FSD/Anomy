import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';

export default function InfoScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();
  const { type } = useLocalSearchParams();

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
      textTransform: 'capitalize',
    },
    content: {
      paddingHorizontal: scale(20),
      paddingTop: verticalScale(20),
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    policyText: {
      fontSize: moderateFont(14),
      color: COLORS.text,
      lineHeight: moderateFont(22),
    },
    // Insights styles
    insightsCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: scale(12),
      marginBottom: verticalScale(24),
    },
    insightBox: {
      flex: 1,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: moderateScale(16),
      padding: scale(16),
      alignItems: 'center',
    },
    insightVal: {
      fontSize: moderateFont(22),
      fontWeight: 'bold',
      color: COLORS.text,
    },
    insightLabel: {
      fontSize: moderateFont(12),
      color: COLORS.subtitle,
      marginTop: verticalScale(4),
    },
    growthText: {
      fontSize: moderateFont(15),
      color: '#2ECC71',
      fontWeight: 'bold',
      marginTop: verticalScale(8),
    },
    sectionTitle: {
      fontSize: moderateFont(16),
      fontWeight: 'bold',
      color: COLORS.text,
      marginBottom: verticalScale(10),
    },
    // Activity styles
    activityStatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: verticalScale(14),
      borderBottomWidth: 0.5,
      borderBottomColor: COLORS.border,
    },
    activityText: {
      flex: 1,
      marginLeft: scale(12),
      fontSize: moderateFont(14),
      color: COLORS.text,
    },
    activityVal: {
      fontSize: moderateFont(14),
      fontWeight: 'bold',
      color: COLORS.text,
    },
  });

  const getHeaderTitle = () => {
    switch (type) {
      case 'terms': return 'Terms of Use';
      case 'privacy': return 'Privacy Policy';
      case 'insights': return 'Creator Insights';
      case 'activity': return 'Your Activity';
      default: return 'Information';
    }
  };

  const renderContent = () => {
    switch (type) {
      case 'terms':
        return (
          <Text style={styles.policyText}>
            Welcome to AnuFy. By using our platform, you agree to these terms:{"\n\n"}
            1. **Identity & Ghost Mode**: You control your ghost mode settings. You are fully responsible for all interactions made under both normal and ghost personas.{"\n\n"}
            2. **Community Standards**: Posting offensive content, spamming, harassing others, or displaying illegal media will result in immediate and permanent account suspension.{"\n\n"}
            3. **Safety Policies**: We do not allow child exploitation, hate speech, or dangerous activities. Dynamic moderation is in place to verify and flag reports.
          </Text>
        );
      case 'privacy':
        return (
          <Text style={styles.policyText}>
            Your privacy is paramount at AnuFy:{"\n\n"}
            1. **No Data Tracking**: Your ghost identity profile details are masked from other users. We do not link your ghost credentials to your public account details on client devices.{"\n\n"}
            2. **Message Storage**: Chats are saved securely. We do not store log data for notifications once they are read by devices.{"\n\n"}
            3. **Blocking**: When you block another user, your activity becomes completely hidden from them instantly.
          </Text>
        );
      case 'insights':
        return (
          <View>
            <View style={styles.insightsCard}>
              <View style={styles.insightBox}>
                <Text style={styles.insightVal}>1,250</Text>
                <Text style={styles.insightLabel}>Post Reach</Text>
              </View>
              <View style={styles.insightBox}>
                <Text style={styles.insightVal}>890</Text>
                <Text style={styles.insightLabel}>Engagement</Text>
              </View>
            </View>
            
            <View style={{ marginTop: verticalScale(10) }}>
              <Text style={styles.sectionTitle}>Followers Growth</Text>
              <Text style={styles.growthText}>+12.4% this week</Text>
            </View>
          </View>
        );
      case 'activity':
        return (
          <View style={{ gap: 10 }}>
            <View style={styles.activityStatRow}>
              <Ionicons name="images-outline" size={20} color={COLORS.primary} />
              <Text style={styles.activityText}>Total Posts Shared</Text>
              <Text style={styles.activityVal}>14</Text>
            </View>
            <View style={styles.activityStatRow}>
              <Ionicons name="videocam-outline" size={20} color={COLORS.primary} />
              <Text style={styles.activityText}>Total Reels Shared</Text>
              <Text style={styles.activityVal}>4</Text>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
}
