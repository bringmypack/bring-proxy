export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/TUO_SCRIPT_ID/exec";

  try {

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    const text = await response.text();

    return res.status(200).send(text);

  } catch (error) {

    return res.status(500).json({
      error: "Proxy error",
      details: error.message
    });

  }
}
