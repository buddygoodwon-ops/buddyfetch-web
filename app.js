async function handleSpeechMessage(message, attachments = []) {
  setStatus('Processing speech...', false);
  try {
    const r = await fetch('/api/liveavatar/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: message || '...', attachments })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  } catch (e) {
    console.error('Speech message error:', e);
    setStatus('Error processing speech.', false);
    return { reply: `Sorry, I couldn't process that speech input. Error: ${e.message}` };
  }
}

async function handleStaticMessage(message, attachments = []) {
  setStatus('Processing static input...', false);
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, attachments })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  } catch (e) {
    console.error('Static message error:', e);
    setStatus('Error processing static input.', false);
    return { reply: `Sorry, I couldn't process that input. Error: ${e.message}` };
  }
}

async function sendLiveAvatarMessage(message, { readQuestion = true } = {}) {
  const clean = String(message || '').trim();
  const attachments = pendingAttachments.slice();
  if (!clean && !attachments.length) return;

  addMsg('user', clean || 'Attachment uploaded', attachments);
  pendingAttachments = [];
  input.value = '';
  input.placeholder = 'Tell Buddy what to fetch...';
  setStatus('BuddyFetch is thinking...', false);

  try {
    if (readQuestion && clean) {
      await speak(`You asked: ${shortQuestion(clean)}`, { interrupt: true });
    }

    const data = await handleSpeechMessage(clean, attachments);
    const reply = data.reply || data.body || data.message || 'I heard you. BuddyFetch is connected.';
    addMsg('buddy', reply);
    await speak(reply, { force: true });
    setStatus('Ready — talk or type.', true);
  } catch (error) {
    const msg = `I heard you, but the fetch hit an error: ${error.message}`;
    addMsg('buddy', msg);
    await speak(msg);
    setStatus('Error — try again.', false);
  } finally {
    sendingSpeech = false;
  }
}

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    listenBtn.disabled = true;
    listenBtn.title = 'Speech recognition is not supported in this browser.';
    setStatus('Type works. Speech needs Chrome/Safari support.', false);
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true; // Keep listening until explicitly stopped
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    recognitionStarting = false;
    micActive = true;
    listenBtn.textContent = '⏹️'; // Stop icon
    listenBtn.setAttribute('aria-label', 'Stop listening');
    avatarCard.classList.add('listening');
    setStatus('Listening — talk naturally, then pause.', false);
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript = `${finalTranscript} ${transcript}`.replace(/\s+/g, ' ').trim();
      } else {
        interim += transcript;
      }
    }
    input.value = `${finalTranscript} ${interim}`.replace(/\s+/g, ' ').trim();
    if (input.value) scheduleSpeechSubmit(2300);
  };

  recognition.onerror = (event) => {
    recognitionStarting = false;
    micActive = false;
    let errorMsg = `Mic error: ${event.error}. `;
    if (event.error === 'not-allowed') errorMsg += 'Check browser permissions.';
    else if (event.error === 'service-not-allowed') errorMsg += 'Check OS microphone permissions.';
    addMsg('buddy', errorMsg);
    setStatus('Mic error — type still works.', false);
  };

  recognition.onend = () => {
    micActive = false;
    recognitionStarting = false;
    listenBtn.textContent = '🎙️'; // Microphone icon
    listenBtn.setAttribute('aria-label', 'Talk to Buddy');
    avatarCard.classList.remove('listening');
    if (input.value) {
      sendMessage(input.value, { readQuestion: true });
    } else {
      setStatus('Ready — tap mic or type.', true);
    }
  };
}

listenBtn?.addEventListener('click', async () => {
  await greet();
  if (!recognition) return;
  if (micActive || recognitionStarting) {
    stopMic();
  } else {
    startMic();
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(input.value, { readQuestion: true });
});

taskModeBtn?.addEventListener('click', () => {
  taskMode = !taskMode;
  taskModeBtn.setAttribute('aria-pressed', String(taskMode));
  taskModeBtn.textContent = taskMode ? '🎾 Fetch Mode: On' : '🎾 Fetch Mode: Off';
});

attachBtn?.addEventListener('click', () => fileInput?.click());
attachBtn2?.addEventListener('click', () => fileInput?.click());

fileInput?.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []).slice(0, 5);
  pendingAttachments.forEach(file => { if (file.previewUrl) URL.revokeObjectURL(file.previewUrl); });
  
  pendingAttachments = await Promise.all(files.map(async file => {
    const previewUrl = file.type?.startsWith('image/') ? URL.createObjectURL(file) : '';
    return {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      kind: file.type?.startsWith('image/') ? 'image' : 'file',
      previewUrl: previewUrl
    };
  }));

  if (pendingAttachments.length) {
    addMsg('user', 'Ready to send:', pendingAttachments);
    input.placeholder = pendingAttachments.length === 1
      ? `Add a note about ${pendingAttachments[0].name}...`
      : `Add a note about ${pendingAttachments.length} files...`;
  }
  fileInput.value = ''; // Clear the file input
});

setStatus('Ready — tap mic or type.', true);
setupSpeech();
greet();
