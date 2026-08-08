import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/src/theme/colors';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';
import { RelationshipState } from '@/src/store/relationshipStore';
import { Ionicons } from '@expo/vector-icons';

export interface FollowRequestActionsProps {
  targetUserId: string;
  initialState?: Partial<RelationshipState>;
  variant?: 'icon' | 'text'; // 'icon' for notifications, 'text' for profile
  style?: StyleProp<ViewStyle>;
  onAcceptSuccess?: () => void;
  onRejectSuccess?: () => void;
}

export function FollowRequestActions({
  targetUserId,
  initialState,
  variant = 'text',
  style,
  onAcceptSuccess,
  onRejectSuccess,
}: FollowRequestActionsProps) {
  const { acceptFollowRequest, rejectFollowRequest, isLoading } = useFollowStatus(targetUserId, initialState);
  
  const handleAccept = async () => {
    if (isLoading) return;
    await acceptFollowRequest();
    onAcceptSuccess?.();
  };

  const handleReject = async () => {
    if (isLoading) return;
    await rejectFollowRequest();
    onRejectSuccess?.();
  };

  if (variant === 'icon') {
    return (
      <View style={[styles.iconRow, style, isLoading && { opacity: 0.5 }]}>
        <TouchableOpacity 
          style={styles.iconAcceptBtn} 
          onPress={handleAccept}
          disabled={isLoading}
        >
          <Text style={styles.iconAcceptText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.iconRejectBtn} 
          onPress={handleReject}
          disabled={isLoading}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color={COLORS.subtitle} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.textRow, style, isLoading && { opacity: 0.5 }]}>
      <TouchableOpacity 
        style={[styles.actionBtn, styles.primaryBtn]} 
        onPress={handleAccept}
        disabled={isLoading}
      >
        <Text style={styles.primaryBtnText}>Confirm</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.actionBtn, styles.outlineBtn]} 
        onPress={handleReject}
        disabled={isLoading}
      >
        <Text style={styles.outlineBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconAcceptBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  iconAcceptText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  iconRejectBtn: {
    padding: 4,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
  },
  primaryBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  outlineBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outlineBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 14,
  },
});
