import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useAppTheme } from '@/src/theme/colors';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { apiClient } from '@/src/api/client';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuthStore } from '@/src/store/authStore';
import { useStoryStore } from '@/src/store/storyStore';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export const StoryBar = React.memo(() => {
  const COLORS = useAppTheme();
  const styles = getStyles(COLORS);
  const router = useSafeRouter();
  const { user } = useAuthStore();
  const { stories, fetchStories } = useStoryStore();

  useFocusEffect(
    useCallback(() => {
      // Fetch in background to update cache
      fetchStories(user);
    }, [fetchStories, user])
  );

  const renderItem = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity 
      style={styles.storyItem} 
      onPress={() => {
        if (item._id === 'me' && !item.lastStoryId) {
          router.push('/create-story');
        } else {
          router.push(`/stories/${item.user._id}` as any);
        }
      }}
    >
      <View style={styles.avatarWrapper}>
        {item.hasUnread || (item._id === 'me' && !item.lastStoryId) ? (
          <LinearGradient
            colors={item._id === 'me' && !item.lastStoryId ? [COLORS.border, COLORS.border] : ['#f09433', '#e6683c', '#dc2743', '#cc2366', '#bc1888']}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBorder}
          >
            <View style={styles.whiteBorder}>
              <Image 
                source={{ uri: resolveAvatarUrl(item.user.avatar_url, item.user.username) }} 
                style={styles.avatar} 
                contentFit="cover"
              />
            </View>
          </LinearGradient>
        ) : (
          <View style={[styles.whiteBorder, { borderWidth: 1, borderColor: COLORS.border }]}>
            <Image 
              source={{ uri: resolveAvatarUrl(item.user.avatar_url, item.user.username) }} 
              style={styles.avatar} 
              contentFit="cover"
            />
          </View>
        )}
        {item._id === 'me' && !item.lastStoryId && (
          <View style={styles.addIcon}>
            <Text style={styles.addIconText}>+</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={styles.username}>
        {item._id === 'me' ? 'Your Story' : item.user.username}
      </Text>
    </TouchableOpacity>
  );

  // Always show the bar with at least "Your Story" to prevent layout jumps
  const displayStories = stories.length > 0 ? stories : [
    {
      _id: 'me',
      user: {
        _id: (user?.id || user?._id)?.toString() || 'me',
        username: 'Your Story',
        avatar_url: user?.avatar_url || user?.avatar,
      },
      hasUnread: false,
      lastStoryId: '',
    }
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        directionalLockEnabled={true}
      >
        {displayStories.map((story: any, index: number) => (
          <View key={story._id || index}>
            {renderItem({ item: story, index })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

const getStyles = (COLORS: any) => StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: 12,
  },
  storyItem: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 80,
  },
  avatarWrapper: {
    position: 'relative',
    width: 76,
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientBorder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteBorder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
  },
  username: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.text,
    textAlign: 'center',
    width: '100%',
  },
  addIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: COLORS.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addIconText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: -2,
  },
});
