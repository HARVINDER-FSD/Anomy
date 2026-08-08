import { BaseEngine } from '../shared/BaseEngine';
import * as MediaLibrary from 'expo-media-library';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import { Logger } from '../../shared/Logger';

export class PermissionEngineClass extends BaseEngine {
  readonly name = 'PermissionEngine';

  protected async onInitialize(): Promise<void> {}
  protected async onDestroy(): Promise<void> {}

  async requestCameraPermission(): Promise<boolean> {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      Logger.error(this.name, 'Camera permission error:', e);
      return false;
    }
  }

  async requestMicrophonePermission(): Promise<boolean> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      Logger.error(this.name, 'Microphone permission error:', e);
      return false;
    }
  }

  async requestMediaLibraryPermission(writeOnly = false): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(writeOnly);
      return status === 'granted';
    } catch (e) {
      Logger.error(this.name, 'Media Library permission error:', e);
      return false;
    }
  }
}

export const PermissionEngine = new PermissionEngineClass();
