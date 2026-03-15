import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue'), meta: { title: '登录' } },
  {
    path: '/',
    component: () => import('../layout/Layout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '控制台' } },
      { path: 'merchant', name: 'Merchant', component: () => import('../views/Merchant.vue'), meta: { title: '商户管理' } },
      { path: 'address', name: 'Address', component: () => import('../views/Address.vue'), meta: { title: '地址管理' } },
      { path: 'deposit', name: 'Deposit', component: () => import('../views/Deposit.vue'), meta: { title: '充币订单' } },
      { path: 'withdraw', name: 'Withdraw', component: () => import('../views/Withdraw.vue'), meta: { title: '提币订单' } },
      { path: 'transfer', name: 'Transfer', component: () => import('../views/Transfer.vue'), meta: { title: '转账' } },
      { path: 'audit', name: 'Audit', component: () => import('../views/Audit.vue'), meta: { title: '审核中心' } },
      { path: 'config', name: 'Config', component: () => import('../views/Config.vue'), meta: { title: '系统配置' } },
      { path: 'logs', name: 'Logs', component: () => import('../views/Logs.vue'), meta: { title: '日志中心' } },
      { path: 'api-doc', name: 'ApiDoc', component: () => import('../views/ApiDoc.vue'), meta: { title: 'API文档' } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || ''} - USDT支付中间件`;
  if (to.path !== '/login' && !localStorage.getItem('token')) {
    next('/login');
  } else {
    next();
  }
});

export default router;
