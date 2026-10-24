import './index.css';
import {
  LearningLevel,
  ExplanationLanguage,
  UserSettings,
  UserProgress,
  VocabWord,
  ConversationMessage,
  DailyQuestion,
  PronunciationPreset,
} from './types';
import {
  INITIAL_TOPICS,
  INITIAL_DAILY_QUESTIONS,
  INITIAL_PRONUNCIATION_PRESETS,
} from './data/initialData';
import {
  loadSettings,
  saveSettings,
  loadProgress,
  recordCompletedExercise,
  loadVocabulary,
  saveVocabulary,
  addCustomWord,
  toggleWordLearned,
  toggleWordSaved,
  resetAllData,
} from './services/storage';
import {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  startSpeechRecognition,
  stopSpeechRecognition,
  getEnglishVoices,
  speakText,
  stopSpeaking,
} from './services/speech';

// --- State Management ---
let currentSettings: UserSettings = loadSettings();
let currentProgress: UserProgress = loadProgress();
let currentVocabulary: VocabWord[] = loadVocabulary();

let activeView: string = 'home';
let currentTopic: string = 'Introduction';
let conversationHistory: ConversationMessage[] = [];
let currentDailyLevel: LearningLevel = currentSettings.level;
let currentDailyQIndex: number = 0;
let filteredDailyQuestions: DailyQuestion[] = [];
let currentPronouncePreset: PronunciationPreset = INITIAL_PRONUNCIATION_PRESETS[0];
let pronounceSpeed: number = 1.0;
let isConvRecording: boolean = false;
let isDailyRecording: boolean = false;
let isPronounceRecording: boolean = false;
let stopConvRecognition: (() => void) | null = null;
let stopDailyRecognition: (() => void) | null = null;
let stopPronounceRecognition: (() => void) | null = null;

// --- DOM Element References ---
const sidebar = document.getElementById('sidebar') as HTMLElement;
const mobileBackdrop = document.getElementById('mobile-backdrop') as HTMLElement;
const mobileMenuBtn = document.getElementById('mobile-menu-btn') as HTMLButtonElement;
const closeSidebarBtn = document.getElementById('close-sidebar-btn') as HTMLButtonElement;
const pageTitle = document.getElementById('page-title') as HTMLElement;
const pageSubtitleBadge = document.getElementById('page-subtitle-badge') as HTMLElement;
const ttsToggleBtn = document.getElementById('tts-toggle-btn') as HTMLButtonElement;
const ttsToggleStatus = document.getElementById('tts-toggle-status') as HTMLElement;
const currentLangIndicator = document.getElementById('current-lang-indicator') as HTMLElement;
const backendStatusPill = document.getElementById('backend-status-pill') as HTMLElement;
const toastContainer = document.getElementById('toast-container') as HTMLElement;

// View sections
const views: Record<string, HTMLElement> = {
  home: document.getElementById('view-home') as HTMLElement,
  conversation: document.getElementById('view-conversation') as HTMLElement,
  daily: document.getElementById('view-daily') as HTMLElement,
  vocabulary: document.getElementById('view-vocabulary') as HTMLElement,
  pronunciation: document.getElementById('view-pronunciation') as HTMLElement,
  progress: document.getElementById('view-progress') as HTMLElement,
  settings: document.getElementById('view-settings') as HTMLElement,
};

// --- Toast Notifications ---
function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
  const toast = document.createElement('div');
  const colors = {
    info: 'bg-slate-900 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-600 text-white',
    error: 'bg-rose-600 text-white',
  };
  toast.className = `${colors[type]} px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-2 transition-all transform translate-y-2 opacity-0`;
  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- Navigation Controller ---
function switchView(viewName: string): void {
  if (!views[viewName]) return;
  activeView = viewName;

  // Toggle active view container
  Object.keys(views).forEach((name) => {
    if (name === viewName) {
      views[name].classList.remove('hidden');
    } else {
      views[name].classList.add('hidden');
    }
  });

  // Update sidebar active buttons
  document.querySelectorAll('.nav-item').forEach((item) => {
    const target = item.getAttribute('data-view');
    if (target === viewName) {
      item.className =
        'nav-item active w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl font-semibold text-sm transition-all text-indigo-600 bg-indigo-50/80';
      const icon = item.querySelector('svg');
      if (icon) icon.setAttribute('class', 'w-5 h-5 text-indigo-600');
    } else {
      item.className =
        'nav-item w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-100';
      const icon = item.querySelector('svg');
      if (icon) icon.setAttribute('class', 'w-5 h-5 text-slate-400');
    }
  });

  // Update header text
  const titles: Record<string, { title: string; subtitle: string }> = {
    home: { title: 'Home Dashboard', subtitle: 'Interactive Speaking' },
    conversation: { title: 'AI Conversation Practice', subtitle: 'Live Voice Dialogue' },
    daily: { title: 'Daily Speaking Questions', subtitle: 'Targeted Exercises' },
    vocabulary: { title: 'Vocabulary Builder', subtitle: 'Words & Phrasal Verbs' },
    pronunciation: { title: 'Pronunciation Lab', subtitle: 'Voice Matching' },
    progress: { title: 'Progress & Analytics', subtitle: 'Real Statistics' },
    settings: { title: 'App Settings', subtitle: 'Preferences & Language' },
  };

  if (titles[viewName]) {
    pageTitle.textContent = titles[viewName].title;
    pageSubtitleBadge.textContent = titles[viewName].subtitle;
  }

  // Close mobile sidebar if open
  closeMobileMenu();

  // Refresh view contents
  if (viewName === 'home') renderHomeDashboard();
  if (viewName === 'conversation' && conversationHistory.length === 0) startConversationTopic(currentTopic);
  if (viewName === 'daily') renderDailyQuestion();
  if (viewName === 'vocabulary') renderVocabularyCards();
  if (viewName === 'pronunciation') renderPronunciationStudio();
  if (viewName === 'progress') renderProgressDashboard();
  if (viewName === 'settings') populateSettingsForm();
}

function openMobileMenu(): void {
  sidebar.classList.remove('-translate-x-full');
  mobileBackdrop.classList.remove('hidden');
}

function closeMobileMenu(): void {
  sidebar.classList.add('-translate-x-full');
  mobileBackdrop.classList.add('hidden');
}

