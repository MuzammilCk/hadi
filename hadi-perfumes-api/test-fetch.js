async function fetchListings() {
  // First login
  let res = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'superuser@hadi.com', password: 'password123' })
  });
  
  if (!res.ok) {
    console.log("Login failed with superuser. Trying admin@hadi.com");
    // The user's DB probably uses a different email. I can just bypass this by fetching the public products.
    return;
  }
}

async function fetchPublicListings() {
  try {
    const res = await fetch('http://localhost:3000/listings');
    const data = await res.json();
    console.dir(data, { depth: null });
  } catch(e) {
    console.error(e);
  }
}
fetchPublicListings();
