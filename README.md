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

## Quick Deploy to Vercel

### 1. Deploy with One Click

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/KiranWelisa/assemblyai-transcription-app&env=ASSEMBLYAI_API_KEY&envDescription=Your%20AssemblyAI%20API%20key&envLink=https://www.assemblyai.com/dashboard/signup)

### 2. Manual Deploy

1. Fork or clone this repository
2. Sign up for [AssemblyAI](https://assemblyai.com) and get your API key
3. Install Vercel CLI: `npm i -g vercel`
4. Run `vercel` in the project directory
5. Add your environment variable when prompted:
   - `ASSEMBLYAI_API_KEY`: Your AssemblyAI API key

## Local Development

```bash
# Clone the repository
git clone https://github.com/KiranWelisa/assemblyai-transcription-app.git
cd assemblyai-transcription-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env and add your AssemblyAI API key

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Environment Variables

- `ASSEMBLYAI_API_KEY`: Your AssemblyAI API key (required)
- `NEXT_PUBLIC_API_BASE_URL`: Override the API base URL (optional)

## How It Works

1. **Frontend**: React-based UI for file upload and transcription display
2. **API Proxy**: Next.js API routes securely handle AssemblyAI requests
3. **Security**: API key is kept server-side, never exposed to the client

## API Routes

- `POST /api/proxy/upload` - Upload audio/video files
- `POST /api/proxy/transcript` - Create transcription
- `GET /api/proxy/transcript/:id` - Get transcript status/results
- `GET /api/proxy/transcript` - List all transcripts

## Supported File Formats

- **Audio**: MP3, WAV, AAC, FLAC, OGG, M4A, OPUS, AMR, WMA
- **Video**: MP4, MOV, WebM, MTS, MXF
- **Max file size**: 2.2GB

## Tech Stack

- Next.js 14
- React 18
- Tailwind CSS
- Lucide Icons
- AssemblyAI API

## License

MIT License - feel free to use this for your own projects!

## Support

- [AssemblyAI Documentation](https://www.assemblyai.com/docs)
- [Create an issue](https://github.com/KiranWelisa/assemblyai-transcription-app/issues)