// --- Home Dashboard Controller ---
function renderHomeDashboard(): void {
  currentProgress = loadProgress();

  const userNameEl = document.getElementById('home-user-name');
  if (userNameEl) userNameEl.textContent = currentSettings.userName || 'Learner';

  const streakEl = document.getElementById('stat-streak');
  if (streakEl) streakEl.textContent = `${currentProgress.streakDays} ${currentProgress.streakDays === 1 ? 'Day' : 'Days'}`;

  const mobileStreak = document.getElementById('mobile-streak-counter');
  if (mobileStreak) mobileStreak.textContent = `${currentProgress.streakDays}d`;

  const sidebarStreak = document.getElementById('sidebar-streak-counter');
  if (sidebarStreak) sidebarStreak.textContent = `${currentProgress.streakDays} ${currentProgress.streakDays === 1 ? 'Day' : 'Days'}`;

  const sidebarBadge = document.getElementById('sidebar-level-badge');
  if (sidebarBadge) sidebarBadge.textContent = currentSettings.level;

  const completedTodayEl = document.getElementById('stat-completed-today');
  if (completedTodayEl) completedTodayEl.textContent = String(currentProgress.todayCompletedCount);

  const wordsLearnedCount = currentVocabulary.filter((w) => w.isLearned).length;
  const wordsLearnedEl = document.getElementById('stat-words-learned');
  if (wordsLearnedEl) wordsLearnedEl.textContent = String(wordsLearnedCount);

  const totalSessionsEl = document.getElementById('stat-total-sessions');
  if (totalSessionsEl) totalSessionsEl.textContent = String(currentProgress.totalSessions);

  // Today's Speaking Challenge status
  const challengeStatusEl = document.getElementById('home-challenge-status');
  if (challengeStatusEl) {
    if (currentProgress.todayCompletedCount > 0) {
      challengeStatusEl.textContent = 'Completed Today';
      challengeStatusEl.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
    } else {
      challengeStatusEl.textContent = 'Pending';
      challengeStatusEl.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200';
    }
  }

  // Set today's challenge text based on user level
  const levelQuestions = INITIAL_DAILY_QUESTIONS.filter((q) => q.level === currentSettings.level);
  const todayQ = levelQuestions[0] || INITIAL_DAILY_QUESTIONS[0];
  const challengeTextEl = document.getElementById('home-challenge-text');
  if (challengeTextEl) challengeTextEl.textContent = `"${todayQ.question}"`;
}

// --- AI Conversation Controller ---
function initTopicButtons(): void {
  const container = document.getElementById('topic-buttons-container');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.topic-btn') as HTMLButtonElement;
    if (!btn) return;
    const topic = btn.getAttribute('data-topic');
    if (!topic) return;

    container.querySelectorAll('.topic-btn').forEach((b) => {
      b.className = 'topic-btn px-3 py-1.5 rounded-xl text-xs font-semibold transition-all bg-slate-100 text-slate-700 hover:bg-slate-200';
    });
    btn.className = 'topic-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-xs';

    currentTopic = topic;
    const ind = document.getElementById('conv-topic-indicator');
    if (ind) ind.textContent = `Topic: ${topic}`;
    startConversationTopic(topic);
  });
}

function startConversationTopic(topicName: string): void {
  const data = INITIAL_TOPICS[topicName] || INITIAL_TOPICS['Introduction'];
  conversationHistory = [
    {
      id: 'msg_start_' + Date.now(),
      role: 'ai',
      text: data.starterQuestion,
      timestamp: Date.now(),
    },
  ];
  renderConversationStream();
  if (currentSettings.autoPlayAudio) {
    speakText(data.starterQuestion, currentSettings.voiceURI);
  }
}

