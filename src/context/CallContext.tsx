import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { socketService } from '@/src/lib/socket';
import { useAuthStore } from '@/src/store/authStore';
import { Alert, Vibration, Platform } from 'react-native';

// 🚀 Safe WebRTC Imports to prevent crash in Expo Go / Web
let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let RTCView: any;
let MediaStream: any;
let mediaDevices: any;
let isWebRTCAvailable = false;

try {
  const WebRTC = require('react-native-webrtc');
  RTCPeerConnection = WebRTC.RTCPeerConnection;
  RTCIceCandidate = WebRTC.RTCIceCandidate;
  RTCSessionDescription = WebRTC.RTCSessionDescription;
  RTCView = WebRTC.RTCView;
  MediaStream = WebRTC.MediaStream;
  mediaDevices = WebRTC.mediaDevices;
  isWebRTCAvailable = true;
} catch {
  console.warn('[CallContext] WebRTC native module not found. Calling features will be disabled in this environment.');
  isWebRTCAvailable = false;
  // No-op fallbacks to prevent crashes
  RTCPeerConnection = class { 
    onicecandidate = null; onaddstream = null; 
    addTrack() {} createOffer() { return Promise.reject(new Error('WebRTC unavailable')); } 
    setLocalDescription() {} setRemoteDescription() {} createAnswer() {} close() {}
  };
  RTCIceCandidate = class {};
  RTCSessionDescription = class {};
  RTCView = function MockRTCView() { return null; };
  MediaStream = class MockMediaStream { 
    getTracks() { return []; } 
    getAudioTracks() { return []; } 
    getVideoTracks() { return []; } 
    toURL() { return ''; }
  };
  mediaDevices = { 
    getUserMedia: () => Promise.reject(new Error('WebRTC not available in this environment')),
    enumerateDevices: () => Promise.resolve([])
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
  callId: string | null;
  targetUserId: string | null;
  status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
  localStream: ExtendedMediaStream | null;
  remoteStream: ExtendedMediaStream | null;
}

interface CallContextType {
  callState: CallState;
  startCall: (recipientId: string, recipientName: string, isVideo: boolean) => void;
  acceptCall: () => void;
  rejectCall: (reason?: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  isMuted: boolean;
  isCameraOff: boolean;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: currentUser } = useAuthStore();
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isIncoming: false,
    isVideo: false,
    callerId: null,
    callerName: null,
    callId: null,
    targetUserId: null,
    status: 'idle',
    localStream: null,
    remoteStream: null,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const pc = useRef<any>(null); // Using any for WebRTC classes to avoid complex type issues with mocks
  const localStreamRef = useRef<any>(null);

  useEffect(() => {
    if (!socketService.socket || !currentUser) return;

    // --- Signaling Listeners ---

    socketService.socket.on('incoming_call', async (data: { callerId: string; callerName: string; isVideo: boolean; callId: string; offer: any }) => {
      console.log('[CallContext] Incoming call from:', data.callerName);
      setCallState(prev => ({
        ...prev,
        isIncoming: true,
        isVideo: data.isVideo,
        callerId: data.callerId,
        callerName: data.callerName,
        callId: data.callId,
        targetUserId: data.callerId,
        status: 'incoming',
      }));
      
      if (Platform.OS !== 'web') {
        Vibration.vibrate([500, 1000, 500, 1000], true);
      }
    });

    socketService.socket.on('call:accepted', async (data: { acceptorId: string; answer: any }) => {
      console.log('[CallContext] Call accepted by:', data.acceptorId);
      if (pc.current && data.answer) {
        try {
          await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          setCallState(prev => ({ ...prev, status: 'connected', isActive: true }));
        } catch (e) {
          console.error('[CallContext] Error setting remote description:', e);
        }
      }
    });

    socketService.socket.on('call:offer', async (data: { senderId: string; sdp: any }) => {
      console.log('[CallContext] Received offer from:', data.senderId);
      if (pc.current) {
        try {
          await pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (e) {
          console.error('[CallContext] Error setting remote offer:', e);
        }
      }
    });

    socketService.socket.on('call:answer', async (data: { senderId: string; sdp: any }) => {
      console.log('[CallContext] Received answer from:', data.senderId);
      if (pc.current) {
        try {
          await pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (e) {
          console.error('[CallContext] Error setting remote answer:', e);
        }
      }
    });

    socketService.socket.on('call:ice-candidate', async (data: { senderId: string; candidate: any }) => {
      console.log('[CallContext] Received ICE candidate');
      if (pc.current && data.candidate) {
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('[CallContext] Error adding ICE candidate:', e);
        }
      }
    });

    socketService.socket.on('call:rejected', (data: { responderId: string; reason: string }) => {
      Alert.alert('Call Rejected', data.reason === 'busy' ? 'User is busy' : 'Call was declined');
      cleanupCall();
    });

    socketService.socket.on('call:ended', () => {
      cleanupCall();
    });

    return () => {
      socketService.socket?.off('incoming_call');
      socketService.socket?.off('call:accepted');
      socketService.socket?.off('call:rejected');
      socketService.socket?.off('call:ended');
      socketService.socket?.off('call:offer');
      socketService.socket?.off('call:answer');
      socketService.socket?.off('call:ice-candidate');
    };
  }, [currentUser]);

  const setupMedia = async (isVideo: boolean) => {
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? {
          facingMode: 'user',
          width: 640,
          height: 480,
          frameRate: 30,
        } : false,
      });
      
      localStreamRef.current = stream;
      setCallState(prev => ({ ...prev, localStream: stream }));
      return stream;
    } catch (e) {
      console.error('[CallContext] Media setup failed:', e);
      Alert.alert('Permission Error', 'Could not access camera or microphone');
      return null;
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
      }
    };

    peer.onaddstream = (event: any) => {
      console.log('[CallContext] Received remote stream');
      setCallState(prev => ({ ...prev, remoteStream: event.stream }));
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => {
        peer.addTrack(track, localStreamRef.current!);
      });
    }

    pc.current = peer;
    return peer;
  };

  const cleanupCall = () => {
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
      callId: null,
      targetUserId: null,
      status: 'idle',
      localStream: null,
      remoteStream: null,
    });
    setIsMuted(false);
    setIsCameraOff(false);
    if (Platform.OS !== 'web') Vibration.cancel();
  };

  const startCall = async (recipientId: string, recipientName: string, isVideo: boolean) => {
    if (!isWebRTCAvailable) {
      Alert.alert(
        'Call Not Available',
        'Calling feature is only available in native builds. Please use a development build (npx expo run:android) to use this feature.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!socketService.socket || !currentUser) return;
    
    const stream = await setupMedia(isVideo);
    if (!stream) return;

    const peer = createPeerConnection(recipientId);
    
    try {
      const offer = await peer.createOffer({});
      await peer.setLocalDescription(offer);

      socketService.socket.emit('call:start', {
        recipientId,
        isVideo,
        offer: peer.localDescription,
      });

      setCallState(prev => ({
        ...prev,
        isActive: true,
        isVideo,
        callerId: currentUser.id,
        callerName: currentUser.username,
        targetUserId: recipientId,
        status: 'calling',
      }));
    } catch (e) {
      console.error('[CallContext] Start call failed:', e);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!isWebRTCAvailable) {
      Alert.alert('Error', 'Calling feature is not available in this environment.');
      return;
    }

    if (!socketService.socket || !callState.callerId) return;
    
    const stream = await setupMedia(callState.isVideo);
    if (!stream) {
      rejectCall('permission_denied');
      return;
    }

    const peer = createPeerConnection(callState.callerId);
    
    try {
      // In incoming call, we should have received the offer already through 'call:start' or 'incoming_call'
      // For this simple version, let's assume 'incoming_call' event provided the offer
      
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socketService.socket.emit('call:accept', {
        callerId: callState.callerId,
        answer: peer.localDescription,
      });

      setCallState(prev => ({ ...prev, status: 'connected', isActive: true, isIncoming: false }));
      if (Platform.OS !== 'web') Vibration.cancel();
    } catch (e) {
      console.error('[CallContext] Accept call failed:', e);
      cleanupCall();
    }
  };

  const rejectCall = (reason = 'declined') => {
    if (socketService.socket && callState.callerId) {
      socketService.socket.emit('call:reject', { callerId: callState.callerId, reason });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (socketService.socket && callState.targetUserId) {
      socketService.socket.emit('call:end', { targetUserId: callState.targetUserId });
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  const switchCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        // @ts-ignore
        videoTrack._switchCamera();
      }
    }
  };

  return (
    <CallContext.Provider value={{ 
      callState, startCall, acceptCall, rejectCall, endCall,
      toggleMute, toggleCamera, switchCamera, isMuted, isCameraOff 
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
