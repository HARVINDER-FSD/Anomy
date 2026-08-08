import { getBaseUrl } from '../api/config';

import { Image } from 'react-native';

/**
 * Resolves a potentially relative avatar URL to a full absolute URL.
 * Supports anonymous mode which will eventually use a pre-selected set of avatars.
 */
export const resolveAvatarUrl = (url?: string, username?: string, isAnonymous?: boolean) => {
  // If no URL, or default placeholder
  if (!url || url === 'null' || url === 'undefined' || url === '' || url.includes('placeholder-user.jpg')) {
    const cleanName = (username || (isAnonymous ? 'Ghost' : 'User')).replace(/^@/, '').trim().toLowerCase();
    if (isAnonymous) {
      return `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(cleanName)}&backgroundColor=7c3aed`;
    }
    return `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(cleanName)}`;
  }

  // Get the server root from config
  const serverRoot = getBaseUrl(false);
  let resolved = url;

  // Replace localhost, 127.0.0.1, or production URL with dynamic machine IP for physical testing!
  if (resolved.startsWith('http://localhost:5000')) {
    resolved = resolved.replace('http://localhost:5000', serverRoot);
  } else if (resolved.startsWith('http://127.0.0.1:5000')) {
    resolved = resolved.replace('http://127.0.0.1:5000', serverRoot);
  } else if (resolved.startsWith('https://mybackenda.onrender.com')) {
    resolved = resolved.replace('https://mybackenda.onrender.com', serverRoot);
  }

  // If it's already an absolute URL (http/https) or base64 data, return it
  if (resolved.startsWith('http') || resolved.startsWith('data:')) {
    return resolved;
  }

  // Ensure the relative path starts with a /
  const relativePath = resolved.startsWith('/') ? resolved : `/${resolved}`;
  
  // Final absolute URL
  return `${serverRoot}${relativePath}`;
};

/**
 * Resolves a potentially relative media URL to a full absolute URL.
 * Used for posts, reels, stories, etc.
 */
export const resolveMediaUrl = (url?: string, asThumbnail = false) => {
  if (!url || url === 'null' || url === 'undefined' || url === '') {
    return '';
  }

  // Get the server root from config
  const serverRoot = getBaseUrl(false);
  let resolved = url;

  // Replace localhost, 127.0.0.1, or production URL with dynamic machine IP for physical testing!
  if (resolved.startsWith('http://localhost:5000')) {
    resolved = resolved.replace('http://localhost:5000', serverRoot);
  } else if (resolved.startsWith('http://127.0.0.1:5000')) {
    resolved = resolved.replace('http://127.0.0.1:5000', serverRoot);
  } else if (resolved.startsWith('https://mybackenda.onrender.com')) {
    resolved = resolved.replace('https://mybackenda.onrender.com', serverRoot);
  }

  // 🚀 CLOUDINARY AUTOMATIC THUMBNAIL GENERATION:
  // If this is a video URL being processed as an image thumbnail, Cloudinary can auto-generate
  // the first frame thumbnail instantly just by replacing the video extension with .jpg!
  // DO NOT modify audio files (like .m4a)!
  const isAudioFile = resolved.endsWith('.m4a') || resolved.endsWith('.wav') || resolved.endsWith('.mp3') || resolved.endsWith('.aac') || resolved.endsWith('.flac') || resolved.endsWith('.ogg');
  const isVideoFile = resolved.endsWith('.mp4') || resolved.endsWith('.mov') || resolved.endsWith('.quicktime') || resolved.endsWith('.mkv') || resolved.endsWith('.avi');
  
  if (asThumbnail && resolved.includes('cloudinary.com') && isVideoFile && !isAudioFile) {
    resolved = resolved.replace(/\.(mp4|mov|quicktime|mkv|avi)$/i, '.jpg');
    // Also ensure it is using optimization params for faster thumbnail delivery!
    if (!resolved.includes('/f_auto,q_auto')) {
      resolved = resolved.replace('/upload/', '/upload/f_auto,q_auto/');
    }
  }

  // If it's already an absolute URL (http/https), base64 data, or a local file, return it
  if (resolved.startsWith('http') || resolved.startsWith('data:') || resolved.startsWith('file://') || resolved.startsWith('content://')) {
    return resolved;
  }

  // Ensure the relative path starts with a /
  const relativePath = resolved.startsWith('/') ? resolved : `/${resolved}`;
  
  // Final absolute URL
  return `${serverRoot}${relativePath}`;
};
