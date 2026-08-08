import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import { apiClient } from '@/src/api/client';

export default function StoryRepliesScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();

  const [selectedOption, setSelectedOption] = useState('everyone'); // 'everyone', 'following', 'nobody'
  const [saving, setSaving] = useState(false);

  const handleSelect = async (opt: string) => {
    setSelectedOption(opt);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      await apiClient.patch('/settings', { storyReplies: opt });
    } catch (e) {
    } finally {
      setSaving(false);
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
    content: {
      paddingHorizontal: scale(20),
      paddingTop: verticalScale(20),
    },
    description: {
      fontSize: moderateFont(14),
      color: COLORS.subtitle,
      marginBottom: verticalScale(24),
      lineHeight: moderateFont(20),
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: scale(16),
      marginBottom: verticalScale(14),
    },
    optionTitle: {
      fontSize: moderateFont(15),
      fontWeight: '600',
      color: COLORS.text,
    },
    optionSub: {
      fontSize: moderateFont(12),
      color: COLORS.subtitle,
      marginTop: verticalScale(4),
      paddingRight: scale(10),
    },
  });

  const options = [
    { key: 'everyone', title: 'Everyone', desc: 'Allows all users to reply to your stories.' },
    { key: 'following', title: 'Followers You Follow Back', desc: 'Only users who follow you AND whom you follow back can reply.' },
    { key: 'nobody', title: 'Off', desc: 'Nobody can reply to your stories. Comments/replies section will be hidden.' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Story Reply Controls</Text>
        <View style={{ position: 'absolute', right: scale(16), top: Platform.OS === 'ios' ? verticalScale(50) : verticalScale(45) }}>
          {saving && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          Choose who can reply or comment on your shared stories.
        </Text>

        {options.map((opt) => {
          const isSelected = selectedOption === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={styles.optionRow}
              onPress={() => handleSelect(opt.key)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{opt.title}</Text>
                <Text style={styles.optionSub}>{opt.desc}</Text>
              </View>
              <Ionicons
                name={isSelected ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={isSelected ? COLORS.primary : COLORS.border}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
