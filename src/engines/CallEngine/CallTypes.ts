export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
export type CallType = 'voice' | 'video';

export interface CallSession {
  callId: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  callType: CallType;
  state: CallState;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
  durationSeconds: number;
}
