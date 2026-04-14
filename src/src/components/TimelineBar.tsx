import React, { useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text, Dimensions, Animated } from 'react-native';
import { useEditorStore, EditorLayer } from '../store/editorStore';
import { COLORS } from '../theme/colors';

const { width } = Dimensions.get('window');
const MS_PER_PIXEL = 50; // 50ms per pixel (zoom level)

/**
 * 📅 HORIZONTAL TIMELINE
 * Allows users to scrub time and adjust layer ranges.
 */
export const TimelineBar: React.FC = () => {
  const { layers, currentTime, totalDuration, setCurrentTime, isPlaying, selectLayer, selectedLayerId } = useEditorStore();
  const scrollRef = useRef<ScrollView>(null);
  
  const timelineWidth = totalDuration / MS_PER_PIXEL;

  const handleScroll = (event: any) => {
    if (isPlaying) return;
    const x = event.nativeEvent.contentOffset.x;
    setCurrentTime(x * MS_PER_PIXEL);
  };

  return (
    <View style={styles.container}>
      <View style={styles.timeLabels}>
        <Text style={styles.timeText}>{(currentTime / 1000).toFixed(1)}s</Text>
        <Text style={styles.timeText}>Total: {(totalDuration / 1000).toFixed(1)}s</Text>
      </View>

      <ScrollView 
        ref={scrollRef}
        horizontal 
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: timelineWidth + width, paddingHorizontal: width / 2 }}
      >
        <View style={[styles.timelineTrack, { width: timelineWidth }]}>
          {/* 📍 CURRENT TIME INDICATOR (PLAYHEAD) */}
          <View style={[styles.playhead, { left: currentTime / MS_PER_PIXEL }]} />

          {/* 🛤️ LAYER BARS */}
          {layers.map((layer, index) => (
            <TouchableOpacity 
              key={layer.id}
              activeOpacity={0.8}
              onPress={() => selectLayer(layer.id)}
              style={[
                styles.layerBar,
                { 
                  left: layer.startTime / MS_PER_PIXEL,
                  width: (layer.endTime - layer.startTime) / MS_PER_PIXEL,
                  top: index * 35 + 10,
                  backgroundColor: selectedLayerId === layer.id ? COLORS.primary : getLayerColor(layer.type)
                }
              ]}
            >
              <Text style={styles.layerLabel} numberOfLines={1}>{layer.type.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const getLayerColor = (type: string) => {
  switch (type) {
    case 'video': return '#2196F3';
    case 'text': return '#E91E63';
    case 'audio': return '#4CAF50';
    case 'sticker': return '#FF9800';
    default: return '#607D8B';
  }
};

const styles = StyleSheet.create({
  container: { height: 200, backgroundColor: '#111', borderTopWidth: 1, borderColor: '#222' },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingHorizontal: 20 },
  timeText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  timelineTrack: { height: 140, backgroundColor: '#181818', position: 'relative' },
  playhead: { position: 'absolute', width: 2, height: '100%', backgroundColor: COLORS.primary, zIndex: 10 },
  layerBar: { 
    position: 'absolute', 
    height: 30, 
    borderRadius: 6, 
    justifyContent: 'center', 
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  layerLabel: { color: '#FFF', fontSize: 10, fontWeight: '800' }
});
