const $ = (id) => document.getElementById(id);

const chat = $('chat');
const form = $('chatForm');
const input = $('messageInput');
const fileInput = $('fileInput');
const listenBtn = $('listenBtn');
const taskModeBtn = $('taskModeBtn');
const attachBtn = $('attachBtn');
const attachBtn2 = $('attachBtn2');
const avatarCard = $('avatarCard');
const statusDot = $('statusDot');
const statusText = $('statusText');

let pendingAttachments = [];
let taskMode = false;
let recognition = null;
let micActive = false;
let recognitionStarting = false;
let finalTranscript = '';
let speechSubmitTimer = null;
let sendingSpeech = false;
let greeted = false;
let currentAudio = null;

function setStatus(text, ready = false) {
  if (statusText) statusText.textContent = text;
  if (!statusDot) return;
  statusDot.classList.toggle('thinking', !ready && !String(text).toLowerCase().includes('error'));
  statusDot.classList.toggle('error', String(text).toLowerCase().includes('error'));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function shortQuestion(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;
}

function addMsg(kind, text, attachments = []) {
  if (!chat) return;
  const bubble = document.createElement('div');
  bubble.className = `msg ${kind}`;
  bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');

  attachments.forEach(file => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.textContent = `${file.kind === 'image' ? '🖼️' : '📎'} ${file.name || 'upload'}${file.size ? ` (${Math.round(file.size / 1024)} KB)` : ''}`;
    bubble.appendChild(chip);
    if (file.previewUrl) {
      const img = document.createElement('img');
      img.className = 'attachment-preview';
      img.src = file.previewUrl;
      img.alt = file.name || 'attachment preview';
      bubble.appendChild(img);
    }
  });

  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

async function speak(text, { interrupt = false, force = false } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return;

  if (interrupt && currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  avatarCard?.classList.add('speaking');
  try {
    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 1200) })
    });

    const contentType = r.headers.get('content-type') || '';
    if (r.ok && contentType.includes('audio')) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      await audio.play();
      await new Promise(resolve => {
        audio.onended = audio.onerror = resolve;
      });
      URL.revokeObjectURL(url);
      return;
    }
  } catch (e) {
    console.warn('ElevenLabs/browser audio fallback:', e);
  } finally {
    avatarCard?.classList.remove('speaking');
  }

  if ('speechSynthesis' in window && (force || !micActive)) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean.slice(0, 1200));
    utterance.rate = 1;
    utterance.pitch = 0.85;
    avatarCard?.classList.add('speaking');
    await new Promise(resolve => {
      utterance.onend = utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
    avatarCard?.classList.remove('speaking');
  }
}

async function greet() {
  if (greeted) return;
  greeted = true;
  const line = 'BuddyFetch is ready. Tap the mic, type a question, or hit the paperclip to upload a file.';
  addMsg('buddy', line);
}

async function handleMessage(message, attachments = []) {
  setStatus('BuddyFetch is fetching...', false);
  const messages = [
    {
      role: 'system',
      content: 'You are BuddyFetch, a funny old-dog AI helper. Be concise, useful, and action-first. If attachments are provided, acknowledge them and explain what you can do next.'
    },
    {
      role: 'user',
      content: `${message || 'Attachment uploaded.'}${attachments.length ? `\n\nAttachments: ${attachments.map(a => `${a.name} (${a.type || a.kind})`).join(', ')}` : ''}`
    }
  ];

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, attachments, messages })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data.reply || data.message || data.body || data.choices?.[0]?.message?.content || 'Fetched. What should I chase next?';
  } catch (e) {
    console.error('Chat error:', e);
    return `I hit a fetch snag: ${e.message}. The buttons are working now, but the backend needs that service reachable.`;
  }
}

async function sendMessage(message, { readQuestion = true } = {}) {
  const clean = String(message || '').trim();
  const attachments = pendingAttachments.slice();
  if ((!clean && !attachments.length) || sendingSpeech) return;

  sendingSpeech = true;
  addMsg('user', clean || 'Attachment uploaded', attachments);
  pendingAttachments = [];
  input.value = '';
  input.placeholder = 'Tap mic or type your question...';

  try {
    if (readQuestion && clean) await speak(`You asked: ${shortQuestion(clean)}`, { interrupt: true });
    const reply = await handleMessage(clean, attachments);
    addMsg('buddy', reply);
    await speak(reply, { force: true });
    setStatus('Ready — talk, type, or upload.', true);
  } finally {
    sendingSpeech = false;
  }
}

