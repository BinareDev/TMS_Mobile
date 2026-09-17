import { useColorScheme as useRNColorScheme } from 'react-native';
import { useAppTheme } from './ThemeContext';

export function useColorScheme() {
  try {
    const { theme } = useAppTheme();
    return theme;
  } catch (e) {
    // Fallback if context is not yet loaded or is not present
    return useRNColorScheme() || 'light';
  }
}

