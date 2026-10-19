import { Router } from 'express';
import { VoiceAgent } from '../voice/voiceAgent.js';

const router = Router();

// POST /api/v1/voice/command - Process voice transcript
router.post('/command', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Bad Request', message: 'transcript is required' });
    }

    const response = await VoiceAgent.processVoiceInput(transcript, userId);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/voice/briefing - Get audio-ready briefing text
router.get('/briefing', async (req, res) => {
  try {
    const userId = req.user!.id;
    const response = await VoiceAgent.processVoiceInput('briefing', userId);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
