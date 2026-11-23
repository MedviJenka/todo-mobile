import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, View, type HostInstance, type KeyboardEvent } from 'react-native';
import Animated, { Easing, SlideInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Wait for the sheet to land before raising the keyboard, so the two never animate against each other. */
const FOCUS_DELAY_MS = 280;

/**
 * Bottom sheet for short forms. It keeps its own height and rides on top of the keyboard. The lift
 * is measured (how far the keyboard overlaps this screen) rather than assumed, so it is right on
 * iOS, on edge-to-edge Android, and on Android builds where the window resizes (overlap is then 0).
 */
export function KeyboardSheet({
  onClose,
  focusRef,
  children,
}: {
  onClose: () => void;
  /** Focused once the sheet has landed. */
  focusRef?: RefObject<{ focus: () => void } | null>;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenRef = useRef<HostInstance>(null);
  const lift = useSharedValue(0);

  // Bottom padding while the keyboard is closed. Everything above the content gap is safe-area
  // room that the keyboard covers anyway, so it comes off the lift.
  const restingPadding = Math.max(insets.bottom, Spacing.three) + Spacing.three;
  const safeRoom = restingPadding - Spacing.three - Spacing.two;

  useEffect(() => {
    const focusTimer = focusRef ? setTimeout(() => focusRef.current?.focus(), FOCUS_DELAY_MS) : undefined;

    const move = (target: number, duration: number) => {
      lift.value = withTiming(target, { duration: Math.max(duration, 120), easing: Easing.out(Easing.cubic) });
    };
    const onShow = (e: KeyboardEvent) => {
      const keyboardTop = e.endCoordinates.screenY;
      const duration = e.duration || 220;
      screenRef.current?.measureInWindow((_x, y, _w, height) => {
        move(Math.max(0, y + height - keyboardTop - safeRoom), duration);
      });
    };
    const onHide = (e: KeyboardEvent) => move(0, e?.duration || 200);

    const subs =
      Platform.OS === 'ios'
        ? [Keyboard.addListener('keyboardWillChangeFrame', onShow), Keyboard.addListener('keyboardWillHide', onHide)]
        : [Keyboard.addListener('keyboardDidShow', onShow), Keyboard.addListener('keyboardDidHide', onHide)];

    return () => {
      clearTimeout(focusTimer);
      subs.forEach((s) => s.remove());
    };
  }, [focusRef, lift, safeRoom]);

  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value }] }));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View ref={screenRef} style={styles.screen}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View style={liftStyle}>
          <Animated.View
            entering={SlideInDown.duration(260).easing(Easing.out(Easing.cubic))}
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: restingPadding }]}>
            <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
            {children}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(8, 10, 20, 0.4)' },
  sheet: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two + 2,
    gap: Spacing.three,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderCurve: 'continuous',
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: Spacing.one },
});
