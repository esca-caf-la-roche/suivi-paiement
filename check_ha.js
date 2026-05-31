import fs from 'fs';
import https from 'https';

const env = fs.readFileSync('.env', 'utf8');
const clientId = env.match(/HELLOASSO_CLIENT_ID=(.*)/)[1].trim();
const clientSecret = env.match(/HELLOASSO_CLIENT_SECRET=(.*)/)[1].trim();

async function fetchURL(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if(options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  const tokenData = await fetchURL('https://api.helloasso.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + clientId + '&client_secret=' + clientSecret
  });
  const token = tokenData.access_token;
  
  const forms = await fetchURL('https://api.helloasso.com/v5/organizations/caf-la-roche-bonneville/forms?pageIndex=1&pageSize=10', {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  for (let f of forms.data) {
     const pays = await fetchURL('https://api.helloasso.com/v5/organizations/caf-la-roche-bonneville/forms/' + f.formType + '/' + f.formSlug + '/payments', {
       headers: { Authorization: 'Bearer ' + token }
     });
     if(pays.data && pays.data.length > 0) {
       for(let p of pays.data) {
           console.log('PAYMENT OBJECT:', JSON.stringify(p, null, 2));
           return;
       }
     }
  }
}
run();
