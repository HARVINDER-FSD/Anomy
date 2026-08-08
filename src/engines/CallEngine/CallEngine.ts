import { BaseEngine } from '../shared/BaseEngine';
import { CallRepository } from '../../repositories/CallRepository';
import { useCallEngineStore } from './CallStore';
import { CallType, CallSession } from './CallTypes';
import { EventBus } from '../../shared/EventBus';
import { PermissionEngine } from '../PermissionEngine';
import { Logger } from '../../shared/Logger';
import { v4 as uuidv4 } from 'uuid';

export class CallEngineClass extends BaseEngine {
  readonly name = 'CallEngine';
  public repository: CallRepository;
  private durationInterval: any = null;

  constructor() {
    super();
    this.repository = new CallRepository();
  }

  protected async onInitialize(): Promise<void> {
    this.repository.on('call:offer', this.handleIncomingOffer);
    this.repository.on('call:answer', this.handleAnswerReceived);
    this.repository.on('call:ice_candidate', this.handleIceCandidate);
    this.repository.on('call:ended', this.handleCallEnded);
    this.repository.on('call:rejected', this.handleCallEnded);
  }

  protected async onDestroy(): Promise<void> {
    this.repository.off('call:offer', this.handleIncomingOffer);
    this.repository.off('call:answer', this.handleAnswerReceived);
    this.repository.off('call:ice_candidate', this.handleIceCandidate);
    this.repository.off('call:ended', this.handleCallEnded);
    this.repository.off('call:rejected', this.handleCallEnded);
  }

  // ── WEBRTC CALL LIFECYCLE ───────────────────────────────────────────────

  async startCall(targetUserId: string, targetName: string, targetAvatar: string, callType: CallType): Promise<boolean> {
    const hasMic = await PermissionEngine.requestMicrophonePermission();
    if (!hasMic) {
      Logger.warn(this.name, 'Microphone permission denied for voice call');
      return false;
    }

    if (callType === 'video') {
      const hasCam = await PermissionEngine.requestCameraPermission();
      if (!hasCam) {
        Logger.warn(this.name, 'Camera permission denied for video call');
        return false;
      }
    }

    const session: CallSession = {
      callId: uuidv4(),
      peerId: targetUserId,
      peerName: targetName,
      peerAvatar: targetAvatar,
      callType,
      state: 'calling',
      isMuted: false,
      isVideoEnabled: callType === 'video',
      isSpeakerOn: callType === 'video',
      durationSeconds: 0,
    };

    useCallEngineStore.getState().setActiveSession(session);

    // Send SDP offer via Signaling Repository
    const mockOffer = { type: 'offer', sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1...' };
    this.repository.sendOffer(targetUserId, mockOffer, callType);

    EventBus.emit('CALL_STARTED', session);
    return true;
  }

  async answerCall(): Promise<void> {
    const session = useCallEngineStore.getState().activeSession;
    if (!session || session.state !== 'incoming') return;

    useCallEngineStore.getState().updateSession({ state: 'connected' });
    this.startDurationCounter();

    const mockAnswer = { type: 'answer', sdp: 'v=0\r\no=- 987654321 2 IN IP4 127.0.0.1...' };
    this.repository.sendAnswer(session.peerId, mockAnswer);

    EventBus.emit('CALL_CONNECTED', session);
  }

  async toggleMute(): Promise<boolean> {
    const session = useCallEngineStore.getState().activeSession;
    if (!session) return false;

    const newMute = !session.isMuted;
    useCallEngineStore.getState().updateSession({ isMuted: newMute });
    return newMute;
  }

  async toggleSpeaker(): Promise<boolean> {
    const session = useCallEngineStore.getState().activeSession;
    if (!session) return false;

    const newSpeaker = !session.isSpeakerOn;
    useCallEngineStore.getState().updateSession({ isSpeakerOn: newSpeaker });
    return newSpeaker;
  }

  async endCall(): Promise<void> {
    const session = useCallEngineStore.getState().activeSession;
    if (session) {
      this.repository.sendEndCall(session.peerId);
    }
    this.cleanupCallState();
  }

  // ── SIGNALING HANDLERS ──────────────────────────────────────────────────

  private handleIncomingOffer = (data: { callerId: string; callerName?: string; callerAvatar?: string; callType: CallType; offer: any }) => {
    const session: CallSession = {
      callId: uuidv4(),
      peerId: data.callerId,
      peerName: data.callerName || 'Incoming Call',
      peerAvatar: data.callerAvatar,
      callType: data.callType || 'voice',
      state: 'incoming',
      isMuted: false,
      isVideoEnabled: data.callType === 'video',
      isSpeakerOn: false,
      durationSeconds: 0,
    };

    useCallEngineStore.getState().setActiveSession(session);
    EventBus.emit('CALL_INCOMING', session);
  };

  private handleAnswerReceived = ({ answer }: any) => {
    const session = useCallEngineStore.getState().activeSession;
    if (session && session.state === 'calling') {
      useCallEngineStore.getState().updateSession({ state: 'connected' });
      this.startDurationCounter();
      EventBus.emit('CALL_CONNECTED', session);
    }
  };

  private handleIceCandidate = ({ candidate }: any) => {
    Logger.debug(this.name, 'Received ICE Candidate', candidate);
  };

  private handleCallEnded = () => {
    this.cleanupCallState();
  };

  private startDurationCounter() {
    if (this.durationInterval) clearInterval(this.durationInterval);
    this.durationInterval = setInterval(() => {
      const active = useCallEngineStore.getState().activeSession;
      if (active && active.state === 'connected') {
        useCallEngineStore.getState().updateSession({ durationSeconds: active.durationSeconds + 1 });
      }
    }, 1000);
  }

  private cleanupCallState() {
    if (this.durationInterval) clearInterval(this.durationInterval);
    useCallEngineStore.getState().clearCall();
    EventBus.emit('CALL_ENDED');
  }
}

export const CallEngine = new CallEngineClass();
