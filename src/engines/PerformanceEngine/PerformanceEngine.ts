import { DeviceEventEmitter } from 'react-native';
import { Logger } from '../../utils/logger';

export interface ScreenMetric {
  screenName: string;
  openTimeMs: number;
  renderCount: number;
  cacheHit: boolean;
  score: number; // 0 - 100
  lastUpdated: number;
}

export interface ApiMetric {
  endpoint: string;
  durationMs: number;
  timestamp: number;
  status: number;
}

export interface SocketMetric {
  event: string;
  durationMs: number;
  timestamp: number;
}

export interface CacheMetric {
  category: string;
  hits: number;
  misses: number;
}

export interface AlertMetric {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  timestamp: number;
}

export interface TimelineEntry {
  id: string;
  label: string;
  durationMs: number;
  timestamp: number;
  cacheHit?: boolean;
}

class PerformanceEngine {
  private static instance: PerformanceEngine;

  private screenTraces: Record<string, { startTime: number; renders: number }> = {};
  private screenMetrics: Record<string, ScreenMetric> = {};
  private currentScreenName: string = 'Home';
  private apiMetrics: ApiMetric[] = [];
  private socketMetrics: SocketMetric[] = [];
  private timeline: TimelineEntry[] = [];
  private cacheMetrics: Record<string, CacheMetric> = {
    Chat: { category: 'Chat', hits: 0, misses: 0 },
    Feed: { category: 'Feed', hits: 0, misses: 0 },
    Profile: { category: 'Profile', hits: 0, misses: 0 },
    Stories: { category: 'Stories', hits: 0, misses: 0 },
    Explore: { category: 'Explore', hits: 0, misses: 0 },
  };
  private renderHeatmap: Record<string, number> = {};
  private alerts: AlertMetric[] = [];
  private isOverlayVisible: boolean = false;
  private enableConsoleOutput: boolean = false;
  private isEnabled: boolean = false;

  private constructor() {}

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.notifyUpdate();
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public static getInstance(): PerformanceEngine {
    if (!PerformanceEngine.instance) {
      PerformanceEngine.instance = new PerformanceEngine();
    }
    return PerformanceEngine.instance;
  }

  // ─── 1. Screen & Navigation Tracking ───
  public startScreenTrace(screenName: string) {
    this.currentScreenName = screenName;
    this.screenTraces[screenName] = {
      startTime: Date.now(),
      renders: (this.screenTraces[screenName]?.renders || 0) + 1,
    };
    this.incrementRender(screenName);
  }

  private cumulativeReportMap: Record<string, {
    screenName: string;
    openTimeMs: number;
    cacheHit: boolean;
    renders: number;
    score: number;
    lastVisitedTime: string;
  }> = {};

  public endScreenTrace(screenName: string, cacheHit: boolean = false) {
    const trace = this.screenTraces[screenName];
    if (!trace) return;

    const openTimeMs = Date.now() - trace.startTime;
    const renderCount = trace.renders;

    let score = 100;
    if (openTimeMs > 100) score -= Math.min(40, Math.floor((openTimeMs - 100) / 10));
    if (!cacheHit) score -= 15;
    if (renderCount > 5) score -= Math.min(25, (renderCount - 5) * 5);
    score = Math.max(10, Math.min(100, score));

    this.screenMetrics[screenName] = {
      screenName,
      openTimeMs,
      renderCount,
      cacheHit,
      score,
      lastUpdated: Date.now(),
    };

    const d = new Date();
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    this.cumulativeReportMap[screenName] = {
      screenName,
      openTimeMs,
      cacheHit,
      renders: renderCount,
      score,
      lastVisitedTime: timeStr,
    };

    // Add to Timeline History
    this.addTimelineEntry(screenName, openTimeMs, cacheHit);

    if (openTimeMs > 300) {
      this.addAlert('warning', `⚠️ ${screenName} took ${openTimeMs}ms (Target: <50ms)`);
    }

    this.printCumulativeMasterReport();
    this.notifyUpdate();
  }

