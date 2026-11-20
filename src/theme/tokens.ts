/**
 * Design tokens — a direct port of DESIGN.md §2 (colour, type, radius, shadow).
 * Keep this file in sync with the web app; screens must never hard-code hexes.
 */

export const palette = {
  brand: {
    50: '#eef5f1',
    100: '#dbe5e0',
    200: '#b9ede0',
    300: '#9ed1c4',
    400: '#7ca89b',
    500: '#5b8f7a',
    600: '#3b665b',
    700: '#1c4f45',
    800: '#143f36',
    900: '#0f3d33',
    950: '#00261e',
  },
  sand: {
    50: '#faf9f5',
    100: '#f5f4f0',
    200: '#e3e2df',
    300: '#d8d6d1',
    400: '#b6b4ae',
    500: '#8a8883',
  },
} as const;

export type AppTheme = {
  mode: 'light' | 'dark';
  page: string;
  root: string;
  surface: string;
  card: string;
  cardBorder: string;
  border: string;
  text: string;
  textMuted: string;
  textMeta: string;
  label: string;
  input: string;
  inputBorder: string;
  placeholder: string;
  focus: string;
  glow: string;
  bubbleAssistant: string;
  bubbleAssistantText: string;
  bubbleUser: string;
  bubbleUserText: string;
  bubbleError: string;
  bubbleErrorText: string;
  dangerBg: string;
  dangerBorder: string;
  dangerText: string;
  successBg: string;
  successBorder: string;
  successText: string;
  warningBg: string;
  warningText: string;
  warningBorder: string;
  navChip: string;
  navChipActive: string;
  chipText: string;
  avatarGradient: readonly [string, string];
  orbGradient: readonly [string, string];
};

export const lightTheme: AppTheme = {
  mode: 'light',
  page: palette.sand[50],
  /** Matches the web root background fill (`#f8fafc`) applied on toggle. */
  root: '#f8fafc',
  surface: '#ffffff',
  card: '#ffffff',
  cardBorder: 'rgba(227,226,223,0.8)',
  border: palette.sand[200],
  text: palette.brand[950],
  textMuted: palette.brand[600],
  textMeta: palette.sand[500],
  label: '#57635e',
  input: '#ffffff',
  inputBorder: palette.sand[200],
  placeholder: palette.sand[500],
  focus: palette.brand[600],
  glow: 'rgba(59,102,91,0.30)',
  bubbleAssistant: '#e8f2ec',
  bubbleAssistantText: '#1b2a24',
  bubbleUser: palette.brand[900],
  bubbleUserText: '#ffffff',
  bubbleError: '#fef2f2',
  bubbleErrorText: '#b91c1c',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  dangerText: '#b91c1c',
  successBg: palette.brand[50],
  successBorder: palette.brand[200],
  successText: palette.brand[800],
  warningBg: '#fef9e7',
  warningText: '#8a6d1a',
  warningBorder: '#f3e3b3',
  navChip: palette.sand[100],
  navChipActive: palette.sand[200],
  chipText: palette.brand[700],
  avatarGradient: ['#0f3d33', '#5b8f7a'] as const,
  orbGradient: ['#0f3d33', '#5b8f7a'],
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  page: '#0b1512',
  /** Matches the web root background fill (`#020617`) applied on toggle. */
  root: '#020617',
  surface: '#141d1b',
  card: '#1a2320',
  cardBorder: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.1)',
  text: palette.sand[100],
  textMuted: palette.sand[400],
  textMeta: '#8a938e',
  label: '#a7b1ac',
  input: '#16211d',
  inputBorder: '#2f3835',
  placeholder: '#8a938e',
  focus: palette.brand[300],
  glow: 'rgba(158,209,196,0.24)',
  bubbleAssistant: '#1a2320',
  bubbleAssistantText: '#eef2ef',
  bubbleUser: '#b9ede0',
  bubbleUserText: '#00261e',
  bubbleError: '#2a1414',
  bubbleErrorText: '#fca5a5',
  dangerBg: 'rgba(127,29,29,0.25)',
  dangerBorder: '#7f1d1d',
  dangerText: '#fca5a5',
  successBg: 'rgba(15,61,51,0.4)',
  successBorder: palette.brand[700],
  successText: palette.brand[100],
  warningBg: '#2b2412',
  warningText: '#f0d98a',
  warningBorder: '#5a4a1d',
  navChip: 'rgba(255,255,255,0.05)',
  navChipActive: 'rgba(255,255,255,0.1)',
  chipText: palette.brand[200],
  avatarGradient: ['#0f3d33', '#5b8f7a'] as const,
  orbGradient: ['#0f3d33', '#5b8f7a'],
};

export const radius = {
  input: 12,
  bubble: 16,
  callBubble: 14,
  card: 16,
  authCard: 28,
  pill: 9999,
} as const;

/** Font family names registered by `useAppFonts()` in the root layout. */
export const fonts = {
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  heading: 'PlusJakartaSans_700Bold',
  headingExtra: 'PlusJakartaSans_800ExtraBold',
  headingSemibold: 'PlusJakartaSans_600SemiBold',
  arabic: 'NotoSansArabic_400Regular',
  arabicMedium: 'NotoSansArabic_500Medium',
  arabicSemibold: 'NotoSansArabic_600SemiBold',
  arabicBold: 'NotoSansArabic_700Bold',
} as const;

/** Tailwind's 4px scale, as used by the web layout. */
export const space = (n: number) => n * 4;

/** The app shell column width (DESIGN §3.1). */
export const SHELL_MAX_WIDTH = 880;

export const opacity = {
  disabledPrimary: 0.4,
  disabledSecondary: 0.6,
  pendingBubble: 0.65,
} as const;

/** Line heights from DESIGN §2.2 — Arabic text gets a taller line. */
export const lineHeight = {
  body: 1.65,
  arabic: 1.75,
  transcript: 1.6,
} as const;
