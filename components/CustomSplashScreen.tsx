import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Image, Text } from 'react-native';
import { COLORS } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';

export const CustomSplashScreen = () => {
  // Advanced Animation Values
  const logoRotateY = useRef(new Animated.Value(90)).current; 
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  
  const footerOpacity = useRef(new Animated.Value(0)).current;
  const footerScale = useRef(new Animated.Value(0.85)).current;
  
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // 🎭 ADVANCED STAGGERED SEQUENCE
    Animated.stagger(300, [
      // 1. Logo flips in 3D and scales up
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(logoRotateY, {
          toValue: 0,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 50,
          useNativeDriver: true,
        }),
      ]),

      // 2. Cinematic Glow Expansion behind the logo (subtle for white background)
      Animated.parallel([
        Animated.timing(glowOpacity, {
          toValue: 0.1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.spring(glowScale, {
          toValue: 1.5,
          friction: 3,
          tension: 20,
          useNativeDriver: true,
        }),
      ]),

      // 3. Elegant Footer Reveal
      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(footerScale, {
          toValue: 1,
          friction: 7,
          tension: 30,
          useNativeDriver: true,
        })
      ])
    ]).start();
  }, [logoRotateY, logoScale, logoOpacity, glowOpacity, glowScale, footerOpacity, footerScale]);

  // Interpolate 3D Rotation
  const rotateY = logoRotateY.interpolate({
    inputRange: [0, 90],
    outputRange: ['0deg', '90deg']
  });

  return (
    <View style={styles.container}>
      <View style={styles.whiteBackground}>
        <View style={styles.logoContainer}>
          {/* Animated Glow Behind Logo */}
          <Animated.View 
            style={[
              styles.glow,
              {
                opacity: glowOpacity,
                transform: [{ scale: glowScale }]
              }
            ]} 
          />

          {/* 3D Flipping Logo Image */}
          <Animated.View style={{ 
            opacity: logoOpacity,
            transform: [{ rotateY }, { scale: logoScale }] 
          }}>
            <Image 
              source={require('@/assets/images/splashicon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        {/* Elegant Footer Reveal */}
        <Animated.View 
          style={[
            styles.footer, 
            { 
              opacity: footerOpacity,
              transform: [{ scale: footerScale }] 
            }
          ]}
        >
          <Text style={styles.fromText}>crafted by</Text>
          <Text style={styles.gsText}>GS</Text>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
  },
  whiteBackground: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    position: 'relative',
    justifyContent: 'center',
  },
  logoImage: {
    width: scale(250),
    height: scale(250),
  },
  glow: {
    position: 'absolute',
    width: scale(200),
    height: scale(200),
    borderRadius: scale(100),
    backgroundColor: '#6366f1', // Indigo glow
    zIndex: -1,
  },
  footer: {
    position: 'absolute',
    bottom: verticalScale(50),
    alignItems: 'center',
  },
  fromText: {
    fontSize: moderateFont(13),
    color: 'rgba(0, 0, 0, 0.4)',
    letterSpacing: 5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  gsText: {
    fontSize: moderateFont(32),
    fontWeight: '900',
    color: '#4f46e5', // Deep indigo
    marginTop: verticalScale(4),
    letterSpacing: 8,
    textShadowColor: 'rgba(79, 70, 229, 0.2)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10
  },
});

