const fs = require('fs');
require('dotenv').config({path: '.env'});
async function run() {
  try {
    const res = await fetch('https://api.helloasso.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.HELLOASSO_CLIENT_ID,
        client_secret: process.env.HELLOASSO_CLIENT_SECRET
      })
    });
    const { access_token } = await res.json();
    const url = 'https://api.helloasso.com/v5/organizations/caf-la-roche-bonneville/forms/PaymentForm/test/payments';
    // Actually we don't know the exact form slug. Let's get the forms first, or use registrants table to find a form slug.
  } catch (e) {
    console.error(e);
  }
}
run();
