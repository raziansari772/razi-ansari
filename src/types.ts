export type LearningLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type ExplanationLanguage = 'English' | 'Urdu';

export interface UserSettings {
  userName: string;
  level: LearningLevel;
  explanationLanguage: ExplanationLanguage;
  voiceURI: string;
  autoPlayAudio: boolean;
}

export interface PracticeRecord {
  id: string;
  timestamp: number;
  type: 'conversation' | 'daily' | 'pronunciation';
  title: string;
  snippet: string;
  score?: number;
}

export interface UserProgress {
  streakDays: number;
  lastPracticeDate: string; // YYYY-MM-DD
  todayCompletedCount: number;
  totalSessions: number;
  history: PracticeRecord[];
}

export interface ConversationFeedback {
  originalAnswer: string;
  correctedSentence: string;
  naturalWay: string;
  mistakeExplanation: string;
  vocabularySuggestion: string;
  pronunciationTip: string;
  nextQuestion: string;
  encouragingNote: string;
  source?: string;
  warning?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
  feedback?: ConversationFeedback;
  timestamp: number;
}

export interface DailyQuestion {
  id: string;
  level: LearningLevel;
  category: string;
  question: string;
  hint: string;
}

export interface DailyFeedbackResult {
  originalAnswer: string;
  correctedSentence: string;
  naturalAlternative: string;
  explanation: string;
  vocabularySuggestion: string;
  pronunciationTip: string;
  feedbackSummary: string;
  score: number;
  warning?: string;
}

export interface VocabWord {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
  meaningUrdu?: string;
  category: 'core' | 'phrases' | 'idiom';
  isLearned: boolean;
  isSaved: boolean;
  isCustom?: boolean;
}

export interface PronunciationPreset {
  id: string;
  sentence: string;
  phonetic: string;
  urduTranslation: string;
  level: LearningLevel;
}
