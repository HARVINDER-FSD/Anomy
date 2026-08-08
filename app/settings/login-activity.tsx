import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, Platform, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';

export default function LoginActivityScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();

  const [currentSession, setCurrentSession] = useState<any>(null);
  const [otherSessions, setOtherSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminatingAll, setTerminatingAll] = useState(false);

  const fetchLoginActivity = async () => {
    try {
      const res = await apiClient.get('/auth/login-activity');
      if (res.data?.success) {
        const activity = res.data.activity || [];
        const current = activity.find((a: any) => a.isCurrent);
        const others = activity.filter((a: any) => !a.isCurrent);
        setCurrentSession(current || activity[0] || null);
        setOtherSessions(current ? others : activity.slice(1));
      }
    } catch (e) {
      // Fallback mock data for development
      setCurrentSession({
        id: '1',
        device: 'Samsung Galaxy S24',
        deviceBrand: 'Samsung',
        deviceModel: 'Galaxy S24',
        deviceType: 'android',
        osVersion: 'Android 14',
        appVersion: '2.0.5',
        ip: '192.168.1.45',
        location: 'New Delhi, India',
        timestamp: new Date(),
        isCurrent: true,
        lastActiveAt: new Date()
      });
      setOtherSessions([
        {
          id: '2',
          device: 'iPhone 15 Pro',
          deviceBrand: 'Apple',
          deviceModel: 'iPhone 15 Pro',
          deviceType: 'ios',
          osVersion: 'iOS 17.4',
          appVersion: '2.0.5',
          ip: '103.45.21.90',
          location: 'Mumbai, India',
          timestamp: new Date(Date.now() - 86400000),
          isCurrent: false,
          lastActiveAt: new Date(Date.now() - 3600000)
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoginActivity();
  }, []);

  const terminateSession = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Log Out Session',
      'Are you sure you want to log out of this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiClient.delete(`/auth/login-activity/${id}`);
              if (res.data?.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                fetchLoginActivity();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to terminate session.');
              }
            } catch {
              Alert.alert('Error', 'An error occurred while terminating the session.');
            }
          }
        }
      ]
    );
  };

  const terminateOtherSessions = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Log Out of All Other Devices',
      'This will log you out of all other active sessions except this current device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out Others',
          style: 'destructive',
          onPress: async () => {
            setTerminatingAll(true);
            try {
              const res = await apiClient.delete('/auth/login-activity/others');
              if (res.data?.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                fetchLoginActivity();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to terminate other sessions.');
              }
            } catch {
              Alert.alert('Error', 'An error occurred while logging out of other sessions.');
            } finally {
              setTerminatingAll(false);
            }
          }
        }
      ]
    );
  };

  // Returns the right icon based on device type
  const getDeviceIcon = (session: any): any => {
    const type = (session.deviceType || '').toLowerCase();
    const device = (session.device || '').toLowerCase();
    if (type === 'ios' || device.includes('iphone') || device.includes('ipad')) return 'apple';
    if (type === 'android' || device.includes('android') || device.includes('samsung') || device.includes('pixel')) return 'android';
    return 'laptop';
  };

  // Format relative time
  const formatRelativeTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
      borderBottomWidth: 0.5,
      borderBottomColor: COLORS.border,
      paddingTop: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45),
    },
    headerTitle: {
      fontSize: moderateFont(18),
      fontFamily: 'Outfit_600SemiBold',
      color: COLORS.text,
      marginLeft: scale(14),
    },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: {
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(20),
      paddingBottom: verticalScale(40),
    },

    // Section label
    sectionLabel: {
      fontSize: moderateFont(11),
      fontFamily: 'Outfit_600SemiBold',
      color: COLORS.subtitle,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: verticalScale(10),
      marginLeft: scale(4),
    },

    // Session Card
    sessionCard: {
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: COLORS.border,
      marginBottom: verticalScale(20),
      overflow: 'hidden',
    },
    cardInner: {
      padding: moderateScale(16),
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: COLORS.background,
      borderWidth: 1,
      borderColor: COLORS.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: scale(14),
      marginTop: 2,
    },
    sessionDetails: { flex: 1 },

    // Device name row
    deviceNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    deviceName: {
      fontSize: moderateFont(15),
      fontFamily: 'Outfit_600SemiBold',
      color: COLORS.text,
    },
    activeBadge: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: scale(8),
      paddingVertical: 2,
      borderRadius: 6,
    },
    activeBadgeText: {
      color: '#16A34A',
      fontSize: moderateFont(10),
      fontFamily: 'Outfit_600SemiBold',
    },

    // Info rows
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: verticalScale(5),
      gap: 6,
    },
    infoText: {
      fontSize: moderateFont(12),
      fontFamily: 'Outfit_400Regular',
      color: COLORS.subtitle,
      flex: 1,
    },

    // Divider between sessions in card
    divider: {
      height: 1,
      backgroundColor: COLORS.border,
    },

    // Terminate button inside card
    terminateRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: moderateScale(16),
      paddingVertical: verticalScale(10),
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
    },
    terminateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(6),
      borderRadius: 8,
      backgroundColor: COLORS.error + '12',
    },
    terminateText: {
      color: COLORS.error,
      fontSize: moderateFont(12),
      fontFamily: 'Outfit_500Medium',
    },

    // Terminate all button
    terminateAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: COLORS.error + '10',
      paddingVertical: verticalScale(15),
      borderRadius: moderateScale(14),
      borderWidth: 1,
      borderColor: COLORS.error + '30',
      marginTop: verticalScale(4),
    },
    terminateAllText: {
      color: COLORS.error,
      fontSize: moderateFont(14),
      fontFamily: 'Outfit_600SemiBold',
    },
    noOthersCard: {
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: moderateScale(24),
      alignItems: 'center',
      gap: 8,
      marginBottom: verticalScale(20),
    },
    noOthersText: {
      textAlign: 'center',
      color: COLORS.subtitle,
      fontSize: moderateFont(13),
      fontFamily: 'Outfit_400Regular',
    },
  });

  const SessionCard = ({ session, showTerminate = false }: { session: any; showTerminate?: boolean }) => {
    const icon = getDeviceIcon(session);
    const iconColor = icon === 'apple' ? COLORS.text : icon === 'android' ? '#3DDC84' : COLORS.primary;

    return (
      <View style={styles.sessionCard}>
        <View style={styles.cardInner}>
          <View style={styles.sessionRow}>
            {/* Device Icon */}
            <View style={styles.iconWrapper}>
              <MaterialCommunityIcons name={icon} size={24} color={iconColor} />
            </View>

            <View style={styles.sessionDetails}>
              {/* Device Name + Active Badge */}
              <View style={styles.deviceNameRow}>
                <Text style={styles.deviceName}>
                  {session.deviceModel && session.deviceModel !== 'Unknown'
                    ? session.deviceModel
                    : session.device || 'Unknown Device'}
                </Text>
                {session.isCurrent && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>● Active Now</Text>
                  </View>
                )}
              </View>

              {/* Brand */}
              {session.deviceBrand && session.deviceBrand !== 'Unknown' && (
                <View style={styles.infoRow}>
                  <Ionicons name="phone-portrait-outline" size={13} color={COLORS.subtitle} />
                  <Text style={styles.infoText}>{session.deviceBrand}</Text>
                </View>
              )}

              {/* OS Version */}
              {session.osVersion && session.osVersion !== 'Unknown OS' && (
                <View style={styles.infoRow}>
                  <Ionicons name="layers-outline" size={13} color={COLORS.subtitle} />
                  <Text style={styles.infoText}>{session.osVersion}</Text>
                </View>
              )}

              {/* Location */}
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={13} color={COLORS.subtitle} />
                <Text style={styles.infoText}>
                  {session.location && session.location !== 'Unknown Location'
                    ? session.location
                    : 'Location unavailable'}
                </Text>
              </View>

              {/* IP */}
              <View style={styles.infoRow}>
                <Ionicons name="wifi-outline" size={13} color={COLORS.subtitle} />
                <Text style={styles.infoText}>IP: {session.ip}</Text>
              </View>

              {/* Last Active */}
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={13} color={COLORS.subtitle} />
                <Text style={styles.infoText}>
                  {session.isCurrent
                    ? 'Currently active'
                    : `Last active ${formatRelativeTime(session.lastActiveAt || session.timestamp)}`}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Terminate Button */}
        {showTerminate && (
          <View style={styles.terminateRow}>
            <TouchableOpacity style={styles.terminateBtn} onPress={() => terminateSession(session.id)}>
              <Ionicons name="log-out-outline" size={14} color={COLORS.error} />
              <Text style={styles.terminateText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Login Activity</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Other Devices */}
          <Text style={styles.sectionLabel}>Where You're Logged In</Text>
          {otherSessions.length === 0 ? (
            <View style={styles.noOthersCard}>
              <Ionicons name="shield-checkmark-outline" size={32} color={COLORS.subtitle} />
              <Text style={styles.noOthersText}>No other active sessions found.{'\n'}Your account is only active on this device.</Text>
            </View>
          ) : (
            otherSessions.map((session) => (
              <SessionCard key={session.id} session={session} showTerminate={true} />
            ))
          )}

          {/* Log Out All */}
          {otherSessions.length > 0 && (
            <TouchableOpacity
              style={styles.terminateAllBtn}
              onPress={terminateOtherSessions}
              disabled={terminatingAll}
            >
              {terminatingAll ? (
                <ActivityIndicator color={COLORS.error} size="small" />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
                  <Text style={styles.terminateAllText}>Log Out of All Other Devices</Text>
                </>
              )}
            </TouchableOpacity>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
