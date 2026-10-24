// Speech Recognition & Synthesis Service

// Declare SpeechRecognition interfaces for TypeScript without external lib conflicts
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

const customWindow = typeof window !== 'undefined' ? (window as unknown as IWindow) : null;
const SpeechRecognitionClass = customWindow?.SpeechRecognition || customWindow?.webkitSpeechRecognition || null;

export const isSpeechRecognitionSupported = Boolean(SpeechRecognitionClass);
export const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let activeRecognition: any = null;

export interface RecognitionCallbacks {
  onStart?: () => void;
  onInterim?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export function startSpeechRecognition(callbacks: RecognitionCallbacks): () => void {
  if (!SpeechRecognitionClass) {
    if (callbacks.onError) {
      callbacks.onError('Speech recognition is not supported in this browser. Please type your response or use Chrome/Edge.');
    }
    return () => {};
  }

  // Abort any ongoing recognition
  stopSpeechRecognition();

  try {
    const recognition = new SpeechRecognitionClass();
    activeRecognition = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
      if (callbacks.onStart) callbacks.onStart();
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      if (interim && callbacks.onInterim) {
        callbacks.onInterim(interim);
      }
      if (finalTranscript && callbacks.onFinal) {
        callbacks.onFinal(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      let message = 'Speech recognition error';
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        message = 'Microphone permission was denied. Please allow microphone access in your browser bar.';
      } else if (event.error === 'no-speech') {
        message = 'No speech detected. Please speak closer to your microphone.';
      } else if (event.error === 'network') {
        message = 'Network error while attempting speech recognition.';
      } else if (event.error === 'audio-capture') {
        message = 'No microphone was found on your device.';
      }
      if (callbacks.onError) callbacks.onError(message);
    };

    recognition.onend = () => {
      activeRecognition = null;
      if (callbacks.onEnd) callbacks.onEnd();
    };

    recognition.start();

    return () => {
      try {
        recognition.stop();
      } catch (e) {
        // Ignore stop error
      }
    };
  } catch (err: any) {
    if (callbacks.onError) callbacks.onError(err.message || 'Could not start microphone');
    return () => {};
  }
}

export function stopSpeechRecognition(): void {
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch (e) {
      // Ignore
    }
    activeRecognition = null;
  }
}

// Speech Synthesis (Text to Speech)
let availableVoices: SpeechSynthesisVoice[] = [];

export function getEnglishVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported) {
      return resolve([]);
    }

    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const english = all.filter((v) => v.lang.startsWith('en'));
      availableVoices = english.length > 0 ? english : all;
      resolve(availableVoices);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      load();
    } else {
      window.speechSynthesis.onvoiceschanged = load;
      setTimeout(load, 500);
    }
  });
}

export function speakText(text: string, voiceURI?: string, rate: number = 0.95): Promise<void> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported || !text) {
      return resolve();
    }

    window.speechSynthesis.cancel(); // Stop any pending speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate; // slightly slower for language learners
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    if (voiceURI && availableVoices.length > 0) {
      const found = availableVoices.find((v) => v.voiceURI === voiceURI);
      if (found) {
        utterance.voice = found;
      }
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported) {
    window.speechSynthesis.cancel();
  }
}