function renderConversationStream(): void {
  const stream = document.getElementById('conversation-stream');
  if (!stream) return;

  stream.innerHTML = '';

  conversationHistory.forEach((msg) => {
    if (msg.role === 'ai') {
      const bubble = document.createElement('div');
      bubble.className = 'flex items-start space-x-3 max-w-2xl';
      bubble.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-sm">
          AI
        </div>
        <div class="space-y-1.5">
          <div class="bg-indigo-50/80 border border-indigo-100/90 text-slate-800 p-4 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow-xs">
            <p>${escapeHtml(msg.text)}</p>
          </div>
          <div class="flex items-center space-x-2 pl-1">
            <button class="msg-listen-btn text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1" data-text="${encodeURIComponent(msg.text)}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
              <span>Listen</span>
            </button>
          </div>
        </div>
      `;
      stream.appendChild(bubble);
    } else {
      // User message + structured AI Feedback card below it
      const userBox = document.createElement('div');
      userBox.className = 'space-y-3';

      const userBubble = document.createElement('div');
      userBubble.className = 'flex items-start justify-end space-x-3';
      userBubble.innerHTML = `
        <div class="bg-slate-900 text-white p-4 rounded-2xl rounded-tr-sm text-sm leading-relaxed max-w-xl shadow-xs">
          <p>${escapeHtml(msg.text)}</p>
        </div>
        <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
          You
        </div>
      `;
      userBox.appendChild(userBubble);

      // If feedback exists for this turn, render structured feedback
      if (msg.feedback) {
        const fb = msg.feedback;
        const feedbackCard = document.createElement('div');
        feedbackCard.className = 'ml-0 md:ml-11 bg-white border border-indigo-100 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3';
        feedbackCard.innerHTML = `
          <div class="flex items-center justify-between pb-2 border-b border-slate-100">
            <span class="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
              <span>🎯</span> Coach Emma's Feedback
            </span>
            <span class="text-[11px] text-slate-400 font-medium">Spoken Response</span>
          </div>

          <!-- Corrected Sentence -->
          <div class="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl">
            <div class="flex items-center justify-between text-xs font-bold text-emerald-800 mb-1">
              <span>Corrected Version</span>
              <button class="msg-listen-btn text-emerald-700 hover:text-emerald-900 flex items-center gap-1" data-text="${encodeURIComponent(fb.correctedSentence)}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                <span>Listen</span>
              </button>
            </div>
            <p class="text-xs sm:text-sm font-semibold text-emerald-900">"${escapeHtml(fb.correctedSentence)}"</p>
          </div>

          <!-- Natural Way -->
          <div class="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
            <div class="flex items-center justify-between text-xs font-bold text-indigo-800 mb-1">
              <span>More Natural Casual Expression</span>
              <button class="msg-listen-btn text-indigo-700 hover:text-indigo-900 flex items-center gap-1" data-text="${encodeURIComponent(fb.naturalWay)}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                <span>Listen</span>
              </button>
            </div>
            <p class="text-xs sm:text-sm text-indigo-950 font-medium">${escapeHtml(fb.naturalWay)}</p>
          </div>

          <!-- Explanation of mistake & encouragement -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span class="font-bold text-slate-700 block mb-1">📝 Grammar & Phrasing Explanation (${currentSettings.explanationLanguage})</span>
              <p class="text-slate-600 leading-relaxed">${escapeHtml(fb.mistakeExplanation)}</p>
            </div>
            <div class="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span class="font-bold text-slate-700 block mb-1">🗣️ Pronunciation & Flow Tip</span>
              <p class="text-slate-600 leading-relaxed">${escapeHtml(fb.pronunciationTip)}</p>
            </div>
          </div>

          <!-- Vocabulary Tip -->
          <div class="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs flex items-center justify-between">
            <div>
              <span class="font-bold text-amber-900">💡 Vocabulary Booster: </span>
              <span class="text-amber-800">${escapeHtml(fb.vocabularySuggestion)}</span>
            </div>
            <button class="add-suggested-vocab-btn text-xs font-bold text-amber-800 hover:text-amber-950 px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 transition-colors" data-vocab="${encodeURIComponent(fb.vocabularySuggestion)}">
              + Save
            </button>
          </div>

          <!-- Motivational note -->
          <p class="text-[11px] text-slate-400 italic">⭐ ${escapeHtml(fb.encouragingNote)}</p>
        `;
        userBox.appendChild(feedbackCard);
      }

      stream.appendChild(userBox);
    }
  });

  // Scroll to bottom
  stream.scrollTop = stream.scrollHeight;

  // Attach listen buttons
  stream.querySelectorAll('.msg-listen-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = (e.currentTarget as HTMLElement).getAttribute('data-text');
      if (target) {
        speakText(decodeURIComponent(target), currentSettings.voiceURI);
      }
    });
  });

  // Attach save suggested vocab buttons
  stream.querySelectorAll('.add-suggested-vocab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const vocabRaw = (e.currentTarget as HTMLElement).getAttribute('data-vocab');
      if (vocabRaw) {
        const decoded = decodeURIComponent(vocabRaw);
        const parts = decoded.split('-');
        const word = parts[0]?.trim() || decoded;
        const meaning = parts.slice(1).join('-').trim() || 'Useful vocabulary word';
        addCustomWord({
          word,
          meaning,
          phonetic: '',
          partOfSpeech: 'phrase',
          example: `Practice saying: "${decoded}" in your next answer.`,
          category: 'core',
        });
        currentVocabulary = loadVocabulary();
        showToast(`Saved "${word}" to your vocabulary!`, 'success');
      }
    });
  });
}

// Conversation Input Handlers
function setupConversationHandlers(): void {
  const form = document.getElementById('conversation-input-form') as HTMLFormElement;
  const textInput = document.getElementById('conv-text-input') as HTMLInputElement;
  const micBtn = document.getElementById('conv-mic-btn') as HTMLButtonElement;
  const recordingStatus = document.getElementById('conv-recording-status') as HTMLElement;
  const stopRecordingBtn = document.getElementById('conv-stop-recording-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-conversation-btn') as HTMLButtonElement;
  const speechNote = document.getElementById('speech-support-note') as HTMLElement;

  if (!isSpeechRecognitionSupported && speechNote) {
    speechNote.textContent = 'Microphone speech recognition is not supported in this browser. Please type your answers.';
    speechNote.className = 'text-amber-600 font-semibold';
  }

  // Submit Answer
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const answer = textInput.value.trim();
    if (!answer) {
      showToast('Please type an answer or speak using the microphone.', 'warning');
      return;
    }

    if (isConvRecording && stopConvRecognition) {
      stopConvRecognition();
      isConvRecording = false;
      recordingStatus.classList.add('hidden');
    }

    // Add user message to conversation stream
    const userMsgId = 'msg_user_' + Date.now();
    const lastAiQuestion = conversationHistory.filter((m) => m.role === 'ai').slice(-1)[0]?.text || '';

    conversationHistory.push({
      id: userMsgId,
      role: 'user',
      text: answer,
      timestamp: Date.now(),
    });

    textInput.value = '';
    renderConversationStream();

    // Show loading indicator bubble
    const stream = document.getElementById('conversation-stream');
    const loadingBubble = document.createElement('div');
    loadingBubble.id = 'conv-loading-bubble';
    loadingBubble.className = 'flex items-center space-x-2 text-indigo-600 text-xs font-semibold p-4 bg-indigo-50/50 rounded-2xl max-w-xs';
    loadingBubble.innerHTML = `
      <div class="flex space-x-1">
        <div class="w-2 h-2 rounded-full bg-indigo-600 animate-bounce"></div>
        <div class="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style="animation-delay: 0.15s"></div>
        <div class="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style="animation-delay: 0.3s"></div>
      </div>
      <span>Coach Emma is analyzing your speech...</span>
    `;
    stream?.appendChild(loadingBubble);
    if (stream) stream.scrollTop = stream.scrollHeight;

    try {
      const response = await fetch('/api/conversation/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: currentTopic,
          level: currentSettings.level,
          explanationLanguage: currentSettings.explanationLanguage,
          history: conversationHistory.map((m) => ({ role: m.role, text: m.text })),
          userAnswer: answer,
          lastQuestion: lastAiQuestion,
        }),
      });

      const data = await response.json();
      loadingBubble.remove();

      // Attach feedback to the user message
      const targetUserMsg = conversationHistory.find((m) => m.id === userMsgId);
      if (targetUserMsg) {
        targetUserMsg.feedback = data;
      }

      // Add AI's follow-up question
      if (data.nextQuestion) {
        conversationHistory.push({
          id: 'msg_ai_' + Date.now(),
          role: 'ai',
          text: data.nextQuestion,
          timestamp: Date.now(),
        });
      }

      renderConversationStream();

      // Record progress in localStorage
      recordCompletedExercise({
        type: 'conversation',
        title: `Conversation: ${currentTopic}`,
        snippet: answer,
        score: 5,
      });
      renderHomeDashboard();

      // Speak next question if enabled
      if (currentSettings.autoPlayAudio && data.nextQuestion) {
        speakText(data.nextQuestion, currentSettings.voiceURI);
      }
    } catch (err: any) {
      console.error(err);
      loadingBubble.remove();
      showToast('Could not reach feedback server. Please try again.', 'error');
    }
  });

  // Microphone toggle button
  micBtn.addEventListener('click', () => {
    if (!isSpeechRecognitionSupported) {
      showToast('Speech recognition is not supported in this browser. Please type your response.', 'warning');
      return;
    }

    if (isConvRecording) {
      if (stopConvRecognition) stopConvRecognition();
      isConvRecording = false;
      recordingStatus.classList.add('hidden');
      return;
    }

    isConvRecording = true;
    recordingStatus.classList.remove('hidden');

    stopConvRecognition = startSpeechRecognition({
      onStart: () => {
        textInput.placeholder = 'Listening... Speak into microphone...';
      },
      onInterim: (interim) => {
        textInput.value = interim;
      },
      onFinal: (finalText) => {
        textInput.value = finalText;
      },
      onError: (errMsg) => {
        showToast(errMsg, 'error');
        isConvRecording = false;
        recordingStatus.classList.add('hidden');
        textInput.placeholder = 'Type your answer in English or click the mic to speak...';
      },
      onEnd: () => {
        isConvRecording = false;
        recordingStatus.classList.add('hidden');
        textInput.placeholder = 'Type your answer in English or click the mic to speak...';
      },
    });
  });

  stopRecordingBtn.addEventListener('click', () => {
    if (stopConvRecognition) stopConvRecognition();
    isConvRecording = false;
    recordingStatus.classList.add('hidden');
  });

  resetBtn.addEventListener('click', () => {
    startConversationTopic(currentTopic);
    showToast('Conversation topic restarted.', 'info');
  });
}

// --- Daily Speaking Questions Controller ---
function initDailyQuestions(): void {
  const tabsContainer = document.getElementById('daily-level-tabs');
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.daily-level-btn') as HTMLButtonElement;
      if (!btn) return;
      const lvl = btn.getAttribute('data-level') as LearningLevel;
      if (!lvl) return;

      tabsContainer.querySelectorAll('.daily-level-btn').forEach((b) => {
        b.className = 'daily-level-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-600 hover:text-slate-900';
      });
      btn.className = 'daily-level-btn active px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-indigo-700 shadow-xs';

      currentDailyLevel = lvl;
      currentDailyQIndex = 0;
      renderDailyQuestion();
    });
  }

  const nextBtn = document.getElementById('daily-next-q-btn') as HTMLButtonElement;
  nextBtn?.addEventListener('click', () => {
    const list = INITIAL_DAILY_QUESTIONS.filter((q) => q.level === currentDailyLevel);
    if (currentDailyQIndex < list.length - 1) {
      currentDailyQIndex++;
    } else {
      currentDailyQIndex = 0;
    }
    renderDailyQuestion();
  });

  const listenQBtn = document.getElementById('daily-listen-q-btn') as HTMLButtonElement;
  listenQBtn?.addEventListener('click', () => {
    const list = INITIAL_DAILY_QUESTIONS.filter((q) => q.level === currentDailyLevel);
    const q = list[currentDailyQIndex] || list[0];
    if (q) speakText(q.question, currentSettings.voiceURI);
  });

  const micBtn = document.getElementById('daily-mic-btn') as HTMLButtonElement;
  const answerInput = document.getElementById('daily-answer-input') as HTMLTextAreaElement;
  const recordingIndicator = document.getElementById('daily-recording-indicator') as HTMLElement;
  const micBtnText = document.getElementById('daily-mic-btn-text') as HTMLElement;

  micBtn?.addEventListener('click', () => {
    if (!isSpeechRecognitionSupported) {
      showToast('Microphone speech recognition is not supported in this browser. Please type your answer.', 'warning');
      return;
    }

    if (isDailyRecording) {
      if (stopDailyRecognition) stopDailyRecognition();
      isDailyRecording = false;
      recordingIndicator?.classList.add('hidden');
      if (micBtnText) micBtnText.textContent = 'Click to Speak';
      return;
    }

    isDailyRecording = true;
    recordingIndicator?.classList.remove('hidden');
    if (micBtnText) micBtnText.textContent = 'Listening... Stop';

    stopDailyRecognition = startSpeechRecognition({
      onStart: () => {},
      onInterim: (interim) => {
        answerInput.value = interim;
      },
      onFinal: (finalText) => {
        answerInput.value = finalText;
      },
      onError: (errMsg) => {
        showToast(errMsg, 'error');
        isDailyRecording = false;
        recordingIndicator?.classList.add('hidden');
        if (micBtnText) micBtnText.textContent = 'Click to Speak';
      },
      onEnd: () => {
        isDailyRecording = false;
        recordingIndicator?.classList.add('hidden');
        if (micBtnText) micBtnText.textContent = 'Click to Speak';
      },
    });
  });

  const submitBtn = document.getElementById('daily-submit-btn') as HTMLButtonElement;
  submitBtn?.addEventListener('click', async () => {
    const answer = answerInput.value.trim();
    if (!answer) {
      showToast('Please speak or type your answer before submitting.', 'warning');
      return;
    }

    if (isDailyRecording && stopDailyRecognition) {
      stopDailyRecognition();
      isDailyRecording = false;
      recordingIndicator?.classList.add('hidden');
      if (micBtnText) micBtnText.textContent = 'Click to Speak';
    }

    const list = INITIAL_DAILY_QUESTIONS.filter((q) => q.level === currentDailyLevel);
    const q = list[currentDailyQIndex] || list[0];

    const fbContainer = document.getElementById('daily-feedback-container') as HTMLElement;
    fbContainer.classList.remove('hidden');
    fbContainer.innerHTML = `
      <div class="flex items-center space-x-2 text-indigo-600 text-xs font-semibold p-4 bg-indigo-50/50 rounded-xl">
        <div class="w-3 h-3 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
        <span>Evaluating your spoken answer...</span>
      </div>
    `;

    try {
      const response = await fetch('/api/daily/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.question,
          level: currentDailyLevel,
          userAnswer: answer,
          explanationLanguage: currentSettings.explanationLanguage,
        }),
      });

      const data = await response.json();
      renderDailyFeedback(data, answer);

      // Record progress
      recordCompletedExercise({
        type: 'daily',
        title: `Daily Question: ${q.category}`,
        snippet: answer,
        score: data.score || 4,
      });
      renderHomeDashboard();
    } catch (err: any) {
      console.error(err);
      fbContainer.innerHTML = `
        <div class="p-4 bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl">
          Could not generate feedback. Please check your connection and retry.
        </div>
      `;
    }
  });
}

function renderDailyQuestion(): void {
  filteredDailyQuestions = INITIAL_DAILY_QUESTIONS.filter((q) => q.level === currentDailyLevel);
  if (currentDailyQIndex >= filteredDailyQuestions.length) {
    currentDailyQIndex = 0;
  }
  const q = filteredDailyQuestions[currentDailyQIndex] || INITIAL_DAILY_QUESTIONS[0];

  const catEl = document.getElementById('daily-q-category');
  if (catEl) catEl.textContent = `Category: ${q.category}`;

  const indexEl = document.getElementById('daily-q-index');
  if (indexEl) indexEl.textContent = `Question ${currentDailyQIndex + 1} of ${filteredDailyQuestions.length}`;

  const textEl = document.getElementById('daily-question-text');
  if (textEl) textEl.textContent = `"${q.question}"`;

  const hintEl = document.getElementById('daily-question-hint');
  if (hintEl) hintEl.textContent = `💡 Hint: ${q.hint}`;

  // Reset answer box & hide previous feedback
  const answerInput = document.getElementById('daily-answer-input') as HTMLTextAreaElement;
  if (answerInput) answerInput.value = '';

  const fbContainer = document.getElementById('daily-feedback-container');
  if (fbContainer) {
    fbContainer.classList.add('hidden');
    fbContainer.innerHTML = '';
  }
}

function renderDailyFeedback(data: any, original: string): void {
  const container = document.getElementById('daily-feedback-container');
  if (!container) return;

  const scoreStars = '⭐'.repeat(Math.min(5, Math.max(1, data.score || 4)));

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h4 class="font-bold text-slate-900 text-sm">Teacher Evaluation</h4>
          <p class="text-xs text-slate-500">${data.feedbackSummary || 'Great job practicing out loud!'}</p>
        </div>
        <div class="text-amber-500 text-sm font-bold">${scoreStars}</div>
      </div>

      <!-- Corrected Version -->
      <div class="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-xl">
        <div class="flex items-center justify-between text-xs font-bold text-emerald-800 mb-1">
          <span>Corrected Version</span>
          <button class="daily-listen-corrected-btn text-emerald-700 hover:text-emerald-900 flex items-center gap-1" data-text="${encodeURIComponent(data.correctedSentence)}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
            <span>Listen</span>
          </button>
        </div>
        <p class="text-sm font-semibold text-emerald-950">"${escapeHtml(data.correctedSentence)}"</p>
      </div>

      <!-- Natural Alternative -->
      <div class="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl">
        <div class="flex items-center justify-between text-xs font-bold text-indigo-800 mb-1">
          <span>Natural Fluent Phrasing</span>
          <button class="daily-listen-natural-btn text-indigo-700 hover:text-indigo-900 flex items-center gap-1" data-text="${encodeURIComponent(data.naturalAlternative)}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
            <span>Listen</span>
          </button>
        </div>
        <p class="text-sm text-indigo-950 font-medium">"${escapeHtml(data.naturalAlternative)}"</p>
      </div>

      <!-- Mistakes & Pronunciation breakdown -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span class="font-bold text-slate-800 block mb-1">📝 Explanation (${currentSettings.explanationLanguage})</span>
          <p class="text-slate-600 leading-relaxed">${escapeHtml(data.explanation)}</p>
        </div>
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span class="font-bold text-slate-800 block mb-1">🗣️ Pronunciation Hint</span>
          <p class="text-slate-600 leading-relaxed">${escapeHtml(data.pronunciationTip)}</p>
        </div>
      </div>

      <!-- Vocabulary Suggestion -->
      <div class="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs flex items-center justify-between">
        <div>
          <span class="font-bold text-amber-900">💡 Vocabulary Suggestion: </span>
          <span class="text-amber-800">${escapeHtml(data.vocabularySuggestion)}</span>
        </div>
        <button class="daily-save-vocab-btn text-xs font-bold text-amber-800 hover:text-amber-950 px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 transition-colors" data-vocab="${encodeURIComponent(data.vocabularySuggestion)}">
          + Add Word
        </button>
      </div>

      <!-- Retry and Action Row -->
      <div class="flex items-center justify-between pt-2">
        <button id="daily-retry-btn" class="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors">
          🔄 Retry This Question
        </button>
        <button id="daily-next-from-fb-btn" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors">
          Next Question →
        </button>
      </div>
    </div>
  `;

  // Attach audio buttons
  container.querySelector('.daily-listen-corrected-btn')?.addEventListener('click', (e) => {
    const text = (e.currentTarget as HTMLElement).getAttribute('data-text');
    if (text) speakText(decodeURIComponent(text), currentSettings.voiceURI);
  });

  container.querySelector('.daily-listen-natural-btn')?.addEventListener('click', (e) => {
    const text = (e.currentTarget as HTMLElement).getAttribute('data-text');
    if (text) speakText(decodeURIComponent(text), currentSettings.voiceURI);
  });

  container.querySelector('.daily-save-vocab-btn')?.addEventListener('click', (e) => {
    const text = (e.currentTarget as HTMLElement).getAttribute('data-vocab');
    if (text) {
      const decoded = decodeURIComponent(text);
      addCustomWord({
        word: decoded.split('-')[0]?.trim() || decoded,
        meaning: decoded.split('-')[1]?.trim() || 'Daily challenge suggestion',
        phonetic: '',
        partOfSpeech: 'expression',
        example: `Used in daily answer: "${original}"`,
        category: 'core',
      });
      currentVocabulary = loadVocabulary();
      showToast('Word saved to vocabulary list!', 'success');
    }
  });

  // Retry button
  document.getElementById('daily-retry-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
    const answerInput = document.getElementById('daily-answer-input') as HTMLTextAreaElement;
    if (answerInput) {
      answerInput.value = '';
      answerInput.focus();
    }
    showToast('Ready for retry! Speak or type your improved answer.', 'info');
  });

  // Next Question from feedback
  document.getElementById('daily-next-from-fb-btn')?.addEventListener('click', () => {
    const list = INITIAL_DAILY_QUESTIONS.filter((q) => q.level === currentDailyLevel);
    if (currentDailyQIndex < list.length - 1) {
      currentDailyQIndex++;
    } else {
      currentDailyQIndex = 0;
    }
    renderDailyQuestion();
  });
}

// --- Vocabulary Builder Controller ---
let vocabSearchQuery: string = '';
let vocabActiveFilter: string = 'all';

function initVocabularyBuilder(): void {
  const searchInput = document.getElementById('vocab-search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', () => {
    vocabSearchQuery = searchInput.value.toLowerCase().trim();
    renderVocabularyCards();
  });

  const filterTabs = document.getElementById('vocab-filter-tabs');
  filterTabs?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.vocab-filter-btn') as HTMLButtonElement;
    if (!btn) return;
    const filter = btn.getAttribute('data-filter') || 'all';

    filterTabs.querySelectorAll('.vocab-filter-btn').forEach((b) => {
      b.className = 'vocab-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
    });
    btn.className = 'vocab-filter-btn active px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs';

    vocabActiveFilter = filter;
    renderVocabularyCards();
  });

  // Add custom word modal
  const openModalBtn = document.getElementById('open-add-word-modal-btn');
  const modal = document.getElementById('add-word-modal');
  const closeModalBtn = document.getElementById('close-add-word-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-add-word-btn');
  const addForm = document.getElementById('add-word-form') as HTMLFormElement;

  openModalBtn?.addEventListener('click', () => modal?.classList.remove('hidden'));
  closeModalBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
  cancelModalBtn?.addEventListener('click', () => modal?.classList.add('hidden'));

  addForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const wordInput = document.getElementById('new-word-input') as HTMLInputElement;
    const posInput = document.getElementById('new-pos-input') as HTMLInputElement;
    const meaningInput = document.getElementById('new-meaning-input') as HTMLInputElement;
    const exampleInput = document.getElementById('new-example-input') as HTMLInputElement;

    const word = wordInput.value.trim();
    const meaning = meaningInput.value.trim();
    const example = exampleInput.value.trim();
    const partOfSpeech = posInput.value.trim() || 'word';

    if (!word || !meaning || !example) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }

    currentVocabulary = addCustomWord({
      word,
      partOfSpeech,
      phonetic: '',
      meaning,
      example,
      category: 'core',
    });

    addForm.reset();
    modal?.classList.add('hidden');
    renderVocabularyCards();
    renderHomeDashboard();
    showToast(`Added "${word}" to your vocabulary!`, 'success');
  });
}

