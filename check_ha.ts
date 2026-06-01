import fetch from 'node-fetch';
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
  
  // Just query the forms to get one and find a payment
  const url = 'https://api.helloasso.com/v5/organizations/esca-caf-la-roche/forms?pageIndex=1&pageSize=10';
  const resForms = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const forms = await resForms.json();
  
  for (let f of forms.data) {
     const payUrl = 'https://api.helloasso.com/v5/organizations/esca-caf-la-roche/forms/' + f.formType + '/' + f.formSlug + '/payments';
     const r = await fetch(payUrl, { headers: { Authorization: 'Bearer ' + token } });
     const pays = await r.json();
     if(pays.data && pays.data.length > 0) {
       for(let p of pays.data) {
           console.log('PAYMENT OBJECT:', JSON.stringify(p, null, 2));
           return;
       }
     }
  }
}
run();
