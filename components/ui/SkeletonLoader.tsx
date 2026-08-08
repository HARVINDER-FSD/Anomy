import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SkeletonProps {
  width: number | string;
  height: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton = ({ width, height, borderRadius = 8, style }: SkeletonProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const animation = useSharedValue(0);

  useEffect(() => {
    animation.value = withRepeat(
      withTiming(1, { duration: 1000 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(animation.value, [0, 1], [0.3, 0.7]);
    return { opacity };
  });

  const backgroundColor = isDark ? '#333333' : '#E1E9EE';

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

export const ChatListSkeleton = () => {
  return (
    <View style={styles.listContainer}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={styles.chatRow}>
          <Skeleton width={50} height={50} borderRadius={25} />
          <View style={styles.chatInfo}>
            <Skeleton width="60%" height={16} style={{ marginBottom: 8 }} />
            <Skeleton width="80%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
};

export const FeedSkeleton = () => {
  return (
    <View style={styles.listContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.feedCard}>
          <View style={styles.feedHeader}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Skeleton width="40%" height={14} style={{ marginBottom: 6 }} />
              <Skeleton width="20%" height={10} />
            </View>
          </View>
          <Skeleton width="100%" height={300} borderRadius={0} />
          <View style={styles.feedFooter}>
            <Skeleton width={100} height={20} />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chatInfo: {
    flex: 1,
    marginLeft: 12,
  },
  feedCard: {
    marginBottom: 20,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  feedFooter: {
    padding: 16,
  }
});
