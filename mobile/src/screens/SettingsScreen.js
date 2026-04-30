import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ReadonlyField({ icon, label, value }) {
  return (
    <View style={styles.readonlyField}>
      <View style={styles.readonlyMeta}>
        <Ionicons name={icon} size={16} color="#7F6E5B" />
        <Text style={styles.readonlyLabel}>{label}</Text>
      </View>
      <Text style={styles.readonlyValue}>{value}</Text>
    </View>
  );
}

function ToggleRow({ icon, label, value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={16} color="#6B4226" />
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#D8CEC2', true: '#DFA679' }}
        thumbColor={value ? '#6B4226' : '#FFFFFF'}
      />
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isNotificationsOn, setIsNotificationsOn] = useState(true);

  const handleSignOut = () => {
    // Placeholder sign-out flow: return to auth screen.
    navigation.getParent()?.replace('Login');
  };

  const handleToggleDarkMode = (value) => {
    // Placeholder handler for persisted preferences.
    setIsDarkMode(value);
  };

  const handleToggleNotifications = (value) => {
    // Placeholder handler for notification settings.
    setIsNotificationsOn(value);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => console.log('Paw icon tapped')} hitSlop={10}>
            <Ionicons name="paw-outline" size={24} color="#6B4226" />
          </Pressable>

          <Text style={styles.headerTitle}>Syntagma</Text>

          <Pressable onPress={() => console.log('Gear icon tapped')} hitSlop={10}>
            <Ionicons name="settings-outline" size={24} color="#6B4226" />
          </Pressable>
        </View>

        <SectionLabel>ACCOUNT</SectionLabel>
        <View style={styles.card}>
          <ReadonlyField icon="person-outline" label="FULL NAME" value="Alex Capy" />
          <ReadonlyField icon="at-outline" label="EMAIL ADDRESS" value="alex@syntagma.io" />

          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="arrow-forward-outline" size={16} color="#6B4226" />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <SectionLabel>GENERAL</SectionLabel>
        <View style={styles.card}>
          <ToggleRow
            icon="moon-outline"
            label="Dark Mode"
            value={isDarkMode}
            onChange={handleToggleDarkMode}
          />
          <View style={styles.rowDivider} />
          <ToggleRow
            icon="notifications-outline"
            label="Notifications"
            value={isNotificationsOn}
            onChange={handleToggleNotifications}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2EDE4',
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTitle: {
    color: '#6B4226',
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
    color: '#8E7A66',
    fontFamily: 'DMSans_400Regular',
    marginBottom: 8,
  },
  card: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#EAE0D4',
    padding: 14,
    marginBottom: 18,
  },
  readonlyField: {
    borderRadius: 999,
    backgroundColor: '#F7F3EE',
    borderWidth: 0.5,
    borderColor: '#E9DED2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  readonlyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  readonlyLabel: {
    fontFamily: 'DMSans_400Regular',
    color: '#8E7A66',
    fontSize: 10,
    letterSpacing: 1,
  },
  readonlyValue: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: '#1A1009',
  },
  signOutButton: {
    marginTop: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  signOutText: {
    fontFamily: 'DMSans_600SemiBold',
    color: '#6B4226',
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5ECE2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: 'DMSans_600SemiBold',
    color: '#1A1009',
    fontSize: 16,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#EDE3D8',
    marginVertical: 6,
  },
});
