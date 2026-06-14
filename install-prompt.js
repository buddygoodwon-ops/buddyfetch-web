// PWA Install Prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  // Show install prompt on first visit
  showInstallPrompt();
});

function showInstallPrompt() {
  // Check if already installed or prompt already shown
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('App already installed');
    return;
  }

  if (localStorage.getItem('installPromptShown')) {
    console.log('Install prompt already shown');
    return;
  }

  // Create custom install prompt
  const promptDiv = document.createElement('div');
  promptDiv.id = 'installPrompt';
  promptDiv.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #f2b84b, #ff6b22);
      color: #180d06;
      padding: 16px 24px;
      border-radius: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.4);
      z-index: 9999;
      font-weight: 800;
      text-align: center;
      max-width: 90vw;
      animation: slideUp 0.3s ease-out;
    ">
      <div style="font-size: 18px; margin-bottom: 8px;">🎾 Save BuddyFetch to your HOME screen!</div>
      <div style="display: flex; gap: 12px; justify-content: center; margin-top: 12px;">
        <button id="installBtn" style="
          background: #fff;
          color: #180d06;
          border: 0;
          padding: 10px 20px;
          border-radius: 999px;
          font-weight: 800;
          cursor: pointer;
          font-size: 16px;
        ">Add to Home Screen</button>
        <button id="dismissBtn" style="
          background: rgba(0,0,0,0.3);
          color: #fff;
          border: 0;
          padding: 10px 20px;
          border-radius: 999px;
          font-weight: 800;
          cursor: pointer;
          font-size: 16px;
        ">Not Now</button>
      </div>
    </div>
  `;

  document.body.appendChild(promptDiv);

  // Install button handler
  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) {
      // Fallback for iOS - show instructions
      showIOSInstructions();
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response: ${outcome}`);
    deferredPrompt = null;
    
    promptDiv.remove();
    localStorage.setItem('installPromptShown', 'true');
  });

  // Dismiss button handler
  document.getElementById('dismissBtn').addEventListener('click', () => {
    promptDiv.remove();
    localStorage.setItem('installPromptShown', 'true');
  });

  // Mark as shown after 30 seconds even if no interaction
  setTimeout(() => {
    if (document.getElementById('installPrompt')) {
      localStorage.setItem('installPromptShown', 'true');
    }
  }, 30000);
}

function showIOSInstructions() {
  alert('To add BuddyFetch to your home screen:\n\n1. Tap the Share button (⎘)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"');
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;
document.head.appendChild(style);

// Show prompt after a short delay (let page load first)
setTimeout(() => {
  if (deferredPrompt || /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    showInstallPrompt();
  }
}, 2000);
