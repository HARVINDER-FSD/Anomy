import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { moderateScale, moderateFont, verticalScale, scale } from '@/src/utils/responsive';

interface PrivacyWarningOverlayProps {
  isVisible: boolean;
  onAccept: () => void;
  personaName: string;
}

export const PrivacyWarningOverlay: React.FC<PrivacyWarningOverlayProps> = ({ isVisible, onAccept, personaName }) => {
  return (
    <Modal transparent visible={isVisible} animationType="fade">
      <View style={styles.overlay}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark-outline" size={60} color={COLORS.secondary} />
          </View>
          
          <Text style={styles.title}>Entering Anonymous Zone</Text>
          <Text style={styles.subtitle}>
            Your identity is now hidden. You are now known as:
          </Text>
          
          <View style={styles.personaBox}>
            <Text style={styles.personaName}>{personaName}</Text>
          </View>
          
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <Ionicons name="eye-off-outline" size={20} color="#FFF" />
              <Text style={styles.infoText}>Interactions aren't linked to your profile.</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="trash-outline" size={20} color="#FFF" />
              <Text style={styles.infoText}>Anonymous chats are wiped on exit.</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="flash-outline" size={20} color="#FFF" />
              <Text style={styles.infoText}>Step into the shadows safely.</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.button} onPress={onAccept}>
            <Text style={styles.buttonText}>Got it, let's go!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: moderateScale(20),
  },
  content: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: moderateScale(30),
    padding: moderateScale(30),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  iconContainer: {
    marginBottom: verticalScale(20),
  },
  title: {
    fontSize: moderateFont(24),
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: verticalScale(10),
  },
  subtitle: {
    fontSize: moderateFont(16),
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: verticalScale(20),
  },
  personaBox: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(15),
    marginBottom: verticalScale(30),
  },
  personaName: {
    fontSize: moderateFont(20),
    fontWeight: 'bold',
    color: '#FFF',
  },
  infoList: {
    width: '100%',
    marginBottom: verticalScale(30),
    gap: verticalScale(15),
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  infoText: {
    fontSize: moderateFont(14),
    color: '#FFF',
  },
  button: {
    width: '100%',
    backgroundColor: '#FFF',
    paddingVertical: verticalScale(16),
    borderRadius: moderateScale(15),
    alignItems: 'center',
  },
  buttonText: {
    fontSize: moderateFont(16),
    fontWeight: 'bold',
    color: '#000',
  },
});
