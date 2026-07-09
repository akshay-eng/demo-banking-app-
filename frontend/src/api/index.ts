import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: object) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

export const accountApi = {
  getAll: () => api.get('/accounts'),
  getSummary: () => api.get('/accounts/summary'),
  getById: (id: string) => api.get(`/accounts/${id}`),
};

export const cardApi = {
  getAll: () => api.get('/cards'),
  toggle: (id: string) => api.patch(`/cards/${id}/toggle`),
};

export const transactionApi = {
  getAll: (params?: object) => api.get('/transactions', { params }),
  getSpending: () => api.get('/transactions/spending'),
  transfer: (data: object) => api.post('/transactions/transfer', data),
};

export const userApi = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data: object) => api.put('/users/profile', data),
  changePassword: (data: object) => api.post('/users/change-password', data),
};

export default api;
