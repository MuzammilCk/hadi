async function testCreateListing() {
  console.log("Logging in...");
  const loginRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@hadi.com', password: 'password123' })
  });
  
  if (!loginRes.ok) {
    console.log("Login failed", await loginRes.text());
    return;
  }
  const { access_token } = await loginRes.json();
  console.log("Logged in. Access token length:", access_token.length);

  try {
    console.log("Creating listing...");
    const res = await fetch('http://localhost:3000/admin/listings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      },
      body: JSON.stringify({
        title: "Test Product",
        sku: "test-product-" + Date.now(),
        price: 1000,
        currency: "INR",
        quantity: 50,
        status: "active"
      })
    });

    const status = res.status;
    const text = await res.text();
    console.log(`STATUS: ${status}`);
    console.log(`BODY: ${text}`);
  } catch(e) {
    console.log("Request failed", e);
  }
}

testCreateListing().catch(console.error);