  public printCumulativeMasterReport() {
    if (!__DEV__ || !this.isEnabled) return;
    const snap = this.getSnapshot();
    const pad = (str: string, len: number) => (str || '').padEnd(len).substring(0, len);

    const rows = Object.values(this.cumulativeReportMap).map(item => {
      const name = pad(`✔ ${item.screenName}`, 24);
      const tti = pad(item.openTimeMs > 0 ? `${item.openTimeMs}ms` : '<10ms', 10);
      const cache = pad(item.cacheHit ? 'HIT' : 'MISS', 9);
      const renders = pad(String(item.renders), 7);
      const score = pad(`${item.score}/100`, 7);
      const time = pad(item.lastVisitedTime, 8);
      return `│ ${name} │ ${tti} │ ${cache} │ ${renders} │ ${score} │ ${time} │`;
    });

    const reportBox = [
      '========================================================================================',
      '🚀 CUMULATIVE MASTER PERFORMANCE AUDIT REPORT (All Visited Screens & Actions)',
      '========================================================================================',
      `Overall Score: ${snap.score}/100  |  FPS: ${snap.fps}  |  Cache Hit: ${snap.cacheHitRatio}%  |  Est. Memory: ${snap.estimatedMemoryMb}MB`,
      '----------------------------------------------------------------------------------------',
      '│ SCREEN / ACTION          │ TTI OPEN   │ CACHE     │ RENDERS │ SCORE   │ VISITED  │',
      '----------------------------------------------------------------------------------------',
      ...rows,
      '========================================================================================',
    ].join('\n');

  }

  // ─── 2. Timeline History ───
  public addTimelineEntry(label: string, durationMs: number, cacheHit?: boolean) {
    const entry: TimelineEntry = {
      id: Math.random().toString(),
      label,
      durationMs,
      timestamp: Date.now(),
      cacheHit,
    };

    if (label.includes('Switched') || label.includes('Mode')) {
      const d = new Date();
      const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      this.cumulativeReportMap[label] = {
        screenName: label,
        openTimeMs: durationMs,
        cacheHit: !!cacheHit,
        renders: 1,
        score: cacheHit ? 95 : 80,
        lastVisitedTime: timeStr,
      };
      this.printCumulativeMasterReport();
    }
    this.timeline.unshift(entry);
    if (this.timeline.length > 25) this.timeline.pop();
    this.notifyUpdate();
  }

  // ─── 3. Render Heatmap ───
  public incrementRender(componentName: string) {
    this.renderHeatmap[componentName] = (this.renderHeatmap[componentName] || 0) + 1;
    if (this.renderHeatmap[componentName] > 15) {
      this.addAlert('warning', `⚠️ ${componentName} rendered ${this.renderHeatmap[componentName]} times`);
    }
    this.notifyUpdate();
  }

  // ─── 4. Cache Hit Ratio ───
  public trackCacheAccess(category: 'Chat' | 'Feed' | 'Profile' | 'Stories' | 'Explore', hit: boolean) {
    if (!this.cacheMetrics[category]) {
      this.cacheMetrics[category] = { category, hits: 0, misses: 0 };
    }
    if (hit) {
      this.cacheMetrics[category].hits += 1;
    } else {
      this.cacheMetrics[category].misses += 1;
    }
    this.notifyUpdate();
  }

  public getCacheHitRatio(category: string): number {
    const metric = this.cacheMetrics[category];
    if (!metric || metric.hits + metric.misses === 0) return 100;
    return Math.round((metric.hits / (metric.hits + metric.misses)) * 100);
  }

  public getOverallCacheHitRatio(): number {
    let totalHits = 0;
    let totalAccess = 0;
    Object.values(this.cacheMetrics).forEach((c) => {
      totalHits += c.hits;
      totalAccess += c.hits + c.misses;
    });
    if (totalAccess === 0) return 100;
    return Math.round((totalHits / totalAccess) * 100);
  }

  private cumulativeApiReportMap: Record<string, {
    endpoint: string;
    durationMs: number;
    status: number;
    calls: number;
    lastVisitedTime: string;
  }> = {};

  // ─── 5. API Latency ───
  public trackApi(rawEndpoint: string, durationMs: number, status: number = 200) {
    let clean = (rawEndpoint || '').trim();
    if (!clean.startsWith('GET') && !clean.startsWith('POST') && !clean.startsWith('PUT') && !clean.startsWith('DELETE') && !clean.startsWith('PATCH')) {
      clean = `GET ${clean}`;
    }
    const endpoint = clean;

    this.apiMetrics.unshift({
      endpoint,
      durationMs,
      timestamp: Date.now(),
      status,
    });
    if (this.apiMetrics.length > 50) this.apiMetrics.pop();

    const d = new Date();
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    const existing = this.cumulativeApiReportMap[endpoint];
    const calls = (existing?.calls || 0) + 1;

    this.cumulativeApiReportMap[endpoint] = {
      endpoint,
      durationMs,
      status,
      calls,
      lastVisitedTime: timeStr,
    };

    if (durationMs > 500) {
      this.addAlert('critical', `⚠️ Slow API: ${endpoint} (${durationMs}ms)`);
    }

    this.printCumulativeApiReport();
    this.notifyUpdate();
  }

