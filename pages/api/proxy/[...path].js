// API Proxy for AssemblyAI to handle CORS and protect API key

export default async function handler(req, res) {
  const { path } = req.query;
  const apiPath = Array.isArray(path) ? path.join('/') : path;
  
  const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
  const ASSEMBLY_BASE_URL = 'https://api.assemblyai.com/v2';

  if (!ASSEMBLYAI_API_KEY) {
    return res.status(500).json({ error: 'AssemblyAI API key not configured' });
  }

  try {
    // Build the full URL
    const url = `${ASSEMBLY_BASE_URL}/${apiPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
    // Prepare headers
    const headers = {
      'Authorization': ASSEMBLYAI_API_KEY,
    };

    // Add content-type for POST requests with JSON body
    if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
      headers['Content-Type'] = 'application/json';
    }

    // Prepare fetch options
    const fetchOptions = {
      method: req.method,
      headers,
    };

    // Handle body for POST/PUT requests
    if (req.method === 'POST' || req.method === 'PUT') {
      if (req.headers['content-type']?.includes('application/json')) {
        fetchOptions.body = JSON.stringify(req.body);
      } else {
        // For file uploads, we need to handle the raw body
        fetchOptions.body = await getRawBody(req);
      }
    }

    // Make the request to AssemblyAI
    const response = await fetch(url, fetchOptions);
    
    // Get the response data
    const data = await response.json();
    
    // Return the response
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy request to AssemblyAI' });
  }
}

// Helper function to get raw body for file uploads
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Configure API route to handle large files
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2.2gb', // AssemblyAI max file size
    },
  },
};