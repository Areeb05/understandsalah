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

// Transcription state
let currentArabicText = '';
let currentEnglishText = '';

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
 * Update transcription display
 */
function updateTranscription(data) {
    // Update Arabic transcription
    if (data.arabic && data.arabic !== currentArabicText) {
        currentArabicText = data.arabic;
        arabicTranscription.textContent = data.arabic;
        arabicTranscription.classList.add('updating');

        setTimeout(() => {
            arabicTranscription.classList.remove('updating');
        }, 300);
    }

    // Update English translation
    if (data.english && data.english !== currentEnglishText) {
        currentEnglishText = data.english;
        englishTranscription.textContent = data.english;
        englishTranscription.classList.add('updating');

        setTimeout(() => {
            englishTranscription.classList.remove('updating');
        }, 300);
    }
}

/**
 * Clear transcription display
 */
function clearTranscriptions() {
    currentArabicText = '';
    currentEnglishText = '';
    arabicTranscription.textContent = 'Waiting for speech...';
    englishTranscription.textContent = 'Waiting for translation...';
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

// Error handling for unhandled promises
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showStatus('An unexpected error occurred. Please refresh the page and try again.', 'error');
});
