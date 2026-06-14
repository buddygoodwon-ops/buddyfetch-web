import Vapi from '@vapi-ai/web';

const $ = (id) => document.getElementById(id);

const chat = $('chat');
const form = $('chatForm');
const input = $('messageInput');
const listenBtn = $('listenBtn');
const avatarCard = $('avatarCard');
const statusDot = $('statusDot');
const statusText = $('statusText');
const dogAvatar = $('dogAvatar');

// VAPI config
const VAPI_PUBLIC_KEY = '174afa6d-ae73-410a-ae80-4d14e5db90ce';
const VAPI_ASSISTANT_ID = 'b0273a7c-a588-4aa0-b605-81ddabebe6b1';

let vapi = null;
let liveAvatarSession = null;
let isConnected = false;
let isSpeaking = false;
let audioContext = null;
let mediaStreamDestination = null;

function setStatus(text, ready = false) {
  if (statusText) statusText.textContent = text;
  if (!statusDot) return;
  statusDot.classList.toggle('thinking', !ready && !String(text).toLowerCase().includes('error'));
  statusDot.classList.toggle('error', String(text).toLowerCase().includes('error'));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function addMsg(role, text) {
  if (!chat) return;
  const bubble = document.createElement('div');
  bubble.className = `msg ${role}`;
  bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

// Initialize LiveAvatar
async function initLiveAvatar() {
  if (!window.BuddyLiveBundle) {
    console.error('LiveAvatar bundle not loaded');
    return null;
  }

  try {
    setStatus('Getting LiveAvatar token...', false);
    
    // Get session token from backend
    const tokenResponse = await fetch('/api/liveavatar/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        avatarName: 'Old Dog Buddy'
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.session_token) {
      throw new Error('No session token received');
    }

    console.log('LiveAvatar token received:', tokenData);
    setStatus('Connecting to LiveAvatar...', false);

    // Initialize LiveAvatar session
    const LiveAvatarSession = window.BuddyLiveBundle.LiveAvatarSession;
    const session = new LiveAvatarSession({
      sessionToken: tokenData.session_token,
      mode: 'LITE' // LITE mode = bring your own audio
    });

    // Set up event handlers
    session.on('connected', () => {
      console.log('LiveAvatar connected');
      setStatus('Avatar ready', true);
    });

    session.on('disconnected', () => {
      console.log('LiveAvatar disconnected');
    });

    session.on('error', (error) => {
      console.error('LiveAvatar error:', error);
      setStatus(`Avatar error: ${error.message}`, false);
    });

    // Connect and get video stream
    await session.connect();
    
    const stream = await session.getVideoStream();
    
    if (stream && dogAvatar) {
      dogAvatar.srcObject = stream;
      dogAvatar.muted = false;
      dogAvatar.autoplay = true;
      dogAvatar.play();
      console.log('LiveAvatar video stream attached');
    }

    return session;
  } catch (error) {
    console.error('Failed to initialize LiveAvatar:', error);
    setStatus(`Avatar init failed: ${error.message}`, false);
    return null;
  }
}

// Initialize VAPI
function initVapi() {
  if (vapi) return;
  
  vapi = new Vapi(VAPI_PUBLIC_KEY);
  
  vapi.on('call-start', async () => {
    console.log('VAPI call started');
    isConnected = true;
    setStatus('Connected - Listening', true);
    
    if (listenBtn) {
      listenBtn.textContent = '🔴 End Call';
      listenBtn.classList.add('active');
    }
    
    avatarCard?.classList.add('listening');

    // Initialize LiveAvatar when call starts
    if (!liveAvatarSession) {
      liveAvatarSession = await initLiveAvatar();
    }
  });
  
  vapi.on('call-end', () => {
    console.log('VAPI call ended');
    isConnected = false;
    isSpeaking = false;
    setStatus('Ready', true);
    
    if (listenBtn) {
      listenBtn.textContent = '🎤 Start Call';
      listenBtn.classList.remove('active');
    }
    
    avatarCard?.classList.remove('listening', 'speaking');

    // Disconnect LiveAvatar
    if (liveAvatarSession) {
      liveAvatarSession.disconnect();
      liveAvatarSession = null;
    }
  });
  
  vapi.on('speech-start', () => {
    console.log('Assistant started speaking');
    isSpeaking = true;
    setStatus('Buddy is speaking', false);
    avatarCard?.classList.add('speaking');
    avatarCard?.classList.remove('listening');
  });
  
  vapi.on('speech-end', () => {
    console.log('Assistant stopped speaking');
    isSpeaking = false;
    
    if (isConnected) {
      setStatus('Listening', true);
      avatarCard?.classList.remove('speaking');
      avatarCard?.classList.add('listening');
    }
  });
  
  vapi.on('message', (message) => {
    console.log('VAPI message:', message);
    
    if (message.type === 'transcript') {
      const role = message.role === 'user' ? 'user' : 'assistant';
      
      if (message.transcriptType === 'final') {
        addMsg(role, message.transcript);
      }
    }
    
    // Handle audio for LiveAvatar lip-sync
    if (message.type === 'speech-update' && liveAvatarSession) {
      // VAPI sends audio chunks - pipe them to LiveAvatar
      if (message.audio) {
        sendAudioToLiveAvatar(message.audio);
      }
    }
  });
  
  vapi.on('error', (error) => {
    console.error('VAPI error:', error);
    setStatus(`Error: ${error.message || 'Connection failed'}`, false);
    isConnected = false;
    
    if (listenBtn) {
      listenBtn.textContent = '🎤 Start Call';
      listenBtn.classList.remove('active');
    }
  });
}

// Send audio to LiveAvatar for lip-sync
async function sendAudioToLiveAvatar(audioData) {
  if (!liveAvatarSession) return;

  try {
    // Initialize audio context if needed
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      mediaStreamDestination = audioContext.createMediaStreamDestination();
    }

    // Decode audio data and send to LiveAvatar
    // VAPI sends base64 audio chunks
    const audioBuffer = base64ToArrayBuffer(audioData);
    const decodedAudio = await audioContext.decodeAudioData(audioBuffer);
    
    const source = audioContext.createBufferSource();
    source.buffer = decodedAudio;
    source.connect(mediaStreamDestination);
    
    // Send audio stream to LiveAvatar
    await liveAvatarSession.sendAudio(mediaStreamDestination.stream);
    
    source.start();
  } catch (error) {
    console.error('Error sending audio to LiveAvatar:', error);
  }
}

// Helper: base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Toggle voice call
async function toggleCall() {
  if (!vapi) initVapi();
  
  if (isConnected) {
    vapi.stop();
  } else {
    try {
      setStatus('Connecting...', false);
      await vapi.start(VAPI_ASSISTANT_ID);
    } catch (error) {
      console.error('Failed to start call:', error);
      setStatus('Failed to start call', false);
    }
  }
}

// Event listeners
if (listenBtn) {
  listenBtn.addEventListener('click', toggleCall);
}

// Attach buttons
const attachBtn = $('attachBtn');
const attachBtn2 = $('attachBtn2');
const fileInput = $('fileInput');

console.log('Buttons found:', { attachBtn: !!attachBtn, attachBtn2: !!attachBtn2, fileInput: !!fileInput });

if (attachBtn && fileInput) {
  attachBtn.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Bottom attach clicked');
    fileInput.click();
  });
}

