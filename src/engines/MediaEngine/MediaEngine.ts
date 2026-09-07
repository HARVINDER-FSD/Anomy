import { BaseEngine } from '../shared/BaseEngine';
import { useMediaStore } from './MediaStore';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { EventBus } from '../../shared/EventBus';
import { apiClient } from '../../api/client';
import { performanceEngine } from '../PerformanceEngine/PerformanceEngine';
import { Logger } from '../../utils/logger';

export type MediaCategory = 'avatars' | 'posts' | 'stories' | 'shots' | 'chat';

const MAX_VIDEO_INPUT_BYTES = 100 * 1024 * 1024; // ~100 MB

export class MediaEngineClass extends BaseEngine {
  readonly name = 'MediaEngine';

  protected async onInitialize(): Promise<void> {}
  protected async onDestroy(): Promise<void> {}

  /**
   * Helper: Determine appropriate Cloudinary folder based on category and type
   */
  private resolveCloudinaryFolder(category: MediaCategory, type: 'image' | 'video' | 'audio'): string {
    if (category === 'avatars') return 'images/avatars';
    if (category === 'shots') return 'videos/shots';

    if (type === 'video') {
      if (category === 'stories') return 'videos/stories';
      if (category === 'chat') return 'videos/chat';
      return 'videos/posts';
    } else {
      if (category === 'stories') return 'images/stories';
      if (category === 'chat') return 'images/chat';
      return 'images/posts';
    }
  }

