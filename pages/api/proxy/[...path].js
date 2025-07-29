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
    // Build the full URL
    const url = `${ASSEMBLY_BASE_URL}/${apiPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
    // Prepare headers
    const headers = {
      'Authorization': ASSEMBLYAI_API_KEY,
    };

    // For JSON requests, set content-type
    if (req.headers['content-type']?.includes('application/json')) {
      headers['Content-Type'] = 'application/json';
    }
    // For file uploads, don't set Content-Type - let fetch handle it

    // Prepare fetch options
    const fetchOptions = {
      method: req.method,
      headers,
    };

    // Handle body based on content type
    if (req.method === 'POST' || req.method === 'PUT') {
      if (req.headers['content-type']?.includes('application/json')) {
        // For JSON, we need to read and stringify the body
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString();
        fetchOptions.body = body;
      } else {
        // For file uploads, stream the request directly
        fetchOptions.body = req;
        fetchOptions.duplex = 'half';
      }
    }

    // Make the request to AssemblyAI
    const response = await fetch(url, fetchOptions);
    
    // Get the response data
    const data = await response.json();
    
    // Return the response with same status code
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to proxy request to AssemblyAI',
      details: error.message 
    });
  }
}

// Disable body parser to allow streaming
export const config = {
  api: {
    bodyParser: false,
  },
};
