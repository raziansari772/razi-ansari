import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Gemini client strictly using @google/genai
const apiKey = process.env.GEMINI_API_KEY || '';
const hasApiKey = Boolean(apiKey && apiKey.trim().length > 5);

let ai: GoogleGenAI | null = null;
if (hasApiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health & Status endpoint
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    hasApiKey,
    model: 'gemini-3.8-flash',
    status: hasApiKey ? 'connected' : 'demo_fallback',
  });
});

// Fallback generator when API key is not present or error occurs
function getFallbackConversationFeedback(userAnswer: string, topic: string, lang: string) {
  const isUrdu = lang === 'Urdu';
  const cleanAns = userAnswer.trim();
  const capitalized = cleanAns.charAt(0).toUpperCase() + cleanAns.slice(1);
  const corrected = capitalized.endsWith('.') ? capitalized : capitalized + '.';
  
  return {
    originalAnswer: userAnswer,
    correctedSentence: corrected,
    naturalWay: `In conversation, you can say: "${corrected} For example, I really enjoy it because it keeps me engaged."`,
    mistakeExplanation: isUrdu
      ? "بہت اچھا آغاز! جملے کو ہمیشہ بڑے حرف (capital letter) سے شروع کریں اور مناسب فعل (verb) استعمال کریں۔"
      : "Good job! Remember to start sentences with a capital letter and keep your subject-verb agreement consistent.",
    vocabularySuggestion: "expand (verb) - to give more details, e.g., 'Let me expand on that.'",
    pronunciationTip: "Focus on articulating vowels clearly and avoid rushing word endings.",
    nextQuestion: `That's interesting! What else would you like to share about ${topic.toLowerCase()}?`,
    encouragingNote: "Every sentence you speak builds fluency! Keep practicing out loud.",
    source: "local-rule-engine",
  };
}

