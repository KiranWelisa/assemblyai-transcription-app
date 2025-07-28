/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // The API proxy URL will automatically use the correct domain
    NEXT_PUBLIC_API_BASE_URL: process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/proxy`
      : 'http://localhost:3000/api/proxy'
  }
}

module.exports = nextConfig