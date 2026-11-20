import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, View, useWindowDimensions } from 'react-native';

import { keys } from '@/api/queryKeys';
import { openChatStream, stopChatStream, type StreamController } from '@/api/stream';
import { voice } from '@/api/endpoints';
import { useLocationPing } from '@/hooks/useLocationPing';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useT } from '@/i18n/useT';
import { SpeechQueue, configureAudioForPlayback } from '@/lib/speech';
import {
  abortRecognition,
  addRecognitionListeners,
  isSpeechRecognitionAvailable,
  requestRecognitionPermissions,
  startRecognition,
  stopRecognition,
} from '@/lib/speechRecognition';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { opacity, radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Composer } from '@/ui/Composer';
import { USE_NATIVE_DRIVER } from '@/ui/anim';
import { Icon } from '@/ui/Icon';

type Phase = 'idle' | 'connecting' | 'live' | 'ended';

type CallTurn = { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean };

let turnCounter = 0;
const nextTurnId = () => `call-${Date.now().toString(36)}-${(turnCounter += 1)}`;

/** Pulsing gradient orb, movement disabled under reduced motion (DESIGN §4.9). */
function Orb({ pulse }: { pulse: 'none' | 'listening' | 'speaking' }) {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced || pulse === 'none') {
      value.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: pulse === 'speaking' ? 550 : 800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: pulse === 'speaking' ? 550 : 800,
          easing: Easing.in(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced, value]);

  const ringScale = value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 140 }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 104,
          height: 104,
          borderRadius: 52,
          backgroundColor: '#5b8f7a',
          transform: [{ scale: ringScale }],
          opacity: ringOpacity,
        }}
      />
      <LinearGradient
        colors={['#0f3d33', '#5b8f7a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 104,
          height: 104,
          borderRadius: 52,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="spa" size={36} color="#dbe5e0" />
      </LinearGradient>
    </View>
  );
}

/**
 * `/call` — voice call mode (DESIGN §5.5).
 *
 * Typing always stays available: every failure mode (voice not configured, mic
 * denied, unsupported language, network loss) explains itself and leaves the
 * composer usable.
 */
