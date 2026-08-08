import { create } from 'zustand';

export interface UploadProgressItem {
  id: string;
  progress: number;
  uri: string;
  status: 'uploading' | 'completed' | 'error';
}

interface MediaStoreState {
  uploads: Record<string, UploadProgressItem>;

  setUploadProgress: (id: string, item: UploadProgressItem) => void;
  removeUpload: (id: string) => void;
}

export const useMediaStore = create<MediaStoreState>((set) => ({
  uploads: {},

  setUploadProgress: (id, item) =>
    set((state) => ({ uploads: { ...state.uploads, [id]: item } })),

  removeUpload: (id) =>
    set((state) => {
      const next = { ...state.uploads };
      delete next[id];
      return { uploads: next };
    }),
}));
