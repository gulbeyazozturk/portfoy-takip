import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ExploreScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.center}>
        <ThemedText type="subtitle">Portföy Takip</ThemedText>
        <ThemedText style={styles.muted}>Varlıklarınızı tek yerden takip edin.</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: '#9ca3af', marginTop: 8 },
});
