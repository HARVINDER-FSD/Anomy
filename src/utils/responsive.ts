import { Dimensions, Platform, PixelRatio, useWindowDimensions } from 'react-native';

const getDimensions = () => Dimensions.get('window');

const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

/**
 * Responsive Scaling Utilities with safety caps for tablets and large displays.
 */
export const scale = (size: number) => {
  const { width } = getDimensions();
  // Capped scale factor (max 1.3x) so elements stay balanced on tablets/desktops
  const factor = Math.min(width / guidelineBaseWidth, 1.3);
  return Math.round(size * factor);
};

export const verticalScale = (size: number) => {
  const { height } = getDimensions();
  const factor = Math.min(height / guidelineBaseHeight, 1.3);
  return Math.round(size * factor);
};

export const moderateScale = (size: number, factor = 0.5) => {
  const { width } = getDimensions();
  const scaleFactor = Math.min(width / guidelineBaseWidth, 1.3);
  return Math.round(size + (size * scaleFactor - size) * factor);
};

export const moderateFont = (size: number, factor = 0.5) => {
  const newSize = moderateScale(size, factor);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

export const SIZES = {
  get width() { return getDimensions().width; },
  get height() { return getDimensions().height; },
  get isSmallDevice() { return getDimensions().width < 375; },
  get isTablet() { return getDimensions().width >= 768; },
  get maxContentWidth() { return 540; },
  padding: moderateScale(20),
  radius: moderateScale(15),
  headerHeight: Platform.OS === 'ios' ? verticalScale(90) : verticalScale(100),
  tabBarHeight: Platform.OS === 'ios' ? 88 : 65,
};

/**
 * Custom React hook for dynamic screen dimensions & responsive layout helper styles.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isSmallDevice = width < 375;
  const isTablet = width >= 768;

  return {
    width,
    height,
    isSmallDevice,
    isTablet,
    cardMaxWidth: isTablet ? 540 : '100%',
    formContainerStyle: isTablet ? { maxWidth: 540, width: '100%' as const, alignSelf: 'center' as const } : { width: '100%' as const },
  };
}
