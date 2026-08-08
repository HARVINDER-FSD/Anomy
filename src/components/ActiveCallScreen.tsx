import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCall } from '@/src/context/CallContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { moderateScale, moderateFont } from '@/src/utils/responsive';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { useAuthStore } from '@/src/store/authStore';

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
    callState, startCall, endCall, toggleMute, toggleCamera, switchCamera, toggleSpeaker, isMuted, isCameraOff, isSpeaker
  } = useCall();
  const currentUser = useAuthStore(s => s.user);
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
  }, [callState.status, callState.localStream, callState.remoteStream]);

  const getStreamURL = (stream: any) => {
    if (!stream) {
      return '';
    }
    if (typeof stream.toURL === 'function') {
      const url = stream.toURL();
      return url;
    }
    return stream.id || '';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    if (callState.status === 'calling') return 'Calling...';
    if (callState.status === 'connected') return callState.isVideo ? 'Video Call' : 'Voice Call';
    if (callState.status === 'incoming') return 'Incoming Call...';
    if (callState.status === 'ended') {
      switch (callState.endedReason) {
        case 'offline':
          return 'User is Offline';
        case 'busy':
          return 'User is Busy';
        case 'declined':
          return 'Call Declined';
        case 'no_answer':
          return 'No Answer';
        default:
          return 'Call Ended';
      }
    }
    return 'Voice Call';
  };

  if (callState.status === 'idle' || callState.isIncoming) return null;

  const isVideoCall = callState.isVideo;
  const isConnected = callState.status === 'connected';

  return (
    <Modal visible={callState.isActive || callState.status === 'calling' || callState.status === 'ended'} animationType="fade" transparent={false}>
      <View style={styles.container}>
        {isVideoCall ? (
          /* --- VIDEO CALL LOGIC --- */
          isConnected ? (
            /* --- CONNECTED: 50/50 SPLIT SCREEN --- */
            <>
              {/* Top Half: Remote Video or Avatar */}
              <View style={styles.videoHalf}>
                {callState.remoteStream && !callState.remoteCameraOff ? (
                  <RTCView
                    streamURL={getStreamURL(callState.remoteStream)}
                    style={styles.fullVideo}
                    objectFit="cover"
                  />
                ) : (
                  <View style={styles.audioPlaceholder}>
                    <View style={styles.avatarWrapper}>
                      <Image
                        source={{ uri: resolveAvatarUrl(callState.callerAvatar || '', callState.callerName || 'User') }}
                        style={styles.avatarLarge}
                      />
                      {(callState.remoteMuted || callState.remoteCameraOff) && (
                        <View style={styles.indicatorContainer}>
                          {callState.remoteMuted && <Ionicons name="mic-off" size={20} color="#FF3B30" />}
                          {callState.remoteCameraOff && <Ionicons name="videocam-off" size={20} color="#FF3B30" />}
                        </View>
                      )}
                    </View>
                    <Text style={styles.remoteNameText}>{callState.callerName}</Text>
                  </View>
                )}
              </View>

              {/* Bottom Half: Local Video or Avatar */}
              <View style={[styles.videoHalf, styles.bottomHalf]}>
                {callState.localStream && !isCameraOff ? (
                  <RTCView
                    streamURL={getStreamURL(callState.localStream)}
                    style={styles.fullVideo}
                    objectFit="cover"
                  />
                ) : (
                  <View style={styles.audioPlaceholder}>
                    <View style={styles.avatarWrapper}>
                      <Image
                        source={{ uri: resolveAvatarUrl(currentUser?.avatar_url || '', currentUser?.username || 'Me') }}
                        style={styles.avatarSmall}
                      />
                      {(isMuted || isCameraOff) && (
                        <View style={styles.indicatorContainer}>
                          {isMuted && <Ionicons name="mic-off" size={16} color="#FF3B30" />}
                          {isCameraOff && <Ionicons name="videocam-off" size={16} color="#FF3B30" />}
                        </View>
                      )}
                    </View>
                    <Text style={styles.localNameText}>You</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            /* --- CALLING: SINGLE CENTERED SCREEN (LIKE VOICE) --- */
            <View style={styles.voiceCallContainer}>
              <View style={styles.voiceInfo}>
                <View style={styles.avatarLargeWrapper}>
                  <Image
                    source={{ uri: resolveAvatarUrl(callState.callerAvatar || '', callState.callerName || 'User') }}
                    style={styles.avatarExtraLarge}
                  />
                </View>
                <Text style={styles.voiceCallerName}>{callState.callerName}</Text>
                <Text style={styles.voiceStatusText}>
                  {getStatusText()}
                </Text>
                <Text style={styles.videoIndicatorText}>Video Call</Text>
              </View>
            </View>
          )
        ) : (
          /* --- VOICE CALL: SINGLE CENTERED SCREEN --- */
          <View style={styles.voiceCallContainer}>
            <View style={styles.voiceInfo}>
              <View style={styles.avatarLargeWrapper}>
                <Image
                  source={{ uri: resolveAvatarUrl(callState.callerAvatar || '', callState.callerName || 'User') }}
                  style={styles.avatarExtraLarge}
                />
                {isMuted && (
                  <View style={styles.voiceIndicator}>
                    <Ionicons name="mic-off" size={24} color="#FF3B30" />
                  </View>
                )}
              </View>
              <Text style={styles.voiceCallerName}>{callState.callerName}</Text>
              <Text style={styles.voiceStatusText}>
                {getStatusText()}
              </Text>
            </View>
          </View>
        )}

        {/* Hidden RTCView to force remote voice/audio playback on audio-only calls */}
        {!isVideoCall && isConnected && callState.remoteStream && (
          <RTCView
            streamURL={getStreamURL(callState.remoteStream)}
            style={{ width: 0, height: 0, position: 'absolute', opacity: 0 }}
          />
        )}

        {/* Floating Controls Overlay */}
        <SafeAreaView style={styles.overlayControls}>
          <View style={styles.timerContainer}>
            {callState.status === 'connected' && (
              <Text style={styles.timerText}>{formatTime(timer)}</Text>
            )}
          </View>

          <View style={styles.controlsRow}>
            {callState.status === 'ended' ? (
              /* --- ENDED STATE: CALL AGAIN / CLOSE BUTTONS --- */
              <>
                <TouchableOpacity
                  style={[styles.controlBtn, { backgroundColor: '#34C759', width: 64, height: 64, borderRadius: 32 }]}
                  onPress={() => {
                    const rId = callState.targetUserId || callState.callerId || '';
                    if (rId) {
                      startCall(rId, callState.callerName || 'User', callState.callerAvatar || '', callState.isVideo);
                    }
                  }}
                >
                  <Ionicons name="call" size={28} color="#FFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.controlBtn, { backgroundColor: '#FF3B30', width: 64, height: 64, borderRadius: 32 }]}
                  onPress={endCall}
                >
                  <Ionicons name="close" size={28} color="#FFF" />
                </TouchableOpacity>
              </>
            ) : (
              /* --- ACTIVE CALL CONTROLS --- */
              <>
                {isVideoCall && (
                  <TouchableOpacity style={styles.controlBtn} onPress={switchCamera}>
                    <Ionicons name="camera-reverse" size={26} color={COLORS.white} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.controlBtn, isMuted && styles.activeControlBtn]}
                  onPress={toggleMute}
                >
                  <Ionicons name={isMuted ? "mic-off" : "mic"} size={26} color={COLORS.white} />
                </TouchableOpacity>

                {/* 🔊 Speakerphone Button */}
                <TouchableOpacity
                  style={[styles.controlBtn, isSpeaker && { backgroundColor: '#FFF' }]}
                  onPress={toggleSpeaker}
                >
                  <Ionicons name="volume-high" size={26} color={isSpeaker ? '#000' : COLORS.white} />
                </TouchableOpacity>

                {isVideoCall && (
                  <TouchableOpacity
                    style={[styles.controlBtn, isCameraOff && styles.activeControlBtn]}
                    onPress={toggleCamera}
                  >
                    <Ionicons name={isCameraOff ? "videocam-off" : "videocam"} size={26} color={COLORS.white} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.controlBtn, styles.endCallBtn]}
                  onPress={endCall}
                >
                  <Ionicons name="call" size={30} color={COLORS.white} style={{ transform: [{ rotate: '135deg' }] }} />
                </TouchableOpacity>
              </>
            )}
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
  /* Video Call Styles */
  videoHalf: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bottomHalf: {
    borderTopWidth: 2,
    borderTopColor: '#333',
  },
  fullVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  audioPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLarge: {
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: 16,
  },
  avatarSmall: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    borderWidth: 2,
    borderColor: '#666',
    marginBottom: 8,
  },
  avatarWrapper: {
    position: 'relative',
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 8,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  remoteNameText: {
    color: '#FFF',
    fontSize: moderateFont(22),
    fontWeight: '700',
  },
  localNameText: {
    color: '#AAA',
    fontSize: moderateFont(16),
    fontWeight: '500',
  },

  /* Voice Call Styles */
  voiceCallContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceInfo: {
    alignItems: 'center',
    paddingBottom: 100,
  },
  avatarLargeWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  avatarExtraLarge: {
    width: moderateScale(180),
    height: moderateScale(180),
    borderRadius: moderateScale(90),
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  voiceIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  voiceCallerName: {
    color: '#FFF',
    fontSize: moderateFont(32),
    fontWeight: '800',
    marginBottom: 8,
  },
  voiceStatusText: {
    color: COLORS.primary,
    fontSize: moderateFont(18),
    fontWeight: '600',
    letterSpacing: 1,
  },
  videoIndicatorText: {
    color: '#AAA',
    fontSize: moderateFont(14),
    marginTop: 8,
    fontWeight: '500',
  },

  /* Global Overlay Styles */
  overlayControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    alignItems: 'center',
  },
  timerContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  timerText: {
    color: '#FFF',
    fontSize: moderateFont(16),
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 45,
  },
  controlBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeControlBtn: {
    backgroundColor: '#FF3B30',
  },
  endCallBtn: {
    backgroundColor: '#FF3B30',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
});
