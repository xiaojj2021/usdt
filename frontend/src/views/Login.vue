<template>
  <div class="login-bg">
    <!-- 背景装饰 -->
    <div class="bg-circle circle-1"></div>
    <div class="bg-circle circle-2"></div>
    <div class="bg-circle circle-3"></div>

    <div class="login-wrap">
      <!-- 左侧 banner -->
      <div class="login-banner">
        <div class="banner-logo">₮</div>
        <h1 class="banner-title">USDT Pay</h1>
        <p class="banner-sub">TRC20 · BSC 双链资产管理平台</p>
        <div class="banner-features">
          <div class="feature-item"><span class="feature-dot green"></span>实时链上余额</div>
          <div class="feature-item"><span class="feature-dot blue"></span>自动归集 & 能量租赁</div>
          <div class="feature-item"><span class="feature-dot yellow"></span>多商户 & 审核系统</div>
        </div>
      </div>

      <!-- 右侧登录框 -->
      <div class="login-card">
        <h2 class="login-title">管理员登录</h2>
        <p class="login-desc">请输入您的账号和密码</p>

        <el-form :model="form" @keyup.enter="handleLogin" style="margin-top: 32px;">
          <el-form-item>
            <el-input
              v-model="form.username"
              placeholder="账号"
              prefix-icon="User"
              size="large"
              class="login-input"
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              prefix-icon="Lock"
              size="large"
              show-password
              class="login-input"
            />
          </el-form-item>
          <el-form-item style="margin-top: 8px;">
            <el-button
              type="primary"
              size="large"
              style="width: 100%; height: 48px; font-size: 16px; border-radius: 12px; background: linear-gradient(90deg, #409EFF 0%, #67c23a 100%); border: none; font-weight: 600; letter-spacing: 2px;"
              :loading="loading"
              @click="handleLogin"
            >
              登 录
            </el-button>
          </el-form-item>
        </el-form>

        <div style="text-align: center; font-size: 12px; color: #c0c4cc; margin-top: 24px;">
          © 2025 USDT 支付中间件 · 安全加密管理
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import request from '../utils/request';

const router = useRouter();
const loading = ref(false);
const form = ref({ username: '', password: '' });

const handleLogin = async () => {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入账号和密码'); return;
  }
  loading.value = true;
  try {
    const res = await request.post('/login', form.value);
    if (res.code === 0) {
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('username', res.data.username);
      ElMessage.success('登录成功');
      router.push('/dashboard');
    } else { ElMessage.error(res.msg); }
  } catch (e) { ElMessage.error('登录失败'); }
  finally { loading.value = false; }
};
</script>

<style scoped>
.login-bg {
  height: 100vh;
  background: linear-gradient(135deg, #0f1117 0%, #1a1d2e 40%, #0d1b2a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

/* 背景装饰圆 */
.bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
  pointer-events: none;
}
.circle-1 { width: 500px; height: 500px; background: #409EFF; top: -150px; left: -150px; }
.circle-2 { width: 400px; height: 400px; background: #67C23A; bottom: -120px; right: -100px; }
.circle-3 { width: 300px; height: 300px; background: #E6A23C; top: 50%; left: 50%; transform: translate(-50%,-50%); }

.login-wrap {
  display: flex;
  width: 900px;
  height: 520px;
  background: rgba(255,255,255,0.04);
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(20px);
  box-shadow: 0 32px 80px rgba(0,0,0,0.5);
  overflow: hidden;
  z-index: 1;
}

/* 左侧 Banner */
.login-banner {
  width: 380px;
  min-width: 380px;
  background: linear-gradient(135deg, rgba(64,158,255,0.15) 0%, rgba(103,194,58,0.1) 100%);
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 48px;
}
.banner-logo {
  width: 64px; height: 64px;
  background: linear-gradient(135deg, #409EFF, #67c23a);
  border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 900; color: #fff;
  box-shadow: 0 8px 24px rgba(64,158,255,0.4);
  margin-bottom: 24px;
}
.banner-title {
  font-size: 32px; font-weight: 800; color: #fff;
  margin-bottom: 8px; letter-spacing: 1px;
}
.banner-sub {
  font-size: 14px; color: rgba(255,255,255,0.5);
  margin-bottom: 40px; line-height: 1.6;
}
.banner-features { display: flex; flex-direction: column; gap: 14px; }
.feature-item { display: flex; align-items: center; gap: 10px; color: rgba(255,255,255,0.65); font-size: 14px; }
.feature-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.feature-dot.green { background: #67C23A; box-shadow: 0 0 8px #67C23A; }
.feature-dot.blue { background: #409EFF; box-shadow: 0 0 8px #409EFF; }
.feature-dot.yellow { background: #E6A23C; box-shadow: 0 0 8px #E6A23C; }

/* 右侧登录框 */
.login-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 56px 48px;
  background: #fff;
}
.login-title { font-size: 26px; font-weight: 700; color: #1a1a2e; margin-bottom: 6px; }
.login-desc { font-size: 14px; color: #909399; }

:deep(.login-input .el-input__wrapper) {
  border-radius: 10px;
  height: 48px;
  font-size: 15px;
  box-shadow: 0 0 0 1px #e0e3ec;
}
:deep(.login-input .el-input__wrapper:hover),
:deep(.login-input .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px #409EFF;
}
</style>
