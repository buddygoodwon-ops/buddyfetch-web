// BuddyFetch - Vanilla JavaScript LiveKit Integration
// Uses CDN-loaded livekit-client from index.html

const avatarCard = document.getElementById('avatarCard');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');

function setStatus(text, ready) {
  if (statusText) statusText.textContent = text;
  if (statusDot) {
    statusDot.classList.toggle('thinking', !ready);
    statusDot.classList.toggle('error', !ready);
  }
}

// Load LiveKit client SDK via CDN (handled in index.html)
window.addEventListener('load', () => {
  setStatus('Avatar plugin ready', true);
});

// Fetch token from our API endpoint
async function fetchToken() {
  try {
    const response = await fetch('/api/token');
    if (!response.ok) throw new Error('Token fetch failed');
    return await response.json();
  } catch (err) {
    console.error('Token fetch error:', err);
    return null;
  }
}

// Start voice session using LiveKit
async function startVoiceSession() {
  setStatus('Connecting to Buddy...', false);
  
  try {
    // Get token from API
    const tokenData = await fetchToken();
    if (!tokenData?.token) {
      throw new Error('No token received from API');
    }
    
    // Ensure LiveKit client is loaded
    if (typeof window.LiveKitClient === 'undefined') {
      throw new Error('LiveKit client not loaded');
    }
    
    const room = new window.LiveKitClient.Room();
    
    // Event handlers
    room.on(window.LiveKitClient.RoomEvent.Connected, () => {
      setStatus('Connected! Listening...', true);
    });
    
    room.on(window.LiveKitClient.RoomEvent.Disconnected, () => {
      setStatus('Disconnected', false);
    });
    
    // Connect to LiveKit
    await room.connect('wss://buddyfetch-xrm1c4hk.livekit.cloud', tokenData.token);
    
    setStatus('Listening...', true);
    
    // Publish local audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await room.localParticipant.publishTrack(stream.getAudioTracks()[0]);
    
    console.log('LiveKit session started successfully');
  } catch (err) {
    console.error('Voice session error:', err);
    setStatus('Failed to connect: ' + err.message, false);
    if (statusDot) statusDot.classList.add('error');
  }
}

// Avatar click handler
if (avatarCard) {
  avatarCard.addEventListener('click', async (e) => {
    e.preventDefault();
    
    try {
      setStatus('Requesting microphone...', false);
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus('Microphone access denied', false);
      if (statusDot) statusDot.classList.add('error');
      return;
    }
    
    await startVoiceSession();
  });
}