function scheduleSpeechSubmit(delay = 2300) {
  clearTimeout(speechSubmitTimer);
  speechSubmitTimer = setTimeout(() => {
    if (micActive) stopMic();
    else if (input.value.trim()) sendMessage(input.value, { readQuestion: true });
  }, delay);
}

function startMic() {
  if (!recognition || micActive || recognitionStarting) return;
  finalTranscript = '';
  recognitionStarting = true;
  try { recognition.start(); }
  catch (e) { recognitionStarting = false; setStatus('Mic already starting — try again.', false); }
}

function stopMic() {
  clearTimeout(speechSubmitTimer);
  if (!recognition) return;
  try { recognition.stop(); } catch (e) { console.warn(e); }
}

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (listenBtn) {
      listenBtn.disabled = false;
      listenBtn.title = 'Speech recognition is not supported here. Type still works.';
    }
    setStatus('Type and upload work. Speech needs Chrome/Safari mic support.', true);
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    recognitionStarting = false;
    micActive = true;
    if (listenBtn) {
      listenBtn.textContent = '⏹️';
      listenBtn.setAttribute('aria-label', 'Stop listening');
    }
    avatarCard?.classList.add('listening');
    setStatus('Listening — talk naturally, then pause.', false);
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript = `${finalTranscript} ${transcript}`.replace(/\s+/g, ' ').trim();
      else interim += transcript;
    }
    input.value = `${finalTranscript} ${interim}`.replace(/\s+/g, ' ').trim();
    if (input.value) scheduleSpeechSubmit(2300);
  };

  recognition.onerror = (event) => {
    recognitionStarting = false;
    micActive = false;
    const errorMsg = event.error === 'not-allowed'
      ? 'Mic permission blocked. Allow microphone access or type instead.'
      : `Mic error: ${event.error}. Type still works.`;
    addMsg('buddy', errorMsg);
    setStatus('Mic error — type/upload still work.', false);
  };

  recognition.onend = () => {
    micActive = false;
    recognitionStarting = false;
    if (listenBtn) {
      listenBtn.textContent = '🎤';
      listenBtn.setAttribute('aria-label', 'Talk to Buddy');
    }
    avatarCard?.classList.remove('listening');
    clearTimeout(speechSubmitTimer);
    if (input.value.trim()) sendMessage(input.value, { readQuestion: true });
    else setStatus('Ready — talk, type, or upload.', true);
  };
}

listenBtn?.addEventListener('click', async () => {
  await greet();
  if (!recognition) {
    addMsg('buddy', 'Mic is not available in this browser. Type your question or upload a file and I can still fetch.');
    return;
  }
  if (micActive || recognitionStarting) stopMic();
  else startMic();
});

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(input.value, { readQuestion: true });
});

taskModeBtn?.addEventListener('click', () => {
  taskMode = !taskMode;
  taskModeBtn.setAttribute('aria-pressed', String(taskMode));
  taskModeBtn.textContent = taskMode ? '🎾 Fetch Mode: On' : '🎾 Fetch Mode: Off';
  setStatus(taskMode ? 'Fetch Mode on — tell Buddy what to chase.' : 'Fetch Mode off — normal chat.', true);
});

function openUploader() {
  if (!fileInput) return;
  fileInput.click();
}

attachBtn?.addEventListener('click', openUploader);
attachBtn2?.addEventListener('click', openUploader);

fileInput?.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []).slice(0, 5);
  pendingAttachments.forEach(file => { if (file.previewUrl) URL.revokeObjectURL(file.previewUrl); });
  pendingAttachments = files.map(file => ({
    file,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    kind: file.type?.startsWith('image/') ? 'image' : 'file',
    previewUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : ''
  }));

  if (pendingAttachments.length) {
    addMsg('user', 'Upload ready. Add a note and hit send, or send it as-is.', pendingAttachments);
    input.placeholder = pendingAttachments.length === 1
      ? `Add a note about ${pendingAttachments[0].name}...`
      : `Add a note about ${pendingAttachments.length} files...`;
    setStatus(`${pendingAttachments.length} upload${pendingAttachments.length > 1 ? 's' : ''} ready.`, true);
  }
  fileInput.value = '';
});

setStatus('Ready — talk, type, or upload.', true);
setupSpeech();
greet();
