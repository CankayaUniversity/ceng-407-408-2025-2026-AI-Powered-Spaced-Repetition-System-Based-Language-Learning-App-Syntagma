import React from 'react';
import { FlatList, Image, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const languages = [
  { id: 'english', name: 'English', image: require('../../assets/flags/english.png') },
  { id: 'french', name: 'French', image: require('../../assets/flags/french.png') },
  { id: 'german', name: 'German', image: require('../../assets/flags/german.png') },
  { id: 'japanese', name: 'Japanese', image: require('../../assets/flags/japanese.png') },
];

export default function HomePage({ navigation }) {
  const renderLanguageCard = ({ item }) => (
    <View style={styles.languageCard}>
      <View style={styles.languageIconCircle}>
        <Image source={item.image} style={styles.languageImage} resizeMode="cover" />
      </View>

      <Text style={styles.languageName}>{item.name}</Text>

      <Pressable
        style={styles.startButton}
        onPress={() => navigation.navigate('FlashcardReview', { language: item.name })}
      >
        <Text style={styles.startButtonText}>Start</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2EDE4" />

      <FlatList
        data={languages}
        keyExtractor={(item) => item.id}
        renderItem={renderLanguageCard}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.topNav}>
              <Image source={require('../../assets/capybara-avatar.jpg')} style={styles.avatar} />
              <Text style={styles.brandName}>Syntagma</Text>
            </View>

            <View style={styles.welcomeCard}>
              <View style={styles.floatIllustrationWrap}>
                <Image
                  source={require('../../assets/capybara-illustration.jpg')}
                  style={styles.floatIllustration}
                />
              </View>

              <Text style={styles.welcomeTitle}>Welcome Back</Text>
              <Text style={styles.welcomeSubtitle}>Ready for your daily linguistic dip?</Text>
            </View>

            <View style={styles.startLearningRow}>
              <Text style={styles.startLearningLabel}>Start Learning</Text>
              <Pressable
                style={styles.addCircle}
                onPress={() => navigation.navigate('AddLanguage')}
              >
                <Text style={styles.addCircleText}>+</Text>
              </Pressable>
            </View>
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2EDE4',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  brandName: {
    color: '#6B4226',
    fontSize: 22,
    fontFamily: 'DMSans_600SemiBold',
  },
  welcomeCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 24,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#EAE0D4',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
    position: 'relative',
  },
  floatIllustrationWrap: {
    position: 'absolute',
    top: -36,
    right: 16,
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: '#7EC8C0',
    overflow: 'hidden',
  },
  floatIllustration: {
    width: '100%',
    height: '100%',
  },
  welcomeTitle: {
    marginTop: 8,
    color: '#6B4226',
    fontSize: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  welcomeSubtitle: {
    marginTop: 6,
    color: '#A08C7C',
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
  startLearningRow: {
    marginBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  startLearningLabel: {
    color: '#1A1009',
    fontSize: 24,
    fontFamily: 'DMSans_600SemiBold',
  },
  addCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6B4226',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircleText: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 28,
    fontFamily: 'DMSans_600SemiBold',
  },
  gridContent: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  gridRow: {
    gap: 12,
  },
  languageCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#EAE0D4',
    padding: 20,
    alignItems: 'center',
  },
  languageIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F0EBE3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  languageImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  languageName: {
    color: '#1A1009',
    fontSize: 17,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 12,
  },
  startButton: {
    width: '100%',
    borderRadius: 50,
    backgroundColor: '#F5C49A',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#6B4226',
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
});
