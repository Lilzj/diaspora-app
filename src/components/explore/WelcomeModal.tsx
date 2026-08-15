import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import { useExploreStore } from '@/store/explore';

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ visible, onClose }) => {
  const startTour = useExploreStore((state) => state.startTour);
  const skipTour = useExploreStore((state) => state.skipTour);

  const handleStart = () => {
    onClose();
    // Launch the core application overview tour
    startTour('app');
  };

  const handleSkip = () => {
    onClose();
    skipTour(); // Mark onboarding as completed/skipped
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    
      statusBarTranslucent
      navigationBarTranslucent>
      <View style={styles.backdrop} className="flex-1 justify-center items-center px-6 relative">
        {/* Clickable Backdrop Overlay */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close welcome modal"
        />

        <View style={styles.modalContent} className="bg-surface-card rounded-3xl w-full max-w-[360px] p-6 border border-subtle">
          
          {/* Decorative Illustration Emoji Header */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 bg-primary-50 rounded-full justify-center items-center mb-2.5">
              <Text className="text-3xl">🌍</Text>
            </View>
            <Text className="text-xs bg-success-surface text-success-default px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
              Welcome to Diaspora
            </Text>
          </View>

          {/* Heading */}
          <Text className="text-xl font-black text-content-primary text-center leading-tight mb-2">
            Build Your New Life Abroad, Confidently
          </Text>

          {/* Subtitle */}
          <Text className="text-xs text-content-muted text-center leading-relaxed mb-5">
            Diaspora is a powerful platform. Take a quick interactive tour to discover how to find jobs, houses, services, and build reputation.
          </Text>

          {/* Metadata Stats */}
          <View className="bg-surface-background border border-subtle rounded-2xl p-3.5 mb-5 flex-col gap-2.5">
            <View className="flex-row items-center">
              <Text className="text-base mr-2">⏱️</Text>
              <View>
                <Text className="text-xs font-bold text-content-strong">Duration</Text>
                <Text className="text-[10px] text-content-faint">~ 2 - 3 minutes (Highly interactive)</Text>
              </View>
            </View>

            <View className="flex-row items-center">
              <Text className="text-base mr-2">💡</Text>
              <View>
                <Text className="text-xs font-bold text-content-strong">Benefits</Text>
                <Text className="text-[10px] text-content-faint">Unlocks verifications faster, prevents scams.</Text>
              </View>
            </View>
          </View>

          {/* Actions Button Stack */}
          <View className="flex-col gap-2.5">
            {/* Start Tour */}
            <TouchableOpacity
              onPress={handleStart}
              className="bg-primary-500 w-full py-3.5 rounded-2xl shadow-lg shadow-primary-500/20 items-center justify-center"
            >
              <Text className="text-white text-xs font-black">Start Guided Tour →</Text>
            </TouchableOpacity>

            <View className="flex-row gap-2">
              {/* Remind Me Later */}
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 bg-surface-background border border-subtle py-3 rounded-2xl items-center justify-center"
              >
                <Text className="text-content-tertiary text-[11px] font-bold">Later</Text>
              </TouchableOpacity>

              {/* Skip */}
              <TouchableOpacity
                onPress={handleSkip}
                className="flex-1 bg-surface-background border border-subtle py-3 rounded-2xl items-center justify-center"
              >
                <Text className="text-content-faint text-[11px] font-bold">Skip Onboarding</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15, 17, 23, 0.65)',
  },
  modalContent: {
    elevation: 24,
    shadowColor: '#0F1117',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
  },
});
export default WelcomeModal;
