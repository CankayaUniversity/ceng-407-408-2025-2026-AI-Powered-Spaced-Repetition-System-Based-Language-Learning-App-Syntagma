import React, { useState } from 'react';
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

export default function LoginScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const isLogin = activeTab === 'login';

  const submitAuth = () => {
    if (isLogin) {
      navigation.replace('MainTabs');
      return;
    }

    if (signupName && signupEmail && signupPassword) {
      navigation.replace('MainTabs');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F0E8" />
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
              <Text style={styles.label}>username</Text>
              <TextInput
                value={loginUsername}
                onChangeText={setLoginUsername}
                placeholder="your.name"
                placeholderTextColor="#9A9388"
                style={styles.input}
                autoCapitalize="none"
              />
              <Text style={styles.label}>password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9A9388"
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
                placeholderTextColor="#9A9388"
                style={styles.input}
              />
              <Text style={styles.label}>email</Text>
              <TextInput
                value={signupEmail}
                onChangeText={setSignupEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9A9388"
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
                  placeholderTextColor="#9A9388"
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

          <Pressable onPress={submitAuth} style={styles.submitPressable}>
            <LinearGradient
              colors={['#8B6340', '#C49A6C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitButton}
            >
              <Text style={styles.submitText}>{isLogin ? 'login' : 'create account'}</Text>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F0E8',
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
    color: '#3D2B1F',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontStyle: 'italic',
  },
  imageCard: {
    height: 230,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#B58D65',
    shadowColor: '#705037',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 6,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#B58D65',
  },
  welcome: {
    marginTop: 18,
    marginBottom: 10,
    textAlign: 'center',
    color: '#7C756A',
    fontSize: 20,
    fontFamily: 'DMSans_600SemiBold',
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
    color: '#1F1B17',
  },
  tabLabelMuted: {
    color: '#8D6E52',
  },
  label: {
    marginBottom: 8,
    color: '#5D554B',
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
    textTransform: 'lowercase',
  },
  input: {
    width: '100%',
    height: 52,
    borderRadius: 18,
    backgroundColor: '#EDEBE6',
    paddingHorizontal: 16,
    marginBottom: 14,
    color: '#2E2924',
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
  passwordWrap: {
    width: '100%',
    height: 52,
    borderRadius: 18,
    backgroundColor: '#EDEBE6',
    paddingHorizontal: 16,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    color: '#2E2924',
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
  eye: {
    color: '#7C6D5D',
    fontSize: 19,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 20,
    color: '#8D6E52',
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
  },
  submitPressable: {
    width: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#7A573B',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.23,
    shadowRadius: 14,
    elevation: 5,
  },
  submitButton: {
    width: '100%',
    height: 56,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'DMSans_600SemiBold',
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  orSection: {
    marginTop: 22,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: '#D5CEC3',
  },
  orText: {
    color: '#9D958A',
    fontSize: 11,
    fontFamily: 'DMSans_600SemiBold',
    letterSpacing: 1,
  },
});
