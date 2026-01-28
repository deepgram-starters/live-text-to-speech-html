/**
 * Live Text-to-Speech - Frontend Application
 *
 * Streaming WebSocket-based TTS with dynamic audio buffering
 */

// Configuration
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE_URL = `${WS_PROTOCOL}//${window.location.host}`;
const SAMPLE_RATE = 48000;
const BUFFER_AHEAD_TIME = 0.1; // Start playing when we have 100ms buffered

// Application state
let ws = null;
let audioContext = null;
let nextStartTime = 0;
let isPlaying = false;
let audioQueue = [];
let scheduledSources = [];
let sessionStartTime = null;
let durationInterval = null;

// Stats
let chunksReceived = 0;
let bytesReceived = 0;

// DOM elements
let connectBtn, sendBtn, disconnectBtn;
let modelSelect, textInput;
let connectionStatus, playbackStatus, currentModel;
let chunksReceivedEl, bytesReceivedEl, buffersQueuedEl, sessionDurationEl;
let playbackStateText, emptyState, playbackSection, transcriptContainer;
let connectOverlay, disconnectContainer;

// Metadata elements
let pageTitle, pageDescription, headerTitle, repoLink;

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing Live TTS application...');

  // Cache DOM elements
  connectBtn = document.getElementById('connect-btn');
  sendBtn = document.getElementById('send-btn');
  disconnectBtn = document.getElementById('disconnect-btn');
  modelSelect = document.getElementById('model-select');
  textInput = document.getElementById('text-input');

  // Status elements
  connectionStatus = document.getElementById('connection-status');
  playbackStatus = document.getElementById('playback-status');
  currentModel = document.getElementById('current-model');
  chunksReceivedEl = document.getElementById('chunks-received');
  bytesReceivedEl = document.getElementById('bytes-received');
  buffersQueuedEl = document.getElementById('buffers-queued');
  sessionDurationEl = document.getElementById('session-duration');
  playbackStateText = document.getElementById('playback-state-text');

  // Main content elements
  emptyState = document.getElementById('empty-state');
  playbackSection = document.getElementById('playback-section');
  transcriptContainer = document.getElementById('transcript-container');
  connectOverlay = document.getElementById('connect-overlay');
  disconnectContainer = document.getElementById('disconnect-container');

  // Metadata elements
  pageTitle = document.getElementById('pageTitle');
  pageDescription = document.getElementById('pageDescription');
  headerTitle = document.getElementById('headerTitle');
  repoLink = document.getElementById('repoLink');

  // Set up event listeners
  connectBtn.addEventListener('click', handleConnect);
  sendBtn.addEventListener('click', handleSend);
  disconnectBtn.addEventListener('click', handleDisconnect);

  // Load metadata
  loadMetadata();

  console.log('Application initialized');
});

/**
 * Initialize audio context
 */
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log('Audio context initialized');
  }
}

/**
 * Load application metadata from /metadata endpoint
 */
async function loadMetadata() {
  try {
    const response = await fetch('/metadata');
    if (!response.ok) {
      console.warn('Failed to load metadata, using defaults');
      return;
    }

    const metadata = await response.json();

    // Update page title
    if (metadata.title && pageTitle) {
      pageTitle.textContent = metadata.title;
    }

    // Update page description
    if (metadata.description && pageDescription) {
      pageDescription.setAttribute('content', metadata.description);
    }

    // Update header title
    if (metadata.title && headerTitle) {
      headerTitle.textContent = metadata.title;
    }

    // Update repository link
    if (metadata.repository && repoLink) {
      repoLink.href = metadata.repository;
    }

    console.log('Metadata loaded:', metadata);
  } catch (error) {
    console.warn('Error loading metadata, using defaults:', error);
  }
}

/**
 * Handle Connect button click
 */
function handleConnect() {
  const model = modelSelect.value;
  const wsUrl = `${WS_BASE_URL}/tts/stream?model=${model}&encoding=linear16&sample_rate=${SAMPLE_RATE}&container=none`;

  console.log('Connecting to:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.addEventListener('open', () => {
    console.log('✓ WebSocket connected');
    updateConnectionStatus('connected', 'Connected');

    // Hide connect overlay, show disconnect button
    connectOverlay.classList.add('hidden');
    disconnectContainer.classList.remove('hidden');

    sendBtn.disabled = false;
    currentModel.textContent = modelSelect.options[modelSelect.selectedIndex].text;

    // Start session timer
    sessionStartTime = Date.now();
    durationInterval = setInterval(updateSessionDuration, 1000);

    resetStats();
    handleStopAudio();
  });

  ws.addEventListener('message', async (event) => {
    if (typeof event.data === 'string') {
      // JSON message
      const msg = JSON.parse(event.data);
      console.log('← JSON:', msg);

      if (msg.type === 'Error') {
        updateConnectionStatus('error', 'Error');
        console.error('Error from server:', msg);
      } else if (msg.type === 'Flushed') {
        console.log('Stream flushed, all audio sent');
      }
    } else {
      // Binary audio data
      const arrayBuffer = await event.data.arrayBuffer();
      const audioData = new Uint8Array(arrayBuffer);

      chunksReceived++;
      bytesReceived += arrayBuffer.byteLength;

      console.log(`← Audio chunk #${chunksReceived}: ${arrayBuffer.byteLength} bytes`);

      // Schedule this chunk for playback
      scheduleAudioChunk(audioData);
      updateStats();
    }
  });

  ws.addEventListener('close', (event) => {
    console.log(`WebSocket closed: ${event.code} ${event.reason || '(no reason)'}`);
    updateConnectionStatus('disconnected', 'Disconnected');

    // Show connect overlay, hide disconnect button
    connectOverlay.classList.remove('hidden');
    disconnectContainer.classList.add('hidden');

    sendBtn.disabled = true;
    handleStopAudio();

    // Stop session timer
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
  });

  ws.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
    updateConnectionStatus('error', 'Error');
  });
}

