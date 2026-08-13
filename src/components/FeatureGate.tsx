import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { Button } from './Button';
import { useThemeTokens } from '@/design-system';

interface FeatureGateProps {
  children: React.ReactNode;
  featureName: string;
  fullScreen?: boolean;
}

export function FeatureGate({ children, featureName, fullScreen = true }: FeatureGateProps) {
  const user = useAuthStore((s) => s.user);
  const accountState = user?.accountState || 'LimitedAccess';

  // If the user has full verified access, render the child component directly
  if (accountState === 'DiasporaVerified' || accountState === 'FullCommunityAccess') {
    return <>{children}</>;
  }

  // Otherwise, display the locked state card
  return <LockedFeatureCard featureName={featureName} fullScreen={fullScreen} />;
}

interface LockedFeatureCardProps {
  featureName: string;
  fullScreen?: boolean;
}

export function LockedFeatureCard({ featureName, fullScreen = true }: LockedFeatureCardProps) {
  // The StyleSheet below is created once at module load, so it cannot see the
  // colour scheme. Layout and shape stay there; the colours are overlaid from
  // the active tokens, which is what keeps the near-black title from being
  // painted onto a dark card.
  const tokens = useThemeTokens();

  const handleStartVerification = () => {
    router.push('/verification/diaspora');
  };

  return (
    <View
      style={[
        fullScreen ? styles.containerFullScreen : styles.containerInline,
        { backgroundColor: tokens.color.surface.background },
      ]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.neutral[200],
          },
        ]}
      >
        {/* Glowing Lock Badge */}
        <View style={styles.iconCircle}>
          <Text style={styles.lockEmoji}>🔒</Text>
        </View>

        {/* Headline */}
        <Text style={[styles.title, { color: tokens.color.text.primary }]}>Community access is available after Diaspora Verification</Text>

        {/* Feature Gating explanation */}
        <Text style={[styles.description, { color: tokens.color.text.placeholder }]}>
          Verify your identity and residency to unlock trusted {featureName.toLowerCase()}, jobs, housing, marketplace, guides, community updates, and events.
        </Text>

        {/* Action Button */}
        <Button
          label="Start Verification"
          variant="primary"
          onPress={handleStartVerification}
          className="w-full mb-4"
          style={{
            shadowColor: '#F59300',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
          }}
        />

        {/* Footer Support links */}
        <View style={styles.footerRow}>
          <TouchableOpacity 
            onPress={() => router.push('/profile/community-guidelines')}
            style={styles.footerButton}
          >
            <Text style={styles.footerButtonText}>Guidelines</Text>
          </TouchableOpacity>
          <Text style={[styles.footerDivider, { color: tokens.color.neutral[300] }]}>·</Text>
          <TouchableOpacity 
            onPress={() => router.push('/profile/privacy-settings')}
            style={styles.footerButton}
          >
            <Text style={styles.footerButtonText}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={[styles.footerDivider, { color: tokens.color.neutral[300] }]}>·</Text>
          <TouchableOpacity 
            onPress={() => router.push('/profile/trust-center')}
            style={styles.footerButton}
          >
            <Text style={styles.footerButtonText}>Trust Center</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  containerFullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    width: '100%',
    height: '100%',
  },
  containerInline: {
    alignItems: 'center',
    paddingTop: 36, // Clear spacing at the top to avoid overlap
    paddingHorizontal: 24,
    paddingBottom: 48, // Clear spacing at the bottom to avoid tab bar
    width: '100%',
  },
  // Shape only. Every colour on this card is overlaid from the active tokens
  // at the call site, because a StyleSheet is built once at module load and
  // cannot see the colour scheme.
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
    width: '100%',
    maxWidth: 340,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    // Brand tint, not a surface — a warm badge behind the lock that reads the
    // same way against a white or a dark card.
    backgroundColor: '#FFF3EB', // primary-50
    borderWidth: 1,
    borderColor: '#FFE5D4', // primary-100
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#F59300',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  lockEmoji: {
    fontSize: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  footerButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  footerButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59300', // primary-500
    textTransform: 'uppercase',
  },
  footerDivider: {
    fontSize: 12,
    color: '#D1D5DB', // neutral-300
    fontWeight: 'bold',
  },
});
