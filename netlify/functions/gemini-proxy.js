// netlify/functions/gemini-proxy.js
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Translate Anthropic-style messages into Gemini format
  const userMessage = Array.isArray(body.messages)
    ? body.messages.map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content.map(c => {
            if (c.type === 'text') return c.text;
            if (c.type === 'image' && c.source?.data) {
              return { inlineData: { mimeType: c.source.media_type, data: c.source.data } };
            }
            return '';
          });
        }
        return '';
      }).flat().filter(Boolean)
    : [body.prompt || ''];

  const geminiBody = {
    contents: [{
      parts: userMessage.map(p =>
        typeof p === 'string' ? { text: p } : p
      )
    }],
    generationConfig: {
      maxOutputTokens: body.max_tokens || 8000,
      temperature: 0.1
    }
  };

  try {
    const model = 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'Gemini API error' })
      };
    }

    // Translate Gemini response back to Anthropic shape
    // so the frontend needs zero changes
    const text = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text || '').join('') || '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: [{ type: 'text', text }],
        model,
        usage: {
          input_tokens: data.usageMetadata?.promptTokenCount || 0,
          output_tokens: data.usageMetadata?.candidatesTokenCount || 0
        }
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Proxy error: ${err.message}` })
    };
  }
};
