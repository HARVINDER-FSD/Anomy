import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Image 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/src/theme/colors';
import { apiClient } from '@/src/api/client';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { useAuthStore } from '@/src/store/authStore';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';


export default function PremiumScreen() {
  const router = useSafeRouter();
  const { user, setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState('blue');

  const badges = [
    { type: 'blue', name: 'Blue Verified', color: '#3498db', desc: 'For public figures and creators' },
    { type: 'gold', name: 'Gold Business', color: '#f1c40f', desc: 'For businesses and organizations' },
    { type: 'green', name: 'Green Media', color: '#2ecc71', desc: 'For news and media entities' },
    { type: 'purple', name: 'Purple VIP', color: '#9b59b6', desc: 'Exclusive for premium developers' },
  ];

  const handleApply = async () => {
    setLoading(true);
    try {
      // Logic: In a real app, this would open a payment gateway
      // Here we simulate the payment verification and badge assignment
      const res = await apiClient.post('/verification/verify-payment', {
        badgeType: selectedBadge,
        paymentId: 'mock_payment_' + Date.now(),
        orderId: 'mock_order_' + Date.now()
      });

      if (res.data.success) {
        if (user) {
          setAuth({ 
            ...user, 
            is_verified: true, 
            badge_type: selectedBadge 
          }, useAuthStore.getState().token || '');
        }
        Alert.alert("Success! 🎉", `Your account is now verified with the ${selectedBadge} badge!`);
        router.back();
      }
    } catch (error) {
      Alert.alert("Error", "Failed to complete verification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium Verification</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.welcomeBox}>
          <LinearGradient 
            colors={[COLORS.primary, COLORS.secondary]} 
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
             <MaterialCommunityIcons name="star-circle" size={50} color={COLORS.white} />
             <Text style={styles.welcomeTitle}>AnuFy Premium</Text>
             <Text style={styles.welcomeSub}>Stand out from the crowd with unique badges</Text>
          </LinearGradient>
        </View>

        <Text style={styles.sectionTitle}>Choose Your Badge</Text>
        <View style={styles.badgeList}>
          {badges.map((badge) => (
            <TouchableOpacity 
              key={badge.type} 
              style={[
                styles.badgeCard, 
                selectedBadge === badge.type && { borderColor: badge.color, borderWidth: 2 }
              ]}
              onPress={() => setSelectedBadge(badge.type)}
            >
              <View style={[styles.badgeIcon, { backgroundColor: badge.color }]}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
              </View>
              <View style={styles.badgeInfo}>
                <Text style={styles.badgeName}>{badge.name}</Text>
                <Text style={styles.badgeDesc}>{badge.desc}</Text>
              </View>
              {selectedBadge === badge.type && (
                <Ionicons name="radio-button-on" size={20} color={badge.color} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.perksBox}>
           <Text style={styles.perksTitle}>Premium Perks:</Text>

           <View style={styles.perkItem}>
             <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} />
             <Text style={styles.perkText}>Priority support & blue/gold/custom ticks</Text>
           </View>
           <View style={styles.perkItem}>
             <Ionicons name="flash" size={18} color={COLORS.primary} />
             <Text style={styles.perkText}>Exclusive early access to new features</Text>
           </View>
        </View>

        <TouchableOpacity 
          style={[styles.applyBtn, { backgroundColor: COLORS.primary }]} 
          onPress={handleApply}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.applyBtnText}>Get Verified Now — ₹99/mo</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border 
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, fontFamily: 'Outfit_500Medium' },
  content: { padding: 20 },
  
  welcomeBox: { borderRadius: 20, overflow: 'hidden', marginBottom: 25 },
  gradient: { padding: 30, alignItems: 'center' },
  welcomeTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.white, marginTop: 10, fontFamily: 'Outfit_700Bold' },
  welcomeSub: { fontSize: 14, color: COLORS.white, opacity: 0.8, textAlign: 'center', marginTop: 5 },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 15, fontFamily: 'Outfit_600SemiBold' },
  badgeList: { gap: 12 },
  badgeCard: { 
    flexDirection: 'row', alignItems: 'center', padding: 15, 
    borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border
  },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  badgeInfo: { flex: 1 },
  badgeName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  badgeDesc: { fontSize: 12, color: COLORS.subtitle, marginTop: 2 },

  perksBox: { marginTop: 30, backgroundColor: COLORS.surface, padding: 20, borderRadius: 20 },
  perksTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 10 },
  perkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  perkText: { fontSize: 13, color: COLORS.subtitle },

  applyBtn: { 
    marginTop: 30, paddingVertical: 18, borderRadius: 30, 
    alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5, marginBottom: 40
  },
  applyBtnText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' }
});
