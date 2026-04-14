import { getBaseUrl } from '../api/config';

/**
 * Resolves a potentially relative avatar URL to a full absolute URL.
 * Also handles fallback to ui-avatars if no avatar is provided.
 */
export const resolveAvatarUrl = (url?: string, username?: string) => {
  // If no URL or default placeholder, return ui-avatars placeholder
  if (!url || url === 'null' || url === 'undefined' || url === '' || url.includes('placeholder-user.jpg')) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'U')}&background=random&size=256`;
  }

  // If it's already an absolute URL (http/https) or base64 data, return it
  if (url.startsWith('http') || url.startsWith('data:')) {
    return url;
  }

  // Get the server root from config
  const serverRoot = getBaseUrl(false);
  
  // Ensure the relative path starts with a /
  const relativePath = url.startsWith('/') ? url : `/${url}`;
  
  // Final absolute URL
  return `${serverRoot}${relativePath}`;
};

/**
 * Resolves a potentially relative media URL to a full absolute URL.
 * Used for posts, reels, stories, etc.
 */
export const resolveMediaUrl = (url?: string) => {
  if (!url || url === 'null' || url === 'undefined' || url === '') {
    return '';
  }

  // If it's already an absolute URL (http/https), base64 data, or a local file, return it
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file://')) {
    return url;
  }

  // Get the server root from config
  const serverRoot = getBaseUrl(false);
  
  // Ensure the relative path starts with a /
  const relativePath = url.startsWith('/') ? url : `/${url}`;
  
  // Final absolute URL
  return `${serverRoot}${relativePath}`;
};
