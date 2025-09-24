export const onRequestPost = async ({ request, env }) => {
  const { merchantReference, html } = await request.json().catch(()=>({}));
  if (!merchantReference || !html) {
    return new Response('Bad Request', { status: 400 });
  }
  await env.DRAFTS.put(merchantReference, html);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
