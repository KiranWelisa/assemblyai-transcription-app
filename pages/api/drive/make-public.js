import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

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
    // Stap 1: Haal bestandsinformatie op om de grootte te controleren
    const fileInfoResponse = await fetch(`${driveApiUrl}?fields=size,name,webContentLink`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!fileInfoResponse.ok) {
      throw new Error('Failed to get file information.');
    }

    const fileInfo = await fileInfoResponse.json();
    const fileSizeInMB = parseInt(fileInfo.size) / (1024 * 1024);
    
    console.log(`File: ${fileInfo.name}, Size: ${fileSizeInMB.toFixed(2)} MB`);

    // Stap 2: Maak het bestand publiek toegankelijk
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

    // Stap 3: Voor grote bestanden, gebruik webContentLink (vereist authenticatie)
    // Voor kleine bestanden, gebruik directe download URL
    let downloadUrl;
    
    if (fileSizeInMB > 100) {
      // OPLOSSING 1: Gebruik een alternatieve API URL voor grote bestanden
      // Deze werkt beter voor audio/video bestanden
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`;
      
      // OPLOSSING 2 (alternatief): Als bovenstaande niet werkt, probeer deze:
      // downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      
      console.log(`Large file detected (${fileSizeInMB.toFixed(2)} MB), using alternative download URL`);
    } else {
      // Voor kleine bestanden, gebruik de standaard methode
      downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
    
    console.log(`Generated download URL for file ${fileId}: ${downloadUrl}`);

    res.status(200).json({
      publicUrl: downloadUrl,
      permissionId: permissionId,
      fileSize: fileSizeInMB,
      fileName: fileInfo.name
    });

  } catch (error) {
    console.error('Server-side error in make-public:', error);
    res.status(500).json({ error: error.message || 'An internal server error occurred.' });
  }
}
