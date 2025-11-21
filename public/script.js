// Initialize Socket.IO connection
// Use environment variable for backend URL, fallback to current host
const backendUrl = window.BACKEND_URL || window.location.origin;
const socket = io(backendUrl);

// DOM Elements
const recordButton = document.getElementById('recordButton');
const buttonText = document.getElementById('buttonText');
const arabicTranscription = document.getElementById('arabicTranscription');
const englishTranscription = document.getElementById('englishTranscription');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');

// Audio recording variables
let mediaRecorder = null;
let audioStream = null;
let isRecording = false;
let chunks = [];

// Transcription state with compact streaming
let currentArabicText = '';
let currentEnglishText = '';
let lastTranscriptionTime = 0;
let transcriptionBuffer = {
    arabic: '',
    english: '',
    lastUpdate: 0,
    pauseThreshold: 2000, // 2 seconds for breath pauses
    maxLength: 300 // Maximum characters before truncation
};

/**
 * Show status message to user
 */
function showStatus(message, type = 'info') {
    statusMessage.className = `status-message ${type}`;
    statusText.textContent = message;
    statusMessage.style.display = 'block';

    // Auto-hide after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
}

/**
 * Cumulative text building for continuous prayer transcription
 */
function manageCumulativeTranscription(arabicText, englishText) {
    // For prayers, we want to continuously append without fragmentation

    if (arabicText && arabicText.trim()) {
        // Clean up the text and append with appropriate spacing
        const cleanArabic = arabicText.trim();
        if (transcriptionBuffer.arabic.trim()) {
            // If we already have text, append with space (avoiding double spaces)
            const lastChar = transcriptionBuffer.arabic.trim().slice(-1);
            const needsSpace = lastChar && ![' ', '\n'].includes(lastChar);
            transcriptionBuffer.arabic += (needsSpace ? ' ' : '') + cleanArabic;
        } else {
            // First text, no prefix needed
            transcriptionBuffer.arabic = cleanArabic;
        }

        // For prayers, keep much more text than regular conversations (up to 2000 chars)
        const maxPrayerLength = 2000;
        if (transcriptionBuffer.arabic.length > maxPrayerLength) {
            // Keep the most recent part of the prayer (last 1500 chars)
            transcriptionBuffer.arabic = '...' + transcriptionBuffer.arabic.slice(-1500);
        }
    }

    if (englishText && englishText.trim()) {
        // Same logic for English translation
        const cleanEnglish = englishText.trim();
        if (transcriptionBuffer.english.trim()) {
            const lastChar = transcriptionBuffer.english.trim().slice(-1);
            const needsSpace = lastChar && ![' ', '\n'].includes(lastChar);
            transcriptionBuffer.english += (needsSpace ? ' ' : '') + cleanEnglish;
        } else {
            transcriptionBuffer.english = cleanEnglish;
        }

        // Keep same length limit for English
        const maxPrayerLength = 2000;
        if (transcriptionBuffer.english.length > maxPrayerLength) {
            transcriptionBuffer.english = '...' + transcriptionBuffer.english.slice(-1500);
        }
    }

    // Update display
    updateTranscriptionDisplay();
}

/**
 * Update transcription display with smart buffering
 */
function updateTranscriptionDisplay() {
    const arabicText = transcriptionBuffer.arabic.trim();
    const englishText = transcriptionBuffer.english.trim();

    // Update Arabic
    if (arabicText !== arabicTranscription.textContent) {
        arabicTranscription.textContent = arabicText || 'Waiting for speech...';
        arabicTranscription.classList.add('updating');

        setTimeout(() => {
            arabicTranscription.classList.remove('updating');
        }, 300);
    }

    // Update English
    if (englishText !== englishTranscription.textContent) {
        englishTranscription.textContent = englishText || 'Waiting for translation...';
        englishTranscription.classList.add('updating');

        setTimeout(() => {
            englishTranscription.classList.remove('updating');
        }, 300);
    }
}

/**
 * Update transcription display (now uses cumulative prayer transcription)
 */
function updateTranscription(data) {
    // Use cumulative transcription for continuous prayer building
    manageCumulativeTranscription(data.arabic, data.english);
}

/**
 * Clear transcription display and reset buffers
 */
function clearTranscriptions() {
    // Clear legacy variables
    currentArabicText = '';
    currentEnglishText = '';

    // Clear compact streaming buffer
    transcriptionBuffer.arabic = '';
    transcriptionBuffer.english = '';
    transcriptionBuffer.lastUpdate = 0;

    // Update display
    updateTranscriptionDisplay();
}

/**
 * Start audio recording
 */
