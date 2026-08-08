import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export default function TimeSpentScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();
  const [timeToday, setTimeToday] = useState(0);
  const [dailyReminder, setDailyReminder] = useState(false);
  const [reminderLimit, setReminderLimit] = useState(30); // 30 mins

  useEffect(() => {
    const getTime = async () => {
      const value = await AsyncStorage.getItem('@time_spent_today');
      setTimeToday(value ? parseInt(value, 10) : 15);
    };
    getTime();
  }, []);

  const toggleReminder = () => {
    setDailyReminder(!dailyReminder);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    content: {
      paddingHorizontal: scale(20),
      paddingTop: verticalScale(20),
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
    heroValue: {
      fontSize: moderateFont(48),
      fontWeight: 'bold',
      color: COLORS.primary,
    },
    heroUnit: {
      fontSize: moderateFont(16),
      color: COLORS.subtitle,
      marginTop: verticalScale(4),
      fontWeight: '500',
    },
    heroTitle: {
      fontSize: moderateFont(16),
      fontWeight: '600',
      color: COLORS.text,
      marginTop: verticalScale(16),
    },
    sectionTitle: {
      fontSize: moderateFont(16),
      fontWeight: 'bold',
      color: COLORS.text,
      marginBottom: verticalScale(16),
      marginTop: verticalScale(12),
    },
    chartContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      height: verticalScale(150),
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(20),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: scale(16),
      marginBottom: verticalScale(24),
    },
    chartBarContainer: {
      alignItems: 'center',
      flex: 1,
    },
    chartBar: {
      width: scale(16),
      borderRadius: scale(8),
      backgroundColor: COLORS.primary + '30',
    },
    chartBarActive: {
      backgroundColor: COLORS.primary,
    },
    chartLabel: {
      fontSize: moderateFont(11),
      color: COLORS.subtitle,
      marginTop: verticalScale(8),
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: scale(16),
      marginBottom: verticalScale(16),
    },
    settingTextContainer: {
      flex: 1,
      marginRight: scale(12),
    },
    settingTitle: {
      fontSize: moderateFont(15),
      fontWeight: '600',
      color: COLORS.text,
    },
    settingSub: {
      fontSize: moderateFont(12),
      color: COLORS.subtitle,
      marginTop: verticalScale(4),
    },
  });

  const chartData = [
    { day: 'Mon', mins: 12 },
    { day: 'Tue', mins: 25 },
    { day: 'Wed', mins: 45 },
    { day: 'Thu', mins: 30 },
    { day: 'Fri', mins: 60 },
    { day: 'Sat', mins: 50 },
    { day: 'Sun', mins: timeToday, isActive: true },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Time Spent</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroValue}>{timeToday}</Text>
          <Text style={styles.heroUnit}>minutes per day</Text>
          <Text style={styles.heroTitle}>Daily Average This Week</Text>
        </View>

        <Text style={styles.sectionTitle}>Activity Overview</Text>
        <View style={styles.chartContainer}>
          {chartData.map((data, index) => {
            const barHeight = Math.max(verticalScale(5), (data.mins / 70) * verticalScale(110));
            return (
              <View key={index} style={styles.chartBarContainer}>
                <View style={[styles.chartBar, { height: barHeight }, data.isActive && styles.chartBarActive]} />
                <Text style={styles.chartLabel}>{data.day}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Manage Your Time</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>Daily Reminder</Text>
            <Text style={styles.settingSub}>Get a reminder when you reach {reminderLimit} minutes in a day.</Text>
          </View>
          <Switch
            value={dailyReminder}
            onValueChange={toggleReminder}
            trackColor={{ false: '#BDC3C7', true: COLORS.primary }}
            thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
