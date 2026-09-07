import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/colors';
import { useAuthStore } from '@/src/store/authStore';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export default function CloseFriendsScreen() {
  const COLORS = useAppTheme();
  const router = useRouter();
  const { user } = useAuthStore();

  const [followers, setFollowers] = useState<any[]>([]);
  const [closeFriends, setCloseFriends] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFollowersList = async () => {
    try {
      const res = await apiClient.get(`/users/${user?.id}/followers?limit=50`);
      setFollowers(res.data.data || []);
      
      const savedCloseFriends = await AsyncStorage.getItem('@close_friends');
      if (savedCloseFriends) {
        setCloseFriends(JSON.parse(savedCloseFriends));
      }
    } catch (e) {
      setFollowers([
        { id: 'f1', username: 'alex_green', full_name: 'Alex Green' },
        { id: 'f2', username: 'emma_w', full_name: 'Emma Watson' },
        { id: 'f3', username: 'coder_john', full_name: 'John Doe' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowersList();
  }, []);

  const toggleCloseFriend = async (friendId: string) => {
    let updated;
    if (closeFriends.includes(friendId)) {
      updated = closeFriends.filter(id => id !== friendId);
    } else {
      updated = [...closeFriends, friendId];
    }
    setCloseFriends(updated);
    await AsyncStorage.setItem('@close_friends', JSON.stringify(updated));
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
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(16),
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    friendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: verticalScale(12),
      borderBottomWidth: 0.5,
      borderBottomColor: COLORS.border,
    },
    friendInfo: {
      flex: 1,
    },
    friendName: {
      fontWeight: 'bold',
      fontSize: moderateFont(15),
      color: COLORS.text,
    },
    friendUsername: {
      color: COLORS.subtitle,
      fontSize: moderateFont(13),
      marginTop: 2,
    },
    description: {
      fontSize: moderateFont(14),
      color: COLORS.subtitle,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(16),
      lineHeight: moderateFont(20),
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Close Friends</Text>
      </View>

      <Text style={styles.description}>
        Select friends to add them to your Close Friends list. They will see posts and stories shared with close friends. We don't send notifications when you edit your list.
      </Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isClose = closeFriends.includes(item.id);
            return (
              <TouchableOpacity style={styles.friendRow} onPress={() => toggleCloseFriend(item.id)}>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{item.full_name || item.fullName || item.username}</Text>
                  <Text style={styles.friendUsername}>@{item.username}</Text>
                </View>
                <Ionicons 
                  name={isClose ? "star" : "star-outline"} 
                  size={24} 
                  color={isClose ? "#F1C40F" : COLORS.border} 
                />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
