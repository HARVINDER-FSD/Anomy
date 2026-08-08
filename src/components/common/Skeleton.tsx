import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: any;
}

export const Skeleton = ({ width, height, borderRadius = 8, style }: SkeletonProps) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-Dimensions.get('window').width, Dimensions.get('window').width],
  });

  return (
    <View 
      style={[
        styles.skeleton, 
        { width, height, borderRadius }, 
        style
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255, 255, 255, 0.5)', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </Animated.View>
    </View>
  );
};

export const PostSkeleton = () => (
  <View style={styles.postSkeleton}>
    <View style={styles.header}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={styles.headerText}>
        <Skeleton width={120} height={12} borderRadius={6} />
        <Skeleton width={80} height={10} borderRadius={5} style={{ marginTop: 6 }} />
      </View>
    </View>
    <Skeleton width="100%" height={300} borderRadius={20} style={{ marginTop: 15 }} />
    <View style={styles.footer}>
      <Skeleton width={60} height={20} borderRadius={10} />
      <Skeleton width={60} height={20} borderRadius={10} />
      <Skeleton width={40} height={20} borderRadius={10} style={{ marginLeft: 'auto' }} />
    </View>
  </View>
);

export const ProfileSkeleton = () => (
  <View style={styles.profileContainer}>
    <View style={styles.profileHeader}>
       <Skeleton width={100} height={100} borderRadius={50} />
       <Skeleton width={150} height={20} borderRadius={10} style={{ marginTop: 15 }} />
       <Skeleton width={100} height={14} borderRadius={7} style={{ marginTop: 8 }} />
    </View>
    <View style={styles.statsRow}>
       <Skeleton width={60} height={40} borderRadius={10} />
       <Skeleton width={60} height={40} borderRadius={10} />
       <Skeleton width={60} height={40} borderRadius={10} />
    </View>
    <View style={styles.grid}>
       {[1, 2, 3, 4, 5, 6].map((i) => (
         <Skeleton key={i} width={(Dimensions.get('window').width / 3) - 10} height={120} style={{ margin: 5 }} />
       ))}
    </View>
  </View>
);

export const ListSkeleton = () => (
  <View style={{ gap: 12 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Skeleton width={50} height={50} borderRadius={25} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="60%" height={14} borderRadius={7} />
          <Skeleton width="40%" height={10} borderRadius={5} />
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#EEEEEE',
    overflow: 'hidden',
  },
  postSkeleton: {
    padding: 15,
    backgroundColor: '#FFF',
    marginBottom: 15,
    borderRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: 12,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 15,
    gap: 10,
  },
  profileContainer: {
    padding: 20,
    alignItems: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  }
});
