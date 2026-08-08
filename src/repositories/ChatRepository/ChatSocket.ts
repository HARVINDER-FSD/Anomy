import { socketService } from '../../lib/socket';

export class ChatSocket {
  joinRoom(chatId: string) {
    socketService.joinRoom(chatId);
  }

  leaveRoom(chatId: string) {
    socketService.leaveRoom(chatId);
  }

  sendMessage(payload: any) {
    socketService.sendMessage(payload);
  }

  editMessage(payload: any) {
    socketService.editMessage(payload);
  }

  deleteMessage(payload: any) {
    socketService.deleteMessage(payload);
  }

  reactToMessage(payload: any) {
    socketService.reactToMessage(payload);
  }

  markRead(payload: any) {
    socketService.markRead(payload);
  }

  on(event: string, callback: (data: any) => void) {
    socketService.on(event, callback);
  }

  off(event: string, callback?: (data: any) => void) {
    socketService.off(event, callback);
  }
}
