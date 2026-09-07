import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import * as Haptics from 'expo-haptics';

export default function HelpScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
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
    description: {
      fontSize: moderateFont(14),
      color: COLORS.subtitle,
      marginBottom: verticalScale(24),
      lineHeight: moderateFont(20),
    },
    faqRow: {
      backgroundColor: COLORS.surface,
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: scale(16),
      marginBottom: verticalScale(14),
      overflow: 'hidden',
    },
    faqHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    faqQuestion: {
      fontSize: moderateFont(15),
      fontWeight: '600',
      color: COLORS.text,
      flex: 1,
      paddingRight: scale(12),
    },
    faqAnswer: {
      fontSize: moderateFont(13),
      color: COLORS.subtitle,
      marginTop: verticalScale(12),
      lineHeight: moderateFont(18),
      borderTopWidth: 0.5,
      borderTopColor: COLORS.border,
      paddingTop: verticalScale(10),
    },
  });

  const faqs = [
    { q: 'What is Ghost Mode?', a: 'Ghost Mode allows you to browse, view posts, and interact completely anonymously. Your identity details are masked under a unique ghost persona.' },
    { q: 'How do I change my registered email?', a: 'Go to Settings -> Personal Details -> Registered Email -> Change. A verification OTP will be sent to confirm ownership.' },
    { q: 'How can I terminate active sessions?', a: 'Go to Settings -> Login Activity / History. You will see a list of logged-in sessions. Simply tap "Log Out" next to any session you wish to terminate.' },
    { q: 'How are reports handled on AnuFy?', a: 'When you submit a report, our moderators investigate the target content. Accounts violating community standards are flagged and permanently suspended.' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & FAQs</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          Find answers to frequently asked questions about security, ghost mode, and account configuration.
        </Text>

        {faqs.map((faq, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <TouchableOpacity
              key={index}
              style={styles.faqRow}
              activeOpacity={0.8}
              onPress={() => toggleExpand(index)}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{faq.q}</Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={COLORS.subtitle}
                />
              </View>
              {isExpanded && (
                <Text style={styles.faqAnswer}>{faq.a}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
