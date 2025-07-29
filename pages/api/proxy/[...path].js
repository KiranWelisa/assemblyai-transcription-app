// API Proxy for AssemblyAI to handle CORS and protect API key

export default async function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { path } = req.query;
  const apiPath = Array.isArray(path) ? path.join('/') : path;

  const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
  const ASSEMBLY_BASE_URL = 'https://api.assemblyai.com/v2';

  if (!ASSEMBLYAI_API_KEY) {
    console.error('AssemblyAI API key not found in environment variables');
    return res.status(500).json({
      error: 'AssemblyAI API key not configured',
      message: 'Please set ASSEMBLYAI_API_KEY in Vercel environment variables'
    });
  }

  try {
    // Build the full URL to the AssemblyAI API
    const url = `${ASSEMBLY_BASE_URL}/${apiPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

    // Prepare headers, including the secret API key
    const headers = {
      'Authorization': ASSEMBLYAI_API_KEY,
    };

    // Prepare fetch options
    const fetchOptions = {
      method: req.method,
      headers,
    };

    // Handle body based on content type
    if (req.method === 'POST' || req.method === 'PUT') {
      if (req.headers['content-type']?.includes('application/json')) {
        // For JSON requests, forward the content type and body
        headers['Content-Type'] = 'application/json';
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString();
        fetchOptions.body = body;
      } else {
        // For file uploads, forward the content type and stream the request body
        headers['Content-Type'] = req.headers['content-type'];
        fetchOptions.body = req;
        fetchOptions.duplex = 'half';
      }
    }

    // Make the request to the AssemblyAI API
    const response = await fetch(url, fetchOptions);

    // Robustly handle the response from AssemblyAI
    const contentType = response.headers.get('content-type');
    if (response.ok && contentType && contentType.includes('application/json')) {
      // If the response is successful and is JSON, send it back to the client
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      // If the response is not ok or not JSON, handle it as an error
      const errorText = await response.text();
      console.error(`AssemblyAI Error (Status: ${response.status}): ${errorText}`);
      res.status(response.status).json({
        error: `Failed to communicate with AssemblyAI.`,
        details: errorText || 'No response body from AssemblyAI.'
      });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Failed to proxy request to AssemblyAI',
      details: error.message
    });
  }
}

// Disable Next.js's default body parser to allow for file streaming
export const config = {
  api: {
    bodyParser: false,
  },
};