/**
 * Handle Send button click
 */
function handleSend() {
  const text = textInput.value.trim();
  if (!text) {
    console.error('No text to send');
    return;
  }

  // Reset for new audio
  handleStopAudio();
  resetStats();

  // Show playback section
  emptyState.classList.add('hidden');
  playbackSection.classList.remove('hidden');

  // Add transcript item
  addTranscriptItem(text);

  console.log(`→ Sending text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  ws.send(JSON.stringify({ type: 'Speak', text }));

  // Send flush after a short delay
  setTimeout(() => {
    console.log('→ Sending Flush');
    ws.send(JSON.stringify({ type: 'Flush' }));
  }, 100);
}

/**
 * Handle Stop Audio button click
 */
function handleStopAudio() {
  // Stop all scheduled sources
  scheduledSources.forEach(source => {
    try {
      source.stop();
    } catch (e) {
      // Source might already be stopped
    }
  });

  scheduledSources = [];
  audioQueue = [];
  isPlaying = false;
  nextStartTime = 0;

  updatePlaybackState('Idle');
  updateStats();

  console.log('Audio stopped');
}

/**
 * Handle Disconnect button click
 */
function handleDisconnect() {
  if (ws) {
    console.log('Closing connection...');
    handleStopAudio();
    ws.close();
  }
}

/**
 * Schedule an audio chunk for playback
 */
function scheduleAudioChunk(audioData) {
  // Initialize audio context if needed
  initAudioContext();

  try {
    // Convert Uint8Array to Int16Array (linear16)
    const int16Array = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.byteLength / 2);

    // Convert to Float32Array for Web Audio API
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768; // Normalize to -1.0 to 1.0
    }

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32Array);

    audioQueue.push(audioBuffer);
    updateStats();

    // Start playback if not already playing
    if (!isPlaying) {
      startPlayback();
    } else {
      // Schedule next buffer
      scheduleNextBuffer();
    }
  } catch (error) {
    console.error('Error scheduling audio:', error);
  }
}

/**
 * Start audio playback
 */
function startPlayback() {
  if (audioQueue.length === 0 || isPlaying) return;

  initAudioContext();

  // Resume audio context if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  isPlaying = true;
  nextStartTime = audioContext.currentTime + BUFFER_AHEAD_TIME;

  console.log(`🔊 Starting playback (buffered: ${audioQueue.length} chunks)`);
  updatePlaybackState('Playing');

  // Schedule all queued buffers
  while (audioQueue.length > 0) {
    scheduleNextBuffer();
  }

  updateStats();
}

/**
 * Schedule the next audio buffer
 */
function scheduleNextBuffer() {
  if (audioQueue.length === 0) return;

  const buffer = audioQueue.shift();
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  // Schedule this buffer to play at nextStartTime
  source.start(nextStartTime);

  // Update next start time
  nextStartTime += buffer.duration;

  // Track scheduled sources
  scheduledSources.push(source);

  // Clean up when this source finishes
  source.onended = () => {
    const index = scheduledSources.indexOf(source);
    if (index > -1) {
      scheduledSources.splice(index, 1);
    }

    // Check if playback should continue
    if (scheduledSources.length === 0 && audioQueue.length === 0) {
      isPlaying = false;
      updatePlaybackState('Idle');
      console.log('Playback complete');
      updateStats();
    }
  };

  updateStats();
}

/**
 * Add a transcript item to the main content area
 */
function addTranscriptItem(text) {
  const timestamp = new Date().toLocaleTimeString();

  const item = document.createElement('div');
  item.className = 'transcript-item';

  const timestampDiv = document.createElement('div');
  timestampDiv.className = 'transcript-item__timestamp';
  timestampDiv.textContent = timestamp;

  const textDiv = document.createElement('div');
  textDiv.className = 'transcript-item__text';
  textDiv.textContent = text;

  item.appendChild(timestampDiv);
  item.appendChild(textDiv);
  transcriptContainer.appendChild(item);
  transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
}

/**
 * Update connection status badge
 */
function updateConnectionStatus(status, text) {
  connectionStatus.className = `status-badge status-badge--${status}`;

  // Clear existing content
  connectionStatus.innerHTML = '';

  // Add indicator
  const indicator = document.createElement('span');
  indicator.className = `status-indicator status-indicator--${status}`;
  connectionStatus.appendChild(indicator);

  // Add text node
  connectionStatus.appendChild(document.createTextNode(text));
}

/**
 * Update playback state
 */
function updatePlaybackState(state) {
  playbackStatus.textContent = state;
  playbackStateText.textContent = state;
}

/**
 * Update stats display
 */
function updateStats() {
  chunksReceivedEl.textContent = chunksReceived;
  bytesReceivedEl.textContent = bytesReceived.toLocaleString();
  buffersQueuedEl.textContent = audioQueue.length;
  playbackStatus.textContent = isPlaying ? 'Playing' : 'Idle';
}

/**
 * Reset stats
 */
function resetStats() {
  chunksReceived = 0;
  bytesReceived = 0;
  updateStats();
}

/**
 * Update session duration
 */
function updateSessionDuration() {
  if (!sessionStartTime) return;

  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  sessionDurationEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
