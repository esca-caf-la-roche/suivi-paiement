const url = 'https://tnvhqkwopxvqofmmoflo.supabase.co/rest/v1/registrants?select=*&helloasso_status=eq.Refunded';
fetch(url, { headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudmhxa3dvcHh2cW9mbW1vZmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDA1NjAsImV4cCI6MjA5NTM3NjU2MH0.k_Tn2CDvRpFfR2cyOxYYicYqHO8t2AVHoOctox6Yc7s', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudmhxa3dvcHh2cW9mbW1vZmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDA1NjAsImV4cCI6MjA5NTM3NjU2MH0.k_Tn2CDvRpFfR2cyOxYYicYqHO8t2AVHoOctox6Yc7s' } })
  .then(r => r.json())
  .then(async data => {
    console.log('Refunded:', data);
    for (let d of data) {
      const email = d.payer_email;
      const allUrl = 'https://tnvhqkwopxvqofmmoflo.supabase.co/rest/v1/registrants?select=*&payer_email=eq.' + email;
      const r = await fetch(allUrl, { headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudmhxa3dvcHh2cW9mbW1vZmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDA1NjAsImV4cCI6MjA5NTM3NjU2MH0.k_Tn2CDvRpFfR2cyOxYYicYqHO8t2AVHoOctox6Yc7s', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudmhxa3dvcHh2cW9mbW1vZmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDA1NjAsImV4cCI6MjA5NTM3NjU2MH0.k_Tn2CDvRpFfR2cyOxYYicYqHO8t2AVHoOctox6Yc7s' } });
      const all = await r.json();
      console.log('All for', email, all);
    }
  });
