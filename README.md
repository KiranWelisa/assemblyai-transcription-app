# AssemblyAI Transcription App

A modern audio/video transcription application with Dutch language default, speaker diarization, AI-generated titles, and persistent storage. Built with Next.js and ready for instant deployment on Vercel.

## Features

- 🇳🇱 Dutch language transcription by default (with English option)
- 🎤 Speaker diarization always enabled
- 📁 Drag-and-drop file upload from URL or Google Drive
- 🤖 **AI-generated titles** using Gemini (analyzes transcript content intelligently)
- 💾 **Persistent storage** with Prisma Postgres (keeps all your transcriptions)
- 🔄 Real-time transcription status
- 📜 View all past transcriptions with smart titles
- 🎨 Modern, responsive UI with onboarding
- 🔒 Secure API proxy implementation
- ⚡ **Google One Tap login** for super fast authentication
- 🔄 **Automatic token refresh**, stay logged in for 30 days

## 🆕 Latest Updates

### 🤖 AI-Powered Title Generation
Every transcription now gets an intelligent, descriptive title! Using Gemini AI, the app analyzes the beginning, middle, and end of your transcript (200 words each) to generate a meaningful title like "Q4 Planning Vergadering" or "Interview: Marketing Strategie".

### 💾 Database Storage
All transcriptions are now saved in Postgres with metadata (title, language, duration, word count). Your transcription history is preserved even if you switch devices!

### 🎯 Easy Onboarding
New users see a big, friendly button that takes them directly to AssemblyAI signup to get their free API key.

## 🚀 Deploy to Vercel

### Quick Setup Checklist

Before deploying, you need:
- ✅ Google OAuth credentials ([get them here](https://console.cloud.google.com))
- ✅ Gemini API key ([get it here](https://aistudio.google.com))
- ✅ Vercel Prisma Postgres database (created in Vercel dashboard)

### Step 1: Fork & Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/KiranWelisa/assemblyai-transcription-app)

1. Click the button above
2. Fork to your GitHub
3. Vercel will start the deployment

### Step 2: Create Prisma Postgres Database

1. In Vercel dashboard, go to your project
2. Click **Storage** tab
3. Click **Create Database**
4. Select **Postgres Prisma**
5. Choose a name (e.g., `transcriptions-db`)
6. Select region (Amsterdam recommended)
7. Click **Create**

Vercel automatically adds these environment variables:
- `POSTGRES_URL`
- `DATABASE_URL`

### Step 3: Add Environment Variables

In Vercel project settings → Environment Variables, add:

```
# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# NextAuth
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32

# Google Drive
NEXT_PUBLIC_GOOGLE_API_KEY=your_google_api_key
NEXT_PUBLIC_GOOGLE_APP_ID=your_google_project_id

# Gemini AI (NEW!)
GEMINI_API_KEY=your_gemini_api_key
```

### Step 4: Get Your API Keys

**Google OAuth & Drive:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable APIs (Drive API, Google+ API)
3. Create OAuth 2.0 credentials
4. Add authorized origins: `https://your-app.vercel.app`
5. Add redirect URIs: `https://your-app.vercel.app/api/auth/callback/google`
6. Create API Key for Drive

**Gemini AI:**
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key"
3. Copy your key

### Step 5: Deploy!

Vercel will automatically:
- Install dependencies (including Prisma)
- Run `prisma generate`
- Push your database schema
- Deploy your app! 🎉

## 💻 Local Development

```bash
# Clone and install
git clone https://github.com/KiranWelisa/assemblyai-transcription-app.git
cd assemblyai-transcription-app
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your keys

# Setup Prisma database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
# Google OAuth (required)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# NextAuth (required)
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000

# Google Drive (required)
NEXT_PUBLIC_GOOGLE_API_KEY=your_api_key
NEXT_PUBLIC_GOOGLE_APP_ID=your_project_id

# Gemini AI (required for title generation)
GEMINI_API_KEY=your_gemini_key

# Prisma Postgres (required)
POSTGRES_URL=your_postgres_url
DATABASE_URL=your_database_url
```

## 📁 Project Structure

```
assemblyai-transcription-app/
├── prisma/
│   └── schema.prisma        # Database schema
├── lib/
│   ├── prisma.js           # Prisma client
│   └── gemini.js           # AI title generation
├── pages/
│   ├── _document.js        # Google Identity Services
│   ├── index.js            # Main page
│   └── api/
│       ├── auth/           # NextAuth & Google One Tap
│       ├── drive/          # Drive file permissions
│       └── transcriptions/ # Database API endpoints
├── components/
│   └── AssemblyAITranscription.js # Main React component
└── package.json
```

## 🛠 How It Works

### Transcription Flow

```
1. User uploads file or URL
   ↓
2. AssemblyAI transcribes (with speaker diarization)
   ↓
3. Transcript displayed immediately ✅
   ↓
4. Metadata saved to database
   ↓
5. [Background] Gemini analyzes transcript
   - Extracts: 200 start + 200 middle + 200 end words
   - Generates: "Q4 Planning Meeting" (max 60 chars)
   ↓
6. Title updated in database
   ↓
7. UI polls and shows new title (2-5 seconds) ✨
```

### Why This Approach?

- **Fast UX**: Transcript shows immediately, title appears moments later
- **Smart Sampling**: 200+200+200 words captures context without sending entire transcript
- **Cost Efficient**: Only ~600 words to Gemini instead of thousands
- **Fallback**: If Gemini fails, generates title from filename/metadata

## 🔐 Security Features

- **Server-side tokens**: All API keys stay on server
- **Auto token refresh**: No expired session interruptions
- **Temporary Drive access**: Files only public during upload
- **User isolation**: Each user sees only their transcriptions
- **Secure database**: Row-level security with email verification

## 🎵 Supported Formats

**Audio**: MP3, WAV, AAC, FLAC, OGG, M4A, OPUS, AMR, WMA  
**Video**: MP4, MOV, WebM, MTS, MXF  
**Max size**: 2.2GB

## 🔧 Database Schema

```prisma
model Transcription {
  id              String   @id @default(cuid())
  assemblyAiId    String   @unique       // Links to AssemblyAI
  userEmail       String                 // Owner
  title           String?                // AI-generated title
  titleGenerating Boolean  @default(true)
  fileName        String?
  language        String?
  duration        Float?
  wordCount       Int?
  createdAt       DateTime @default(now())
}
```

**What we DON'T store:**
- ❌ Full transcript text (always fetched from AssemblyAI)
- ❌ Audio files (stored in Drive or AssemblyAI)
- ❌ Utterances or timestamps

This keeps the database lightweight and respects data ownership!

## 🚀 Performance

- **First transcription view**: < 500ms (metadata from DB)
- **Title generation**: 2-5 seconds (background, non-blocking)
- **Past transcriptions load**: < 200ms (Postgres query)
- **Full transcript load**: ~1 second (AssemblyAI API call)

## 📝 License

MIT License

## 🤝 Support

- [AssemblyAI Docs](https://www.assemblyai.com/docs)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [Create an Issue](https://github.com/KiranWelisa/assemblyai-transcription-app/issues)

---

Made with ❤️ • Powered by AssemblyAI, Gemini AI & Vercel Postgres