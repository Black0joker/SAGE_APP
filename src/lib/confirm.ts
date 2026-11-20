import { Alert, Platform } from 'react-native';

/**
 * Destructive confirmation. On native this is `Alert.alert` with a destructive
 * action (DESIGN §8.1); on web it falls back to the browser prompt.
 */
export function confirmDestructive({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    const accepted = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true;
    if (accepted) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
