import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  DeviceEventEmitter,
  Alert,
  Share,
} from 'react-native';
import { performanceEngine } from '@/src/engines/PerformanceEngine/PerformanceEngine';

export const PerformanceOverlay: React.FC = () => {
  // Disabled: Zero UI footprint
  return null;

  const [metrics, setMetrics] = useState<any>(() => performanceEngine.getSnapshot());
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('performance:updated', (snapshot) => {
      setMetrics(snapshot);
    });
    return () => sub.remove();
  }, []);

  const handleExport = async () => {
    try {
      const json = performanceEngine.exportMetricsJson();
      await Share.share({
        title: 'AnuFy Performance Metrics Report',
        message: json,
      });
    } catch (err) {
      Alert.alert('Export Error', 'Could not export performance metrics');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#4CAF50';
    if (score >= 70) return '#FF9800';
    return '#F44336';
  };

  return (
    <>
      {/* Floating ⚡ Action Trigger */}
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.8}
      >
        <Text style={styles.floatingButtonText}>⚡</Text>
        <View
          style={[
            styles.floatingScoreBadge,
            { backgroundColor: getScoreColor(metrics.score) },
          ]}
        >
          <Text style={styles.floatingScoreText}>{metrics.score}</Text>
        </View>
      </TouchableOpacity>

      {/* Expanded Performance Dashboard Modal */}
      <Modal
        visible={isExpanded}
        transparent
        animationType="slide"
        onRequestClose={() => setIsExpanded(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dashboardCard}>
            {/* Header */}
            <View style={styles.dashboardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18 }}>🚀</Text>
                <Text style={styles.dashboardTitle}>Performance Dashboard</Text>
              </View>
              <TouchableOpacity onPress={() => setIsExpanded(false)} hitSlop={10}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* Metrics Grid */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Current Screen</Text>
                  <Text style={styles.metricValueBold}>{metrics.currentScreen}</Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Open Time</Text>
                  <Text style={styles.metricValue}>
                    {metrics.openTimeMs > 0 ? `${metrics.openTimeMs}ms` : '<10ms'}
                  </Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>FPS</Text>
                  <Text style={[styles.metricValue, { color: '#4CAF50' }]}>
                    {metrics.fps}
                  </Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Cache Hit</Text>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: metrics.cacheHitRatio >= 80 ? '#4CAF50' : '#FF9800' },
                    ]}
                  >
                    {metrics.cacheHitRatio}%
                  </Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>API Latency</Text>
                  <Text style={styles.metricValue}>
                    {metrics.apiLatencyMs > 0 ? `${metrics.apiLatencyMs}ms` : '0ms'}
                  </Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Socket Latency</Text>
                  <Text style={styles.metricValue}>
                    {metrics.socketLatencyMs > 0 ? `${metrics.socketLatencyMs}ms` : '0ms'}
                  </Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Renders</Text>
                  <Text style={styles.metricValue}>{metrics.renders}</Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Memory Est.</Text>
                  <Text style={styles.metricValue}>{metrics.estimatedMemoryMb}MB</Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Score</Text>
                  <Text style={[styles.metricValueBold, { color: getScoreColor(metrics.score) }]}>
                    {metrics.score}/100
                  </Text>
                </View>
              </View>

              {/* Timeline Section */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Timeline History</Text>
              </View>

              <View style={styles.timelineContainer}>
                {metrics.timeline && metrics.timeline.length > 0 ? (
                  metrics.timeline.slice(0, 7).map((item: any, idx: number) => (
                    <View key={item.id || idx} style={styles.timelineRow}>
                      <Text style={{ color: '#4CAF50', marginRight: 6 }}>✔</Text>
                      <Text style={styles.timelineLabel}>{item.label}</Text>
                      <Text style={styles.timelineDuration}>({item.durationMs}ms)</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No timeline history yet</Text>
                )}
              </View>

              {/* Alerts & Warnings Section */}
              {metrics.alerts && metrics.alerts.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Alerts & Warnings</Text>
                  </View>
                  <View style={styles.alertsContainer}>
                    {metrics.alerts.map((al: any) => (
                      <Text key={al.id} style={styles.alertText}>
                        {al.message}
                      </Text>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            {/* Dashboard Footer / Actions */}
            <View style={styles.dashboardFooter}>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                <Text style={styles.exportBtnText}>📤 Export Metrics JSON</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    bottom: 90,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  floatingButtonText: {
    fontSize: 20,
  },
  floatingScoreBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingScoreText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dashboardCard: {
    width: '100%',
    backgroundColor: '#181825',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#313244',
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#313244',
    marginBottom: 12,
  },
  dashboardTitle: {
    color: '#CDD6F4',
    fontSize: 16,
    fontWeight: '800',
  },
  closeText: {
    color: '#A6ADC8',
    fontSize: 18,
    fontWeight: '700',
  },
  metricsGrid: {
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    color: '#BAC2DE',
    fontSize: 13,
  },
  metricValue: {
    color: '#CDD6F4',
    fontSize: 13,
    fontWeight: '600',
  },
  metricValueBold: {
    color: '#CDD6F4',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionHeader: {
    marginTop: 14,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#CDD6F4',
    fontSize: 14,
    fontWeight: '700',
  },
  timelineContainer: {
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineLabel: {
    color: '#CDD6F4',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  timelineDuration: {
    color: '#A6ADC8',
    fontSize: 12,
  },
  emptyText: {
    color: '#6C7086',
    fontSize: 12,
    fontStyle: 'italic',
  },
  alertsContainer: {
    backgroundColor: 'rgba(243, 139, 168, 0.1)',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(243, 139, 168, 0.3)',
  },
  alertText: {
    color: '#F38BA8',
    fontSize: 12,
  },
  dashboardFooter: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#313244',
  },
  exportBtn: {
    backgroundColor: '#313244',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportBtnText: {
    color: '#CDD6F4',
    fontSize: 13,
    fontWeight: '700',
  },
});
