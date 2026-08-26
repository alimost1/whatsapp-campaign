import axios from 'axios';

const testLogin = async () => {
  try {
    const response = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@map-com.com',
      password: 'app123'
    });
    console.log('Login successful:', response.data);
  } catch (error) {
    console.error('Login failed:', error.response ? error.response.data : error.message);
  }
};

testLogin();