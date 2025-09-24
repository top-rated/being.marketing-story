// GET /peecho/pingback?peechoId=%PEECHOID%&merchantId=%MERCHANTID%&secret=%SECRET%

// HMAC-SHA1 base64 (для подписи set_source_url)
async function hmacSha1Base64(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const peechoId   = url.searchParams.get('peechoId');
    const merchantId = url.searchParams.get('merchantId'); // = data-reference
    if (!peechoId || !merchantId) {
      return new Response('Missing params', { status: 400 });
    }

    // 1) Достать HTML черновика из KV
    const html = await env.DRAFTS.get(merchantId);
    if (!html) return new Response('Draft not found', { status: 404 });

    // 2) Сгенерировать PDF через Cloudflare Browser Rendering /pdf
    const brResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          html,
          pdfOptions: {
            printBackground: true,
            preferCSSPageSize: true,
            width: '210mm',  // A4 портрет
            height: '297mm'
          }
        })
      }
    );
    if (!brResp.ok) {
      const t = await brResp.text();
      return new Response('BrowserRendering error: ' + t, { status: 500 });
    }
    const pdfArrayBuffer = await brResp.arrayBuffer();

    // 3) Сохранить PDF в R2 (binding PDFS) и сделать публичный URL
    const key = `${peechoId}.pdf`;
    await env.PDFS.put(key, pdfArrayBuffer, {
      httpMetadata: { contentType: 'application/pdf' }
    });
    const sourceUrl = `${env.PUBLIC_R2_URL}/${key}`; // например: https://pub-XXXX.r2.dev/PEECHOID.pdf

    // 4) Подписать и отправить в Peecho set_source_url
    const dataToSign = `${peechoId}${merchantId}${sourceUrl}`;
    const signature  = await hmacSha1Base64(env.PEECHO_SECRET, dataToSign);

    const form = new URLSearchParams({
      orderId: peechoId,
      sourceUrl, // важно: с маленькой 'l', как в их примере
      merchantApiKey: env.PEECHO_API_KEY,
      secret: signature
    });

    const peechoResp = await fetch('https://www.peecho.com/rest/order/set_source_url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    const text = await peechoResp.text();
    if (!peechoResp.ok || !/OK/i.test(text)) {
      return new Response('Peecho API error: ' + text, { status: 502 });
    }

    return new Response('OK');
  } catch (e) {
    return new Response('Server error: ' + e.message, { status: 500 });
  }
};