  public printCumulativeApiReport() {
    if (!__DEV__ || !this.isEnabled) return;
    const pad = (str: string, len: number) => (str || '').padEnd(len).substring(0, len);

    let totalDuration = 0;
    let slowCount = 0;
    const apiList = Object.values(this.cumulativeApiReportMap);
    apiList.forEach(item => {
      totalDuration += item.durationMs;
      if (item.durationMs > 500) slowCount++;
    });
    const avgLatency = apiList.length > 0 ? Math.round(totalDuration / apiList.length) : 0;

    const rows = apiList.map(item => {
      const name = pad(`✔ ${item.endpoint}`, 32);
      const lat = pad(`${item.durationMs}ms`, 9);
      const st = pad(`${item.status} ${item.status < 400 ? 'OK' : 'ERR'}`, 9);
      const calls = pad(String(item.calls), 6);
      const rating = item.durationMs < 100 ? pad('⚡ FAST', 8) : item.durationMs < 500 ? pad('🟡 GOOD', 8) : pad('🔴 SLOW', 8);
      const time = pad(item.lastVisitedTime, 8);
      return `│ ${name} │ ${lat} │ ${st} │ ${calls} │ ${rating} │ ${time} │`;
    });

    const reportBox = [
      '========================================================================================',
      '⚡ CUMULATIVE API PERFORMANCE AUDIT REPORT (All Intercepted API Endpoints)',
      '========================================================================================',
      `Avg API Latency: ${avgLatency}ms  |  Total Requests: ${apiList.length}  |  Slow Requests (>500ms): ${slowCount}`,
      '----------------------------------------------------------------------------------------',
      '│ HTTP METHOD & ENDPOINT          │ LATENCY   │ STATUS    │ CALLS  │ RATING   │ VISITED  │',
      '----------------------------------------------------------------------------------------',
      ...rows,
      '========================================================================================',
    ].join('\n');

  }

  // ─── 6. Socket Latency ───
  public trackSocket(event: string, durationMs: number) {
    this.socketMetrics.unshift({
      event,
      durationMs,
      timestamp: Date.now(),
    });
    if (this.socketMetrics.length > 50) this.socketMetrics.pop();
    this.notifyUpdate();
  }

  // ─── 7. Alerts ───
  public addAlert(type: 'warning' | 'critical' | 'info', message: string) {
    const alert: AlertMetric = {
      id: Math.random().toString(),
      type,
      message,
      timestamp: Date.now(),
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > 20) this.alerts.pop();
    this.notifyUpdate();
  }

  // ─── Snapshot & Export ───
  public getSnapshot() {
    const currentMetric = this.screenMetrics[this.currentScreenName];
    const latestApi = this.apiMetrics[0]?.durationMs || 0;
    const latestSocket = this.socketMetrics[0]?.durationMs || 0;

    return {
      currentScreen: this.currentScreenName,
      openTimeMs: currentMetric?.openTimeMs || 0,
      score: currentMetric?.score || 100,
      fps: 60,
      cacheHitRatio: this.getOverallCacheHitRatio(),
      apiLatencyMs: latestApi,
      socketLatencyMs: latestSocket,
      renders: this.renderHeatmap[this.currentScreenName] || 1,
      estimatedMemoryMb: Math.round(110 + (Object.keys(this.renderHeatmap).length * 3.5)),
      timeline: this.timeline,
      screenMetrics: this.screenMetrics,
      renderHeatmap: this.renderHeatmap,
      cacheMetrics: this.cacheMetrics,
      apiMetrics: this.apiMetrics.slice(0, 5),
      socketMetrics: this.socketMetrics.slice(0, 5),
      alerts: this.alerts.slice(0, 5),
      isOverlayVisible: this.isOverlayVisible,
    };
  }

  public exportMetricsJson(): string {
    return JSON.stringify(this.getSnapshot(), null, 2);
  }

  public toggleOverlay() {
    this.isOverlayVisible = !this.isOverlayVisible;
    this.notifyUpdate();
  }

  public enableConsoleLogs() {
    this.enableConsoleOutput = true;
  }

  public disableConsoleLogs() {
    this.enableConsoleOutput = false;
  }

  private notifyUpdate() {
    DeviceEventEmitter.emit('performance:updated', this.getSnapshot());
  }
}

export const performanceEngine = PerformanceEngine.getInstance();
