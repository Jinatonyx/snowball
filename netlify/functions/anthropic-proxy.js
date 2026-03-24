// netlify/functions/anthropic-proxy.js
//
// Thin proxy that forwards requests from the Snowball frontend to the
// Anthropic API, injecting the API key from environment variables.
//
// SETUP:
//   1. In Netlify dashboard → Site configuration → Environment variables
//   2. Add variable:  ANTHROPIC_API_KEY = sk-ant-api03-YOUR-KEY-HERE
//   3. Deploy. Done.
//
// The key is NEVER sent to the browser. Users never see it.

exports.handler = async function(event) {

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Retrieve API key from environment variable (set in Netlify dashboard)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: { message: 'Server configuration error: API key not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.' }
      })
    };
  }

  // Parse and validate the request body
  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Invalid JSON in request body' } })
    };
  }

  // Safety: restrict to allowed models only
  const allowedModels = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'];
  if (!allowedModels.includes(requestBody.model)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: `Model not permitted: ${requestBody.model}` } })
    };
  }

  // Safety: cap max_tokens to prevent runaway costs
  const MAX_TOKENS_LIMIT = 10000;
  if (requestBody.max_tokens && requestBody.max_tokens > MAX_TOKENS_LIMIT) {
    requestBody.max_tokens = MAX_TOKENS_LIMIT;
  }

  // Forward to Anthropic API
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        // CORS: only allow requests from your own Netlify domain
        // Replace with your actual domain, or use '*' during testing
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: responseText
    };

  } catch (err) {
    console.error('Proxy fetch error:', err);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: `Proxy error: ${err.message}` } })
    };
  }
};
