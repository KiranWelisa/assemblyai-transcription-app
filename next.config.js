/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NODE_ENV === 'production' 
      ? 'https://your-app-name.vercel.app/api/proxy'
      : 'http://localhost:3000/api/proxy'
  }
}

module.exports = nextConfig