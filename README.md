# AssemblyAI Transcription App

A modern audio/video transcription application with Dutch language default and speaker diarization, built with Next.js and ready for instant deployment on Vercel.

## Features

- 🇳🇱 Dutch language transcription by default (with English option)
- 🎤 Speaker diarization always enabled
- 📁 Drag-and-drop file upload from URL or Google Drive
- 🔄 Real-time transcription status
- 📜 View all past transcriptions
- 🎨 Modern, responsive UI
- 🔒 Secure API proxy implementation
- ⚡ **Google One Tap login** for super fast authentication
- 🔄 **Automatic token refresh** - stay logged in for 30 days

## 🆕 New: Enhanced Authentication

### Google One Tap Login
No more full-page redirects! When you're already logged into Google, you'll see a quick One Tap prompt that lets you sign in with just one click. It's fast, convenient, and keeps you on the page.

### Automatic Token Refresh
Your session now stays active for up to 30 days! The app automatically refreshes your Google access token in the background, so you don't have to log in repeatedly.

## 🚀 Deploy to Vercel in 2 Minutes

### Option 1: One-Click Deploy (Easiest!)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/KiranWelisa/assemblyai-transcription-app&env=NEXT_PUBLIC_GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,NEXTAUTH_SECRET,NEXT_PUBLIC_GOOGLE_API_KEY,NEXT_PUBLIC_GOOGLE_APP_ID&envDescription=Required%20environment%20variables%20for%20Google%20authentication%20and%20Drive%20integration)

Just click the button above and add these environment variables:

**Required Google OAuth credentials:**
1. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Your Google OAuth Client ID
2. `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret
3. `NEXTAUTH_SECRET` - Random secret for NextAuth (generate with: `openssl rand -base64 32`)
4. `NEXT_PUBLIC_GOOGLE_API_KEY` - Google API Key for Drive integration
5. `NEXT_PUBLIC_GOOGLE_APP_ID` - Google Cloud Project ID

**How to get Google credentials:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Drive API and Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Add authorized JavaScript origins: `https://your-domain.vercel.app`
6. Add authorized redirect URIs: `https://your-domain.vercel.app/api/auth/callback/google`
7. Copy Client ID and Client Secret
8. Create an API Key in "Credentials" → "Create Credentials" → "API Key"

### Option 2: Deploy from GitHub

1. **Fork this repository** to your GitHub account
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project" and import your forked repo
4. Add all environment variables listed above
5. Click "Deploy"

That's it! Your app will be live at `https://your-project.vercel.app`

## 💻 Local Development

```bash
# Clone the repository
git clone https://github.com/KiranWelisa/assemblyai-transcription-app.git
cd assemblyai-transcription-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local and add your environment variables

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Variables for Local Development

Create a `.env.local` file with:

```env
# Google OAuth (required)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXTAUTH_SECRET=your_nextauth_secret

# Google Drive integration (required)
NEXT_PUBLIC_GOOGLE_API_KEY=your_api_key
NEXT_PUBLIC_GOOGLE_APP_ID=your_project_id

# NextAuth URL (for local dev)
NEXTAUTH_URL=http://localhost:3000
```

## 📁 Project Structure

```
assemblyai-transcription-app/
├── pages/
│   ├── _document.js         # Custom document for Google Identity Services
│   ├── index.js             # Main page
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth].js      # NextAuth config with token refresh
│       │   └── google-one-tap.js     # One Tap verification endpoint
│       └── drive/
│           ├── make-public.js        # Temporarily make Drive file public
│           └── make-private.js       # Revoke public access
├── components/
│   └── AssemblyAITranscription.js # Main React component
├── styles/
│   └── globals.css          # Global styles with Tailwind
└── package.json             # Dependencies
```

## 🛠 How It Works

1. **Google One Tap Authentication**: Uses Google Identity Services for quick login
2. **Automatic Token Refresh**: NextAuth automatically refreshes access tokens before they expire
3. **Session Management**: Monitors session health and refreshes every 5 minutes
4. **Google Drive Integration**: Temporarily makes Drive files public for transcription, then revokes access
5. **AssemblyAI Processing**: Sends audio/video to AssemblyAI for transcription with speaker diarization

## 🔐 Security Features

- **Server-side token management**: All sensitive tokens handled server-side
- **Automatic token refresh**: Prevents expired session issues
- **Temporary file access**: Drive files are made public only during transcription
- **Immediate access revocation**: Public access is revoked right after transcription starts
- **Client-side API key storage**: AssemblyAI keys stored in browser localStorage (your choice)

## 🎵 Supported File Formats

- **Audio**: MP3, WAV, AAC, FLAC, OGG, M4A, OPUS, AMR, WMA
- **Video**: MP4, MOV, WebM, MTS, MXF
- **Max file size**: 2.2GB

## 📝 License

MIT License, feel free to use this for your own projects!

## 🤝 Support

- [AssemblyAI Documentation](https://www.assemblyai.com/docs)
- [Create an issue](https://github.com/KiranWelisa/assemblyai-transcription-app/issues)

---

Made with ❤️ for easy audio transcription