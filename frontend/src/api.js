import axios from 'axios';

const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' }
});

// Add auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Remove token on 401 so user gets logged out
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('userName');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;