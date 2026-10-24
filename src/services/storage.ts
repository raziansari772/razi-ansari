import { UserSettings, UserProgress, VocabWord, PracticeRecord } from '../types';
import { INITIAL_VOCABULARY } from '../data/initialData';

const SETTINGS_KEY = 'speakfluent_settings_v1';
const PROGRESS_KEY = 'speakfluent_progress_v1';
const VOCAB_KEY = 'speakfluent_vocab_v1';

export const DEFAULT_SETTINGS: UserSettings = {
  userName: 'Learner',
  level: 'Beginner',
  explanationLanguage: 'English',
  voiceURI: '',
  autoPlayAudio: true,
};

function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function loadProgress(): UserProgress {
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  const defaultProgress: UserProgress = {
    streakDays: 0,
    lastPracticeDate: '',
    todayCompletedCount: 0,
    totalSessions: 0,
    history: [],
  };

  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const parsed: UserProgress = JSON.parse(raw);
      // Check day rollover
      if (parsed.lastPracticeDate !== today) {
        parsed.todayCompletedCount = 0;
        // If they missed more than 1 day, streak is 0 until they practice
        if (parsed.lastPracticeDate !== yesterday && parsed.lastPracticeDate !== '') {
          parsed.streakDays = 0;
        }
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load progress:', e);
  }

  return defaultProgress;
}

export function saveProgress(progress: UserProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.error('Failed to save progress:', e);
  }
}

export function recordCompletedExercise(record: Omit<PracticeRecord, 'id' | 'timestamp'>): UserProgress {
  const progress = loadProgress();
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  // Streak logic
  if (progress.lastPracticeDate === today) {
    // Already practiced today, don't double increment streak
  } else if (progress.lastPracticeDate === yesterday) {
    // Consecutive day
    progress.streakDays += 1;
  } else {
    // First practice or streak was broken
    progress.streakDays = 1;
  }

  progress.lastPracticeDate = today;
  progress.todayCompletedCount += 1;
  progress.totalSessions += 1;

  const fullRecord: PracticeRecord = {
    id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: Date.now(),
    ...record,
  };

  progress.history.unshift(fullRecord);
  if (progress.history.length > 50) {
    progress.history = progress.history.slice(0, 50);
  }

  saveProgress(progress);
  return progress;
}

export function loadVocabulary(): VocabWord[] {
  try {
    const raw = localStorage.getItem(VOCAB_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load vocabulary:', e);
  }
  return INITIAL_VOCABULARY;
}

export function saveVocabulary(words: VocabWord[]): void {
  try {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(words));
  } catch (e) {
    console.error('Failed to save vocabulary:', e);
  }
}

export function addCustomWord(newWord: Omit<VocabWord, 'id' | 'isLearned' | 'isSaved' | 'isCustom'>): VocabWord[] {
  const current = loadVocabulary();
  const wordItem: VocabWord = {
    id: 'custom_' + Date.now(),
    isLearned: false,
    isSaved: true,
    isCustom: true,
    ...newWord,
  };
  current.unshift(wordItem);
  saveVocabulary(current);
  return current;
}

export function toggleWordLearned(id: string): VocabWord[] {
  const list = loadVocabulary();
  const found = list.find((w) => w.id === id);
  if (found) {
    found.isLearned = !found.isLearned;
    saveVocabulary(list);
  }
  return list;
}

export function toggleWordSaved(id: string): VocabWord[] {
  const list = loadVocabulary();
  const found = list.find((w) => w.id === id);
  if (found) {
    found.isSaved = !found.isSaved;
    saveVocabulary(list);
  }
  return list;
}

export function resetAllData(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(VOCAB_KEY);
    localStorage.removeItem('speakfluent_conversation_history');
  } catch (e) {
    console.error('Failed to reset data:', e);
  }
}
