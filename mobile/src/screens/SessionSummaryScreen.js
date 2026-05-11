import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../shared/theme';

export default function SessionSummaryScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reviewedCount = route.params?.reviewedCount ?? 0;
  const targetCount = route.params?.targetCount ?? reviewedCount;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Session Summary</Text>
        <Text style={styles.subtitle}>{`You reviewed ${reviewedCount} of ${targetCount} cards.`}</Text>

        <Pressable style={styles.button} onPress={() => navigation.navigate('MainTabs')}>
          <Text style={styles.buttonText}>Back to Library</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: colors.card,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    color: colors.accent,
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 10,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 4,
  },
  button: {
    marginTop: 18,
    backgroundColor: colors.accentStrong,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
  },
});