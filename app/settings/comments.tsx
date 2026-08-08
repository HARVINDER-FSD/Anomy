import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, ScrollView, Switch, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';
import { apiClient } from '@/src/api/client';

export default function CommentsScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();

  const [blockOffensive, setBlockOffensive] = useState(true);
  const [customFilter, setCustomFilter] = useState(false);
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Fetch settings on load
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/settings');
      if (res.data?.success && res.data?.settings) {
        setBlockOffensive(res.data.settings.blockOffensiveComments ?? true);
        setCustomFilter(res.data.settings.customFilter ?? false);
        setKeywords(res.data.settings.filterKeywords ?? '');
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: string, value: any) => {
    try {
      setUpdating(true);
      await apiClient.patch('/settings', { [key]: value });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Error', 'Failed to update settings');
      // Revert state on error
      fetchSettings();
    } finally {
      setUpdating(false);
    }
  };

  const toggleBlockOffensive = async () => {
    const newValue = !blockOffensive;
    setBlockOffensive(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSetting('blockOffensiveComments', newValue);
  };

  const toggleCustomFilter = async () => {
    const newValue = !customFilter;
    setCustomFilter(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSetting('customFilter', newValue);
  };

  const handleKeywordsChange = async (text: string) => {
    setKeywords(text);
    // Debounce or save immediately? Let's save when done typing? Or on change? Let's do on change for now, or maybe debounce. For simplicity, let's just save.
    await updateSetting('filterKeywords', text);
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
    inputGroup: {
      marginTop: verticalScale(8),
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
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comments Control</Text>
        {updating && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 'auto' }} />}
      </View>

      {loading ? (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          Manage how people interact with your content. You can automatically hide offensive comments or filter out comments containing specific words.
        </Text>

        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>Hide Offensive Comments</Text>
            <Text style={styles.settingSub}>Automatically hide comments that may be offensive, inappropriate, or spam.</Text>
          </View>
          <Switch
            value={blockOffensive}
            onValueChange={toggleBlockOffensive}
            trackColor={{ false: '#BDC3C7', true: COLORS.primary }}
            thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>Custom Keyword Filter</Text>
            <Text style={styles.settingSub}>Hide comments that contain words, phrases, or emojis you specify.</Text>
          </View>
          <Switch
            value={customFilter}
            onValueChange={toggleCustomFilter}
            trackColor={{ false: '#BDC3C7', true: COLORS.primary }}
            thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
          />
        </View>

        {customFilter && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Manage Keywords & Phrases</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Separate words with commas (e.g. bad, spam)"
                placeholderTextColor={COLORS.subtitle + '80'}
                value={keywords}
                onChangeText={handleKeywordsChange}
                editable={!updating}
              />
            </View>
          </View>
        )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
