require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const speech = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = createServer(app);

// Configure CORS for cross-origin requests (Netlify frontend → Railway backend)
const corsOptions = {
    origin: true, // Allow all origins for now, restrict in production
    methods: ["GET", "POST"],
    credentials: true
};
app.use(cors(corsOptions));

const io = new Server(server, {
    cors: corsOptions
});

// Google Cloud credentials setup
let credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credPath && process.env.GOOGLE_CREDENTIALS_JSON) {
    // If credentials are in environment variable, write to temporary file
    const credsDir = path.join(__dirname, 'temp-creds');
    if (!fs.existsSync(credsDir)) {
        fs.mkdirSync(credsDir);
    }
    credPath = path.join(credsDir, 'google-creds.json');
    fs.writeFileSync(credPath, process.env.GOOGLE_CREDENTIALS_JSON, 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}

// Initialize Google Cloud clients
let speechClient = null;
let translate = null;

try {
    speechClient = new speech.SpeechClient();
    translate = new Translate();
    console.log('✓ Google Cloud APIs initialized successfully');
} catch (error) {
    console.error('✗ Failed to initialize Google Cloud APIs:', error.message);
    console.log('Note: The app will still run but speech-to-text features will not work');
}

// Serve static files
app.use(express.static('public'));

// Store audio data temporarily for processing
let audioBuffers = [];

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('start-recording', () => {
        console.log('Recording started for client:', socket.id);
        audioBuffers = []; // Clear previous buffers
        socket.emit('recording-started');
    });

    socket.on('audio-chunk', async (audioData) => {
        // Store audio chunk
        audioBuffers.push(Buffer.from(audioData));

        // Process audio when we have enough data (every few chunks)
        if (audioBuffers.length >= 2) { // Process every 2 chunks for real-time feel
            await processAudioChunk(audioBuffers, socket);
            audioBuffers = []; // Clear processed buffers
        }
    });

    socket.on('stop-recording', () => {
        console.log('Recording stopped for client:', socket.id);
        socket.emit('recording-stopped');
        audioBuffers = []; // Clear buffers
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        audioBuffers = [];
    });
});

// Process audio chunk for speech recognition and translation
async function processAudioChunk(buffers, socket) {
    try {
        const audioBuffer = Buffer.concat(buffers);

        // Configure speech recognition for Arabic
        const request = {
            audio: {
                content: audioBuffer.toString('base64'),
            },
            config: {
                encoding: 'WEBM_OPUS',
                // Remove sampleRateHertz to let Google auto-detect from the WEBM OPUS header
                languageCode: 'ar-SA', // Arabic (Saudi Arabia) - good for Islamic recitation
                model: 'default',
                useEnhanced: true,
            },
        };

        // Perform speech recognition
        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        if (transcription) {
            console.log('Arabic transcription:', transcription);

            // Translate to English if we have transcription
            const [englishTranslation] = await translate.translate(transcription, {
                from: 'ar',
                to: 'en'
            });

            console.log('English translation:', englishTranslation);

            // Send results to client
            socket.emit('transcription-update', {
                arabic: transcription,
                english: englishTranslation
            });
        }
    } catch (error) {
        console.error('Error processing audio chunk:', error);
        socket.emit('error', 'Error processing speech: ' + error.message);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to use the app`);
    console.log('Make sure to set GOOGLE_APPLICATION_CREDENTIALS environment variable');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});
