// GET /test/pdf
// Проверяет CF Browser Rendering: вернёт PDF "It works" прямо в браузер.
export const onRequestGet = async ({ env }) => {
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        html: '<html><body style="font-family:system-ui;"><h1>It works 🎉</h1><p>Cloudflare Browser Rendering → PDF</p></body></html>',
        pdfOptions: { printBackground: true, preferCSSPageSize: true }
      })
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    return new Response('Browser Rendering error: ' + text, { status: 500 });
  }
  const pdf = await resp.arrayBuffer();
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="test.pdf"'
    }
  });
};
