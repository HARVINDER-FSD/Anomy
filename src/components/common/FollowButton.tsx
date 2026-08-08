import React, { useRef } from 'react';
import { Text, TouchableOpacity, StyleSheet, Animated, StyleProp, ViewStyle, TextStyle, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/src/theme/colors';
import { useRelationshipStore } from '@/src/store/relationshipStore';
import { Ionicons } from '@expo/vector-icons';

export interface FollowButtonProps {
  targetUserId: string;
  variant?: 'primary' | 'outline' | 'transparent';
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /**
   * Parent MUST pass the toggle action down.
   * This prevents a duplicate useFollowStatus call (and duplicate API + socket) when the
   * parent already owns the hook — e.g. user/[username].tsx, followers.tsx etc.
   */
  onToggle: () => void | Promise<void>;
  isLoading?: boolean;
  /** Show "Follow back" instead of "Follow" when the target follows you */
  followsBackLabel?: boolean;
}

const STATIC_DEFAULT_STATE = {
  isFollowing: false,
  isPending: false,
};

export function FollowButton({
  targetUserId,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
  onToggle,
  isLoading = false,
  followsBackLabel = false,
}: FollowButtonProps) {
  // Store-read ONLY — using referentially stable default state
  const relationship = useRelationshipStore(state =>
    state.relationships[targetUserId] ?? STATIC_DEFAULT_STATE
  );

  const { isFollowing, isPending } = relationship;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const handlePress = async () => {
    if (isLoading) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await onToggle();
  };

  const getVariantStyles = () => {
    const isFollowedOrRequested = isFollowing || isPending;

    if (variant === 'transparent') {
      return {
        container: [styles.baseButton, styles.transparentBtn, isFollowedOrRequested && styles.transparentBtnActive],
        text: [styles.baseText, styles.transparentText, isFollowedOrRequested && styles.transparentTextActive],
      };
    }
    if (variant === 'outline' || isFollowedOrRequested) {
      return {
        container: [styles.baseButton, styles.outlineBtn],
        text: [styles.baseText, styles.outlineText],
      };
    }
    return {
      container: [styles.baseButton, styles.primaryBtn],
      text: [styles.baseText, styles.primaryText],
    };
  };

  const getSizeStyles = () => {
    if (size === 'sm') return { container: styles.smBtn, text: styles.smText };
    if (size === 'lg') return { container: styles.lgBtn, text: styles.lgText };
    return { container: styles.mdBtn, text: styles.mdText };
  };

  const getButtonText = () => {
    if (isLoading) return '...';
    if (isPending) return 'Requested';
    if (isFollowing) return 'Following';
    if (followsBackLabel) return 'Follow back';
    return 'Follow';
  };

  const vs = getVariantStyles();
  const sz = getSizeStyles();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={isLoading}
        style={[vs.container, sz.container, style, isLoading && { opacity: 0.7 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {isPending && (
            <Ionicons
              name="time-outline"
              size={size === 'sm' ? 12 : 16}
              color={(vs.text[1] as any)?.color || COLORS.text}
            />
          )}
          <Text style={[vs.text, sz.text, textStyle]}>
            {getButtonText()}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  baseButton: { alignItems: 'center', justifyContent: 'center' },
  baseText: { fontWeight: '700' },
  smBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, minWidth: 70 },
  smText: { fontSize: 12 },
  mdBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, minWidth: 85 },
  mdText: { fontSize: 13 },
  lgBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, minWidth: 120 },
  lgText: { fontSize: 15 },
  primaryBtn: { backgroundColor: COLORS.primary, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8 },
  primaryText: { color: '#FFF' },
  outlineBtn: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8 },
  outlineText: { color: '#374151' },
  transparentBtn: { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)', borderRadius: 6 },
  transparentBtnActive: { backgroundColor: 'rgba(0, 0, 0, 0.3)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)', borderRadius: 6 },
  transparentText: { color: '#FFF' },
  transparentTextActive: { color: 'rgba(255, 255, 255, 0.85)' },
});
