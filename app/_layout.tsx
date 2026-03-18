import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { PortfolioProvider } from '@/context/portfolio';
import { SelectedCategoriesProvider } from '@/context/selected-categories';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PortfolioProvider>
        <SelectedCategoriesProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="bulk-upload"
              options={{ headerShown: false, title: 'Toplu yükleme' }}
            />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
        </SelectedCategoriesProvider>
      </PortfolioProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