if (attachBtn2 && fileInput) {
  attachBtn2.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Top attach clicked');
    fileInput.click();
  });
}

if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    console.log('Files selected:', files);
    if (files.length > 0) {
      const fileNames = files.map(f => f.name).join(', ');
      addMsg('system', `Attached: ${fileNames}`);
    }
  });
}

// Task mode toggle
const taskModeBtn = $('taskModeBtn');
console.log('Task mode button found:', !!taskModeBtn);
if (taskModeBtn) {
  taskModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Task mode clicked');
    const isOn = taskModeBtn.getAttribute('aria-pressed') === 'true';
    taskModeBtn.setAttribute('aria-pressed', !isOn);
    taskModeBtn.textContent = isOn ? '🎾 Fetch Mode: Off' : '🎾 Fetch Mode: On';
    console.log('Chat element:', chat);
    if (chat) {
      addMsg('system', isOn ? 'Fetch mode disabled' : 'Fetch mode enabled - Buddy will tackle longer tasks');
    }
  });
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input?.value?.trim();
    if (!text) return;
    
    addMsg('user', text);
    input.value = '';
    
    if (isConnected && vapi) {
      // Send text message during active call
      vapi.send({
        type: 'add-message',
        message: {
          role: 'user',
          content: text
        }
      });
    } else {
      addMsg('assistant', 'Start a call first to chat with Buddy.');
    }
  });
}

// Initialize on load
setStatus('Ready', true);
console.log('BuddyFetch VAPI + LiveAvatar initialized');