export default function CallScreen() {
  const { t, language } = useT();
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const session = useSession();
  const setLanguage = usePrefs((state) => state.setLanguage);

  const [phase, setPhase] = useState<Phase>('idle');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [partial, setPartial] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const streamRef = useRef<StreamController | null>(null);
  const speechRef = useRef<SpeechQueue | null>(null);
  const assistantBufferRef = useRef('');
  /** Index into `assistantBufferRef` up to which text has been queued for speech. */
  const flushedLengthRef = useRef(0);
  const assistantTurnIdRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  /** True between a user hang-up and the next call, so `onClose` skips the flush. */
  const phaseStoppedRef = useRef(false);

  const statusQuery = useQuery({ queryKey: keys.voiceStatus, queryFn: () => voice.status() });

  // Both chat and call ping location while in the foreground (API.md §7.4).
  useLocationPing(true);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /**
   * The status-derived banner is computed rather than stored, so the effect that
   * would otherwise mirror query data into state disappears.
   */
  const statusBanner = useMemo(() => {
    const status = statusQuery.data;
    if (!status) return null;
    if (!status.configured) return t('voiceUnavailable');
    if (status.expired || status.reason?.includes('expired')) return t('voiceExpired');
    if (!status.available) return t('voiceUnavailable');
    return null;
  }, [statusQuery.data, t]);

  const bannerText = banner ?? statusBanner;

  const beginListening = useCallback(() => {
    if (mutedRef.current || phaseRef.current !== 'live') return;
    startRecognition(language);
  }, [language]);

  const pauseListening = useCallback(() => {
    stopRecognition();
  }, []);

  const updateAssistantTurn = useCallback((patch: Partial<CallTurn>) => {
    const id = assistantTurnIdRef.current;
    if (!id) return;
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }, []);

  /** Streams one assistant turn for the given request body. */
  const runAssistantTurn = useCallback(
    (body: { message?: string; greeting?: boolean }) => {
      const queue = speechRef.current;
      assistantBufferRef.current = '';
      flushedLengthRef.current = 0;
      const turnId = nextTurnId();
      assistantTurnIdRef.current = turnId;
      setTurns((current) => [...current, { id: turnId, role: 'assistant', content: '', pending: true }]);
      setStreaming(true);

      /**
       * Speaks everything generated since the last flush as ONE segment.
       *
       * Called at a tool boundary and when generation finishes — never per delta.
       * Speaking sentence-by-sentence produced a request per sentence and choppy
       * audio; slicing by character count against a trimmed `spoken` string also
       * silently dropped the tail at tool boundaries.
       */
      const flushSpeech = () => {
        const buffer = assistantBufferRef.current;
        const from = flushedLengthRef.current;
        if (from >= buffer.length) return;
        const segment = buffer.slice(from);
        flushedLengthRef.current = buffer.length;
        if (segment.trim()) queue?.enqueue(segment);
      };

      const controller = openChatStream(
        {
          language,
          mode: 'call',
          ...(body.message ? { message: body.message } : {}),
          ...(body.greeting ? { greeting: true } : {}),
        },
        {
          onEvent: (event) => {
            if ('delta' in event) {
              assistantBufferRef.current += event.delta;
              updateAssistantTurn({ content: assistantBufferRef.current, pending: false });
              // Text is spoken at the next tool boundary or on `done`.
              return;
            }

            if ('tool' in event && event.tool.status === 'start') {
              // Speak the text that came before this tool, then start fresh.
              flushSpeech();
              return;
            }

            if ('error' in event) {
              setBanner(event.error.message);
              updateAssistantTurn({ pending: false, content: event.error.message });
              return;
            }

            if ('done' in event) {
              // The whole remaining reply — including text after the last tool.
              flushSpeech();
              updateAssistantTurn({ pending: false });
            }
          },
          onError: (error) => {
            setBanner(error.message);
            updateAssistantTurn({ pending: false });
          },
          onClose: () => {
            // A dropped connection still leaves a partial reply worth speaking.
            // A user-initiated stop deletes the turn server-side, so `queue.clear()`
            // has already run and `flushSpeech` is a no-op against a dead queue.
            if (!phaseStoppedRef.current) flushSpeech();
            setStreaming(false);
            streamRef.current = null;
          },
        },
      );

      streamRef.current = controller;
    },
    [language, updateAssistantTurn],
  );

  const handleFinalSpeech = useCallback(
    (transcript: string) => {
      const text = transcript.trim();
      setPartial('');
      if (!text) return;
      setTurns((current) => [...current, { id: nextTurnId(), role: 'user', content: text }]);
      runAssistantTurn({ message: text });
    },
    [runAssistantTurn],
  );

  useEffect(() => {
    if (phase !== 'live') return;

    const unsubscribe = addRecognitionListeners({
      onEnd: () => {
        // The recognizer stops after each final result; resume unless the user
        // muted, the app moved on, or SAGE is talking.
        if (!mutedRef.current && phaseRef.current === 'live') {
          setTimeout(() => {
            if (!mutedRef.current && phaseRef.current === 'live') beginListening();
          }, 400);
        }
      },
      onPartial: (transcript) => setPartial(transcript),
      onFinal: (transcript) => handleFinalSpeech(transcript),
      onError: (code) => {
        if (code.includes('not-allowed') || code.includes('permission')) {
          setBanner(t('micDenied'));
        } else if (code.includes('no-speech') || code.includes('nomatch')) {
          setBanner(t('noSpeech'));
        } else if (code.includes('network')) {
          setBanner(t('micNetwork'));
        } else if (code.includes('language')) {
          setBanner(t('micLanguage'));
        } else if (code.includes('audio-capture')) {
          setBanner(t('micUnavailable'));
        }
      },
    });

    return unsubscribe;
  }, [beginListening, handleFinalSpeech, phase, t]);

  const startCall = useCallback(async () => {
    setBanner(null);
    setTurns([]);
    setPartial('');
    setPhase('connecting');
    // A fresh call may speak again.
    phaseStoppedRef.current = false;

    await configureAudioForPlayback();

    speechRef.current = new SpeechQueue(language, statusQuery.data?.default_voice, (value) => {
      setSpeaking(value);
      // Never let the microphone hear SAGE's own voice.
      if (value) pauseListening();
      else if (!mutedRef.current && phaseRef.current === 'live') beginListening();
    });

    // Typing always works, so this is a warning rather than a failure.
    const nativeAvailable = isSpeechRecognitionAvailable();
    const recognitionReady = nativeAvailable && (await requestRecognitionPermissions());
    if (!recognitionReady) {
      setBanner(
        nativeAvailable
          ? t('micDenied') // native module present, permission refused
          : t('micNoDevBuild'), // Expo Go: the module is not in this runtime
      );
    }

    setPhase('live');
    phaseRef.current = 'live';
    if (recognitionReady) beginListening();

    // The greeting turn: with no messages, the server has the assistant open.
    runAssistantTurn({ greeting: true });
  }, [beginListening, language, pauseListening, runAssistantTurn, statusQuery.data?.default_voice, t]);

  const hangUp = useCallback(() => {
    const controller = streamRef.current;
    const streamId = controller?.getStreamId();
    if (controller && streamId) {
      void stopChatStream(streamId).finally(() => controller.abort());
    } else {
      controller?.abort();
    }
    streamRef.current = null;

    // Set before clearing the queue, so `onClose` never re-speaks a stopped turn
    // (the server deletes it, so there is nothing to say).
    phaseStoppedRef.current = true;
    speechRef.current?.clear();
    speechRef.current = null;
    abortRecognition();
    setSpeaking(false);
    setStreaming(false);
    setPartial('');
    setPhase('ended');
    phaseRef.current = 'ended';
  }, []);

  useEffect(
    () => () => {
      // Leaving the screen must stop the microphone and any audio.
      speechRef.current?.clear();
      abortRecognition();
      streamRef.current?.abort();
    },
    [],
  );

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      if (next) pauseListening();
      else if (phaseRef.current === 'live' && !speaking) beginListening();
      return next;
    });
  }, [beginListening, pauseListening, speaking]);

  const statusText = useMemo(() => {
    if (phase === 'idle') return t('ready');
    if (phase === 'connecting') return t('connecting');
    if (phase === 'ended') return t('callEnded');
    if (speaking) return t('speaking');
    if (streaming) return t('thinking');
    if (muted) return t('muted');
    return t('listening');
  }, [muted, phase, speaking, streaming, t]);

  const pulse: 'none' | 'listening' | 'speaking' =
    phase !== 'live' ? 'none' : speaking ? 'speaking' : streaming || muted ? 'none' : 'listening';

  const sendTyped = useCallback(() => {
    const text = draft.trim();
    setDraft('');
    if (!text) return;
    setTurns((current) => [...current, { id: nextTurnId(), role: 'user', content: text }]);
    if (phaseRef.current !== 'live') {
      // Typing before the call starts still works: treat it as a chat turn.
      setPhase('live');
      phaseRef.current = 'live';
      phaseStoppedRef.current = false;
    }
    // Typing before "Start call" left the queue unset, so nothing was spoken.
    if (!speechRef.current) {
      speechRef.current = new SpeechQueue(language, statusQuery.data?.default_voice, (value) => {
        setSpeaking(value);
        if (value) pauseListening();
        else if (!mutedRef.current && phaseRef.current === 'live') beginListening();
      });
    }
    runAssistantTurn({ message: text });
  }, [
    beginListening,
    draft,
    language,
    pauseListening,
    runAssistantTurn,
    statusQuery.data?.default_voice,
  ]);

  const firstName = session.user?.first_name ?? session.user?.full_name ?? '';

  return (
    <AppShell
      badge={t('badgeCall')}
      showBack={width < 1024}
      footer={
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={sendTyped}
          onStop={phase === 'live' ? hangUp : undefined}
          streaming={streaming}
          placeholder={t('callPlaceholder')}
        />
      }
    >
      <ScrollView
        contentContainerStyle={{ padding: space(5), gap: space(4) }}
        accessibilityLabel="Call transcript"
      >
        <View style={{ alignItems: 'center' }}>
          <Orb pulse={pulse} />
        </View>

        <View style={{ alignItems: 'center', gap: space(1) }}>
          <AppText variant="sectionTitle">{t('callTitle')}</AppText>
          <AppText variant="hint" color={theme.textMuted} align="center">
            {t('callSubtitle')}
          </AppText>
          <AppText variant="meta" color={theme.textMeta}>
            {statusText}
          </AppText>
        </View>

        {bannerText ? <InlineAlert tone="warning" message={bannerText} /> : null}

        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap', justifyContent: 'center' }}>
          {phase === 'idle' || phase === 'ended' ? (
            <Button label={t('start')} icon="call" onPress={() => void startCall()} />
          ) : (
            <>
              <Button label={t('hangup')} variant="hangup" onPress={hangUp} />
              <Button
                label={muted ? t('unmute') : t('mute')}
                variant="secondary"
                icon={muted ? 'mic-off' : 'mic'}
                onPress={toggleMute}
              />
            </>
          )}
          {narrowLanguageToggle(width) ? (
            <Button
              // Shows the language you would switch TO, so the button always
              // reads as an action rather than a status.
              label={language === 'ar' ? 'EN' : 'AR'}
              variant="text"
              onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            />
          ) : null}
        </View>

        <View style={{ width: '100%', gap: space(3), marginTop: space(2) }}>
          {turns.map((turn) => (
            <View
              key={turn.id}
              style={{
                alignItems: turn.role === 'user' ? 'flex-end' : 'flex-start',
                opacity: turn.pending && !turn.content ? opacity.pendingBubble : 1,
              }}
            >
              <AppText variant="badge" color={theme.textMeta} style={{ marginBottom: space(1) }}>
                {turn.role === 'user' ? t('you') : t('sage')}
              </AppText>
              <View
                style={{
                  maxWidth: '88%',
                  backgroundColor: turn.role === 'user' ? theme.bubbleUser : theme.bubbleAssistant,
                  borderRadius: radius.callBubble,
                  paddingHorizontal: space(3.5),
                  paddingVertical: space(3),
                }}
              >
                <AppText
                  variant="transcript"
                  color={turn.role === 'user' ? theme.bubbleUserText : theme.bubbleAssistantText}
                >
                  {turn.content || '…'}
                </AppText>
              </View>
            </View>
          ))}

          {partial ? (
            <View style={{ alignItems: 'flex-end', opacity: 0.65 }}>
              <AppText variant="badge" color={theme.textMeta} style={{ marginBottom: space(1) }}>
                {t('you')}
              </AppText>
              <View
                style={{
                  maxWidth: '88%',
                  backgroundColor: theme.bubbleUser,
                  borderRadius: radius.callBubble,
                  paddingHorizontal: space(3.5),
                  paddingVertical: space(3),
                }}
              >
                <AppText variant="transcript" color={theme.bubbleUserText}>
                  {partial}
                </AppText>
              </View>
            </View>
          ) : null}

          {turns.length === 0 ? (
            <AppText variant="meta" color={theme.textMeta} align="center">
              {firstName ? t('welcomeNamed', { name: firstName }) : t('welcome')}
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </AppShell>
  );
}

/** The language code is hidden on the narrowest screens in the web app (§3.2). */
function narrowLanguageToggle(width: number): boolean {
  return width >= 640;
}
