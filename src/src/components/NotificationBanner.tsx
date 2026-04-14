import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Animated, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { resolveMediaUrl, resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useRouter } from 'expo-router';

interface NotificationBannerProps {
  notification: any;
  onDismiss: () => void;
}

export const NotificationBanner = ({ notification, onDismiss }: NotificationBannerProps) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const router = useRouter();

  useEffect(() => {
    // Slide in
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Auto dismiss after 4 seconds
    const timer = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, 4000);

    return () => clearTimeout(timer);
  }, [slideAnim, onDismiss]);

  const handlePress = () => {
    const postId = notification.data?.postId || notification.post?.id;
    if (postId) {
      router.push(`/post/${postId}`);
    }
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  const actor = notification.actor || {};
  const actorName = actor.full_name || actor.username || 'Someone';
  const actorAvatar = resolveAvatarUrl(actor.avatar_url, actor.username);
  const postThumbnail = notification.post?.image;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity style={styles.banner} onPress={handlePress} activeOpacity={0.8}>
        <Image source={{ uri: actorAvatar }} style={styles.avatar} />
        
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>
            <Text style={styles.bold}>{actorName}</Text> liked your post
          </Text>
        </View>

        {postThumbnail && (
          <Image
            source={{ uri: resolveMediaUrl(postThumbnail) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        )}

        <TouchableOpacity onPress={() => {
          Animated.timing(slideAnim, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }).start(() => onDismiss());
        }} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={COLORS.subtitle} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  closeBtn: {
    padding: 6,
  },
});
