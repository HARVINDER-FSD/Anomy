import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCall } from '@/src/context/CallContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { moderateScale, moderateFont } from '@/src/utils/responsive';

// 🚀 Safe RTCView Import
let RTCView: any;
try {
  RTCView = require('react-native-webrtc').RTCView;
} catch {
  RTCView = function MockRTCView() { return null; };
  RTCView.displayName = 'MockRTCView';
}

export const ActiveCallScreen: React.FC = () => {
  const { 
    callState, endCall, toggleMute, toggleCamera, switchCamera, isMuted, isCameraOff 
  } = useCall();
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: any;
    if (callState.status === 'connected') {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [callState.status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (callState.status === 'idle' || callState.isIncoming) return null;

  const isVideoCall = callState.isVideo;

  return (
    <Modal visible={callState.isActive || callState.status === 'calling'} animationType="fade" transparent={false}>
      <View style={styles.container}>
        {/* Remote Video (Full Screen) */}
        {isVideoCall && callState.remoteStream ? (
          <RTCView
            streamURL={callState.remoteStream.toURL() || ''}
            style={styles.remoteVideo}
            objectFit="cover"
          />
        ) : (
          <View style={styles.audioBackground}>
            <Image 
              source={{ uri: `https://ui-avatars.com/api/?name=${callState.callerName || 'U'}&background=random&size=128` }} 
              style={styles.avatar} 
            />
            <Text style={styles.callerName}>{callState.callerName}</Text>
          </View>
        )}

        {/* Local Video (Small Overlay) */}
        {isVideoCall && callState.localStream && !isCameraOff && (
          <View style={styles.localVideoContainer}>
            <RTCView
              streamURL={callState.localStream.toURL() || ''}
              style={styles.localVideo}
              objectFit="cover"
            />
          </View>
        )}

        {/* Header Overlay */}
        <SafeAreaView style={styles.overlayHeader}>
          <View style={styles.headerContent}>
            <Text style={styles.statusText}>
              {callState.status === 'calling' ? 'Calling...' : 'In Call'}
            </Text>
            {callState.status === 'connected' && (
              <Text style={styles.timerText}>{formatTime(timer)}</Text>
            )}
          </View>
        </SafeAreaView>

        {/* Controls Overlay */}
        <SafeAreaView style={styles.overlayControls}>
          <View style={styles.controlsRow}>
            {isVideoCall && (
              <TouchableOpacity style={styles.controlBtn} onPress={switchCamera}>
                <Ionicons name="camera-reverse" size={28} color={COLORS.white} />
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.controlBtn, isMuted && styles.activeControlBtn]} 
              onPress={toggleMute}
            >
              <Ionicons name={isMuted ? "mic-off" : "mic"} size={28} color={COLORS.white} />
            </TouchableOpacity>

            {isVideoCall && (
              <TouchableOpacity 
                style={[styles.controlBtn, isCameraOff && styles.activeControlBtn]} 
                onPress={toggleCamera}
              >
                <Ionicons name={isCameraOff ? "videocam-off" : "videocam"} size={28} color={COLORS.white} />
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.controlBtn, styles.endCallBtn]} 
              onPress={endCall}
            >
              <Ionicons name="call" size={32} color={COLORS.white} style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideo: {
    flex: 1,
  },
  localVideoContainer: {
    position: 'absolute',
    top: moderateScale(100),
    right: moderateScale(20),
    width: moderateScale(100),
    height: moderateScale(150),
    borderRadius: moderateScale(15),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.white,
    backgroundColor: '#222',
  },
  localVideo: {
    flex: 1,
  },
  audioBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  avatar: {
    width: moderateScale(150),
    height: moderateScale(150),
    borderRadius: moderateScale(75),
    marginBottom: moderateScale(30),
    borderWidth: 3,
    borderColor: COLORS.secondary,
  },
  callerName: {
    color: COLORS.white,
    fontSize: moderateFont(32),
    fontWeight: '700',
  },
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: moderateScale(20),
  },
  statusText: {
    color: COLORS.secondary,
    fontSize: moderateFont(18),
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  timerText: {
    color: COLORS.white,
    fontSize: moderateFont(16),
    marginTop: 5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  overlayControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingBottom: moderateScale(50),
    paddingHorizontal: moderateScale(20),
  },
  controlBtn: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: moderateScale(30),
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeControlBtn: {
    backgroundColor: '#F44336',
  },
  endCallBtn: {
    backgroundColor: '#F44336',
    width: moderateScale(70),
    height: moderateScale(70),
    borderRadius: moderateScale(35),
  }
});