// Conversation Feedback Endpoint
app.post('/api/conversation/message', async (req: Request, res: Response) => {
  try {
    const { topic, level = 'Beginner', explanationLanguage = 'English', history = [], userAnswer = '', lastQuestion = '' } = req.body;

    if (!userAnswer || !userAnswer.trim()) {
      return res.status(400).json({ error: 'User answer cannot be empty.' });
    }

    if (!ai) {
      const fallback = getFallbackConversationFeedback(userAnswer, topic || 'English', explanationLanguage);
      return res.json(fallback);
    }

    const systemPrompt = `You are an empathetic, encouraging English speaking coach helping a ${level} level student improve their conversational English.
The conversation topic is: "${topic}".
User's preferred explanation language is: "${explanationLanguage}". (If Urdu, write the mistake explanation and encouraging feedback in clear Roman Urdu or simple Urdu script, while keeping English corrections in clear English).

Analyze the student's spoken response to the question: "${lastQuestion || 'Tell me about yourself'}".
User's Answer: "${userAnswer}".

Provide:
1. originalAnswer: The user's exact words.
2. correctedSentence: Grammatically accurate, natural sentence retaining their original meaning.
3. naturalWay: A casual, confident native speaker alternative suitable for everyday conversation.
4. mistakeExplanation: Simple, gentle explanation of any grammar, tense, preposition, or word-order error. (Explain in ${explanationLanguage}).
5. vocabularySuggestion: One useful word, phrase, or colocation with simple meaning and example.
6. pronunciationTip: 1 short actionable tip on syllable stress, silent letters, or common pronunciation traps (e.g. 'th', 'w' vs 'v', 'ed' endings).
7. nextQuestion: An engaging, open-ended conversational follow-up question related to ${topic} tailored for a ${level} student.
8. encouragingNote: A warm, short 1-sentence motivational praise.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `Here is the conversation history:\n${JSON.stringify(history.slice(-4))}\n\nAnalyze student answer: "${userAnswer}"` }],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            originalAnswer: { type: Type.STRING },
            correctedSentence: { type: Type.STRING },
            naturalWay: { type: Type.STRING },
            mistakeExplanation: { type: Type.STRING },
            vocabularySuggestion: { type: Type.STRING },
            pronunciationTip: { type: Type.STRING },
            nextQuestion: { type: Type.STRING },
            encouragingNote: { type: Type.STRING },
          },
          required: [
            'originalAnswer',
            'correctedSentence',
            'naturalWay',
            'mistakeExplanation',
            'vocabularySuggestion',
            'pronunciationTip',
            'nextQuestion',
            'encouragingNote',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ ...parsed, source: 'gemini-3.8-flash' });
  } catch (err: any) {
    console.error('Conversation feedback error:', err);
    // Graceful fallback with clear indicator
    const fallback = getFallbackConversationFeedback(req.body?.userAnswer || '', req.body?.topic || 'General', req.body?.explanationLanguage || 'English');
    return res.json({ ...fallback, warning: 'AI response generated via fallback engine due to temporary service issue.' });
  }
});

// Daily Speaking Challenge Feedback Endpoint
app.post('/api/daily/feedback', async (req: Request, res: Response) => {
  try {
    const { question, level = 'Beginner', userAnswer = '', explanationLanguage = 'English' } = req.body;

    if (!userAnswer || !userAnswer.trim()) {
      return res.status(400).json({ error: 'Answer is required.' });
    }

    if (!ai) {
      const fallback = getFallbackConversationFeedback(userAnswer, 'Daily Challenge', explanationLanguage);
      return res.json({
        ...fallback,
        feedbackSummary: 'Well spoken! Keep practicing every day to improve confidence.',
        score: 4,
      });
    }

    const systemPrompt = `You are a friendly English teacher reviewing a student's answer for a daily speaking challenge.
Student level: ${level}.
Question: "${question}".
Answer: "${userAnswer}".
Explanation language: ${explanationLanguage}.

Return structured feedback:
1. originalAnswer: exact student input
2. correctedSentence: polished version
3. naturalAlternative: more fluent, idiomatic phrasing
4. explanation: simple breakdown of grammar/vocabulary mistakes in ${explanationLanguage}
5. vocabularySuggestion: useful word or phrase with definition and sample usage
6. pronunciationTip: 1 tip on phonetics/stress
7. feedbackSummary: overall friendly evaluation
8. score: integer between 1 and 5 stars reflecting effort and clarity for their level.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: `Evaluate this answer: "${userAnswer}"` }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            originalAnswer: { type: Type.STRING },
            correctedSentence: { type: Type.STRING },
            naturalAlternative: { type: Type.STRING },
            explanation: { type: Type.STRING },
            vocabularySuggestion: { type: Type.STRING },
            pronunciationTip: { type: Type.STRING },
            feedbackSummary: { type: Type.STRING },
            score: { type: Type.INTEGER },
          },
          required: [
            'originalAnswer',
            'correctedSentence',
            'naturalAlternative',
            'explanation',
            'vocabularySuggestion',
            'pronunciationTip',
            'feedbackSummary',
            'score',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ ...parsed, source: 'gemini-3.8-flash' });
  } catch (err: any) {
    console.error('Daily feedback error:', err);
    const fallback = getFallbackConversationFeedback(req.body?.userAnswer || '', 'Daily Challenge', req.body?.explanationLanguage || 'English');
    return res.json({
      ...fallback,
      naturalAlternative: fallback.naturalWay,
      explanation: fallback.mistakeExplanation,
      feedbackSummary: 'Good speaking effort! Keep your rhythm smooth.',
      score: 4,
      warning: 'Feedback computed via local teacher engine.',
    });
  }
});

// Pronunciation Nuance Endpoint
app.post('/api/pronunciation/analyze', async (req: Request, res: Response) => {
  try {
    const { targetSentence = '', spokenText = '', explanationLanguage = 'English' } = req.body;

    if (!targetSentence) {
      return res.status(400).json({ error: 'Target sentence required' });
    }

    if (!ai) {
      return res.json({
        phoneticBreakdown: 'Pay attention to consonant clusters and sentence stress.',
        guidance: explanationLanguage === 'Urdu'
          ? 'الفاظ کو آرام سے ادا کریں اور آواز کے اتار چڑھاؤ (intonation) کا خیال رکھیں۔'
          : 'Speak with steady pacing and make sure to stress the key words in the sentence.',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Target sentence: "${targetSentence}"\nStudent said: "${spokenText}"\nExplanation language: ${explanationLanguage}\n\nProvide 1 practical phonetic tip on how to pronounce tricky sounds in the target sentence, and 1 sentence guidance in ${explanationLanguage}.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            phoneticBreakdown: { type: Type.STRING },
            guidance: { type: Type.STRING },
          },
          required: ['phoneticBreakdown', 'guidance'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Pronunciation analyze error:', err);
    return res.json({
      phoneticBreakdown: 'Focus on connecting words smoothly (linking).',
      guidance: 'Keep practicing out loud with the voice model.',
    });
  }
});

// Vite Middleware for development / Static files for production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SpeakFluent Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
