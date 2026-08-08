import { BaseEngine } from '../shared/BaseEngine';
import { useSearchStore } from './SearchStore';
import { apiClient } from '../../api/client';

export class SearchEngineClass extends BaseEngine {
  readonly name = 'SearchEngine';
  private debounceTimer: any = null;

  protected async onInitialize(): Promise<void> {}
  protected async onDestroy(): Promise<void> {}

  search(query: string, type: 'users' | 'posts' | 'messages' = 'users') {
    useSearchStore.getState().setQuery(query);
    if (!query.trim()) {
      useSearchStore.getState().setResults([]);
      return;
    }

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      useSearchStore.getState().setSearching(true);
      try {
        const res = await apiClient.get(`/search?q=${encodeURIComponent(query)}&type=${type}`);
        const results = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        useSearchStore.getState().setResults(results);
      } catch (err) {
        useSearchStore.getState().setResults([]);
      } finally {
        useSearchStore.getState().setSearching(false);
      }
    }, 300);
  }
}

export const SearchEngine = new SearchEngineClass();
