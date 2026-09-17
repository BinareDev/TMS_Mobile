import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme as useRNColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeType = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';

// In-memory cache fallback for environments without functional AsyncStorage native modules
const inMemoryStorage: Record<string, string> = {};

const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn('[ThemeContext] AsyncStorage not available. Using fallback storage.', e);
      return inMemoryStorage[key] || null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn('[ThemeContext] AsyncStorage not available. Using fallback storage.', e);
      inMemoryStorage[key] = value;
    }
  }
};

interface ThemeContextProps {
  themePreference: ThemePreference;
  theme: ThemeType;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useRNColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    const loadTheme = async () => {
      const val = await safeStorage.getItem('theme_preference');
      if (val === 'light' || val === 'dark' || val === 'system') {
        setThemePreferenceState(val);
      }
    };
    loadTheme();
  }, []);

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    await safeStorage.setItem('theme_preference', pref);
  };

  const activeTheme: ThemeType =
    themePreference === 'system'
      ? (systemColorScheme === 'dark' ? 'dark' : 'light')
      : themePreference;

  return (
    <ThemeContext.Provider value={{ themePreference, theme: activeTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
};

