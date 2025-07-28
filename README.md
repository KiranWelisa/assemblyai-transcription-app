# AssemblyAI Transcription App

A modern audio/video transcription application with Dutch language default and speaker diarization, built with Next.js and ready for instant deployment on Vercel.

## Features

- 🇳🇱 Dutch language transcription by default (with English option)
- 🎤 Speaker diarization always enabled
- 📁 Drag-and-drop file upload
- 🔄 Real-time transcription status
- 📜 View all past transcriptions
- 🎨 Modern, responsive UI
- 🔒 Secure API proxy implementation

## 🚀 Deploy to Vercel in 2 Minutes

### Option 1: One-Click Deploy (Easiest!)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/KiranWelisa/assemblyai-transcription-app&env=ASSEMBLYAI_API_KEY&envDescription=Your%20AssemblyAI%20API%20key&envLink=https://www.assemblyai.com/dashboard/signup)

Just click the button above and:
1. It will clone this repo to your GitHub
2. Deploy it to Vercel
3. Ask for your AssemblyAI API key
4. Done! Your app is live! 🎉

### Option 2: Deploy from GitHub

1. **Fork this repository** to your GitHub account
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project" and import your forked repo
4. Add environment variable:
   - Name: `ASSEMBLYAI_API_KEY`
   - Value: Your AssemblyAI API key (get one at [assemblyai.com](https://assemblyai.com))
5. Click "Deploy"

That's it! Your app will be live at `https://your-project.vercel.app`

## 🔑 Get Your AssemblyAI API Key

1. Sign up at [assemblyai.com](https://assemblyai.com)
2. Go to your dashboard
3. Copy your API key
4. Add it to Vercel as shown above

## 💻 Local Development

```bash
# Clone the repository
git clone https://github.com/KiranWelisa/assemblyai-transcription-app.git
cd assemblyai-transcription-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local and add your AssemblyAI API key

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## 📁 Project Structure

```
assemblyai-transcription-app/
├── pages/
│   ├── index.js             # Main page
│   └── api/
│       └── proxy/
│           └── [...path].js # API proxy for AssemblyAI
├── components/
│   └── AssemblyAITranscription.js # Main React component
├── styles/
│   └── globals.css          # Global styles with Tailwind
├── .env.example             # Example environment variables
└── package.json             # Dependencies
```

## 🛠 How It Works

1. **Frontend**: React-based UI for file upload and transcription display
2. **API Proxy**: Next.js API routes securely handle AssemblyAI requests
3. **Security**: API key is kept server-side, never exposed to the client
4. **Auto-configuration**: Automatically detects Vercel URL for API calls

## 📚 API Routes

- `POST /api/proxy/upload` - Upload audio/video files
- `POST /api/proxy/transcript` - Create transcription
- `GET /api/proxy/transcript/:id` - Get transcript status/results
- `GET /api/proxy/transcript` - List all transcripts

## 🎵 Supported File Formats

- **Audio**: MP3, WAV, AAC, FLAC, OGG, M4A, OPUS, AMR, WMA
- **Video**: MP4, MOV, WebM, MTS, MXF
- **Max file size**: 2.2GB

## 🔧 Configuration

The app automatically configures itself for Vercel deployment. No manual URL configuration needed!

For advanced users, you can override settings:
- `ASSEMBLYAI_API_KEY`: Your AssemblyAI API key (required)
- `NEXT_PUBLIC_API_BASE_URL`: Override the API base URL (optional)

## 📝 License

MIT License - feel free to use this for your own projects!

## 🤝 Support

- [AssemblyAI Documentation](https://www.assemblyai.com/docs)
- [Create an issue](https://github.com/KiranWelisa/assemblyai-transcription-app/issues)

---

Made with ❤️ for easy audio transcription