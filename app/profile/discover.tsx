import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, SafeAreaView, ActivityIndicator, Alert, Platform, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { FollowButton } from '@/src/components/common/FollowButton';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import * as Haptics from 'expo-haptics';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import * as Contacts from 'expo-contacts';
import { useAuthStore } from '@/src/store/authStore';
import { useFollowStatus } from '@/src/hooks/useFollowStatus';

import { COUNTRY_CODES } from '@/src/constants/countryCodes';

function DiscoverFollowButton({ targetUserId, initialState, styles }: { targetUserId: string; initialState?: any; styles: any }) {
  const { toggleFollow, isLoading } = useFollowStatus(targetUserId, initialState);
  return (
    <FollowButton
      targetUserId={targetUserId}
      onToggle={toggleFollow}
      isLoading={isLoading}
      variant="primary"
      size="sm"
      style={styles.capsuleBtnPrimary}
      textStyle={styles.capsuleBtnTextPrimary}
    />
  );
}

export default function DiscoverContactsScreen() {
  const router = useSafeRouter();
  const currentUser = useAuthStore(state => state.user);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const [manualNumber, setManualNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0].code);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchingManual, setSearchingManual] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        setPermissionGranted(true);
        fetchAndSyncContacts();
      }
    })();
  }, []);

  const fetchAndSyncContacts = async () => {
    setLoading(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });
      
      const phones: string[] = [];
      if (data && data.length > 0) {
        for (const contact of data) {
          if (contact.phoneNumbers) {
            for (const phone of contact.phoneNumbers) {
              if (phone.number) phones.push(phone.number);
            }
          }
        }
      }
      
      if (phones.length > 0) {
        const response = await apiClient.post('/users/sync-contacts', { contacts: phones });
        const allUsers = response.data?.users || [];
        
        const filteredUsers = allUsers;
        
        setUsers(filteredUsers);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sync contacts.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = async () => {
    if (!manualNumber.trim()) return;
    setSearchingManual(true);
    try {
      // Combine country code with phone number
      const fullNumber = `${countryCode}${manualNumber.trim()}`;
      const response = await apiClient.post('/users/sync-contacts', { contacts: [fullNumber] });
      const newUsers = response.data?.users || [];
      const filteredUsers = newUsers;
      
      if (filteredUsers.length === 0) {
        if (newUsers.length > 0) {
          Alert.alert('Not Found', 'This is your own number or user not found.');
        } else {
          Alert.alert('Not Found', 'No user found with this number. Make sure the number is registered on AnuFy with the correct country code.');
        }
      } else {
        // Add new users to the top of the list if they are not already there
        setUsers(prev => {
          const combined = [...filteredUsers, ...prev];
          const unique = Array.from(new Map(combined.map(item => [item._id || item.id, item])).values());
          return unique;
        });
        setManualNumber('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not search number. Please try again.');
    } finally {
      setSearchingManual(false);
    }
  };

  const renderUser = ({ item }: { item: any }) => {
    const userId = item._id || item.id;
    const { isFollowing, isPending, isLoading, toggleFollow } = useFollowStatus(userId, {
      isFollowing: !!item.is_following,
    });
    const isFollowed = isFollowing || isPending;
    const isSelf = String(userId) === String(currentUser?._id || currentUser?.id);

    return (
      <View style={styles.userItem}>
        <View style={styles.userPressableArea}>
          <Image
            source={{ uri: resolveAvatarUrl(item.profileImage || item.avatar_url || item.avatar, item.username) }}
            style={styles.avatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.usernameText} numberOfLines={1}>
              {item.username}
            </Text>
            <Text style={styles.fullNameText} numberOfLines={1}>
              {item.full_name || item.fullName || item.username}
            </Text>
          </View>
        </View>

        {isSelf ? (
          <View style={[styles.capsuleBtnPrimary, { backgroundColor: COLORS.border }]}>
            <Text style={styles.capsuleBtnTextPrimary}>You</Text>
          </View>
        ) : (
          <DiscoverFollowButton
            targetUserId={userId}
            initialState={{ isFollowing: !!item.is_following }}
            styles={styles}
          />
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discover People</Text>
        <View style={{ width: 26 }} />
      </View>
      
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="call-outline" size={18} color="#8E8E93" style={styles.searchIcon} />
          
          <TouchableOpacity 
            style={styles.countrySelector}
            onPress={() => setShowCountryPicker(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.countrySelectorText}>
              {selectedCountry.flag} {selectedCountry.code}
            </Text>
            <Ionicons name="chevron-down" size={12} color={COLORS.subtitle} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <TextInput
            style={styles.searchInput}
            placeholder="Phone number..."
            placeholderTextColor="#8E8E93"
            keyboardType="phone-pad"
            value={manualNumber}
            onChangeText={setManualNumber}
            onSubmitEditing={handleManualSearch}
            returnKeyType="search"
          />
          {searchingManual ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <TouchableOpacity onPress={handleManualSearch} disabled={!manualNumber.trim()} style={{ padding: 4, opacity: manualNumber.trim() ? 1 : 0.5 }}>
              <Ionicons name="search-outline" size={20} color={COLORS.text} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.helperText}>Enter country code (e.g., +91, +1, +44) followed by phone number</Text>
      </View>

      {!permissionGranted && users.length === 0 ? (
        <View style={styles.centerNode}>
          <Ionicons name="people-outline" size={60} color={COLORS.border} />
          <Text style={styles.emptyText}>Contacts permission is required.</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={async () => {
             const { status } = await Contacts.requestPermissionsAsync();
             if (status === 'granted') {
               setPermissionGranted(true);
               fetchAndSyncContacts();
             } else {
               Alert.alert('Permission denied', 'Please enable contacts permission in your settings.');
             }
          }}>
            <Text style={styles.permissionBtnText}>Enable Permission</Text>
          </TouchableOpacity>
        </View>
      ) : loading && users.length === 0 ? (
        <View style={styles.centerNode}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={{ marginTop: 10, color: COLORS.subtitle }}>Syncing contacts...</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id || item._id}
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centerNode}>
              <Ionicons name="search-outline" size={60} color={COLORS.border} />
              <Text style={styles.emptyText}>No matching users found.</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCountryPicker(false)}>
          <View style={styles.countryPickerContainer}>
            <View style={styles.countryPickerHeader}>
              <Text style={styles.countryPickerTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(_, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.countryItem}
                  onPress={() => {
                    setSelectedCountry(item);
                    setCountryCode(item.code);
                    setShowCountryPicker(false);
                  }}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryDialCode}>{item.code}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: scale(20), paddingBottom: verticalScale(12),
    paddingTop: Platform.OS === 'ios' ? verticalScale(55) : verticalScale(50),
    backgroundColor: COLORS.background
  },
  headerTitle: { fontSize: moderateFont(18), fontWeight: '700', color: COLORS.text },
  searchContainer: {
    paddingHorizontal: scale(20),
    paddingBottom: verticalScale(10),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    height: verticalScale(42),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: scale(8),
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingVertical: 0,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingRight: scale(8),
    marginRight: scale(8),
  },
  countrySelectorText: {
    fontSize: moderateFont(14),
    color: COLORS.text,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateFont(14),
    color: COLORS.text,
    height: '100%',
    paddingVertical: 0,
  },
  helperText: {
    fontSize: moderateFont(11),
    color: COLORS.subtitle,
    marginTop: verticalScale(6),
    paddingHorizontal: scale(4),
  },
  centerNode: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: verticalScale(50) },
  listContent: { paddingHorizontal: scale(20), paddingTop: scale(10) },
  emptyText: { color: COLORS.subtitle, marginTop: verticalScale(15), fontSize: moderateFont(16) },
  permissionBtn: {
    marginTop: 20, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#3858F6', borderRadius: 8
  },
  permissionBtnText: { color: '#FFF', fontWeight: 'bold' },
  userItem: {
    flexDirection: 'row', alignItems: 'center', marginVertical: verticalScale(8), width: '100%',
  },
  userPressableArea: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: scale(48), height: scale(48), borderRadius: scale(24), backgroundColor: COLORS.surface, marginRight: scale(12) },
  userInfo: { flex: 1, justifyContent: 'center' },
  usernameText: { fontSize: moderateFont(14), fontWeight: '700', color: COLORS.text },
  fullNameText: { fontSize: moderateFont(14), color: COLORS.subtitle, marginTop: verticalScale(2) },
  capsuleBtnPrimary: {
    backgroundColor: '#3858F6', paddingHorizontal: scale(14), paddingVertical: verticalScale(6),
    borderRadius: moderateScale(8), minWidth: scale(80), alignItems: 'center', justifyContent: 'center',
  },
  capsuleBtnTextPrimary: { fontSize: moderateFont(14), fontWeight: '600', color: '#FFF' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  countryPickerContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '70%',
  },
  countryPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countryPickerTitle: {
    fontSize: moderateFont(16),
    fontWeight: 'bold',
    color: COLORS.text,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  countryFlag: {
    fontSize: 24,
    marginRight: 15,
  },
  countryName: {
    flex: 1,
    fontSize: moderateFont(15),
    color: COLORS.text,
  },
  countryDialCode: {
    fontSize: moderateFont(15),
    color: COLORS.subtitle,
    fontWeight: '600',
  },
});
