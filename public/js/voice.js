/**
 * Work Radar Voice Assistant Client
 * Provides Web Speech recognition and synthetic TTS voice output.
 */
class WorkRadarVoiceClient {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.initSpeechRecognition();
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.updateOrb(true);
        const statusEl = document.getElementById('voice-status-text');
        if (statusEl) statusEl.textContent = 'Listening... Speak your command.';
      };

      this.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');

        const transcriptEl = document.getElementById('voice-transcript-text');
        if (transcriptEl) transcriptEl.textContent = `"${transcript}"`;

        if (event.results[0].isFinal) {
          this.executeVoiceCommand(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('[SpeechRecognition Error]', event.error);
        this.updateOrb(false);
        const statusEl = document.getElementById('voice-status-text');
        if (statusEl) statusEl.textContent = `Recognition error: ${event.error}. You can click a prompt below.`;
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.updateOrb(false);
      };
    }
  }

  openVoiceModal() {
    const modal = document.getElementById('modal-voice');
    if (modal) modal.classList.remove('hidden');

    const respBox = document.getElementById('voice-response-box');
    if (respBox) respBox.classList.add('hidden');

    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) statusEl.textContent = 'Ready. Click a quick prompt or speak.';

    this.startListening();
  }

  closeVoiceModal() {
    const modal = document.getElementById('modal-voice');
    if (modal) modal.classList.add('hidden');
    this.stopListening();
  }

  startListening() {
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('SpeechRecognition start failed:', err);
      }
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {}
    }
    this.updateOrb(false);
  }

  updateOrb(active) {
    const orb = document.getElementById('voice-orb');
    if (orb) {
      if (active) orb.classList.add('active');
      else orb.classList.remove('active');
    }
  }

  async executeVoiceCommand(transcript) {
    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) statusEl.textContent = 'Analyzing command with Radar AI...';

    try {
      const res = await window.api.sendVoiceCommand(transcript);

      const respBox = document.getElementById('voice-response-box');
      const respText = document.getElementById('voice-response-text');
      if (respBox && respText) {
        respBox.classList.remove('hidden');
        respText.textContent = res.spokenText;
      }

      if (statusEl) statusEl.textContent = 'Response ready.';

      // Speak answer back
      this.speak(res.spokenText);

      // Refresh dashboard
      if (window.app) {
        window.app.refreshDashboard();
      }
    } catch (err) {
      console.error('Voice command execution failed:', err);
      if (statusEl) statusEl.textContent = 'Failed to execute voice command.';
    }
  }

  speak(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }
}

window.voice = new WorkRadarVoiceClient();
