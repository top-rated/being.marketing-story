// GET /test/render_to_r2?merchantId=PROJECT_xxx
// Берёт HTML из KV (DRAFTS), рендерит PDF через Browser Rendering,
// кладёт в R2 (PDFS) и возвращает публичный URL.
export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const merchantId = url.searchParams.get('merchantId');
  if (!merchantId) return new Response('Missing merchantId', { status: 400 });

  const html = await env.DRAFTS.get(merchantId);
  if (!html) return new Response('Draft not found', { status: 404 });

  const br = await fetch(
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
          width: '210mm',
          height: '297mm'
        }
      })
    }
  );
  if (!br.ok) {
    const t = await br.text();
    return new Response('Browser Rendering error: ' + t, { status: 500 });
  }
  const pdf = await br.arrayBuffer();

  const key = `test-${merchantId}-${Date.now()}.pdf`;
  await env.PDFS.put(key, pdf, { httpMetadata: { contentType: 'application/pdf' } });
  const urlOut = `${env.PUBLIC_R2_URL}/${key}`;

  return new Response(JSON.stringify({ url: urlOut }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
