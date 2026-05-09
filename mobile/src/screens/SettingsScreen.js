import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchCurrentUser } from '../shared/api';
import { getAuth } from '../shared/storage';
import { useTheme } from '../shared/theme';

function SectionLabel({ children, styles }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ReadonlyField({ icon, label, value, styles, colors }) {
  return (
    <View style={styles.readonlyField}>
      <View style={styles.readonlyMeta}>
        <Ionicons name={icon} size={16} color={colors.textSecondary} />
        <Text style={styles.readonlyLabel}>{label}</Text>
      </View>
      <Text style={styles.readonlyValue}>{value}</Text>
    </View>
  );
}

function ToggleRow({ icon, label, value, onChange, colors, styles }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={16} color={colors.accent} />
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accentSoft }}
        thumbColor={value ? colors.accent : colors.surface}
      />
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const { colors, isDark, setIsDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isDarkMode, setIsDarkMode] = useState(isDark);
  const [isNotificationsOn, setIsNotificationsOn] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');

  useEffect(() => {
    setIsDarkMode(isDark);
  }, [isDark]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const auth = await getAuth();
      if (isMounted && auth?.email) {
        setProfileEmail(auth.email);
      }

      try {
        const user = await fetchCurrentUser();
        if (!isMounted) {
          return;
        }

        if (user?.fullName) {
          setProfileName(user.fullName);
        } else if (user?.email) {
          setProfileEmail(user.email);
          setProfileName(deriveNameFromEmail(user.email));
        } else if (auth?.email) {
          setProfileName(deriveNameFromEmail(auth.email));
        }
      } catch (err) {
        if (isMounted && auth?.email) {
          setProfileName(deriveNameFromEmail(auth.email));
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = () => {
    // Placeholder sign-out flow: return to auth screen.
    navigation.getParent()?.replace('Login');
  };

  const handleToggleDarkMode = (value) => {
    setIsDarkMode(value);
    setIsDark(value);
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
            <Ionicons name="paw-outline" size={24} color={colors.accent} />
          </Pressable>

          <Text style={styles.headerTitle}>Syntagma</Text>

          <Pressable onPress={() => console.log('Gear icon tapped')} hitSlop={10}>
            <Ionicons name="settings-outline" size={24} color={colors.accent} />
          </Pressable>
        </View>

        <SectionLabel styles={styles}>ACCOUNT</SectionLabel>
        <View style={styles.card}>
          <ReadonlyField
            icon="person-outline"
            label="FULL NAME"
            value={profileName || 'Loading...'}
            styles={styles}
            colors={colors}
          />
          <ReadonlyField
            icon="at-outline"
            label="EMAIL ADDRESS"
            value={profileEmail || 'Loading...'}
            styles={styles}
            colors={colors}
          />

          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="arrow-forward-outline" size={16} color="#6B4226" />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <SectionLabel styles={styles}>GENERAL</SectionLabel>
        <View style={styles.card}>
          <ToggleRow
            icon="moon-outline"
            label="Dark Mode"
            value={isDarkMode}
            onChange={handleToggleDarkMode}
            colors={colors}
            styles={styles}
          />
          <View style={styles.rowDivider} />
          <ToggleRow
            icon="notifications-outline"
            label="Notifications"
            value={isNotificationsOn}
            onChange={handleToggleNotifications}
            colors={colors}
            styles={styles}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function deriveNameFromEmail(email) {
  if (!email) {
    return '';
  }

  const prefix = email.split('@')[0] || '';
  const words = prefix.split(/[._-]+/g).filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.accent,
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 8,
  },
  card: {
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 18,
  },
  readonlyField: {
    borderRadius: 999,
    backgroundColor: colors.mutedSurface,
    borderWidth: 0.5,
    borderColor: colors.border,
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
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
  },
  readonlyValue: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
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
    color: colors.accent,
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
    backgroundColor: colors.mutedSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: 'DMSans_600SemiBold',
    color: colors.textPrimary,
    fontSize: 16,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
});