async function startRecording() {
    try {
        showStatus('Requesting microphone access...', 'info');

        // Get user media (microphone)
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000, // Google's recommended sample rate
                channelCount: 1,   // Mono audio
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create MediaRecorder
        const options = {
            mimeType: 'audio/webm;codecs=opus', // Most compatible format
            audioBitsPerSecond: 128000
        };

        mediaRecorder = new MediaRecorder(audioStream, options);

        // Set up event handlers
        mediaRecorder.ondataavailable = handleAudioChunk;

        mediaRecorder.onstart = () => {
            isRecording = true;
            console.log('Recording started');
            showStatus('Recording... Speak into your microphone', 'success');
        };

        mediaRecorder.onstop = () => {
            isRecording = false;
            console.log('Recording stopped');
            showStatus('Recording stopped', 'info');

            // Stop all tracks
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
            }

            // Process remaining chunks if any
            if (chunks.length > 0) {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                sendAudioChunk(blob);
                chunks = [];
            }
        };

        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            showStatus('Recording error: ' + event.error.message, 'error');
            stopRecording();
        };

        // Start recording with small time slices for real-time processing
        mediaRecorder.start(500); // Collect data every 500ms

        console.log('Recording started successfully');
        showStatus('Recording... Speak Arabic into your microphone', 'success');

    } catch (error) {
        console.error('Error starting recording:', error);
        showStatus('Failed to access microphone. Please allow microphone access and try again.', 'error');
    }
}

/**
 * Handle audio data chunks
 */
function handleAudioChunk(event) {
    if (event.data.size > 0) {
        chunks.push(event.data);

        // Send audio chunk immediately for real-time processing
        sendAudioChunk(event.data);
    }
}

/**
 * Send audio chunk to server
 */
function sendAudioChunk(audioData) {
    // Convert Blob to ArrayBuffer, then to Uint8Array
    const reader = new FileReader();
    reader.onloadend = () => {
        const arrayBuffer = reader.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        socket.emit('audio-chunk', uint8Array);
    };
    reader.readAsArrayBuffer(audioData);
}

/**
 * Stop audio recording
 */
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder = null;
        chunks = [];

        // Stop all audio tracks
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
    }
}

/**
 * Toggle recording state
 */
function toggleRecording() {
    if (!isRecording) {
        // Start recording
        clearTranscriptions();
        updateButtonState('recording');
        socket.emit('start-recording');
        startRecording().catch(error => {
            console.error('Failed to start recording:', error);
            updateButtonState('idle');
        });
    } else {
        // Stop recording
        updateButtonState('stopped');
        socket.emit('stop-recording');
        stopRecording();
    }
}

/**
 * Update button visual state
 */
function updateButtonState(state) {
    const button = recordButton;
    button.classList.remove('recording', 'stopped');

    switch (state) {
        case 'recording':
            buttonText.textContent = '⏹️ Stop Recording';
            button.classList.add('recording');
            break;
        case 'stopped':
            buttonText.textContent = '✅ Recording Stopped';
            button.classList.add('stopped');
            setTimeout(() => {
                buttonText.textContent = '🎤 Start Recording';
                button.classList.remove('stopped');
            }, 2000);
            break;
        default:
            buttonText.textContent = '🎤 Start Recording';
            break;
    }
}

/**
 * Socket.IO event handlers
 */
socket.on('recording-started', () => {
    console.log('Server confirmed recording started');
});

socket.on('recording-stopped', () => {
    console.log('Server confirmed recording stopped');
    updateButtonState('idle');
});

socket.on('transcription-update', (data) => {
    console.log('Received transcription update:', data);
    updateTranscription(data);
});

socket.on('error', (error) => {
    console.error('Server error:', error);
    showStatus('Server error: ' + error, 'error');
    stopRecording();
    updateButtonState('idle');
});

socket.on('connect', () => {
    console.log('Connected to server');
    showStatus('Connected to transcription service', 'success');
    setTimeout(() => statusMessage.style.display = 'none', 2000);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showStatus('Disconnected from transcription service', 'error');
    stopRecording();
    updateButtonState('idle');
});

// Button click handler
recordButton.addEventListener('click', () => {
    // Check if browser supports Web Audio API and MediaRecorder
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showStatus('Your browser does not support audio recording. Please use a modern browser like Chrome or Firefox.', 'error');
        return;
    }

    toggleRecording();
});

// Initialize on page load
window.addEventListener('load', () => {
    console.log('Page loaded, initializing...');

    // Check Socket.IO connection
    if (!socket.connected) {
        showStatus('Connecting to transcription service...', 'info');
    }

    // Handle page visibility changes (stop recording if page becomes hidden)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isRecording) {
            console.log('Page became hidden, stopping recording to save resources');
            toggleRecording();
        }
    });

    // Handle before unload (stop recording)
    window.addEventListener('beforeunload', () => {
        if (isRecording) {
            stopRecording();
        }
    });
});

