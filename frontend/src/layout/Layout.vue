<template>
  <div class="layout-root">
    <!-- ===== 侧边栏 ===== -->
    <aside :class="['sidebar', { collapsed: isCollapse }]">
      <!-- Logo -->
      <div class="sidebar-logo">
        <div class="logo-icon">₮</div>
        <transition name="fade">
          <div v-if="!isCollapse" class="logo-text">
            <span class="logo-title">USDT Pay</span>
            <span class="logo-sub">资产管理平台</span>
          </div>
        </transition>
      </div>

      <!-- 导航菜单 -->
      <nav class="sidebar-nav">
        <div v-for="group in menuGroups" :key="group.label" class="nav-group">
          <transition name="fade">
            <div v-if="!isCollapse" class="nav-group-label">{{ group.label }}</div>
          </transition>
          <router-link
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: $route.path === item.path }"
          >
            <el-icon :size="18" class="nav-icon"><component :is="item.icon" /></el-icon>
            <transition name="fade">
              <span v-if="!isCollapse" class="nav-label">{{ item.label }}</span>
            </transition>
          </router-link>
        </div>
      </nav>

      <!-- 折叠按钮 -->
      <div class="sidebar-footer" @click="isCollapse = !isCollapse">
        <el-icon :size="16"><component :is="isCollapse ? 'Expand' : 'Fold'" /></el-icon>
        <transition name="fade">
          <span v-if="!isCollapse" style="font-size: 13px;">收起菜单</span>
        </transition>
      </div>
    </aside>

    <!-- ===== 主区域 ===== -->
    <div class="main-wrapper">
      <!-- 顶部栏 -->
      <header class="topbar">
        <div class="topbar-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item style="font-size: 15px; font-weight: 600; color: #1a1a2e;">{{ $route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="topbar-right">
          <div class="status-dot"></div>
          <span class="topbar-time">{{ currentTime }}</span>
          <div class="topbar-divider"></div>
          <div class="user-info">
            <div class="user-avatar">{{ username.charAt(0).toUpperCase() }}</div>
            <span class="user-name">{{ username }}</span>
          </div>
          <el-button type="danger" size="small" plain @click="handleLogout" style="margin-left: 4px;">退出</el-button>
        </div>
      </header>

      <!-- 内容区 -->
      <main class="main-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Odometer, OfficeBuilding, Wallet, Download, Upload,
  Promotion, Stamp, Setting, Document, Reading, Fold, Expand
} from '@element-plus/icons-vue';

const router = useRouter();
const isCollapse = ref(false);
const username = ref(localStorage.getItem('username') || 'admin');
const currentTime = ref('');

const menuGroups = [
  {
    label: '概览',
    items: [
      { path: '/dashboard', label: '控制台', icon: Odometer },
    ]
  },
  {
    label: '业务管理',
    items: [
      { path: '/merchant', label: '商户管理', icon: OfficeBuilding },
      { path: '/address', label: '地址管理', icon: Wallet },
      { path: '/deposit', label: '充币订单', icon: Download },
      { path: '/withdraw', label: '提币订单', icon: Upload },
      { path: '/transfer', label: '内部转账', icon: Promotion },
    ]
  },
  {
    label: '运维',
    items: [
      { path: '/audit', label: '审核中心', icon: Stamp },
      { path: '/config', label: '系统配置', icon: Setting },
      { path: '/logs', label: '日志中心', icon: Document },
      { path: '/api-doc', label: 'API文档', icon: Reading },
    ]
  }
];

let clockTimer = null;
const updateTime = () => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  currentTime.value = `${h}:${m}:${s}`;
};

onMounted(() => {
  updateTime();
  clockTimer = setInterval(updateTime, 1000);
});
onUnmounted(() => { if (clockTimer) clearInterval(clockTimer); });

const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  router.push('/login');
};
</script>

<style scoped>
/* ===== 布局根 ===== */
.layout-root {
  display: flex;
  height: 100vh;
  background: #f0f2f5;
}

/* ===== 侧边栏 ===== */
.sidebar {
  width: 230px;
  min-width: 230px;
  background: linear-gradient(180deg, #0f1117 0%, #1a1d2e 50%, #131625 100%);
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.25);
  z-index: 10;
  position: relative;
}
.sidebar.collapsed {
  width: 68px;
  min-width: 68px;
}

/* Logo */
.sidebar-logo {
  height: 68px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
  flex-shrink: 0;
}
.logo-icon {
  width: 36px;
  height: 36px;
  min-width: 36px;
  background: linear-gradient(135deg, #409EFF 0%, #67c23a 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 900;
  color: #fff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}
.logo-text { display: flex; flex-direction: column; overflow: hidden; }
.logo-title { font-size: 15px; font-weight: 700; color: #fff; white-space: nowrap; }
.logo-sub { font-size: 11px; color: rgba(255,255,255,0.4); white-space: nowrap; margin-top: 1px; }

/* 导航 */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}
.sidebar-nav::-webkit-scrollbar { width: 4px; }
.sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.nav-group { margin-bottom: 8px; }
.nav-group-label {
  font-size: 11px;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 8px 10px 4px;
  white-space: nowrap;
  overflow: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  color: rgba(255,255,255,0.55);
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
}
.nav-item:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.9);
}
.nav-item.active {
  background: linear-gradient(90deg, rgba(64,158,255,0.25) 0%, rgba(64,158,255,0.08) 100%);
  color: #409EFF;
  box-shadow: inset 3px 0 0 #409EFF;
}
.nav-icon { flex-shrink: 0; }
.nav-label { font-size: 14px; font-weight: 500; overflow: hidden; }

/* 折叠按钮 */
.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.35);
  cursor: pointer;
  transition: color 0.2s;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar-footer:hover { color: rgba(255,255,255,0.7); }

/* ===== 主区域 ===== */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* 顶部栏 */
.topbar {
  height: 60px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 1px 12px rgba(0,0,0,0.06);
  z-index: 9;
  flex-shrink: 0;
}
.topbar-left { display: flex; align-items: center; gap: 12px; }
.topbar-right { display: flex; align-items: center; gap: 10px; }
.topbar-divider { width: 1px; height: 24px; background: #ebeef5; margin: 0 4px; }

.status-dot {
  width: 8px; height: 8px;
  background: #67C23A;
  border-radius: 50%;
  box-shadow: 0 0 6px #67C23A;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.topbar-time {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: #606266;
  letter-spacing: 1px;
}

.user-info { display: flex; align-items: center; gap: 8px; }
.user-avatar {
  width: 32px; height: 32px;
  background: linear-gradient(135deg, #409EFF, #67c23a);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff;
}
.user-name { font-size: 14px; color: #303133; font-weight: 500; }

/* 内容区 */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #f0f2f5;
}

/* 过渡动画 */
.fade-enter-active { transition: opacity 0.2s, transform 0.2s; }
.fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from { opacity: 0; transform: translateX(-6px); }
.fade-leave-to { opacity: 0; }
</style>
