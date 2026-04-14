import { Dimensions, Platform, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Guideline sizes are based on standard iPhone 11 screen
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

/**
 * Scales size based on screen width
 */
export const scale = (size: number) => (SCREEN_WIDTH / guidelineBaseWidth) * size;

/**
 * Scales size based on screen height
 */
export const verticalScale = (size: number) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;

/**
 * Moderate scaling for non-linear scale requirements
 */
export const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;

/**
 * Returns a pixel-perfect font size
 */
export const moderateFont = (size: number, factor = 0.5) => {
  const newSize = moderateScale(size, factor);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

export const SIZES = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmallDevice: SCREEN_WIDTH < 375,
  isTablet: SCREEN_WIDTH >= 768,
  padding: moderateScale(20),
  radius: moderateScale(15),
  headerHeight: Platform.OS === 'ios' ? verticalScale(90) : verticalScale(100),
  tabBarHeight: Platform.OS === 'ios' ? 88 : 65,
};
