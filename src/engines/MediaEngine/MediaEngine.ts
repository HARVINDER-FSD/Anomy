import { BaseEngine } from '../shared/BaseEngine';
import { useMediaStore } from './MediaStore';
import axios from 'axios';
import { EventBus } from '../../shared/EventBus';

export class MediaEngineClass extends BaseEngine {
  readonly name = 'MediaEngine';

  protected async onInitialize(): Promise<void> {}
  protected async onDestroy(): Promise<void> {}

  async uploadMedia(uri: string, type: 'image' | 'video' | 'audio', uploadPreset = 'profilePicsUnsigned'): Promise<string | null> {
    const uploadId = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: 10, uri, status: 'uploading' });

    try {
      const CLOUD_NAME = 'dskwivk8p';
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'upload';
      const mimeType = type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/m4a' : 'image/jpeg';

      formData.append('file', { uri, type: mimeType, name: filename } as any);
      formData.append('upload_preset', uploadPreset);

      const endpoint = type === 'video' || type === 'audio'
        ? `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`
        : `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

      const res = await axios.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: percent, uri, status: 'uploading' });
        },
      });

      const url = res.data.secure_url || res.data.url;
      useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: 100, uri, status: 'completed' });
      EventBus.emit('MEDIA_UPLOAD_SUCCESS', { uploadId, url });
      return url;
    } catch (err) {
      useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: 0, uri, status: 'error' });
      EventBus.emit('MEDIA_UPLOAD_FAILED', { uploadId, error: err });
      return null;
    }
  }
}

export const MediaEngine = new MediaEngineClass();
