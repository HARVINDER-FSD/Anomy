import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { formatDistanceToNowStrict } from 'date-fns';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';

interface ChatHeaderProps {
  title: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: string;
  isAnonymous: boolean;
  isDisappearing: boolean;
  headerBg: string;
  headerTint: string;
  onBack: () => void;
  onInfo: () => void;
  onAudioCall?: () => void;
  onVideoCall?: () => void;
  onMore?: () => void;
  isNewThread: boolean;
  isDeletedUser?: boolean;
}

export const ChatHeader = React.memo(({
  title,
  avatar,
  isOnline,
  lastSeen,
  isAnonymous,
  isDisappearing,
  headerBg,
  headerTint,
  onBack,
  onInfo,
  onAudioCall,
  onVideoCall,
  onMore,
  isNewThread,
  isDeletedUser,
}: ChatHeaderProps) => {
  const [activeStatus, setActiveStatus] = useState('');

  useEffect(() => {
    const updateStatus = () => {
      if (isDeletedUser) {
        setActiveStatus('AnuFy User');
        return;
      }
      if (isAnonymous) {
        setActiveStatus('Vanish on read');
        return;
      }
      if (isOnline) {
        setActiveStatus('Active now');
        return;
      }
      if (lastSeen) {
        try {
          const date = new Date(lastSeen);
          if (!isNaN(date.getTime())) {
            const timeStr = formatDistanceToNowStrict(date, { addSuffix: false })
              .replace('seconds', 's')
              .replace('second', 's')
              .replace('minutes', 'm')
              .replace('minute', 'm')
              .replace('hours', 'h')
              .replace('hour', 'h')
              .replace('days', 'd')
              .replace('day', 'd')
              .replace('months', 'mo')
              .replace('month', 'mo')
              .replace('years', 'y')
              .replace('year', 'y');
            setActiveStatus(`Active ${timeStr} ago`);
            return;
          }
        } catch { }
      }
      // No last_seen data — show nothing
      setActiveStatus('');
    };

    updateStatus();
    const interval = setInterval(updateStatus, 60000);
    return () => clearInterval(interval);
  }, [isOnline, lastSeen, isAnonymous]);

  return (
    <View style={[styles.header, { backgroundColor: headerBg }]}>
      <Pressable onPress={onBack} hitSlop={15} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={headerTint} />
      </Pressable>
      
      <Pressable 
        style={styles.headerInfoArea} 
        onPress={(!isNewThread && !isDeletedUser) ? onInfo : undefined}
        android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
        disabled={isNewThread || isDeletedUser}
      >
        <View style={styles.avatarContainer}>
          {isDeletedUser ? (
            <View style={[styles.headerAvatar, { backgroundColor: headerBg, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person-remove" size={20} color={COLORS.subtitle} />
            </View>
          ) : (
            <Image source={{ uri: resolveAvatarUrl(avatar, title, isAnonymous) }} style={[styles.headerAvatar, { backgroundColor: headerBg }]} contentFit="cover" transition={200} />
          )}
          {!isAnonymous && isOnline && !isDeletedUser && <View style={[styles.onlineBadge, { borderColor: headerBg }]} />}
        </View>
        
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: headerTint }, isDeletedUser && { color: COLORS.subtitle }]}>
            {isDeletedUser ? 'AnuFy User' : title}
          </Text>
          <Text 
            numberOfLines={1} 
            style={[
              styles.headerSub, 
              { color: (isAnonymous || isDeletedUser) ? '#9CA3AF' : COLORS.subtitle }, 
              !isAnonymous && !isDeletedUser && isOnline && { color: '#10B981', fontWeight: '600' }
            ]}
          >
            {activeStatus}
          </Text>
        </View>
      </Pressable>

      <View style={styles.headerRight}>
        <TouchableOpacity 
          style={styles.iconHit} 
          hitSlop={10} 
          onPress={onAudioCall}
          disabled={!onAudioCall}
        >
          <Ionicons 
            name="call-outline" 
            size={24} 
            color={!onAudioCall ? `${headerTint}40` : headerTint} 
          />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.iconHit} 
          hitSlop={10} 
          onPress={onVideoCall}
          disabled={!onVideoCall}
        >
          <Ionicons 
            name="videocam-outline" 
            size={26} 
            color={!onVideoCall ? `${headerTint}40` : headerTint} 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4, // 🚀 Vertical padding kam kiya uper shift karne ke liye
    // Border and shadow removed for a cleaner look
  },
  backBtn: { 
    padding: 6,
    marginRight: 12, // Increased space between back button and avatar
  },
  headerInfoArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2, 
    paddingRight: 10,
    borderRadius: 8,
    marginLeft: 8, // Shifted further right
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  headerAvatar: {
    width: 34, // Made avatar smaller
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 14, // Made username slightly smaller
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    marginTop: -1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconHit: {
    padding: 6, // 🚀 Padding kam ki compact look ke liye
    marginLeft: 2,
  },
});
