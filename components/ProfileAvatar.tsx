import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/src/theme/colors';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';

interface ProfileAvatarProps {
  url: string | null | undefined;
  username: string;
  size: number;
  borderWidth?: number;
  isOnline?: boolean;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ 
  url, 
  username, 
  size, 
  borderWidth = 3,
  isOnline = false
}) => {
  const resolvedUrl = resolveAvatarUrl(url || undefined, username);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {/* Premium Gradient Border */}
      <LinearGradient
        colors={[COLORS.primary, COLORS.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.borderGradient, 
          { 
            width: size, 
            height: size, 
            borderRadius: size / 2,
            padding: borderWidth
          }
        ]}
      >
        <View style={[styles.imageContainer, { borderRadius: (size - borderWidth * 2) / 2 }]}>
          <Image
            source={{ uri: resolvedUrl }}
            style={[styles.image, { borderRadius: (size - borderWidth * 2) / 2 }]} // Ensure image itself is rounded
          />
        </View>
      </LinearGradient>

      {/* Online Status Indicator */}
      {isOnline && (
        <View style={[
          styles.onlineIndicator,
          { 
            width: size * 0.22, 
            height: size * 0.22, 
            borderRadius: (size * 0.22) / 2,
            bottom: size * 0.05,
            right: size * 0.05,
            borderWidth: Math.max(2, size * 0.03)
          }
        ]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  borderGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  imageContainer: {
    backgroundColor: 'transparent',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333', // Dark fallback color
  },
  onlineIndicator: {
    backgroundColor: '#4ade80', // Emerald-400
    borderColor: COLORS.white,
    position: 'absolute',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
