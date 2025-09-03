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

  const { fileId, permissionId } = req.body;
  if (!fileId || !permissionId) {
    return res.status(400).json({ error: 'Bad Request: fileId and permissionId are required.' });
  }

  const accessToken = token.accessToken;
  const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`;

  try {
    // 4. Stuur een DELETE-verzoek naar de Google Drive API om de specifieke permissie te verwijderen
    const response = await fetch(driveApiUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    // Een succesvolle DELETE-operatie retourneert een 204 No Content status
    if (response.status !== 204) {
      const errorData = await response.json();
      console.error('Google Drive API Revoke Permission Error:', errorData);
      throw new Error('Failed to revoke file permission.');
    }

    // 5. Stuur een succesbericht terug naar de frontend
    res.status(200).json({ message: 'File access revoked successfully.' });

  } catch (error) {
    console.error('Server-side error in make-private:', error);
    res.status(500).json({ error: error.message || 'An internal server error occurred.' });
  }
}