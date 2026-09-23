const autocannon = require('autocannon');
const http = require('http');

const data = JSON.stringify({ email: 'admin@microgenesis.com', password: 'admin123' });

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  const setCookie = res.headers['set-cookie'];
  const cookie = setCookie ? setCookie[0].split(';')[0] : '';
  
  if (!cookie) {
    console.error('Login failed or no cookie received. Check credentials or server state.');
    process.exit(1);
  }

  console.log('Successfully logged in! Starting stress test across multiple routes...');

  const instance = autocannon({
    url: 'http://localhost:4000',
    connections: 50,
    duration: 15,
    pipelining: 1,
    requests: [
      { method: 'GET', path: '/api/records', headers: { Cookie: cookie } },
      { method: 'GET', path: '/api/companies', headers: { Cookie: cookie } },
      { method: 'GET', path: '/api/customers', headers: { Cookie: cookie } },
      { method: 'GET', path: '/api/suppliers', headers: { Cookie: cookie } },
      { method: 'GET', path: '/api/skus', headers: { Cookie: cookie } },
      { method: 'GET', path: '/api/dashboard/stats', headers: { Cookie: cookie } },
      { method: 'GET', path: '/api/users', headers: { Cookie: cookie } },
      { method: 'GET', path: '/api/drivers', headers: { Cookie: cookie } }
    ]
  }, (err, result) => {
    if (err) {
      console.error('Stress test error:', err);
    } else {
      console.log(autocannon.printResult(result));
    }
  });

  autocannon.track(instance, { renderProgressBar: false });
});

req.on('error', (error) => {
  console.error('Error during login request:', error);
});

req.write(data);
req.end();
