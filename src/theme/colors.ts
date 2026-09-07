import { Appearance } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

const scheme = Appearance.getColorScheme();

export const lightColors = {
  primary: '#9333EA',      // Vivid Violet Accent
  secondary: '#6366F1',    // Indigo Glow
  background: '#F8FAFC',   // Crisp Alabaster/Slate Background
  surface: '#FFFFFF',      // Pure White Card Surface
  surfaceElevated: '#F1F5F9', // Elevated Pill / Input
  text: '#0F172A',         // Rich Charcoal Text
  subtitle: '#64748B',     // Muted Slate Subtitle
  white: '#FFFFFF',
  black: '#000000',
  error: '#EF4444',
  success: '#10B981',
  info: '#3B82F6',
  border: '#E2E8F0',       // Subtle Border
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  chipBg: '#F1F5F9',
  chipActiveBg: '#F3E8FF',
  chipActiveBorder: '#9333EA',
  chipText: '#64748B',
  chipActiveText: '#9333EA',
  transparent: 'transparent'
};

export const darkColors = {
  primary: '#A855F7',      // Neon Violet Accent
  secondary: '#818CF8',    // Soft Indigo Glow
  background: '#09090B',   // Deep OLED Pitch Black
  surface: '#18181B',      // Dark Zinc Card Surface
  surfaceElevated: '#27272A', // Elevated Pill / Input
  text: '#FAFAFA',         // Crisp White Text
  subtitle: '#A1A1AA',     // Zinc Muted Subtitle
  white: '#09090B',        // Dynamic White for legacy inverted components
  black: '#FAFAFA',        // Dynamic Black for legacy inverted components
  error: '#F87171',
  success: '#34D399',
  info: '#60A5FA',
  border: 'rgba(255, 255, 255, 0.08)',
  tabBarBg: '#09090B',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  chipBg: '#18181B',
  chipActiveBg: 'rgba(168, 85, 247, 0.2)',
  chipActiveBorder: '#A855F7',
  chipText: '#A1A1AA',
  chipActiveText: '#FAFAFA',
  transparent: 'transparent'
};

// Evaluate at startup so legacy screens get correct theme
export const COLORS = scheme === 'dark' ? darkColors : lightColors;

export const GRADIENT = {
  main: ['#9333EA', '#6366F1'],   
  light: ['#FFFFFF', '#F8FAFC'],
  dark: ['#1E1B4B', '#09090B'],
};

export function useAppTheme() {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkColors : lightColors;
}
