import { BaseRepository } from '../engines/shared/BaseRepository';
import { socketService } from '../lib/socket';

export class CallRepository extends BaseRepository {
  readonly name = 'CallRepository';

  sendOffer(targetUserId: string, offer: any, callType: 'voice' | 'video') {
    this.log(`Sending WebRTC call offer to ${targetUserId}`);
    socketService.emit('call:offer', { targetUserId, offer, callType });
  }

  sendAnswer(targetUserId: string, answer: any) {
    this.log(`Sending WebRTC call answer to ${targetUserId}`);
    socketService.emit('call:answer', { targetUserId, answer });
  }

  sendIceCandidate(targetUserId: string, candidate: any) {
    socketService.emit('call:ice_candidate', { targetUserId, candidate });
  }

  sendEndCall(targetUserId: string) {
    this.log(`Ending WebRTC call with ${targetUserId}`);
    socketService.emit('call:end', { targetUserId });
  }

  sendRejectCall(targetUserId: string) {
    this.log(`Rejecting WebRTC call from ${targetUserId}`);
    socketService.emit('call:reject', { targetUserId });
  }

  on(event: string, callback: (data: any) => void) {
    socketService.on(event, callback);
  }

  off(event: string, callback?: (data: any) => void) {
    socketService.off(event, callback);
  }
}
