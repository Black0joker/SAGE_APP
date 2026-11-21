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
  /** Push-to-talk: true only between tapping Record and tapping Stop. */
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [partial, setPartial] = useState('');
  /** Finals captured during this recording, shown live before the send. */
  const [captured, setCaptured] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const streamRef = useRef<StreamController | null>(null);
  const speechRef = useRef<SpeechQueue | null>(null);
  const assistantBufferRef = useRef('');
  /** Index into `assistantBufferRef` up to which text has been queued for speech. */
  const flushedLengthRef = useRef(0);
  const assistantTurnIdRef = useRef<string | null>(null);
  const recordingRef = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  /** True between a user hang-up and the next call, so `onClose` skips the flush. */
  const phaseStoppedRef = useRef(false);
  /** Finals accumulated during the current recording, in order. */
  const sessionTextRef = useRef('');
  /** Set when the user taps Stop: the next final/end must send the buffer. */
  const pendingSendRef = useRef(false);
  /** Safety net for recognizers that never emit a final after stop. */
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusQuery = useQuery({ queryKey: keys.voiceStatus, queryFn: () => voice.status() });

  // Both chat and call ping location while in the foreground (API.md §7.4).
  useLocationPing(true);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

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

  const handleFinalSpeech = useCallback((transcript: string) => {
    const text = transcript.trim();
    if (!text) return;
    // Accumulate: nothing is sent until the user taps Stop.
    sessionTextRef.current = sessionTextRef.current ? `${sessionTextRef.current} ${text}` : text;
    setCaptured(sessionTextRef.current);
    setPartial('');
  }, []);

  /**
   * Sends whatever has been captured, exactly once, then resets the session.
   *
   * `force` is used by the safety timer, which must send even if the engine never
   * signals the end of the utterance.
   */
  const flushRecording = useCallback((force = false) => {
    if (!pendingSendRef.current) return;
    if (!force && recordingRef.current) return;
    pendingSendRef.current = false;

    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }

    const text = sessionTextRef.current.trim();
    sessionTextRef.current = '';
    setCaptured('');
    setPartial('');
    if (!text) return; // nothing was said: send nothing

    setTurns((current) => [...current, { id: nextTurnId(), role: 'user', content: text }]);
    runAssistantTurn({ message: text });
  }, [runAssistantTurn]);

  const startRecording = useCallback(() => {
    if (phaseRef.current !== 'live' || speaking) return;
    sessionTextRef.current = '';
    pendingSendRef.current = false;
    setCaptured('');
    setPartial('');
    setRecording(true);
    recordingRef.current = true;
    startRecognition(language);
  }, [language, speaking]);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    setRecording(false);
    recordingRef.current = false;
    // Ask the engine to finalise; the result arrives asynchronously in `onFinal`.
    pendingSendRef.current = true;
    stopRecognition();

    // Some Android recognizers never emit a final after stop, so never hang.
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(() => flushRecording(true), 1500);
  }, [flushRecording]);

  useEffect(() => {
    if (phase !== 'live') return;

    const unsubscribe = addRecognitionListeners({
      onEnd: () => {
        // Push-to-talk: resume only while the user is still recording.
        if (recordingRef.current) {
          setTimeout(() => {
            if (recordingRef.current) startRecognition(language);
          }, 300);
        } else if (pendingSendRef.current) {
          // The engine finished: send everything captured for this utterance.
          flushRecording();
        }
      },
      onPartial: (transcript) => setPartial(transcript),
      onFinal: (transcript) => {
        handleFinalSpeech(transcript);
        // Do NOT send here: continuous mode can emit several finals for one
        // utterance. The send happens on `onEnd`, or via the safety timer.
      },
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
        // Stop cleanly, keeping whatever was already captured.
        setRecording(false);
        recordingRef.current = false;
      },
    });

    return unsubscribe;
  }, [flushRecording, handleFinalSpeech, language, phase, t]);

  useEffect(
    () => () => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    },
    [],
  );

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
    // Nothing listens until the user taps Record.

    // The greeting turn: with no messages, the server has the assistant open.
    runAssistantTurn({ greeting: true });
  }, [language, runAssistantTurn, statusQuery.data?.default_voice, t]);

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
    // Discard an in-progress recording: a hung-up call must not send it.
    pendingSendRef.current = false;
    sessionTextRef.current = '';
    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    setRecording(false);
    recordingRef.current = false;
    speechRef.current?.clear();
    speechRef.current = null;
    abortRecognition();
    setSpeaking(false);
    setStreaming(false);
    setPartial('');
    setCaptured('');
    setPhase('ended');
    phaseRef.current = 'ended';
  }, []);

  useEffect(
    () => () => {
      // Leaving the screen must stop the microphone and any audio.
      speechRef.current?.clear();
      abortRecognition();
      streamRef.current?.abort();
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    },
    [],
  );

  /** Push-to-talk toggle. Disabled while SAGE is speaking, so it never hears itself. */
  const toggleRecording = useCallback(() => {
    if (recordingRef.current) stopRecording();
    else startRecording();
  }, [startRecording, stopRecording]);

  const statusText = useMemo(() => {
    if (phase === 'idle') return t('ready');
    if (phase === 'connecting') return t('connecting');
    if (phase === 'ended') return t('callEnded');
    if (recording) return t('recording');
    if (speaking) return t('speaking');
    if (streaming) return t('thinking');
    return t('ready');
  }, [phase, recording, speaking, streaming, t]);

  const pulse: 'none' | 'listening' | 'speaking' =
    phase !== 'live' ? 'none' : speaking ? 'speaking' : recording ? 'listening' : 'none';

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
      });
    }
    runAssistantTurn({ message: text });
  }, [draft, language, runAssistantTurn, statusQuery.data?.default_voice]);

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
                // Push-to-talk: tap to open the mic, tap again to stop and send.
                label={recording ? t('stopRecording') : t('record')}
                variant={recording ? 'primary' : 'secondary'}
                icon={recording ? 'stop' : 'mic'}
                onPress={toggleRecording}
                disabled={speaking}
                accessibilityHint={t('recordHint')}
                testID="record-toggle"
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

          {captured || partial ? (
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
                  {[captured, partial].filter(Boolean).join(' ')}
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
