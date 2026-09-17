import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useAppTheme } from './ThemeContext';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  let theme: 'light' | 'dark' = 'light';
  try {
    const context = useAppTheme();
    theme = context.theme;
  } catch (e) {
    theme = (useRNColorScheme() || 'light') as 'light' | 'dark';
  }

  if (hasHydrated) {
    return theme;
  }

  return 'light';
}

