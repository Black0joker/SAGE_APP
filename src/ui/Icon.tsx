import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * Icon wrapper.
 *
 * The web app uses Material Symbols ligatures; this is the closest equivalent set
 * in `@expo/vector-icons`. Glyph meanings are kept identical (DESIGN §8.1).
 */
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <MaterialIcons name={name} size={size} color={color} />;
}

/** Semantic names used across screens, mapped once. */
export const Icons = {
  brand: 'spa',
  schedule: 'event',
  memory: 'psychology',
  documents: 'description',
  trusted: 'verified-user',
  call: 'call',
  chat: 'forum',
  language: 'language',
  light: 'light-mode',
  dark: 'dark-mode',
  send: 'arrow-upward',
  stop: 'stop',
  close: 'close',
  trash: 'delete-outline',
  back: 'arrow-back',
  mic: 'mic',
  micOff: 'mic-off',
  logout: 'logout',
  person: 'person-outline',
  mail: 'mail-outline',
  lock: 'lock-outline',
  lockReset: 'lock-reset',
  arrowForward: 'arrow-forward',
  check: 'check',
  place: 'place',
  warning: 'error-outline',
  share: 'ios-share',
  download: 'file-download',
  refresh: 'refresh',
  add: 'add',
  chevronDown: 'expand-more',
  chevronUp: 'expand-less',
  info: 'info-outline',
  settings: 'settings',
} as const satisfies Record<string, IconName>;
