import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '@/design-system/ThemeContext';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'question';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertOptions {
  type: AlertType;
  title: string;
  message: string;
  buttons?: AlertButton[];
}

interface NotificationContextValue {
  showToast: (options: ToastOptions) => void;
  showAlert: (options: AlertOptions) => void;
  hideToast: () => void;
  hideAlert: () => void;
}

// ---------------------------------------------------------------------------
// CONTEXT
// ---------------------------------------------------------------------------

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// TOAST ANIMATED COMPONENT
// ---------------------------------------------------------------------------

interface ToastProps extends ToastOptions {
  onDismiss: () => void;
}

function ToastComponent({ type, title, message, duration = 3000, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const translateY = useSharedValue(-200);
  const opacity = useSharedValue(0);

  // Determine Toast styles based on type
  const typeConfig = {
    success: {
      icon: 'checkmark-circle' as const,
      color: tokens.color.success.default,
      bgColor: isDark ? tokens.color.success.surface : '#F0FDF4',
      borderColor: isDark ? tokens.color.success.default + '40' : '#DCFCE7',
    },
    error: {
      icon: 'close-circle' as const,
      color: tokens.color.error.default,
      bgColor: isDark ? tokens.color.error.surface : '#FEF2F2',
      borderColor: isDark ? tokens.color.error.default + '40' : '#FEE2E2',
    },
    warning: {
      icon: 'warning' as const,
      color: tokens.color.warning.default,
      bgColor: isDark ? tokens.color.warning.surface : '#FFFBEB',
      borderColor: isDark ? tokens.color.warning.default + '40' : '#FEF3C7',
    },
    info: {
      icon: 'information-circle' as const,
      color: tokens.color.info.default,
      bgColor: isDark ? tokens.color.info.surface : '#EFF6FF',
      borderColor: isDark ? tokens.color.info.default + '40' : '#DBEAFE',
    },
  }[type];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const dismiss = useCallback(() => {
    'worklet';
    opacity.value = withTiming(0, { duration: 250 });
    translateY.value = withTiming(-200, { duration: 300 }, (finished) => {
      if (finished) {
        runOnJS(onDismiss)();
      }
    });
  }, [onDismiss]);

  useEffect(() => {
    // Slide in
    translateY.value = withSpring(insets.top > 0 ? insets.top + 8 : 16, {
      damping: 15,
      stiffness: 120,
    });
    opacity.value = withTiming(1, { duration: 200 });

    // Auto-dismiss timer
    const timer = setTimeout(() => {
      dismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [insets.top, duration]);

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          backgroundColor: typeConfig.bgColor,
          borderColor: typeConfig.borderColor,
          shadowColor: tokens.color.text.primary,
        },
        animatedStyle,
      ]}
      className="border rounded-2xl mx-5 p-4 flex-row items-start"
    >
      <Ionicons name={typeConfig.icon} size={24} color={typeConfig.color} className="mr-3 mt-0.5" />
      <View className="flex-1 mr-2">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="font-bold text-sm tracking-tight"
        >
          {title}
        </Text>
        {message ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs mt-1 font-semibold leading-relaxed"
          >
            {message}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={() => dismiss()} className="p-1">
        <Ionicons name="close" size={18} color={tokens.color.text.placeholder} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// CUSTOM ALERT MODAL COMPONENT
// ---------------------------------------------------------------------------

interface AlertModalProps extends AlertOptions {
  visible: boolean;
  onDismiss: () => void;
}

function AlertModalComponent({ type, title, message, buttons, visible, onDismiss }: AlertModalProps) {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  const typeConfig = {
    success: {
      icon: 'checkmark-circle' as const,
      color: tokens.color.success.default,
      bgColor: isDark ? '#064E3B' : '#DCFCE7',
    },
    error: {
      icon: 'close-circle' as const,
      color: tokens.color.error.default,
      bgColor: isDark ? '#7F1D1D' : '#FEE2E2',
    },
    warning: {
      icon: 'warning' as const,
      color: tokens.color.warning.default,
      bgColor: isDark ? '#78350F' : '#FEF3C7',
    },
    info: {
      icon: 'information-circle' as const,
      color: tokens.color.info.default,
      bgColor: isDark ? '#1E3A8A' : '#DBEAFE',
    },
    question: {
      icon: 'help-circle' as const,
      color: tokens.color.primary[500],
      bgColor: isDark ? tokens.color.primary[900] + '30' : '#FEF3C7',
    },
  }[type];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 18, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value = withTiming(0.9, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible]);

  const handleButtonPress = (btnPress?: () => void) => {
    onDismiss();
    if (btnPress) {
      setTimeout(() => {
        btnPress();
      }, 100);
    }
  };

  const finalButtons = buttons && buttons.length > 0 
    ? buttons 
    : [{ text: 'OK', onPress: () => {}, style: 'default' as const }];

  const renderButtons = () => {
    const isStack = finalButtons.length > 2;

    return (
      <View className={`mt-6 ${isStack ? 'flex-col gap-2.5' : 'flex-row gap-3'}`}>
        {finalButtons.map((btn, idx) => {
          const isCancel = btn.style === 'cancel';
          const isDestructive = btn.style === 'destructive';
          
          let btnBg: string = tokens.color.primary[500];
          let btnText = '#FFFFFF';
          let borderStyle = {};

          if (isCancel) {
            btnBg = 'transparent';
            btnText = tokens.color.text.secondary;
            borderStyle = {
              borderWidth: 1,
              borderColor: tokens.color.border.default,
            };
          } else if (isDestructive) {
            btnBg = tokens.color.error.default;
            btnText = '#FFFFFF';
          }

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.8}
              onPress={() => handleButtonPress(btn.onPress)}
              style={[
                styles.button,
                { backgroundColor: btnBg, ...borderStyle, height: 48, justifyContent: 'center', alignItems: 'center' },
              ]}
              className="flex-1 rounded-2xl"
            >
              <Text
                style={{ color: btnText, includeFontPadding: false, textAlignVertical: 'center' }}
                className={`text-xs font-black uppercase tracking-wider ${isCancel ? 'font-bold' : ''}`}
              >
                {btn.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} className="bg-black/50 justify-center items-center px-6" onPress={onDismiss}>
        <Animated.View
          style={[
            styles.modalCard,
            animatedStyle,
          ]}
          className="w-full max-w-[360px]"
        >
          <Pressable onPress={() => {}} style={{ width: '100%' }}>
            <View
              style={{
                backgroundColor: tokens.color.surface.elevated,
                borderColor: tokens.color.border.default,
                paddingTop: 28,
                paddingBottom: 32,
                paddingHorizontal: 24,
              }}
              className="w-full rounded-[32px] border shadow-2xl items-center"
            >
              {/* Header Icon */}
              <View
                style={{ backgroundColor: typeConfig.bgColor }}
                className="w-14 h-14 rounded-full items-center justify-center mb-4"
              >
                <Ionicons name={typeConfig.icon} size={28} color={typeConfig.color} />
              </View>

              {/* Text Content */}
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-lg font-black text-center tracking-tight mb-2"
              >
                {title}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold text-center leading-relaxed px-1"
              >
                {message}
              </Text>

              {/* Render CTA Buttons */}
              <View className="w-full">{renderButtons()}</View>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// PROVIDER
// ---------------------------------------------------------------------------

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [alert, setAlert] = useState<AlertOptions | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);

  const activeToastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((options: ToastOptions) => {
    // Dismiss any existing toast first
    setToast(null);
    if (activeToastTimeout.current) {
      clearTimeout(activeToastTimeout.current);
    }

    // Small delay to let old toast unmount if needed
    activeToastTimeout.current = setTimeout(() => {
      setToast(options);
    }, 50);
  }, []);

  const showAlert = useCallback((options: AlertOptions) => {
    setAlert(options);
    setAlertVisible(true);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const hideAlert = useCallback(() => {
    setAlertVisible(false);
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast, showAlert, hideToast, hideAlert }}>
      {children}

      {/* Floating Toast Notification Container */}
      {toast ? (
        <View style={styles.toastOverlay} pointerEvents="box-none">
          <ToastComponent
            type={toast.type}
            title={toast.title}
            message={toast.message}
            duration={toast.duration}
            onDismiss={hideToast}
          />
        </View>
      ) : null}

      {/* Global Alert Modal Container */}
      {alert ? (
        <AlertModalComponent
          type={alert.type}
          title={alert.title}
          message={alert.message}
          buttons={alert.buttons}
          visible={alertVisible}
          onDismiss={hideAlert}
        />
      ) : null}
    </NotificationContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

export const useNotification = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  toastOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999, // Super high zIndex to float above tabs/screens
    pointerEvents: 'box-none',
  },
  toastContainer: {
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      web: {
        shadowColor: 'rgba(0,0,0,0.1)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 16,
      },
    }),
  },
  overlay: {
    flex: 1,
  },
  modalCard: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  button: {
    minWidth: 100,
  },
});