function renderVocabularyCards(): void {
  const grid = document.getElementById('vocab-cards-grid');
  if (!grid) return;

  currentVocabulary = loadVocabulary();

  const filtered = currentVocabulary.filter((w) => {
    // Search filter
    const matchesSearch =
      !vocabSearchQuery ||
      w.word.toLowerCase().includes(vocabSearchQuery) ||
      w.meaning.toLowerCase().includes(vocabSearchQuery) ||
      w.example.toLowerCase().includes(vocabSearchQuery) ||
      (w.meaningUrdu && w.meaningUrdu.toLowerCase().includes(vocabSearchQuery));

    // Category tab filter
    let matchesCategory = true;
    if (vocabActiveFilter === 'core') matchesCategory = w.category === 'core';
    else if (vocabActiveFilter === 'phrases') matchesCategory = w.category === 'phrases' || w.category === 'idiom';
    else if (vocabActiveFilter === 'saved') matchesCategory = w.isSaved;
    else if (vocabActiveFilter === 'learned') matchesCategory = w.isLearned;

    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <p class="text-3xl mb-2">🔍</p>
        <p class="font-bold text-slate-700 text-sm">No vocabulary items match your filter.</p>
        <p class="text-xs text-slate-400 mt-1">Try searching for a different word or change the filter tab.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((w) => {
      const learnedBadge = w.isLearned
        ? `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Learned ✓</span>`
        : `<span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">Practicing</span>`;

      const urduHtml =
        currentSettings.explanationLanguage === 'Urdu' && w.meaningUrdu
          ? `<p class="text-xs text-slate-700 font-medium font-['Noto_Nastaliq_Urdu',sans-serif] mt-1 bg-amber-50/50 p-1.5 rounded-lg border border-amber-100">معنی: ${escapeHtml(
              w.meaningUrdu
            )}</p>`
          : '';

      return `
      <div class="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
        <div>
          <!-- Card Header -->
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-bold text-slate-900 text-base">${escapeHtml(w.word)}</h4>
                <button class="vocab-audio-btn text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50" data-word="${encodeURIComponent(
                  w.word
                )}" title="Listen to pronunciation">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                </button>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                <span class="italic text-slate-500 font-medium">${escapeHtml(w.partOfSpeech)}</span>
                ${w.phonetic ? `<span>•</span><span class="font-mono text-slate-400">${escapeHtml(w.phonetic)}</span>` : ''}
              </div>
            </div>
            ${learnedBadge}
          </div>

          <!-- Meaning -->
          <p class="text-xs text-slate-600 mt-3 leading-relaxed">${escapeHtml(w.meaning)}</p>
          ${urduHtml}

          <!-- Example -->
          <div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-start justify-between gap-2">
            <p class="text-xs text-slate-700 italic">"${escapeHtml(w.example)}"</p>
            <button class="vocab-example-audio-btn text-slate-400 hover:text-indigo-600 shrink-0 p-0.5" data-example="${encodeURIComponent(
              w.example
            )}" title="Listen to sentence">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
            </button>
          </div>
        </div>

        <!-- Action Row -->
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <button class="vocab-toggle-save-btn flex items-center space-x-1 ${
            w.isSaved ? 'text-amber-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }" data-id="${w.id}">
            <span>${w.isSaved ? '★ Saved' : '☆ Save'}</span>
          </button>
          <button class="vocab-toggle-learned-btn px-2.5 py-1 rounded-lg font-bold transition-colors ${
            w.isLearned ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }" data-id="${w.id}">
            ${w.isLearned ? 'Mark as Unlearned' : 'Mark Learned ✓'}
          </button>
        </div>
      </div>
      `;
    })
    .join('');

  // Attach card event listeners
  grid.querySelectorAll('.vocab-audio-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const word = (e.currentTarget as HTMLElement).getAttribute('data-word');
      if (word) speakText(decodeURIComponent(word), currentSettings.voiceURI);
    });
  });

  grid.querySelectorAll('.vocab-example-audio-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sentence = (e.currentTarget as HTMLElement).getAttribute('data-example');
      if (sentence) speakText(decodeURIComponent(sentence), currentSettings.voiceURI);
    });
  });

  grid.querySelectorAll('.vocab-toggle-learned-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) {
        currentVocabulary = toggleWordLearned(id);
        renderVocabularyCards();
        renderHomeDashboard();
      }
    });
  });

  grid.querySelectorAll('.vocab-toggle-save-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) {
        currentVocabulary = toggleWordSaved(id);
        renderVocabularyCards();
      }
    });
  });
}