  /**
   * Optimize image before upload using expo-image-manipulator
   */
  private async optimizeImage(uri: string, category: MediaCategory): Promise<{ uri: string; originalSize: number; compressedSize: number; compressionTimeMs: number }> {
    const startTime = Date.now();
    let originalSize = 0;

    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists && fileInfo.size) {
        originalSize = fileInfo.size;
      }
    } catch (_) {}

    // If image is already tiny (< 300 KB), skip re-encoding
    if (originalSize > 0 && originalSize < 300 * 1024 && category !== 'avatars') {
      return {
        uri,
        originalSize,
        compressedSize: originalSize,
        compressionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const maxDimension = category === 'avatars' ? 512 : 1440;
      const compressQuality = category === 'avatars' ? 0.65 : 0.72;

      // Fit long edge within maxDimension while maintaining aspect ratio
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: maxDimension } }],
        { compress: compressQuality, format: ImageManipulator.SaveFormat.JPEG }
      );

      let compressedSize = originalSize;
      try {
        const compInfo = await FileSystem.getInfoAsync(result.uri);
        if (compInfo.exists && compInfo.size) {
          compressedSize = compInfo.size;
        }
      } catch (_) {}

      return {
        uri: result.uri,
        originalSize: originalSize || compressedSize,
        compressedSize,
        compressionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      Logger.warn('MediaEngine', 'Image optimization fallback to original URI', error as any);
      return {
        uri,
        originalSize,
        compressedSize: originalSize,
        compressionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Optimize video before upload using react-native-compressor
   */
  private async optimizeVideo(uri: string): Promise<{ uri: string; originalSize: number; compressedSize: number; compressionTimeMs: number }> {
    const startTime = Date.now();
    let originalSize = 0;

    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists && fileInfo.size) {
        originalSize = fileInfo.size;
      }
    } catch (_) {}

    // If video is already <= 8 MB, skip re-encoding to preserve battery and speed
    if (originalSize > 0 && originalSize <= 8 * 1024 * 1024) {
      return {
        uri,
        originalSize,
        compressedSize: originalSize,
        compressionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const { Video } = require('react-native-compressor');
      const compressedUri = await Video.compress(
        uri,
        {
          compressionMethod: 'auto',
          maxSize: 1280, // Target 720p maximum dimension
          bitrate: 2500000, // ~2.5 Mbps bitrate for 720p H.264
        },
        (progress: number) => {
          const percent = Math.round(progress * 40);
          EventBus.emit('VIDEO_COMPRESSION_PROGRESS', { progress: percent });
        }
      );

      let compressedSize = originalSize;
      try {
        const compInfo = await FileSystem.getInfoAsync(compressedUri);
        if (compInfo.exists && compInfo.size) {
          compressedSize = compInfo.size;
        }
      } catch (_) {}

      return {
        uri: compressedUri,
        originalSize: originalSize || compressedSize,
        compressedSize,
        compressionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      Logger.warn('MediaEngine', 'Video compression fallback to original URI', error as any);
      return {
        uri,
        originalSize,
        compressedSize: originalSize,
        compressionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Main Upload Method with signature authentication, folder whitelisting & performance tracking
   */
  async uploadMedia(
    uri: string,
    type: 'image' | 'video' | 'audio',
    category: MediaCategory = 'posts',
    options?: { onProgress?: (percent: number) => void }
  ): Promise<string | null> {
    const uploadId = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: 5, uri, status: 'uploading' });

    const startTime = Date.now();
    let finalUri = uri;
    let originalSizeBytes = 0;
    let compressedSizeBytes = 0;
    let compressionTimeMs = 0;

    // 1. Validation & Optimization
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists && fileInfo.size) {
        originalSizeBytes = fileInfo.size;
        compressedSizeBytes = fileInfo.size;
      }

      if (type === 'video' && originalSizeBytes > MAX_VIDEO_INPUT_BYTES) {
        Logger.error('MediaEngine', `Video exceeds maximum limit of 100MB (${Math.round(originalSizeBytes / (1024 * 1024))}MB)`);
        useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: 0, uri, status: 'error' });
        return null;
      }

      if (type === 'image') {
        const opt = await this.optimizeImage(uri, category);
        finalUri = opt.uri;
        originalSizeBytes = opt.originalSize;
        compressedSizeBytes = opt.compressedSize;
        compressionTimeMs = opt.compressionTimeMs;
      } else if (type === 'video') {
        const opt = await this.optimizeVideo(uri);
        finalUri = opt.uri;
        originalSizeBytes = opt.originalSize;
        compressedSizeBytes = opt.compressedSize;
        compressionTimeMs = opt.compressionTimeMs;
      }
    } catch (err) {
      Logger.warn('MediaEngine', 'Validation/Optimization check failed, proceeding with source URI');
    }

    // 2. Fetch Backend-Signed Upload Authorization
    const folder = this.resolveCloudinaryFolder(category, type);
    let cloudName = 'vdrckjpv';
    let apiKey = '';
    let timestamp = Date.now();
    let signature = '';
    let publicId = '';

    try {
      const configRes = await apiClient.post('/upload', { folder });
      cloudName = configRes.data.cloudName || 'vdrckjpv';
      apiKey = configRes.data.apiKey;
      timestamp = configRes.data.timestamp;
      signature = configRes.data.signature;
      publicId = configRes.data.publicId;
      Logger.info('MediaEngine_UploadConfig', { cloudName, folder, hasSignature: !!signature });
    } catch (configError: any) {
      Logger.warn('MediaEngine', `Failed to fetch backend signed authorization: ${configError?.response?.data?.error || configError?.message}`, configError as any);
    }

    // 3. Perform Direct Signed Upload to Cloudinary
    try {
      const formData = new FormData();
      const filename = finalUri.split('/').pop() || 'upload';
      const mimeType = type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/m4a' : 'image/jpeg';

      formData.append('file', { uri: finalUri, type: mimeType, name: filename } as any);

      if (signature && apiKey && publicId) {
        formData.append('api_key', apiKey);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        formData.append('public_id', publicId);
        // NOTE: Do NOT append 'folder' separately — it is already included in public_id.
        // Adding folder separately causes Cloudinary signature mismatch errors.
      } else {
        Logger.warn('MediaEngine', 'No signature available, falling back to unsigned preset');
        formData.append('upload_preset', 'profilePicsUnsigned');
      }

      const resourceType = type === 'video' || type === 'audio' ? 'video' : 'image';
      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

      const res = await axios.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: percent, uri, status: 'uploading' });
          options?.onProgress?.(percent);
        },
      });

      const url = res.data.secure_url || res.data.url;
      const uploadDurationMs = Date.now() - startTime;
      const ratio = originalSizeBytes > 0 ? Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100) : 0;

      useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: 100, uri, status: 'completed' });
      EventBus.emit('MEDIA_UPLOAD_SUCCESS', { uploadId, url });

      // Track runtime metrics in PerformanceEngine
      performanceEngine.trackMediaUpload({
        originalSizeBytes,
        compressedSizeBytes,
        compressionRatioPercent: Math.max(0, ratio),
        compressionTimeMs,
        uploadDurationMs,
        success: true,
        mediaType: type === 'video' ? 'video' : 'image',
        folder,
      });

      return url;
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.response?.data || err?.message || 'Unknown error';
      Logger.error('MediaEngine', `Upload to Cloudinary failed: ${JSON.stringify(errMsg)}`);
      useMediaStore.getState().setUploadProgress(uploadId, { id: uploadId, progress: 0, uri, status: 'error' });
      EventBus.emit('MEDIA_UPLOAD_FAILED', { uploadId, error: err });

      performanceEngine.trackMediaUpload({
        originalSizeBytes,
        compressedSizeBytes,
        compressionRatioPercent: 0,
        compressionTimeMs,
        uploadDurationMs: Date.now() - startTime,
        success: false,
        mediaType: type === 'video' ? 'video' : 'image',
        folder,
      });

      return null;
    }
  }
}

export const MediaEngine = new MediaEngineClass();
