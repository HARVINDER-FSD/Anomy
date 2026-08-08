import { Appearance } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

const scheme = Appearance.getColorScheme();

export const lightColors = {
  primary: '#4B0082',      
  secondary: '#1a0040',    
  background: '#FFFFFF',   
  surface: '#F5F3FF',      
  text: '#1A1A2E',         
  subtitle: '#6B7280',     
  white: '#FFFFFF',
  black: '#000000',
  error: '#FF4D4D',
  success: '#2ECC71',
  info: '#3498DB',
  border: '#E5E0F0',       
  transparent: 'transparent'
};

export const darkColors = {
  primary: '#9C27B0',      // Lighter purple for dark mode visibility
  secondary: '#4B0082',    
  background: '#121212',   // Classic dark mode background
  surface: '#1E1E1E',      // Slightly elevated surface color
  text: '#FFFFFF',         // White text
  subtitle: '#A0A0A0',     // Light grey subtitle
  white: '#121212',        // 🚀 Flipped to make legacy backgrounds dark
  black: '#FFFFFF',        // 🚀 Flipped to make legacy text white
  error: '#FF4D4D',
  success: '#2ECC71',
  info: '#3498DB',
  border: '#333333',       // Darker borders
  transparent: 'transparent'
};

// Evaluate at startup so legacy screens get correct theme
export const COLORS = scheme === 'dark' ? darkColors : lightColors;

export const GRADIENT = {
  main: ['#4B0082', '#1a0040'],   
  light: ['#FFFFFF', '#F5F3FF']   
};

export function useAppTheme() {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkColors : lightColors;
}