// --- Pronunciation Practice Lab Controller ---
function initPronunciationLab(): void {
  renderPronunciationChips();

  const listenBtn = document.getElementById('pronounce-listen-btn') as HTMLButtonElement;
  listenBtn?.addEventListener('click', () => {
    speakText(currentPronouncePreset.sentence, currentSettings.voiceURI, pronounceSpeed);
  });

  const speedBtn = document.getElementById('pronounce-speed-btn') as HTMLButtonElement;
  speedBtn?.addEventListener('click', () => {
    pronounceSpeed = pronounceSpeed === 1.0 ? 0.8 : 1.0;
    speedBtn.textContent = `${pronounceSpeed.toFixed(1)}x`;
    showToast(`Speech model speed set to ${pronounceSpeed.toFixed(1)}x (great for practice!)`, 'info');
  });

  const micBtn = document.getElementById('pronounce-mic-btn') as HTMLButtonElement;
  const micLabel = document.getElementById('pronounce-mic-label') as HTMLElement;

  micBtn?.addEventListener('click', () => {
    if (!isSpeechRecognitionSupported) {
      showToast('Microphone speech recognition is not supported in this browser.', 'warning');
      return;
    }

    if (isPronounceRecording) {
      if (stopPronounceRecognition) stopPronounceRecognition();
      isPronounceRecording = false;
      micBtn.classList.remove('mic-recording-pulse');
      micLabel.textContent = 'Click microphone & read sentence out loud';
      return;
    }

    isPronounceRecording = true;
    micBtn.classList.add('mic-recording-pulse');
    micLabel.textContent = 'Listening... Speak the sentence now!';

    stopPronounceRecognition = startSpeechRecognition({
      onStart: () => {},
      onFinal: (spokenText) => {
        isPronounceRecording = false;
        micBtn.classList.remove('mic-recording-pulse');
        micLabel.textContent = 'Click microphone & read sentence out loud';
        analyzePronunciationMatch(currentPronouncePreset.sentence, spokenText);
      },
      onError: (err) => {
        showToast(err, 'error');
        isPronounceRecording = false;
        micBtn.classList.remove('mic-recording-pulse');
        micLabel.textContent = 'Click microphone & read sentence out loud';
      },
      onEnd: () => {
        isPronounceRecording = false;
        micBtn.classList.remove('mic-recording-pulse');
        micLabel.textContent = 'Click microphone & read sentence out loud';
      },
    });
  });
}

