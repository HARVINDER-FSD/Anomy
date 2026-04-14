import React, { useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

interface VideoPlayerProps {
  uri: string;
}

export const VideoPlayer = ({ uri }: VideoPlayerProps) => {
  const video = useRef(null);
  
  return (
    <View style={styles.container}>
      <Video
        ref={video}
        style={styles.video}
        source={{ uri }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        shouldPlay
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  video: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
});
