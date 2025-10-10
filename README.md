Of course. Here is a cleaned-up and simplified `README.md` file that focuses on the essential information and provides a clear, working one-click Vercel deployment setup.

-----

# AssemblyAI Transcription App

A modern audio/video transcription application built with Next.js, featuring AI-powered title generation, persistent storage, and seamless deployment on Vercel.

## Core Features

  - 🇳🇱 **Dutch & English Transcription**: Transcribe audio and video files with speaker diarization.
  - 🤖 **AI-Generated Titles**: Automatically generate smart, descriptive titles for your transcriptions using Gemini.
  - 💾 **Persistent Storage**: Save all your transcriptions in a Postgres database using Prisma.
  - 🔄 **Real-Time Status**: Track the status of your transcriptions in real-time.
  - ⚡ **Google One Tap Login**: Fast and secure authentication.
  - 📁 **Google Drive Integration**: Easily transcribe files directly from your Google Drive.

-----

## 🚀 Deploy to Vercel

Get your own version of this application running in minutes with Vercel.

### Step 1: Click to Deploy

[](https://vercel.com/new/clone?repository-url=https://github.com/KiranWelisa/assemblyai-transcription-app)

Clicking the button above will fork the repository to your GitHub account and start the deployment process on Vercel.

### Step 2: Set Up the Database

After the deployment starts, you'll be prompted to create a database.

1.  In the Vercel dashboard, go to the **Storage** tab for your new project.
2.  Click **Create Database** and select **Postgres**.
3.  Follow the instructions to create and connect the database. Vercel will automatically add the required `POSTGRES_URL` and `DATABASE_URL` environment variables to your project.

### Step 3: Add Environment Variables

You need to provide API keys for Google and Gemini. In your Vercel project's settings, add the following environment variables:

```env
# Google OAuth (for login & Drive)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
NEXT_PUBLIC_GOOGLE_API_KEY=your_google_api_key_here
NEXT_PUBLIC_GOOGLE_APP_ID=your_google_project_id_here

# NextAuth (for authentication)
NEXTAUTH_SECRET=generate_a_secret_key_here

# Gemini AI (for title generation)
GEMINI_API_KEY=your_gemini_api_key_here
```

**Where to get the keys:**

  - **Google Keys**: Create a project in the [Google Cloud Console](https://console.cloud.google.com/). Enable the "Google Drive API" and create OAuth 2.0 credentials and an API Key.
  - **Gemini Key**: Get your key from [Google AI Studio](https://aistudio.google.com/).
  - **NEXTAUTH\_SECRET**: You can generate a secure secret by running `openssl rand -base64 32` in your terminal.

Once the variables are added, **re-deploy** your application for the changes to take effect.

-----

## 💻 Local Development

To run the application on your local machine, follow these steps.

### 1\. Clone the Repository

```bash
git clone https://github.com/KiranWelisa/assemblyai-transcription-app.git
cd assemblyai-transcription-app
```

### 2\. Install Dependencies

```bash
npm install
```

### 3\. Set Up Environment Variables

Copy the example environment file and fill in your own API keys and database URL.

```bash
cp .env.example .env.local
```

### 4\. Set Up the Database

Run the following commands to generate the Prisma client and push the database schema.

```bash
npx prisma generate
npx prisma db push
```

### 5\. Run the Development Server

```bash
npm run dev
```

Your application will be available at [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000).
