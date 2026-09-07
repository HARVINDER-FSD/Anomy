import { BaseEngine } from '../shared/BaseEngine';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { Logger } from '../../shared/Logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERMISSIONS_REQUESTED_KEY = '@anufy_initial_permissions_requested_v1';

export class PermissionEngineClass extends BaseEngine {
  readonly name = 'PermissionEngine';

  protected async onInitialize(): Promise<void> {
    // Initialized safely without triggering simultaneous native dialog storms
  }

  protected async onDestroy(): Promise<void> {}

  async requestInitialPermissions(force = false): Promise<void> {
    try {
      if (!force) {
        const alreadyRequested = await AsyncStorage.getItem(PERMISSIONS_REQUESTED_KEY);
        if (alreadyRequested === 'true') {
          return;
        }
        await AsyncStorage.setItem(PERMISSIONS_REQUESTED_KEY, 'true');
      }

      // 1. Camera Permission
      try {
        await Camera.requestCameraPermissionsAsync();
      } catch (_) {}

      // 2. Microphone Permission (for voice messages, audio/video calls)
      try {
        await Camera.requestMicrophonePermissionsAsync();
      } catch (_) {}

      // 3. Media Library Permission (for gallery, photos & videos)
      try {
        await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      } catch (_) {
        try {
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        } catch (_) {}
      }
    } catch (e) {
      Logger.error(this.name, 'Error requesting initial permissions:', e);
    }
  }

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
      const { status } = await Camera.requestMicrophonePermissionsAsync();
      return status === 'granted';
    } catch (e) {
      Logger.error(this.name, 'Microphone permission error:', e);
      return false;
    }
  }

  async requestMediaLibraryPermission(writeOnly = false): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(writeOnly, ['photo', 'video']);
      return status === 'granted';
    } catch (e) {
      Logger.error(this.name, 'Media Library permission error:', e);
      return false;
    }
  }
}

export const PermissionEngine = new PermissionEngineClass();
