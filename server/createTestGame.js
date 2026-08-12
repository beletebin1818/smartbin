const http = require('http');

function request(url, method, headers, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(body)
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            data: body
          });
        }
      });
    });
    
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function main() {
  try {
    console.log('Logging in as admin...');
    const loginRes = await request('http://localhost:3000/api/auth/login', 'POST', {}, {
      username: 'john',
      password: 'johnadmin'
    });
    
    if (loginRes.statusCode !== 200) {
      console.error('Failed to log in:', loginRes.data);
      return;
    }
    
    const token = loginRes.data.token || loginRes.data.data.token;
    console.log('Login successful, token acquired.');
    
    console.log('Creating a game with 56 cards...');
    const createRes = await request('http://localhost:3000/api/games', 'POST', {
      'Authorization': `Bearer ${token}`
    }, {
      cardPrice: 50,
      totalCards: 56,
      mode: 'automatic',
      prize: 0
    });
    
    console.log('Game Creation Status:', createRes.statusCode);
    console.log('Response:', JSON.stringify(createRes.data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
