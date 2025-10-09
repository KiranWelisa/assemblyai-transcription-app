// pages/api/auth/google-one-tap.js
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'No credential provided' });
  }

  try {
    // Verify the Google One Tap credential
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    
    // Return user info to be used by NextAuth
    res.status(200).json({
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      sub: payload.sub,
    });
  } catch (error) {
    console.error('One Tap verification error:', error);
    res.status(401).json({ error: 'Invalid credential' });
  }
}
