import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';

interface Props {
  badgeType?: 'blue' | 'gold' | 'green' | 'purple' | string | null;
  size?: number;
  containerStyle?: any;
}

export const VerifiedTick = ({ badgeType, size = 16, containerStyle }: Props) => {
  return null;
};
