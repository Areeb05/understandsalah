# Understand Salah: Real-Time Transcription Webapp

A Node.js web application that transcribes spoken Arabic prayers (Salah) in real-time and translates them to English. Features a mobile-optimized interface with live speech-to-text processing using Google Cloud APIs.

## Features

- 🎤 **Real-time Arabic Speech Recognition** - Uses Google Cloud Speech-to-Text API
- 🌍 **Automatic Translation** - Arabic-to-English translation via Google Translate API
- 📱 **Mobile-First Design** - Responsive dark purple theme with gold accents
- ⚡ **Live WebSocket Updates** - Real-time transcription and translation display
- 🔒 **Secure** - Proper credential handling and error management

## Live Demo

🚀 [View on Netlify](https://your-netlify-deployment.netlify.app) *(deploy after setup)*

## Screenshots

*Add screenshots of your app here*

## Tech Stack

- **Backend**: Node.js, Express.js
- **Real-time**: Socket.IO
- **Speech-to-Text**: Google Cloud Speech-to-Text API
- **Translation**: Google Translate API
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Audio**: MediaRecorder API, Web Audio API
- **Deployment**: Ready for Netlify, Vercel, or any Node.js hosting

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Google Cloud Platform account with billing enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Areeb05/understandsalah.git
   cd understandsalah
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Google Cloud credentials**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Speech-to-Text API and Translate API
   - Create a Service Account with these roles:
     - `roles/speech.client`
     - `roles/translate.user`
   - Generate a JSON key for the service account
   - Set the environment variable:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
     ```
     Or paste the JSON content into a `.env` file as:
     ```env
     GOOGLE_CREDENTIALS_JSON={your-json-here}
     ```

4. **Start the application**
   ```bash
   npm start
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## Usage

1. Click "🎤 Start Recording" to begin audio capture
2. Speak Arabic prayers/text into your microphone
3. Watch real-time transcription appear in the top box
4. See English translation appear in the bottom box
5. Click "⏹️ Stop Recording" when finished

## Deployment

### Netlify (Recommended for Quick Deployment)

1. **Fork and push to your GitHub**
   ```bash
   git clone https://github.com/yourusername/understandsalah.git
   cd understandsalah
   ```

2. **Connect to Netlify**
   - Go to [Netlify.com](https://netlify.com) and sign up
   - Click "New site from Git"
   - Connect your forked repository
   - Set Build Command: `npm run build` (if using build process)
   - Set Publish Directory: `public/`
   - Add Environment Variables in Netlify Dashboard:
     - `GOOGLE_CREDENTIALS_JSON`: Your service account JSON content
     - `NODE_ENV`: `production`

3. **Deploy**
   - Netlify will automatically deploy your app
   - Set up your domain or use the provided netlify.app URL

### Other Platforms

The app is also ready for deployment on:
- **Vercel**: `vercel --prod`
- **Railway**: Push to GitHub, connect repository
- **Heroku**: Add buildpack, set config vars
- **DigitalOcean App Platform**: Import repository

## API Reference

### Audio Processing
- **Input**: Audio chunks via WebSocket (MediaRecorder API)
- **Format**: WebM/Opus encoded audio
- **Sample Rate**: 16kHz, mono channel
- **Language**: Arabic (ar-SA) - optimized for Islamic recitation

### WebSocket Events
- `start-recording` - Begin recording session
- `audio-chunk` - Send audio data for processing
- `stop-recording` - End recording session
- `transcription-update` - Receive transcription and translation
- `error` - Error handling

## Configuration

### Environment Variables
```env
GOOGLE_CREDENTIALS_JSON=your_service_account_json_content
PORT=3000  # Optional, defaults to 3000
```

### Supported Languages
- **Primary**: Arabic (Saudi Arabia dialect) `ar-SA`
- **Translation**: Arabic → English

## Security

⚠️ **Important Security Notes:**

- Never commit `.env` files containing real credentials
- Use separate service accounts for different environments
- Enable Google Cloud billing alerts
- Rotate service account keys regularly
- Use environment-specific APIs when needed

## Development

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start with auto-restart
npm start
```

### Testing
- Test audio recording in Chrome/Safari
- Verify microphone permissions
- Check WebSocket connectivity
- Test with various Arabic text/accents

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Submit a pull request

## License

ISC License - see LICENSE file for details.

## Support

If you encounter issues:
1. Check your Google Cloud credentials are properly set
2. Ensure microphone permissions are granted in browser
3. Verify APIs are enabled in Google Cloud Console
4. Check browser console for JavaScript errors

## Roadmap

- [ ] Support for additional Arabic dialects
- [ ] Offline speech recognition fallback
- [ ] Text-to-speech for pronunciation help
- [ ] Recording playback functionality
- [ ] Mobile app versions (React Native)
- [ ] Multi-language support
- [ ] Batch processing for longer audio files
