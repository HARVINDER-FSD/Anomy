import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCall } from '@/src/context/CallContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';

export const IncomingCallModal: React.FC = () => {
  const { callState, acceptCall, rejectCall } = useCall();

  if (!callState.isIncoming) return null;

  return (
    <Modal visible={callState.isIncoming} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.incomingLabel}>Incoming {callState.isVideo ? 'Video' : 'Audio'} Call</Text>
          
          <View style={styles.callerInfo}>
            <Image 
              source={{ uri: resolveAvatarUrl(callState.callerAvatar || '', callState.callerName || 'User') }} 
              style={styles.avatar} 
            />
            <Text style={styles.callerName}>{callState.callerName}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.rejectBtn]} 
              onPress={() => rejectCall()}
            >
              <Ionicons name="close" size={32} color={COLORS.white} />
              <Text style={styles.btnLabel}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.acceptBtn]} 
              onPress={() => acceptCall()}
            >
              <Ionicons name={callState.isVideo ? "videocam" : "call"} size={32} color={COLORS.white} />
              <Text style={styles.btnLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: moderateScale(50),
  },
  incomingLabel: {
    color: COLORS.subtitle,
    fontSize: moderateFont(16),
    fontWeight: '600',
    letterSpacing: 1,
  },
  callerInfo: {
    alignItems: 'center',
    marginTop: moderateScale(40), // Shifted down
  },
  avatar: {
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    marginBottom: moderateScale(20),
    borderWidth: 3,
    borderColor: COLORS.secondary,
  },
  callerName: {
    color: COLORS.white,
    fontSize: moderateFont(28),
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-evenly',
  },
  actionBtn: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: {
    backgroundColor: '#4CAF50',
  },
  rejectBtn: {
    backgroundColor: '#F44336',
  },
  btnLabel: {
    color: COLORS.white,
    fontSize: moderateFont(12),
    marginTop: 5,
    fontWeight: '600',
  }
});
