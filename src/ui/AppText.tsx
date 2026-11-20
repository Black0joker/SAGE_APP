import { Text, type TextProps, type TextStyle } from 'react-native';

import { useT } from '@/i18n/useT';
import { fonts, lineHeight, palette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';

/**
 * Text with the design's type ramp baked in (DESIGN §2.2).
 *
 * Arabic swaps the whole font stack and raises the line-height to 1.75 — the
 * Arabic font is named explicitly rather than left to the system fallback.
 */

export type TextVariant =
  | 'wordmark'
  | 'hero'
  | 'pageTitle'
  | 'sectionTitle'
  | 'body'
  | 'transcript'
  | 'hint'
  | 'meta'
  | 'status'
  | 'label'
  | 'badge'
  | 'button';

type Props = TextProps & {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  bold?: boolean;
};

function familyFor(variant: TextVariant, arabic: boolean, bold: boolean): string {
  if (arabic) {
    switch (variant) {
      case 'hero':
      case 'pageTitle':
      case 'sectionTitle':
      case 'wordmark':
        return fonts.arabicBold;
      case 'label':
      case 'badge':
      case 'button':
        return fonts.arabicSemibold;
      default:
        return bold ? fonts.arabicSemibold : fonts.arabic;
    }
  }
  switch (variant) {
    case 'hero':
      return fonts.headingExtra;
    case 'pageTitle':
      return fonts.headingExtra;
    case 'sectionTitle':
      return fonts.heading;
    case 'wordmark':
      return fonts.headingExtra;
    case 'label':
    case 'badge':
    case 'button':
      return fonts.bodySemibold;
    case 'meta':
    case 'status':
      return fonts.bodyMedium;
    default:
      return bold ? fonts.bodySemibold : fonts.body;
  }
}

function sizeFor(variant: TextVariant): Pick<TextStyle, 'fontSize' | 'lineHeight' | 'letterSpacing'> {
  switch (variant) {
    case 'wordmark':
      return { fontSize: 15, letterSpacing: 2.1 };
    case 'hero':
      return { fontSize: 32, lineHeight: 37 };
    case 'pageTitle':
      return { fontSize: 24, lineHeight: 30 };
    case 'sectionTitle':
      return { fontSize: 18, lineHeight: 24 };
    case 'body':
      return { fontSize: 15, lineHeight: 25 };
    case 'transcript':
      return { fontSize: 14.4, lineHeight: 23 };
    case 'hint':
      return { fontSize: 14, lineHeight: 21 };
    case 'meta':
      return { fontSize: 12, lineHeight: 17 };
    case 'status':
      return { fontSize: 11, lineHeight: 15 };
    case 'label':
      return { fontSize: 12, lineHeight: 16, letterSpacing: 0.5 };
    case 'badge':
      return { fontSize: 11, lineHeight: 14 };
    case 'button':
      return { fontSize: 14, lineHeight: 19 };
  }
}

export function AppText({ variant = 'body', color, align, bold, style, ...rest }: Props) {
  const theme = useAppTheme();
  const { isRtl } = useT();

  const defaultColor =
    variant === 'meta' || variant === 'status'
      ? theme.textMeta
      : variant === 'hint'
        ? theme.textMuted
        : theme.text;

  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: familyFor(variant, isRtl, Boolean(bold)),
          color: color ?? defaultColor,
          ...sizeFor(variant),
        },
        variant === 'label' ? { textTransform: 'uppercase' as const } : null,
        variant === 'transcript' ? { lineHeight: 23 } : null,
        isRtl ? { lineHeight: Math.round((sizeFor(variant).fontSize ?? 15) * lineHeight.arabic) } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}

/** Convenience for the brand wordmark colour used in the top bar. */
export const wordmarkColor = palette.brand[900];