function renderPronunciationChips(): void {
  const container = document.getElementById('pronounce-preset-chips');
  if (!container) return;

  container.innerHTML = INITIAL_PRONUNCIATION_PRESETS.map((p, idx) => {
    const isSelected = p.id === currentPronouncePreset.id;
    return `
      <button class="pronounce-chip px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
        isSelected ? 'bg-rose-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }" data-id="${p.id}">
        Sentence ${idx + 1} (${p.level})
      </button>
    `;
  }).join('');

  container.querySelectorAll('.pronounce-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      const found = INITIAL_PRONUNCIATION_PRESETS.find((p) => p.id === id);
      if (found) {
        currentPronouncePreset = found;
        renderPronunciationStudio();
        renderPronunciationChips();
      }
    });
  });
}

function renderPronunciationStudio(): void {
  const targetText = document.getElementById('pronounce-target-text');
  if (targetText) targetText.textContent = `"${currentPronouncePreset.sentence}"`;

  const phoneticText = document.getElementById('pronounce-phonetic-text');
  if (phoneticText) phoneticText.textContent = currentPronouncePreset.phonetic;

  const resultCard = document.getElementById('pronounce-result-card');
  if (resultCard) {
    resultCard.classList.add('hidden');
    resultCard.innerHTML = '';
  }
}

