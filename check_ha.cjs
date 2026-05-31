import { config } from 'dotenv';
config({path: '.env'});

async function run() {
  const clientId = process.env.HELLOASSO_CLIENT_ID;
  const clientSecret = process.env.HELLOASSO_CLIENT_SECRET;
  
  const resToken = await fetch('https://api.helloasso.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
  });
  const tokenData = await resToken.json();
  const token = tokenData.access_token;
  
  // Actually, we don't need to get all forms. Let's just fetch all payments for the org to find a refund.
  // Wait, /v5/organizations/{orgSlug}/payments is not a valid endpoint? It's usually per form.
  // Wait, I can use the supabase REST api to get a refunded record!
  const url = 'https://tnvhqkwopxvqofmmoflo.supabase.co/rest/v1/registrants?select=helloasso_payment_id,payer_email,helloasso_link_id,helloasso_status&helloasso_status=eq.Refunded';
  const r = await fetch(url, { headers: { 'apikey': process.env.VITE_SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + process.env.VITE_SUPABASE_ANON_KEY } });
  const data = await r.json();
  console.log('Refunded in DB:', data);
}
run();
