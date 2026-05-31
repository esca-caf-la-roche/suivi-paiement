import fs from 'fs';

const envStr = fs.readFileSync('.env', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

async function run() {
  const clientId = env['HELLOASSO_CLIENT_ID'];
  const clientSecret = env['HELLOASSO_CLIENT_SECRET'];
  
  const resToken = await fetch('https://api.helloasso.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
  });
  const tokenData = await resToken.json();
  const token = tokenData.access_token;
  
  const forms = await fetch('https://api.helloasso.com/v5/organizations/caf-la-roche-bonneville/forms?pageIndex=1&pageSize=10', {
    headers: { Authorization: 'Bearer ' + token }
  }).then(r => r.json());
  
  for (let f of forms.data) {
     const payUrl = 'https://api.helloasso.com/v5/organizations/caf-la-roche-bonneville/forms/' + f.formType + '/' + f.formSlug + '/payments';
     const pays = await fetch(payUrl, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
     if(pays.data && pays.data.length > 0) {
         console.log('PAYMENT OBJECT:', JSON.stringify(pays.data[0], null, 2));
         
         // Search for a refunded one
         for(let p of pays.data) {
            if(p.state === 'Refunded') {
               console.log('REFUNDED PAYMENT OBJECT:', JSON.stringify(p, null, 2));
               return;
            }
         }
         return;
     }
  }
}
run();
