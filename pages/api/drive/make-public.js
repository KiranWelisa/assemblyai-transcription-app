import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  // 1. Accepteer alleen POST-verzoeken
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Haal de beveiligde token op met de sessie-informatie
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // 3. Valideer de gebruiker en het toegangstoken
  if (!token || !token.accessToken) {
    return res.status(401).json({ error: 'Unauthorized: No valid session found.' });
  }

  const { fileId } = req.body;
  if (!fileId) {
    return res.status(400).json({ error: 'Bad Request: fileId is required.' });
  }

  const accessToken = token.accessToken;
  const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  try {
    // 4. Maak een permissie aan die het bestand leesbaar maakt voor iedereen met de link
    const permissionResponse = await fetch(`${driveApiUrl}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });

    if (!permissionResponse.ok) {
      const errorData = await permissionResponse.json();
      console.error('Google Drive API Permission Error:', errorData);
      throw new Error('Failed to set file permissions.');
    }

    const permissionResult = await permissionResponse.json();
    const permissionId = permissionResult.id; // Belangrijk om deze op te slaan!

    // 5. Haal de metadata van het bestand op, inclusief de downloadlink
    const fileMetadataResponse = await fetch(`${driveApiUrl}?fields=webContentLink,webViewLink`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!fileMetadataResponse.ok) {
      const errorData = await fileMetadataResponse.json();
      console.error('Google Drive API Metadata Error:', errorData);
      throw new Error('Failed to get file metadata.');
    }

    const fileMetadata = await fileMetadataResponse.json();
    
    // De webContentLink is de directe downloadlink die AssemblyAI nodig heeft
    const downloadUrl = fileMetadata.webContentLink;

    // 6. Stuur de publieke URL en de permissie-ID terug naar de frontend
    res.status(200).json({
      publicUrl: downloadUrl,
      permissionId: permissionId, // We hebben deze ID later nodig om de toegang weer in te trekken
    });

  } catch (error) {
    console.error('Server-side error:', error);
    res.status(500).json({ error: error.message || 'An internal server error occurred.' });
  }
}