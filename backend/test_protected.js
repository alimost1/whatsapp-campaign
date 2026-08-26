import axios from 'axios';

// Replace with the token from the login response
const token = 'eyJhbG...wieA'; // This is a placeholder; we'll use the actual token from the login response

// Since we don't have the token in the environment, we'll extract it from the login response again.
// Let's do a login first and then use the token.

const loginAndTest = async () => {
  try {
    // Login to get token
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@map-com.com',
      password: 'app123'
    });
    const token = loginResponse.data.token;
    console.log('Token received:', token);

    // Set up axios instance with token
    const api = axios.create({
      baseURL: 'http://localhost:3001',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });

    // Test /me endpoint
    const meResponse = await api.get('/api/auth/me');
    console.log('/me response:', meResponse.data);

    // Test /stats endpoint
    const statsResponse = await api.get('/api/stats');
    console.log('/stats response:', statsResponse.data);

    // Test /v2/logs endpoint
    const logsResponse = await api.get('/api/v2/logs?limit=10');
    console.log('/v2/logs response:', logsResponse.data);

  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
};

loginAndTest();