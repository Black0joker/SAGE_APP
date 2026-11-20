import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { fonts, radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { useT } from '@/i18n/useT';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  icon?: IconName;
  /** Reveals a show/hide control; used for every password input. */
  revealable?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
};

export function Field({
  label,
  hint,
  icon,
  revealable,
  containerStyle,
  testID,
  multiline,
  ...rest
}: FieldProps) {
  const theme = useAppTheme();
  const { isRtl } = useT();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = focused ? theme.focus : theme.inputBorder;

  return (
    <View style={[{ gap: space(1.5) }, containerStyle]}>
      <AppText variant="label" color={theme.label}>
        {label}
      </AppText>

      <View
        style={{
          flexDirection: isRtl ? 'row-reverse' : 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: space(2),
          backgroundColor: theme.input,
          borderWidth: focused ? 2 : 1,
          borderColor,
          borderRadius: radius.input,
          paddingHorizontal: space(3),
          paddingVertical: multiline ? space(2.5) : space(1.5),
          minHeight: multiline ? 96 : 46,
        }}
      >
        {icon ? <Icon name={icon} size={18} color={theme.textMeta} /> : null}

        <TextInput
          testID={testID}
          {...rest}
          multiline={multiline}
          secureTextEntry={revealable ? !revealed : rest.secureTextEntry}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          placeholderTextColor={theme.placeholder}
          selectionColor={theme.focus}
          // 16px keeps mobile browsers from zooming on focus (DESIGN §3.5).
          style={{
            flex: 1,
            fontFamily: isRtl ? fonts.arabic : fonts.body,
            fontSize: multiline ? 15 : 16,
            lineHeight: isRtl ? 28 : 22,
            color: theme.text,
            paddingVertical: 0,
            textAlign: isRtl ? 'right' : 'left',
            minHeight: multiline ? 72 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />

        {revealable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setRevealed((value) => !value)}
          >
            <Icon name={revealed ? 'visibility-off' : 'visibility'} size={18} color={theme.textMeta} />
          </Pressable>
        ) : null}
      </View>

      {hint ? (
        <AppText variant="meta" color={theme.textMeta}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