async function analyzePronunciationMatch(target: string, spoken: string): Promise<void> {
  const resultCard = document.getElementById('pronounce-result-card');
  if (!resultCard) return;

  resultCard.classList.remove('hidden');
  resultCard.innerHTML = `
    <div class="flex items-center space-x-2 text-rose-600 text-xs font-semibold p-4 bg-rose-50/50 rounded-xl">
      <div class="w-3 h-3 rounded-full border-2 border-rose-600 border-t-transparent animate-spin"></div>
      <span>Analyzing recognized speech against target sentence...</span>
    </div>
  `;

  // Compare words
  const cleanTargetWords = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const cleanSpokenWords = spoken.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

  let matchCount = 0;
  const wordComparisonHtml = cleanTargetWords
    .map((word) => {
      const isMatched = cleanSpokenWords.includes(word);
      if (isMatched) {
        matchCount++;
        return `<span class="px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-bold inline-block mr-1 mb-1">${escapeHtml(word)}</span>`;
      } else {
        return `<span class="px-2 py-1 rounded bg-rose-100 text-rose-800 line-through inline-block mr-1 mb-1" title="Word missed or not detected clearly">${escapeHtml(
          word
        )}</span>`;
      }
    })
    .join(' ');

  const accuracyPercent = cleanTargetWords.length > 0 ? Math.round((matchCount / cleanTargetWords.length) * 100) : 0;

  // Query backend for phonetic advice
  let aiGuidance = 'Focus on linking words together and practicing clear vowel sounds.';
  try {
    const res = await fetch('/api/pronunciation/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSentence: target,
        spokenText: spoken,
        explanationLanguage: currentSettings.explanationLanguage,
      }),
    });
    const data = await res.json();
    if (data.phoneticBreakdown || data.guidance) {
      aiGuidance = `${data.phoneticBreakdown} ${data.guidance}`;
    }
  } catch (e) {
    // Fallback guidance
  }

  resultCard.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h4 class="font-bold text-slate-900 text-base">Speech Recognition Match Result</h4>
          <p class="text-xs text-slate-500">Comparison of your spoken words with the target text</p>
        </div>
        <div class="text-right">
          <span class="text-2xl font-black ${
            accuracyPercent >= 80 ? 'text-emerald-600' : accuracyPercent >= 50 ? 'text-amber-600' : 'text-rose-600'
          }">${accuracyPercent}%</span>
          <span class="block text-[10px] text-slate-400 font-bold uppercase">Accuracy</span>
        </div>
      </div>

      <!-- Word Comparison Chips -->
      <div>
        <label class="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Word-by-word Analysis</label>
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl leading-relaxed">
          ${wordComparisonHtml}
        </div>
        <div class="flex items-center gap-4 text-[11px] text-slate-500 mt-2">
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span> Detected cleanly</span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span> Needs clearer articulation</span>
        </div>
      </div>

      <!-- What was recognized -->
      <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
        <span class="font-bold text-slate-700 block mb-0.5">What microphone captured:</span>
        <p class="text-slate-600 italic">"${escapeHtml(spoken || '(No voice recognized)')}"</p>
      </div>

      <!-- AI Coach Phonetic Advice -->
      <div class="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs space-y-1">
        <span class="font-bold text-indigo-900 flex items-center gap-1.5">
          <span>💡</span> Phonetic Coach Tip
        </span>
        <p class="text-indigo-950 leading-relaxed">${escapeHtml(aiGuidance)}</p>
      </div>

      <div class="flex justify-end pt-1">
        <button id="pronounce-try-again-btn" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors">
          Try Speaking Again 🎙️
        </button>
      </div>
    </div>
  `;

  document.getElementById('pronounce-try-again-btn')?.addEventListener('click', () => {
    resultCard.classList.add('hidden');
    showToast('Click the big microphone button to record again!', 'info');
  });

  // Record completed session in stats
  recordCompletedExercise({
    type: 'pronunciation',
    title: `Pronunciation: ${target.slice(0, 30)}...`,
    snippet: spoken,
    score: Math.round((accuracyPercent / 100) * 5),
  });
  renderHomeDashboard();
}

// --- Progress & Analytics Controller ---
function renderProgressDashboard(): void {
  currentProgress = loadProgress();
  currentVocabulary = loadVocabulary();

  const streakVal = document.getElementById('progress-streak-val');
  if (streakVal) streakVal.textContent = `${currentProgress.streakDays} Days`;

  const exVal = document.getElementById('progress-exercises-val');
  if (exVal) exVal.textContent = String(currentProgress.totalSessions);

  const wordsLearned = currentVocabulary.filter((w) => w.isLearned).length;
  const vocabVal = document.getElementById('progress-vocab-val');
  if (vocabVal) vocabVal.textContent = String(wordsLearned);

  // Compute average score from history
  const scored = currentProgress.history.filter((h) => typeof h.score === 'number');
  const avgScore =
    scored.length > 0 ? (scored.reduce((acc, h) => acc + (h.score || 0), 0) / scored.length).toFixed(1) : '--';
  const scoreVal = document.getElementById('progress-score-val');
  if (scoreVal) scoreVal.textContent = avgScore !== '--' ? `${avgScore} / 5` : '--';

  // Render weekly chart (7 days)
  renderWeeklyChart();

  // Render practice log
  renderHistoryLog();
}

function renderWeeklyChart(): void {
  const container = document.getElementById('weekly-chart-container');
  if (!container) return;

  // Build the last 7 days array
  const days: { dateStr: string; label: string; count: number }[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const dayName = dayNames[d.getDay()];

    // Count records on this date
    const count = currentProgress.history.filter((h) => {
      const recDate = new Date(h.timestamp);
      const recStr = `${recDate.getFullYear()}-${String(recDate.getMonth() + 1).padStart(2, '0')}-${String(
        recDate.getDate()
      ).padStart(2, '0')}`;
      return recStr === dateStr;
    }).length;

    days.push({ dateStr, label: i === 0 ? 'Today' : dayName, count });
  }

  const maxCount = Math.max(1, ...days.map((d) => d.count));

  container.innerHTML = days
    .map((day) => {
      const heightPercent = Math.max(8, Math.round((day.count / maxCount) * 100));
      const isToday = day.label === 'Today';
      const barColor = isToday ? 'bg-indigo-600' : 'bg-indigo-200 hover:bg-indigo-300';

      return `
      <div class="flex-1 flex flex-col items-center h-full justify-end group">
        <span class="text-[10px] font-bold text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">${day.count}</span>
        <div class="w-full max-w-[36px] ${barColor} rounded-t-lg transition-all" style="height: ${heightPercent}%"></div>
        <span class="text-[11px] font-semibold text-slate-600 mt-2">${day.label}</span>
      </div>
      `;
    })
    .join('');
}

function renderHistoryLog(): void {
  const list = document.getElementById('history-log-list');
  const countEl = document.getElementById('history-count');
  if (!list) return;

  if (countEl) countEl.textContent = `${currentProgress.history.length} records`;

  if (currentProgress.history.length === 0) {
    list.innerHTML = `
      <div class="py-8 text-center text-slate-400 text-xs">
        No completed exercises yet. Start speaking in AI Conversation or Daily Questions!
      </div>
    `;
    return;
  }

  list.innerHTML = currentProgress.history
    .map((rec) => {
      const d = new Date(rec.timestamp);
      const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const stars = rec.score ? '⭐'.repeat(rec.score) : '';

      return `
      <div class="py-3 flex items-start justify-between">
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-slate-900 text-xs">${escapeHtml(rec.title)}</span>
            ${stars ? `<span class="text-xs text-amber-500">${stars}</span>` : ''}
          </div>
          <p class="text-xs text-slate-500 mt-0.5 line-clamp-1 italic">"${escapeHtml(rec.snippet)}"</p>
        </div>
        <span class="text-[11px] text-slate-400 shrink-0 ml-3">${timeStr}</span>
      </div>
      `;
    })
    .join('');
}

// --- Settings Controller ---
function initSettings(): void {
  const saveBtn = document.getElementById('save-settings-btn');
  saveBtn?.addEventListener('click', () => {
    const nameInput = document.getElementById('settings-username-input') as HTMLInputElement;
    const levelSelect = document.getElementById('settings-level-select') as HTMLSelectElement;
    const langSelect = document.getElementById('settings-lang-select') as HTMLSelectElement;
    const voiceSelect = document.getElementById('settings-voice-select') as HTMLSelectElement;
    const autoplayCheck = document.getElementById('settings-autoplay-audio') as HTMLInputElement;

    currentSettings.userName = nameInput.value.trim() || 'Learner';
    currentSettings.level = levelSelect.value as LearningLevel;
    currentSettings.explanationLanguage = langSelect.value as ExplanationLanguage;
    currentSettings.voiceURI = voiceSelect.value;
    currentSettings.autoPlayAudio = autoplayCheck.checked;

    saveSettings(currentSettings);
    applySettingsToUI();
    showToast('Settings saved successfully!', 'success');
  });

  // Reset modal
  const openResetBtn = document.getElementById('open-reset-modal-btn');
  const resetModal = document.getElementById('reset-confirm-modal');
  const cancelResetBtn = document.getElementById('cancel-reset-btn');
  const confirmResetBtn = document.getElementById('confirm-reset-btn');

  openResetBtn?.addEventListener('click', () => resetModal?.classList.remove('hidden'));
  cancelResetBtn?.addEventListener('click', () => resetModal?.classList.add('hidden'));

  confirmResetBtn?.addEventListener('click', () => {
    resetAllData();
    currentProgress = loadProgress();
    currentVocabulary = loadVocabulary();
    conversationHistory = [];
    resetModal?.classList.add('hidden');
    renderHomeDashboard();
    renderVocabularyCards();
    renderProgressDashboard();
    showToast('All progress data has been reset.', 'info');
  });
}

async function populateSettingsForm(): Promise<void> {
  const nameInput = document.getElementById('settings-username-input') as HTMLInputElement;
  const levelSelect = document.getElementById('settings-level-select') as HTMLSelectElement;
  const langSelect = document.getElementById('settings-lang-select') as HTMLSelectElement;
  const voiceSelect = document.getElementById('settings-voice-select') as HTMLSelectElement;
  const autoplayCheck = document.getElementById('settings-autoplay-audio') as HTMLInputElement;

  if (nameInput) nameInput.value = currentSettings.userName;
  if (levelSelect) levelSelect.value = currentSettings.level;
  if (langSelect) langSelect.value = currentSettings.explanationLanguage;
  if (autoplayCheck) autoplayCheck.checked = currentSettings.autoPlayAudio;

  if (voiceSelect && isSpeechSynthesisSupported) {
    const voices = await getEnglishVoices();
    voiceSelect.innerHTML = voices
      .map(
        (v) =>
          `<option value="${v.voiceURI}" ${v.voiceURI === currentSettings.voiceURI ? 'selected' : ''}>${v.name} (${v.lang})</option>`
      )
      .join('');
  }
}

function applySettingsToUI(): void {
  const langIndicator = document.getElementById('current-lang-indicator');
  if (langIndicator) langIndicator.textContent = currentSettings.explanationLanguage;

  const sidebarBadge = document.getElementById('sidebar-level-badge');
  if (sidebarBadge) sidebarBadge.textContent = currentSettings.level;

  const ttsStatus = document.getElementById('tts-toggle-status');
  if (ttsStatus) {
    ttsStatus.textContent = currentSettings.autoPlayAudio ? 'ON' : 'OFF';
    ttsStatus.className = currentSettings.autoPlayAudio ? 'font-bold text-indigo-600' : 'font-bold text-slate-400';
  }
}

// --- Check Backend Status ---
async function checkBackendStatus(): Promise<void> {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.status === 'connected') {
      backendStatusPill.textContent = 'AI Connected';
      backendStatusPill.className = 'text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded';
    } else {
      backendStatusPill.textContent = 'Demo Mode';
      backendStatusPill.className = 'text-[11px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded';
    }
  } catch (e) {
    backendStatusPill.textContent = 'Offline Engine';
    backendStatusPill.className = 'text-[11px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded';
  }
}

// Utility: Escape HTML
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Global Initialization ---
function initApp(): void {
  // Navigation items
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // Cross-view quick jump buttons (e.g. data-navigate="conversation")
  document.querySelectorAll('[data-navigate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-navigate');
      if (target) switchView(target);
    });
  });

  // Mobile menu buttons
  mobileMenuBtn?.addEventListener('click', openMobileMenu);
  closeSidebarBtn?.addEventListener('click', closeMobileMenu);
  mobileBackdrop?.addEventListener('click', closeMobileMenu);

  // Quick start challenge button on home
  document.getElementById('quick-start-challenge-btn')?.addEventListener('click', () => {
    switchView('daily');
  });

  // Top bar audio toggle
  ttsToggleBtn?.addEventListener('click', () => {
    currentSettings.autoPlayAudio = !currentSettings.autoPlayAudio;
    saveSettings(currentSettings);
    applySettingsToUI();
    if (!currentSettings.autoPlayAudio) stopSpeaking();
    showToast(`Audio auto-read turned ${currentSettings.autoPlayAudio ? 'ON' : 'OFF'}`, 'info');
  });

  // Sub-modules
  initTopicButtons();
  setupConversationHandlers();
  initDailyQuestions();
  initVocabularyBuilder();
  initPronunciationLab();
  initSettings();

  // Load initial settings and UI state
  applySettingsToUI();
  renderHomeDashboard();
  checkBackendStatus();

  // Pre-load voices
  if (isSpeechSynthesisSupported) {
    getEnglishVoices().then((voices) => {
      if (!currentSettings.voiceURI && voices.length > 0) {
        currentSettings.voiceURI = voices[0].voiceURI;
        saveSettings(currentSettings);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);
