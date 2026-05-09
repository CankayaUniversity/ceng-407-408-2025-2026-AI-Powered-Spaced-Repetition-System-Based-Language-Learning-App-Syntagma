import React, { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { loginUser, registerUser } from '../shared/api';
import { useTheme } from '../shared/theme';

export default function LoginScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const isLogin = activeTab === 'login';

  const submitAuth = async () => {
    setAuthError('');

    if (authLoading) {
      return;
    }

    if (isLogin) {
      if (!loginUsername || !loginPassword) {
        setAuthError('Please enter your email and password.');
        return;
      }

      try {
        setAuthLoading(true);
        await loginUser(loginUsername.trim(), loginPassword);
        navigation.replace('MainTabs');
      } catch (err) {
        setAuthError(err?.message || 'Login failed.');
      } finally {
        setAuthLoading(false);
      }

      return;
    }

    if (!signupEmail || !signupPassword) {
      setAuthError('Please enter your email and password.');
      return;
    }

    try {
      setAuthLoading(true);
      await registerUser(signupEmail.trim(), signupPassword);
      await loginUser(signupEmail.trim(), signupPassword);
      navigation.replace('MainTabs');
    } catch (err) {
      setAuthError(err?.message || 'Sign up failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.logo}>Syntagma</Text>

          <View style={styles.imageCard}>
            <Image
              source={require('../../assets/capybara-illustration.jpg')}
              style={styles.image}
              resizeMode="cover"
            />
          </View>

          <Text style={styles.welcome}>Welcome</Text>

          <View style={styles.tabsRow}>
            <Pressable onPress={() => setActiveTab('login')}>
              <Text
                style={[
                  styles.tabLabel,
                  isLogin ? styles.tabLabelActive : styles.tabLabelMuted,
                ]}
              >
                Login
              </Text>
            </Pressable>
            <Pressable onPress={() => setActiveTab('signup')}>
              <Text
                style={[
                  styles.tabLabel,
                  !isLogin ? styles.tabLabelActive : styles.tabLabelMuted,
                ]}
              >
                Sign up
              </Text>
            </Pressable>
          </View>

          {isLogin ? (
            <>
              <Text style={styles.label}>email</Text>
              <TextInput
                value={loginUsername}
                onChangeText={setLoginUsername}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.label}>password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  style={styles.passwordInput}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
                  <Text style={styles.eye}>👁</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.label}>name</Text>
              <TextInput
                value={signupName}
                onChangeText={setSignupName}
                placeholder="Capybara Learner"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.label}>email</Text>
              <TextInput
                value={signupEmail}
                onChangeText={setSignupEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.label}>password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={signupPassword}
                  onChangeText={setSignupPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  style={styles.passwordInput}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
                  <Text style={styles.eye}>👁</Text>
                </Pressable>
              </View>
            </>
          )}

          <Pressable>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

          <Pressable onPress={submitAuth} style={styles.submitPressable}>
            <LinearGradient
              colors={isDark ? ['#4A3322', '#8B6340'] : ['#8B6340', '#C49A6C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitButton}
            >
              <Text style={styles.submitText}>
                {authLoading ? 'loading...' : isLogin ? 'login' : 'create account'}
              </Text>
            </LinearGradient>
          </Pressable>

          <View style={styles.orSection}>
            <View style={styles.rule} />
            <Text style={styles.orText}>OR CONTINUE WITH</Text>
            <View style={styles.rule} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardWrap: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 22,
      paddingTop: 10,
      paddingBottom: 30,
    },
    logo: {
      marginTop: 8,
      marginBottom: 16,
      textAlign: 'center',
      fontSize: 48,
      lineHeight: 54,
      color: colors.accent,
      fontFamily: 'PlayfairDisplay_700Bold',
      fontStyle: 'italic',
    },
    imageCard: {
      height: 230,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: colors.accentStrong,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 6,
    },
    image: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.accentStrong,
    },
    welcome: {
      marginTop: 18,
      marginBottom: 10,
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 20,
      fontFamily: 'DMSans_600SemiBold',
    },
    errorText: {
      marginTop: 10,
      textAlign: 'center',
      color: colors.warning,
      fontSize: 13,
      fontFamily: 'DMSans_400Regular',
    },
    tabsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 26,
      marginBottom: 18,
    },
    tabLabel: {
      fontSize: 18,
      fontFamily: 'DMSans_600SemiBold',
    },
    tabLabelActive: {
      color: colors.textPrimary,
    },
    tabLabelMuted: {
      color: colors.textSecondary,
    },
    label: {
      marginBottom: 8,
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: 'DMSans_600SemiBold',
      textTransform: 'lowercase',
    },
    input: {
      width: '100%',
      height: 52,
      borderRadius: 18,
      backgroundColor: colors.mutedSurface,
      paddingHorizontal: 16,
      marginBottom: 14,
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: 'DMSans_400Regular',
    },
    passwordWrap: {
      width: '100%',
      height: 52,
      borderRadius: 18,
      backgroundColor: colors.mutedSurface,
      paddingHorizontal: 16,
      marginBottom: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    passwordInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: 'DMSans_400Regular',
    },
    eye: {
      fontSize: 16,
      color: colors.accent,
    },
    forgot: {
      marginTop: 10,
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: 'DMSans_400Regular',
    },
    submitPressable: {
      marginTop: 6,
    },
    submitButton: {
      width: '100%',
      height: 56,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitText: {
      color: colors.surface,
      fontSize: 15,
      fontFamily: 'DMSans_600SemiBold',
      textTransform: 'lowercase',
    },
    orSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 20,
    },
    rule: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    orText: {
      color: colors.textMuted,
      fontSize: 11,
      letterSpacing: 1,
      fontFamily: 'DMSans_600SemiBold',
    },
  });
