import { BaseEngine } from '../shared/BaseEngine';
import { useAnonymousStore } from './AnonymousStore';
import { socketService } from '../../lib/socket';
import { EventBus } from '../../shared/EventBus';

export class AnonymousEngineClass extends BaseEngine {
  readonly name = 'AnonymousEngine';

  protected async onInitialize(): Promise<void> {
    socketService.on('anonymous:matched', this.handleMatched);
    socketService.on('anonymous:waiting', this.handleWaiting);
    socketService.on('anonymous:partner_skipped', this.handlePartnerSkipped);
  }

  protected async onDestroy(): Promise<void> {
    socketService.off('anonymous:matched', this.handleMatched);
    socketService.off('anonymous:waiting', this.handleWaiting);
    socketService.off('anonymous:partner_skipped', this.handlePartnerSkipped);
  }

  joinMatchmaking() {
    useAnonymousStore.getState().setQueueing(true);
    socketService.emit('anonymous:join');
  }

  skipPartner() {
    socketService.emit('anonymous:skip');
    useAnonymousStore.getState().setActiveMatch(null);
  }

  private handleMatched = (data: { conversationId: string; partnerPersona: any }) => {
    useAnonymousStore.getState().setQueueing(false);
    useAnonymousStore.getState().setActiveMatch(data.conversationId);
    EventBus.emit('GHOST_MATCHED', data);
  };

  private handleWaiting = () => {
    useAnonymousStore.getState().setQueueing(true);
  };

  private handlePartnerSkipped = () => {
    useAnonymousStore.getState().setActiveMatch(null);
    EventBus.emit('GHOST_PARTNER_SKIPPED');
  };
}

export const AnonymousEngine = new AnonymousEngineClass();
