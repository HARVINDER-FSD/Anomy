import { useEditorStore } from '../store/editorStore';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { apiClient } from '../api/client';

/**
 * 🎞️ ANUFY HYBRID EXPORTER BRIDGE (v2.0 - SOUND SYNC)
 */
export const ExporterService = {
  
  generateExportArguments: () => {
    const { clips, layers, activeMusic } = useEditorStore.getState();
    const args: string[] = [];
    
    // 1. INPUT CLIPS (Sequential Merge)
    clips.forEach(c => {
      args.push('-ss', (c.trimStart / 1000).toString());
      args.push('-t', (c.duration / 1000).toString());
      args.push('-i', c.uri);
    });
    
    // 2. INPUT MUSIC (Soundtrack Overlay)
    if (activeMusic?.url) {
      args.push('-i', activeMusic.url);
    }
    
    // 3. LAYER FILTER ENGINE 
    let filters = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[vbase];`;
    
    // Text/Sticker Overlay
    layers.forEach((layer, index) => {
      const xPos = Math.round(layer.x * 1080);
      const yPos = Math.round(layer.y * 1920);
      if (layer.type === 'text') {
        filters += `[vbase]drawtext=text='${layer.content}':x=${xPos}:y=${yPos}:fontsize=${layer.fontSize || 50}:fontcolor=white[v${index+1}];`;
      }
    });

    // 4. AUDIO MIXING (Original + Music)
    if (activeMusic) {
      args.push('-filter_complex', `${filters} [0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]`);
      args.push('-map', `[v${layers.length}]`);
      args.push('-map', '[aout]');
    } else {
      args.push('-filter_complex', filters);
      args.push('-map', `[v${layers.length}]`);
      args.push('-map', '0:a');
    }

    const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '/tmp/'
    const outputPath = `${cacheDir}AnuFy_Shot_${Date.now()}.mp4`;
    
    args.push('-c:v', 'libx264');
    args.push('-preset', 'superfast');
    args.push('-crf', '20');
    args.push('-y'); // Overwrite output file
    args.push(outputPath);

    return {
      args,
      outputPath
    };
  },

  uploadToCloudinary: async (uri: string, type: 'video' | 'image' = 'video'): Promise<string | null> => {
    try {
      // 1. Get Signature
      const configRes = await apiClient.post('/upload', { folder: 'reels' });
      const { cloudName, apiKey, timestamp, signature, publicId } = configRes.data;

      // 2. Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        type: type === 'video' ? 'video/mp4' : 'image/jpeg',
        name: type === 'video' ? 'video.mp4' : 'image.jpg',
      } as any);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);
      formData.append('public_id', publicId);
      formData.append('folder', 'reels');

      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      return data.secure_url || null;
    } catch (e) {
      console.error('[uploadToCloudinary] Error:', e);
      return null;
    }
  },

  startExport: async () => {
    const { clips, layers, activeMusic } = useEditorStore.getState();
    if (!clips.length) return false;

    try {
      // 🚀 1. ENSURE ALL CLIPS ARE REMOTE (Upload local ones)
      const processedClips = await Promise.all(clips.map(async (c) => {
        if (typeof c.uri === 'string' && c.uri.startsWith('http')) {
          return { ...c, remoteUri: c.uri };
        }
        const remoteUrl = await ExporterService.uploadToCloudinary(c.uri, 'video');
        return { ...c, remoteUri: remoteUrl };
      }));

      if (processedClips.some(c => !c.remoteUri)) {
        console.warn('[ExporterService] Some clips failed to upload');
        return clips[0].uri; // Fallback
      }

      // 🚀 2. ENSURE ALL IMAGE LAYERS ARE REMOTE
      const processedLayers = await Promise.all(layers.map(async (l) => {
        if (l.type !== 'image' && l.type !== 'sticker') return l;
        if (l.uri && l.uri.startsWith('http')) return l;
        if (!l.uri) return l;
        
        const remoteUrl = await ExporterService.uploadToCloudinary(l.uri, 'image');
        return { ...l, uri: remoteUrl || l.uri };
      }));

      // 🚀 3. CALL SERVER-SIDE FFmpeg
      const payload: any = {
        clips: processedClips.map(c => ({
          url: c.remoteUri,
          trimStartMs: c.trimStart,
          trimEndMs: c.trimEnd
        })),
        layers: processedLayers.map(l => ({
          type: l.type,
          content: l.content,
          url: l.uri,
          x: l.x,
          y: l.y,
          fontSize: l.fontSize,
          startMs: l.startTime,
          endMs: l.endTime
        })),
        music: activeMusic ? {
          url: activeMusic.url,
          trimStartMs: activeMusic.trimStart ?? 0,
          volume: activeMusic.volume ?? 1
        } : undefined,
        output: { width: 1080, height: 1920, fps: 30, format: 'mp4' }
      };

      const res = await apiClient.post('/exports/shot', payload);
      const url = res?.data?.data?.videoUrl;
      
      if (url) return url;
    } catch (e) {
      console.error('[ExporterService] Server-side export failed, falling back:', e);
    }

    return clips[0].uri;
  }
};
