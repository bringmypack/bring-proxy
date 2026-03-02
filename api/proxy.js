export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzJcz9C1Fl4DZhxLlWtOdc-Dg0AXnToSpLqeL1Xh2NfoPTWayeXQNUXKQdQgK8J4nnN-A/exec";

  try {

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: 'Proxy error',
      details: error.message
    });
  }
}
