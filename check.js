import fs from 'fs';

// Charge les variables depuis .env.local ou .env manuellement sans dotenv
const env = {};
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      if (line.trim().startsWith('#') || !line.includes('=')) return;
      const firstEqual = line.indexOf('=');
      const key = line.slice(0, firstEqual).trim();
      const val = line.slice(firstEqual + 1).trim().replace(/^['"]|['"]$/g, ''); // retire les guillemets
      if (key && env[key] === undefined) {
        env[key] = val;
      }
    });
  }
}

const supabaseUrl = env['VITE_SUPABASE_URL'] || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY'] || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Erreur : VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquants dans .env.local ou .env.");
  process.exit(1);
}

const url = `${supabaseUrl}/rest/v1/registrants?select=*&helloasso_status=eq.Refunded`;

async function run() {
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    
    if (!res.ok) {
      throw new Error(`Erreur HTTP : ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log('Refunded:', data);
    
    for (let d of data) {
      const email = d.payer_email;
      const allUrl = `${supabaseUrl}/rest/v1/registrants?select=*&payer_email=eq.${encodeURIComponent(email)}`;
      const r = await fetch(allUrl, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      });
      const all = await r.json();
      console.log('All for', email, all);
    }
  } catch (err) {
    console.error('Erreur lors de la requête :', err);
  }
}

run();