// Fullscreen Prayer Mode variables
let isFullscreen = false;
let fullscreenLanguage = 'arabic'; // 'arabic' or 'english'
let wakeLock = null;
let fullscreenTimeout = null;

// Individual Box Fullscreen variables
let isIndividualFullscreen = false;
let individualFullscreenType = null; // 'arabic' or 'english'

// Fullscreen Mode Functions
function enterFullscreen(language = 'arabic') {
    const overlay = document.getElementById('fullscreenOverlay');
    const transcription = document.getElementById('fullscreenTranscription');

    // Set the language and content
    fullscreenLanguage = language;
    transcription.className = `fullscreen-transcription ${language}`;

    const content = language === 'arabic' ? arabicTranscription.textContent : englishTranscription.textContent;
    transcription.textContent = content;

    // Request screen wake lock
    requestWakeLock();

    // Show fullscreen
    overlay.classList.remove('hidden');
    isFullscreen = true;

    // Allow document body to be fullscreen
    document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable fullscreen: ${err.message}`);
    });

    showStatus('Bible prayer mode activated - Screen will stay awake', 'success');

    // Auto-exit after 5 minutes to save battery
    fullscreenTimeout = setTimeout(() => {
        exitFullscreen();
        showStatus('Auto-exited prayer mode after 5 minutes to save battery', 'info');
    }, 5 * 60 * 1000);
}

function exitFullscreen() {
    const overlay = document.getElementById('fullscreenOverlay');

    // Hide fullscreen
    overlay.classList.add('hidden');
    isFullscreen = false;

    // Release wake lock
    releaseWakeLock();

    // Exit document fullscreen if active
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
            console.warn(`Error attempting to exit fullscreen: ${err.message}`);
        });
    }

    // Clear auto-exit timeout
    if (fullscreenTimeout) {
        clearTimeout(fullscreenTimeout);
        fullscreenTimeout = null;
    }

    showStatus('Exited prayer mode', 'info');
}

// Individual Box Fullscreen Functions
function enterIndividualFullscreen(type) {
    // Exit any existing fullscreen modes
    if (isFullscreen) {
        exitFullscreen();
    }
    if (isIndividualFullscreen) {
        exitIndividualFullscreen();
    }

    const overlayId = type === 'arabic' ? 'arabicFullscreenOverlay' : 'englishFullscreenOverlay';
    const textElementId = type === 'arabic' ? 'arabicFullscreenText' : 'englishFullscreenText';
    const sourceElement = type === 'arabic' ? arabicTranscription : englishTranscription;

    const overlay = document.getElementById(overlayId);
    const textElement = document.getElementById(textElementId);

    // Set content and show overlay
    textElement.textContent = sourceElement.textContent;
    overlay.classList.remove('hidden');

    isIndividualFullscreen = true;
    individualFullscreenType = type;

    showStatus(`Fullscreen ${type} activated`, 'success');
}

function exitIndividualFullscreen() {
    if (!isIndividualFullscreen) return;

    const overlayId = individualFullscreenType === 'arabic' ? 'arabicFullscreenOverlay' : 'englishFullscreenOverlay';
    const overlay = document.getElementById(overlayId);

    overlay.classList.add('hidden');

    isIndividualFullscreen = false;
    individualFullscreenType = null;

    showStatus('Exited fullscreen', 'info');
}

// Screen Wake Lock Functions
async function requestWakeLock() {
    try {
        // Create and play a silent video to keep screen awake (fallback for older browsers)
        const video = document.createElement('video');
        video.src = 'data:video/mp4;base64,CAEBHgAAAAAAAJABAAEAAAAAAAABAAAAAQAAAABAQACAgICAAB4AAAABAAAAAAAAAAAAAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB';
        video.loop = true;
        video.muted = true;
        video.style.position = 'absolute';
        video.style.left = '-9999px';
        video.style.top = '-9999px';
        video.setAttribute('playsinline', '');
        document.body.appendChild(video);

        await video.play();

        // Request screen wake lock if available
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => {
                    console.log('Screen Wake Lock released');
                });
                console.log('Screen Wake Lock is active');
            } catch (err) {
                console.warn(`Wake Lock error: ${err.message}`);
            }
        }

        // Store video reference for cleanup
        window.wakeVideo = video;

    } catch (error) {
        console.warn('Failed to activate screen keep-awake:', error);
        showStatus('Unable to keep screen awake - may turn off during prayer', 'info');
    }
}

function releaseWakeLock() {
    // Release wake lock
    if (wakeLock !== null) {
        wakeLock.release().then(() => {
            wakeLock = null;
        });
    }

    // Remove video element
    if (window.wakeVideo) {
        window.wakeVideo.pause();
        window.wakeVideo.remove();
        window.wakeVideo = null;
    }
}

// Event Listeners for Fullscreen Mode
document.addEventListener('DOMContentLoaded', () => {
    const arabicBox = document.getElementById('arabicBox');
    const englishBox = document.getElementById('englishBox');
    const fullscreenOverlay = document.getElementById('fullscreenOverlay');
    const fullscreenTranscription = document.getElementById('fullscreenTranscription');
    const exitZone = document.getElementById('exitZone');

    // Click handlers for entering fullscreen
    arabicBox.addEventListener('click', (e) => {
        if (!isRecording && arabicTranscription.textContent.trim() !== 'Waiting for speech...') {
            e.preventDefault();
            // Long press or double tap for individual fullscreen on mobile/touch devices
            if (e.type === 'dblclick' || (e.touches && e.touches.length === 1)) {
                enterIndividualFullscreen('arabic');
            } else {
                enterFullscreen('arabic');
            }
        }
    });

    englishBox.addEventListener('click', (e) => {
        if (!isRecording && englishTranscription.textContent.trim() !== 'Waiting for translation...') {
            e.preventDefault();
            // Long press or double tap for individual fullscreen on mobile/touch devices
            if (e.type === 'dblclick' || (e.touches && e.touches.length === 1)) {
                enterIndividualFullscreen('english');
            } else {
                enterFullscreen('english');
            }
        }
    });

    // Add touch/double-click event listeners for individual fullscreen
    arabicBox.addEventListener('dblclick', (e) => {
        e.preventDefault();
        enterIndividualFullscreen('arabic');
    });

    englishBox.addEventListener('dblclick', (e) => {
        e.preventDefault();
        enterIndividualFullscreen('english');
    });

    // Touch events for mobile (long press alternative)
    let touchStartTime = 0;
    arabicBox.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
    });

    arabicBox.addEventListener('touchend', (e) => {
        if (Date.now() - touchStartTime > 500 && !isRecording) { // Long press > 500ms
            e.preventDefault();
            enterIndividualFullscreen('arabic');
        }
    });

    englishBox.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
    });

    englishBox.addEventListener('touchend', (e) => {
        if (Date.now() - touchStartTime > 500 && !isRecording) { // Long press > 500ms
            e.preventDefault();
            enterIndividualFullscreen('english');
        }
    });

    // Exit fullscreen on overlay click
    fullscreenOverlay.addEventListener('click', (e) => {
        // Don't exit if clicking in content area
        if (e.target.closest('.fullscreen-content')) {
            return;
        }
        exitFullscreen();
    });

    // Exit fullscreen on exit zone click
    exitZone.addEventListener('click', (e) => {
        e.stopPropagation();
        exitFullscreen();
    });

    // Individual fullscreen exit zones
    const arabicExitZone = document.getElementById('arabicExitZone');
    const englishExitZone = document.getElementById('englishExitZone');

    arabicExitZone.addEventListener('click', (e) => {
        e.stopPropagation();
        exitIndividualFullscreen();
    });

    englishExitZone.addEventListener('click', (e) => {
        e.stopPropagation();
        exitIndividualFullscreen();
    });

    // Handle fullscreen change events
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && isFullscreen) {
            exitFullscreen();
        }
    });

    // Handle visibility change (release wake lock if page becomes hidden)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && wakeLock) {
            releaseWakeLock();
        }
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (wakeLock) {
            releaseWakeLock();
        }
    });

    // Handle back button on mobile
    window.addEventListener('popstate', () => {
        if (isFullscreen) {
            exitFullscreen();
        }
    });

    // Update fullscreen content when transcription updates
    const originalUpdateTranscription = window.updateTranscription;
    window.updateTranscription = function(data) {
        originalUpdateTranscription(data);

        // Update prayer mode fullscreen content if active
        if (isFullscreen) {
            const fullscreenTranscription = document.getElementById('fullscreenTranscription');
            const content = fullscreenLanguage === 'arabic' ? arabicTranscription.textContent : englishTranscription.textContent;
            fullscreenTranscription.textContent = content;
        }

        // Update individual fullscreen content if active
        if (isIndividualFullscreen) {
            const textElementId = individualFullscreenType === 'arabic' ? 'arabicFullscreenText' : 'englishFullscreenText';
            const sourceElement = individualFullscreenType === 'arabic' ? arabicTranscription : englishTranscription;
            const textElement = document.getElementById(textElementId);
            if (textElement) {
                textElement.textContent = sourceElement.textContent;
            }
        }
    };
});

// Error handling for unhandled promises
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showStatus('An unexpected error occurred. Please refresh the page and try again.', 'error');
});
