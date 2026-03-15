import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '../router';

const request = axios.create({
  baseURL: '/admin/api',
  timeout: 30000,
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

request.interceptors.response.use(
  (response) => {
    const { data } = response;
    if (data.code === 401) {
      localStorage.removeItem('token');
      router.push('/login');
      ElMessage.error('登录已过期，请重新登录');
      return Promise.reject(new Error(data.msg));
    }
    return data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      router.push('/login');
      const msg = error.response?.data?.msg || '登录已过期，请重新登录';
      ElMessage.error(msg);
      return Promise.reject(error);
    }
    const msg = error.response?.data?.msg || error.message || '网络请求失败';
    ElMessage.error(msg);
    return Promise.reject(error);
  }
);

export default request;
