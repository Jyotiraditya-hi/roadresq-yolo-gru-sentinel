import axios from 'axios';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: API });

// send the login token with every request
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

// expired or missing login -> back to the login page
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !e.config.url.includes('/auth/')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(e);
  }
);

export const errMsg = (e) => e.response?.data?.error || e.message || 'Something went wrong';
export default api;
