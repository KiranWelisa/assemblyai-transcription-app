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
    const permissionId = permissionResult.id;

    // **DE CORRECTIE:** Genereer een directe downloadlink die de virus-scan waarschuwing overslaat.
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    // Log de gegenereerde URL op de server om te debuggen
    console.log(`Generated direct download URL for file ${fileId}: ${downloadUrl}`);

    // 5. Stuur de publieke URL en de permissie-ID terug naar de frontend
    res.status(200).json({
      publicUrl: downloadUrl,
      permissionId: permissionId,
    });

  } catch (error) {
    console.error('Server-side error in make-public:', error);
    res.status(500).json({ error: error.message || 'An internal server error occurred.' });
  }
}
