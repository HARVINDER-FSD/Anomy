import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '@/src/lib/socket';
import { useAuthStore } from '@/src/store/authStore';
import { Alert, Vibration, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';

// 🚀 Safe WebRTC Imports
let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let RTCView: any;
let MediaStream: any;
let mediaDevices: any;
let isWebRTCAvailable = false;

try {
  // Try to require the native module
  const WebRTC = require('react-native-webrtc');
  if (WebRTC) {
    RTCPeerConnection = WebRTC.RTCPeerConnection;
    RTCIceCandidate = WebRTC.RTCIceCandidate;
    RTCSessionDescription = WebRTC.RTCSessionDescription;
    RTCView = WebRTC.RTCView;
    MediaStream = WebRTC.MediaStream;
    mediaDevices = WebRTC.mediaDevices;
    isWebRTCAvailable = !!RTCPeerConnection;
  }
} catch (e) {
}

// Fallbacks for Development / Expo Go
if (!isWebRTCAvailable) {
  RTCPeerConnection = class MockPC {
    onicecandidate = null;
    onaddstream = null;
    addTrack() {}
    createOffer() { return Promise.resolve({ sdp: 'mock-sdp', type: 'offer' }); }
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { return Promise.resolve(); }
    createAnswer() { return Promise.resolve({ sdp: 'mock-sdp', type: 'answer' }); }
    addIceCandidate() { return Promise.resolve(); }
    close() {}
  };
  RTCIceCandidate = class {};
  RTCSessionDescription = class {};
  RTCView = ({ children }: any) => <>{children}</>;
  MediaStream = class {
    getTracks() { return [{ stop: () => {} }]; }
    getAudioTracks() { return [{ enabled: true }]; }
    getVideoTracks() { return [{ enabled: true, _switchCamera: () => {} }]; }
    toURL() { return 'mock-url'; }
  };
  mediaDevices = {
    getUserMedia: async () => {
      return new MediaStream();
    },
    enumerateDevices: () => Promise.resolve([{ kind: 'videoinput' }, { kind: 'audioinput' }])
  };
}

interface ExtendedMediaStream {
  getTracks(): any[];
  getAudioTracks(): any[];
  getVideoTracks(): any[];
  toURL(): string;
}

interface CallState {
  isActive: boolean;
  isIncoming: boolean;
  isVideo: boolean;
  callerId: string | null;
  callerName: string | null;
  callerAvatar: string | null;
  callId: string | null;
  targetUserId: string | null;
  status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
  localStream: ExtendedMediaStream | null;
  remoteStream: ExtendedMediaStream | null;
  offer: any | null;
  remoteCameraOff: boolean;
  remoteMuted: boolean;
  isSpeaker?: boolean;
  endedReason?: string | null;
}

interface CallContextType {
  callState: CallState;
  startCall: (recipientId: string, recipientName: string, recipientAvatar: string, isVideo: boolean) => void;
  acceptCall: () => void;
  rejectCall: (reason?: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  toggleSpeaker: () => void;
  isMuted: boolean;
  isCameraOff: boolean;
  isSpeaker: boolean;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const configuration = {
  iceServers: [
    // Google STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Additional STUN servers
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun1.l.google.com:19305' },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: currentUser } = useAuthStore();
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isIncoming: false,
    isVideo: false,
    callerId: null,
    callerName: null,
    callerAvatar: null,
    callId: null,
    targetUserId: null,
    status: 'idle',
    localStream: null,
    remoteStream: null,
    offer: null,
    remoteCameraOff: false,
    remoteMuted: false,
    isSpeaker: false,
    endedReason: null,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  const pc = useRef<any>(null); // Using any for WebRTC classes to avoid complex type issues with mocks
  const localStreamRef = useRef<any>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStateRef = useRef<CallState>(callState);
  const iceCandidatesQueue = useRef<any[]>([]);
  const isRemoteDescriptionSet = useRef<boolean>(false);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);
  const currentCallRef = useRef<{
    userId: string;
    username: string;
    avatar: string;
    direction: 'incoming' | 'outgoing';
    type: 'voice' | 'video';
    connectTime: number | null;
    status: 'connected' | 'missed' | 'declined' | 'no_answer';
  } | null>(null);

  useEffect(() => {
    // Load call logs from AsyncStorage on startup
    const { useCallHistoryStore } = require('@/src/store/callHistoryStore');
    useCallHistoryStore.getState().loadCallLogs().catch(() => {});
  }, []);

  const saveCallLog = () => {
    const call = currentCallRef.current;
    if (call) {
      const duration = call.connectTime ? Math.round((Date.now() - call.connectTime) / 1000) : 0;
      const finalStatus = duration > 0 ? 'connected' : call.status;
      
      const { useCallHistoryStore } = require('@/src/store/callHistoryStore');
      useCallHistoryStore.getState().addCallLog({
        userId: call.userId,
        username: call.username,
        avatar: call.avatar,
        duration,
        type: call.type,
        direction: call.direction,
        status: finalStatus,
      }).catch(() => {});
      
      currentCallRef.current = null;
    }
  };

  const cleanupCall = () => {
    iceCandidatesQueue.current = [];
    isRemoteDescriptionSet.current = false;
    saveCallLog();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    stopSound();
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      localStreamRef.current = null;
    }
    setCallState({
      isActive: false,
      isIncoming: false,
      isVideo: false,
      callerId: null,
      callerName: null,
      callerAvatar: null,
      callId: null,
      targetUserId: null,
      status: 'idle',
      localStream: null,
      remoteStream: null,
      offer: null,
      remoteCameraOff: false,
      remoteMuted: false,
      isSpeaker: false,
      endedReason: null,
    });
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSpeaker(false);
    if (Platform.OS !== 'web') {
      Vibration.cancel();
      Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: true, // Default to earpiece
      }).catch(() => {});
    }
  };

  const handleCallEnded = useCallback(async (reason: string | null = null) => {
    iceCandidatesQueue.current = [];
    isRemoteDescriptionSet.current = false;
    saveCallLog();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    await stopSound();
    if (pc.current) {
      try { pc.current.close(); } catch (_) {}
      pc.current = null;
    }
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      } catch (_) {}
      localStreamRef.current = null;
    }
    setCallState(prev => {
      // If we were just receiving an incoming call and it was cancelled/ended, transition to idle immediately
      if (prev.status === 'incoming' || prev.status === 'idle') {
        return {
          ...prev,
          isActive: false,
          isIncoming: false,
          status: 'idle',
          localStream: null,
          remoteStream: null,
          endedReason: null
        };
      }
      // If the caller cancelled the call themselves while calling, go to idle immediately
      if (prev.status === 'calling' && (reason === 'ended' || reason === 'cancelled')) {
        return {
          ...prev,
          isActive: false,
          isIncoming: false,
          status: 'idle',
          localStream: null,
          remoteStream: null,
          endedReason: null
        };
      }
      // Otherwise, show the ended screen
      return {
        ...prev,
        status: 'ended',
        localStream: null,
        remoteStream: null,
        endedReason: reason
      };
    });
    if (Platform.OS !== 'web') Vibration.cancel();
  }, []);

  const playSound = async (type: 'ringtone' | 'calling') => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          playThroughEarpieceAndroid: type === 'calling', // Calling plays in earpiece, ringtone plays in speaker
        }).catch(() => {});
      }
      
      let soundAsset;
      if (type === 'ringtone') {
        soundAsset = require('@/assets/sounds/ringtone.mp3');
      } else {
        soundAsset = require('@/assets/sounds/calling.mp3');
      }

      const { sound } = await Audio.Sound.createAsync(soundAsset, { isLooping: true });
      soundRef.current = sound;
      await sound.playAsync();
    } catch (e) {
    }
  };

  const stopSound = async () => {
    try {
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
        } catch (e) {
        }
        try {
          await soundRef.current.unloadAsync();
        } catch (e) {
        }
        soundRef.current = null;
      }
      // Also cancel vibration
      if (Platform.OS !== 'web') {
        Vibration.cancel();
      }
    } catch (e) {
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    const attachListeners = () => {
      if (!socketService.socket) return;

      socketService.socket.off('call:incoming');
      socketService.socket.off('call:accepted');
      socketService.socket.off('call:rejected');
      socketService.socket.off('call:ended');
      socketService.socket.off('call:end');
      socketService.socket.off('call:offer');
      socketService.socket.off('call:answer');
      socketService.socket.off('call:ice-candidate');
      socketService.socket.off('call:toggle-audio');
      socketService.socket.off('call:toggle-video');
      socketService.socket.off('call:user_offline');

      socketService.socket.on('call:incoming', async (data: { callerId: string; callerName: string; callerAvatar: string; isVideo: boolean }) => {
        currentCallRef.current = {
          userId: data.callerId,
          username: data.callerName || 'Unknown User',
          avatar: data.callerAvatar || '',
          direction: 'incoming',
          type: data.isVideo ? 'video' : 'voice',
          connectTime: null,
          status: 'missed',
        };

        setCallState(prev => ({
          ...prev,
          isIncoming: true,
          isVideo: data.isVideo,
          callerId: data.callerId,
          callerName: data.callerName || 'Unknown User',
          callerAvatar: data.callerAvatar,
          targetUserId: data.callerId,
          status: 'incoming',
        }));
        playSound('ringtone');
        if (Platform.OS !== 'web') {
          Vibration.vibrate([500, 1000, 500, 1000], true);
        }
      });

      socketService.socket.on('call:accepted', async (data: { acceptorId: string }) => {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        await stopSound();
        // Now that call is accepted, the caller sends the offer
        if (pc.current) {
          try {
            const offer = await pc.current.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: callState.isVideo,
            });
            await pc.current.setLocalDescription(offer);
            
            socketService.socket?.emit('call:offer', {
              targetUserId: data.acceptorId,
              sdp: pc.current.localDescription,
            });
            
            if (currentCallRef.current) {
              currentCallRef.current.connectTime = Date.now();
              currentCallRef.current.status = 'connected';
            }

            const defaultSpeaker = callState.isVideo;
            setIsSpeaker(defaultSpeaker);
            await setCallAudioMode(callState.isVideo, defaultSpeaker);
            
            setCallState(prev => ({ 
              ...prev, 
              status: 'connected', 
              isActive: true,
              isSpeaker: defaultSpeaker
            }));
          } catch (e) {
          }
        }
      });

      socketService.socket.on('call:offer', async (data: { senderId: string; sdp: any }) => {
        if (pc.current) {
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            isRemoteDescriptionSet.current = true;
            
            // Process queued candidates
            for (const candidate of iceCandidatesQueue.current) {
              try {
                await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (candidateErr) {
              }
            }
            iceCandidatesQueue.current = [];

            // If we are the one receiving the offer, we must send an answer
            if (callStateRef.current.status === 'connected' || callStateRef.current.status === 'incoming') {
              const answer = await pc.current.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: callState.isVideo,
              });
              await pc.current.setLocalDescription(answer);
              
              socketService.socket?.emit('call:answer', {
                targetUserId: data.senderId,
                sdp: pc.current.localDescription,
              });
            }
          } catch (e) {
          }
        }
      });

      socketService.socket.on('call:answer', async (data: { senderId: string; sdp: any }) => {
        if (pc.current) {
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            isRemoteDescriptionSet.current = true;
            
            // Process queued candidates
            for (const candidate of iceCandidatesQueue.current) {
              try {
                await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (candidateErr) {
              }
            }
            iceCandidatesQueue.current = [];
          } catch (e) {
          }
        }
      });

      socketService.socket.on('call:ice-candidate', async (data: { senderId: string; candidate: any }) => {
        if (pc.current && data.candidate) {
          try {
            if (isRemoteDescriptionSet.current) {
              await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
              iceCandidatesQueue.current.push(data.candidate);
            }
          } catch (e) {
          }
        } else {
        }
      });



      socketService.socket.on('call:rejected', async (data: { responderId: string; reason: string }) => {
        await stopSound();
        await handleCallEnded(data.reason === 'busy' ? 'busy' : 'declined');
      });

      socketService.socket.on('call:user_offline', async () => {
        await stopSound();
        await handleCallEnded('offline');
      });

      socketService.socket.on('call:toggle-audio', (data: { isMuted: boolean }) => {
        setCallState(prev => ({ ...prev, remoteMuted: data.isMuted }));
      });

      socketService.socket.on('call:toggle-video', (data: { isCameraOff: boolean }) => {
        setCallState(prev => ({ ...prev, remoteCameraOff: data.isCameraOff }));
      });

      socketService.socket.on('call:end', async () => {
        await handleCallEnded('ended');
      });

      socketService.socket.on('call:ended', async () => {
        await handleCallEnded('ended');
      });
    };

    // Attach now if connected
    attachListeners();

    // Re-attach on every reconnect
    socketService.socket?.on('connect', attachListeners);

    return () => {
      socketService.socket?.off('connect', attachListeners);
      socketService.socket?.off('call:incoming');
      socketService.socket?.off('call:accepted');
      socketService.socket?.off('call:rejected');
      socketService.socket?.off('call:ended');
      socketService.socket?.off('call:end');
      socketService.socket?.off('call:offer');
      socketService.socket?.off('call:answer');
      socketService.socket?.off('call:ice-candidate');
      socketService.socket?.off('call:user_offline');
    };
  }, [currentUser, handleCallEnded]);

  const setCallAudioMode = async (isVideo: boolean, useSpeaker: boolean) => {
    if (Platform.OS === 'web') return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false, // Always use speaker for calls
        shouldDuckAndroid: false,
      });
      
      // Small delay to ensure audio mode is applied
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Ensure local audio track is enabled
      if (localStreamRef.current) {
        const audioTracks = localStreamRef.current.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks[0].enabled = true;
        }
      }
    } catch (e) {
    }
  };

  const requestPermissions = async (isVideo: boolean) => {
    try {
      
      // Request audio permission
      const { status: audioStatus } = await Audio.requestPermissionsAsync();
      if (audioStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Microphone permission is required for calls. Please enable it in your device settings.',
          [{ text: 'OK' }]
        );
        return false;
      }
      
      // Request camera permission if video call
      if (isVideo) {
        const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
        if (cameraStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Camera permission is required for video calls. Please enable it in your device settings.',
            [{ text: 'OK' }]
          );
          return false;
        }
      }
      
      return true;
    } catch (e: any) {
      Alert.alert(
        'Permission Error',
        'Failed to request necessary permissions. Please check your device settings.',
        [{ text: 'OK' }]
      );
      return false;
    }
  };

  const setupMedia = async (isVideo: boolean) => {
    try {
      
      // Request permissions first
      const hasPermissions = await requestPermissions(isVideo);
      if (!hasPermissions) {
        return null;
      }
      
      // Use simplest audio constraints for maximum compatibility
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        } : false,
      });
      
      
      // Explicitly enable audio track
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0];
        audioTrack.enabled = true;
      } else {
        Alert.alert('Audio Error', 'Could not access microphone. Please check your device settings.');
        return null;
      }
      
      // Enable video tracks if present
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        videoTrack.enabled = true;
      } else if (isVideo) {
        Alert.alert('Camera Error', 'Could not access camera. Please check your device settings.');
        return null;
      } else {
      }
      
      localStreamRef.current = stream;
      setCallState(prev => ({ ...prev, localStream: stream }));
      return stream;
    } catch (e: any) {
      
      // Handle specific permission errors
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        Alert.alert(
          'Permission Required',
          'Camera and microphone permissions are required for calls. Please enable them in your device settings.',
          [{ text: 'OK' }]
        );
        return null;
      }
      
      if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        Alert.alert(
          'Device Not Found',
          'No camera or microphone found on this device.',
          [{ text: 'OK' }]
        );
        return null;
      }
      
      if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        Alert.alert(
          'Device Busy',
          'Camera or microphone is already in use by another application.',
          [{ text: 'OK' }]
        );
        return null;
      }
      
      // Retry with simpler constraints
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: isVideo ? { facingMode: 'user' } : false,
        });
        stream.getTracks().forEach((track: any) => {
          track.enabled = true;
        });
        localStreamRef.current = stream;
        setCallState(prev => ({ ...prev, localStream: stream }));
        return stream;
      } catch (retryErr: any) {
        try {
          const stream = await mediaDevices.getUserMedia({
            audio: true,
            video: isVideo ? true : false,
          });
          stream.getTracks().forEach((track: any) => {
            track.enabled = true;
          });
          localStreamRef.current = stream;
          setCallState(prev => ({ ...prev, localStream: stream }));
          return stream;
        } catch (finalErr: any) {
          if (isWebRTCAvailable) {
            Alert.alert(
              'Media Error',
              'Could not access camera or microphone. Please check your app permissions and device settings.',
              [{ text: 'OK' }]
            );
          }
          return null;
        }
      }
    }
  };

  const createPeerConnection = (targetUserId: string) => {
    const peer = new RTCPeerConnection(configuration);

    peer.onicecandidate = (event: any) => {
      if (event.candidate) {
        socketService.socket?.emit('call:ice-candidate', {
          targetUserId,
          candidate: event.candidate,
        });
      } else {
      }
    };

    peer.onconnectionstatechange = (event: any) => {
      if (peer.connectionState === 'connected') {
      }
    };

    peer.oniceconnectionstatechange = (event: any) => {
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
      }
    };

    // Both onaddstream and ontrack for compatibility with all versions of react-native-webrtc
    peer.onaddstream = (event: any) => {
      const remoteStream = event.stream;
      
      // Ensure remote audio track is enabled
      const remoteAudioTracks = remoteStream.getAudioTracks();
      if (remoteAudioTracks.length > 0) {
        remoteAudioTracks[0].enabled = true;
      } else {
      }
      
      // Ensure remote video track is enabled
      const remoteVideoTracks = remoteStream.getVideoTracks();
      if (remoteVideoTracks.length > 0) {
        remoteVideoTracks[0].enabled = true;
      }
      
      setCallState(prev => ({ ...prev, remoteStream }));
    };

    peer.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        
        // Ensure remote audio track is enabled
        const remoteAudioTracks = remoteStream.getAudioTracks();
        if (remoteAudioTracks.length > 0) {
          remoteAudioTracks[0].enabled = true;
        } else {
        }
        
        // Ensure remote video track is enabled
        const remoteVideoTracks = remoteStream.getVideoTracks();
        if (remoteVideoTracks.length > 0) {
          remoteVideoTracks[0].enabled = true;
        }
        
        setCallState(prev => ({ ...prev, remoteStream }));
      } else {
      }
    };

    if (localStreamRef.current) {
      
      // Ensure audio track is enabled before adding
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = true;
      }
      
      // Ensure video track is enabled before adding
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].enabled = true;
      } else {
      }
      
      // Use addTrack instead of deprecated addStream for better compatibility
      localStreamRef.current.getTracks().forEach((track: any) => {
        track.enabled = true;
        peer.addTrack(track, localStreamRef.current!);
      });
    } else {
    }

    pc.current = peer;
    return peer;
  };



  const startCall = async (recipientId: string, recipientName: string, recipientAvatar: string, isVideo: boolean) => {
    if (!socketService.socket || !currentUser) {
      return;
    }


    // Request permissions first
    const hasPermissions = await requestPermissions(isVideo);
    if (!hasPermissions) {
      return;
    }

    // Setup media after permissions are granted
    const stream = await setupMedia(isVideo);
    if (!stream) {
      if (!isWebRTCAvailable) {
        Alert.alert('Development Note', 'WebRTC is not available in Expo Go. Please use a development build (npx expo run:android) to test calling.');
      }
      return;
    }

    // Set audio mode AFTER stream is created
    const defaultSpeaker = isVideo;
    await setCallAudioMode(isVideo, defaultSpeaker);
    setIsSpeaker(defaultSpeaker);

    currentCallRef.current = {
      userId: recipientId,
      username: recipientName,
      avatar: recipientAvatar,
      direction: 'outgoing',
      type: isVideo ? 'video' : 'voice',
      connectTime: null,
      status: 'no_answer',
    };

    createPeerConnection(recipientId);
    
    try {
      socketService.socket.emit('call:start', {
        recipientId,
        isVideo,
        callerName: currentUser.username,
        callerAvatar: currentUser.avatar_url,
      });

      setCallState(prev => ({
        ...prev,
        isActive: true,
        isVideo,
        callerId: currentUser.id,
        callerName: recipientName,
        callerAvatar: recipientAvatar,
        targetUserId: recipientId,
        status: 'calling',
      }));
      playSound('calling');

      // Ring Timeout: Auto-hangup after 30 seconds of no answer
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = setTimeout(() => {
        if (socketService.socket && recipientId) {
          socketService.socket.emit('call:end', { targetUserId: recipientId });
        }
        handleCallEnded('no_answer').catch(() => {});
      }, 30000);

    } catch (e: any) {
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!socketService.socket || !callState.callerId) {
      return;
    }
    
    await stopSound();

    // Request permissions first
    const hasPermissions = await requestPermissions(callState.isVideo);
    if (!hasPermissions) {
      rejectCall('permission_denied');
      return;
    }
    
    const stream = await setupMedia(callState.isVideo);
    if (!stream) {
      if (!isWebRTCAvailable) {
        Alert.alert('Development Note', 'WebRTC is not available in Expo Go. Please use a development build.');
      }
      rejectCall('permission_denied');
      return;
    }

    // Set audio mode AFTER stream is created
    const defaultSpeaker = callState.isVideo;
    await setCallAudioMode(callState.isVideo, defaultSpeaker);
    setIsSpeaker(defaultSpeaker);

    createPeerConnection(callState.callerId);
    
    try {
      socketService.socket.emit('call:accept', {
        callerId: callState.callerId,
      });

      if (currentCallRef.current) {
        currentCallRef.current.connectTime = Date.now();
        currentCallRef.current.status = 'connected';
      }

      setCallState(prev => ({ 
        ...prev, 
        status: 'connected', 
        isActive: true, 
        isIncoming: false,
        isSpeaker: defaultSpeaker
      }));
      if (Platform.OS !== 'web') Vibration.cancel();
    } catch (e: any) {
      cleanupCall();
    }
  };

  const rejectCall = (reason = 'declined') => {
    if (socketService.socket && callState.callerId) {
      socketService.socket.emit('call:reject', { callerId: callState.callerId, reason });
    }
    if (currentCallRef.current) {
      currentCallRef.current.status = 'declined';
    }
    cleanupCall();
  };

  const endCall = async () => {
    if (socketService.socket && callState.targetUserId) {
      socketService.socket.emit('call:end', { targetUserId: callState.targetUserId });
    }
    if (callState.status === 'connected') {
      await handleCallEnded('ended');
    } else {
      cleanupCall();
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0];
        const newMutedState = !isMuted;
        audioTrack.enabled = !newMutedState;
        setIsMuted(newMutedState);
        
        // Notify remote user
        if (socketService.socket && callState.targetUserId) {
          socketService.socket.emit('call:toggle-audio', { 
            targetUserId: callState.targetUserId, 
            isMuted: newMutedState 
          });
        }
      } else {
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        const newCameraOffState = !isCameraOff;
        videoTrack.enabled = !newCameraOffState;
        setIsCameraOff(newCameraOffState);
        
        // Notify remote user
        if (socketService.socket && callState.targetUserId) {
          socketService.socket.emit('call:toggle-video', { 
            targetUserId: callState.targetUserId, 
            isCameraOff: newCameraOffState 
          });
        }
      } else {
      }
    }
  };

  const switchCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        if (typeof videoTrack._switchCamera === 'function') {
          videoTrack._switchCamera();
        } else {
          // Fallback: recreate stream with different facing mode
          const currentFacingMode = videoTrack.getSettings()?.facingMode;
          const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
          setupMedia(callState.isVideo).then(newStream => {
            if (newStream && pc.current) {
              // Replace tracks in peer connection
              const sender = pc.current.getSenders().find((s: any) => s.track.kind === 'video');
              if (sender) {
                sender.replaceTrack(newStream.getVideoTracks()[0]);
              }
            }
          }).catch(err => {
          });
        }
      }
    }
  };

  const toggleSpeaker = async () => {
    try {
      const nextSpeaker = !isSpeaker;
      setIsSpeaker(nextSpeaker);
      setCallState(prev => ({ ...prev, isSpeaker: nextSpeaker }));
      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          playThroughEarpieceAndroid: !nextSpeaker,
        });
      }
    } catch (e) {
    }
  };

  return (
    <CallContext.Provider value={{ 
      callState, startCall, acceptCall, rejectCall, endCall,
      toggleMute, toggleCamera, switchCamera, toggleSpeaker, isMuted, isCameraOff, isSpeaker 
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
