import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SessionSummaryScreen({ route, navigation }) {
  const reviewedCount = route.params?.reviewedCount ?? 0;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Session Summary</Text>
        <Text style={styles.subtitle}>You reviewed {reviewedCount} cards.</Text>

        <Pressable style={styles.button} onPress={() => navigation.navigate('MainTabs')}>
          <Text style={styles.buttonText}>Back to Library</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2EDE4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
  },
  title: {
    color: '#6B4226',
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 10,
  },
  subtitle: {
    color: '#5A4A3A',
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 4,
  },
  button: {
    marginTop: 18,
    backgroundColor: '#C49A6C',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
  },
});