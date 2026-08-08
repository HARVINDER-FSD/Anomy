import { create } from 'zustand';

interface SearchStoreState {
  query: string;
  results: any[];
  isSearching: boolean;
  setQuery: (query: string) => void;
  setResults: (results: any[]) => void;
  setSearching: (isSearching: boolean) => void;
}

export const useSearchStore = create<SearchStoreState>((set) => ({
  query: '',
  results: [],
  isSearching: false,
  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results }),
  setSearching: (isSearching) => set({ isSearching }),
}));
