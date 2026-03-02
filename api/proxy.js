export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby-j5tKAEK5gBW9-64-lfvNDXdyIBu6davlmz3LAcDPp9JS8LqiFBstMPu6cJSEDfOS/exec";

  try {

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body),
      redirect: 'follow'
    });

    const text = await response.text();

    console.log("STATUS:", response.status);
    console.log("RAW:", text);

    if (!response.ok) {
      return res.status(500).json({
        error: "Apps Script error",
        status: response.status,
        raw: text
      });
    }

    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({
        error: "Invalid JSON from Apps Script",
        raw: text
      });
    }

  } catch (error) {
    return res.status(500).json({
      error: 'Proxy fetch failed',
      details: error.message
    });
  }
}
