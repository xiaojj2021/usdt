<template>
  <div>
    <!-- ===== 欢迎横幅 ===== -->
    <div class="welcome-banner">
      <div class="welcome-text">
        <h2>你好，{{ username }} 👋</h2>
        <p>{{ todayStr }} · 系统运行正常</p>
      </div>
      <div class="banner-actions">
        <el-button type="primary" @click="manualCollect('trc20')" :loading="collecting" style="border-radius: 8px;">
          手动归集 TRC20
        </el-button>
        <el-button type="success" @click="manualCollect('bsc')" :loading="collecting" style="border-radius: 8px;">
          手动归集 BSC
        </el-button>
      </div>
    </div>

    <!-- ===== 统计卡片 ===== -->
    <el-row :gutter="20" style="margin-bottom: 24px;">
      <el-col :span="6" v-for="card in statCards" :key="card.label">
        <div class="stat-card" :style="{ background: card.gradient }">
          <div class="stat-icon-wrap" :style="{ background: card.iconBg }">
            <el-icon :size="22" color="#fff"><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-label">{{ card.label }}</div>
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-unit">{{ card.unit }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- ===== Gas 余额 ===== -->
    <el-card v-if="gasBalances.length" shadow="never" class="section-card" style="margin-bottom: 24px;">
      <template #header>
        <div class="card-header-row">
          <div class="section-title">
            <span class="title-dot"></span>
            主地址 Gas 余额
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 12px; color: #b0b3c0;">30s 自动刷新</span>
            <el-button size="small" @click="loadGasBalance" :loading="gasLoading" style="border-radius: 7px;">刷新</el-button>
          </div>
        </div>
      </template>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        <div v-for="item in gasBalances" :key="item.address"
          :class="['gas-card', item.gas_sufficient ? 'gas-ok' : 'gas-warn']">
          <!-- 链标签 + 不足警告 -->
          <div class="gas-card-top">
            <el-tag :type="item.chain_type === 'trc20' ? 'primary' : 'success'" size="small" effect="dark" style="border-radius: 5px; padding: 0 6px;">
              {{ item.chain_type.toUpperCase() }}
            </el-tag>
            <span class="gas-address">{{ item.address.substr(0, 6) }}...{{ item.address.substr(-4) }}</span>
            <el-tag v-if="!item.gas_sufficient" type="danger" size="small" effect="dark" style="border-radius: 5px; padding: 0 6px; margin-left: auto;">⚠ 不足</el-tag>
          </div>
          <!-- 余额数值 -->
          <div class="gas-card-body">
            <div class="gas-metric">
              <div class="gas-metric-label">USDT</div>
              <div class="gas-metric-value">{{ item.usdt_balance }}</div>
            </div>
            <div class="gas-divider"></div>
            <div class="gas-metric">
              <div class="gas-metric-label">{{ item.gas_token }}</div>
              <div class="gas-metric-value" :style="{ color: item.gas_sufficient ? '#67C23A' : '#F56C6C' }">
                {{ parseFloat(item.gas_balance).toFixed(2) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- ===== 最近记录 ===== -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header-row">
              <div class="section-title">
                <span class="title-dot blue"></span>
                最近充币
              </div>
              <el-tag size="small" effect="plain" type="info" style="border-radius: 6px;">最近 10 笔</el-tag>
            </div>
          </template>
          <el-table :data="data.recent_deposits || []" size="small" max-height="340" :show-header="true" style="border-radius: 8px; overflow: hidden;">
            <el-table-column prop="order_no" label="订单号" width="170" show-overflow-tooltip />
            <el-table-column prop="chain_type" label="链" width="70">
              <template #default="{ row }">
                <el-tag :type="row.chain_type === 'trc20' ? 'primary' : 'success'" size="small" effect="light">{{ row.chain_type?.toUpperCase() }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="90">
              <template #default="{ row }"><b>{{ row.amount }}</b></template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="76">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'warning'" size="small" effect="dark">
                  {{ row.status === 1 ? '成功' : row.status === 2 ? '失败' : '待确认' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="create_time" label="时间" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header-row">
              <div class="section-title">
                <span class="title-dot red"></span>
                最近提币
              </div>
              <el-tag size="small" effect="plain" type="info" style="border-radius: 6px;">最近 10 笔</el-tag>
            </div>
          </template>
          <el-table :data="data.recent_withdraws || []" size="small" max-height="340" style="border-radius: 8px; overflow: hidden;">
            <el-table-column prop="order_no" label="订单号" width="170" show-overflow-tooltip />
            <el-table-column prop="chain_type" label="链" width="70">
              <template #default="{ row }">
                <el-tag :type="row.chain_type === 'trc20' ? 'primary' : 'success'" size="small" effect="light">{{ row.chain_type?.toUpperCase() }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="90">
              <template #default="{ row }"><b>{{ row.amount }}</b></template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="76">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'warning'" size="small" effect="dark">
                  {{ row.status === 1 ? '成功' : row.status === 2 ? '失败' : '处理中' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="create_time" label="时间" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, Upload, Stamp, OfficeBuilding } from '@element-plus/icons-vue';
import request from '../utils/request';

const data = ref({});
const collecting = ref(false);
const gasBalances = ref([]);
const gasLoading = ref(false);
const username = ref(localStorage.getItem('username') || 'admin');

const todayStr = computed(() => {
  const now = new Date();
  const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${days[now.getDay()]}`;
});

const statCards = computed(() => [
  {
    label: '今日充币', value: data.value.deposit_today || '0.00', unit: 'USDT',
    icon: Download,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  {
    label: '今日提币', value: data.value.withdraw_today || '0.00', unit: 'USDT',
    icon: Upload,
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  {
    label: '待审核订单', value: data.value.pending_audit_count || 0, unit: '笔',
    icon: Stamp,
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  {
    label: '活跃商户', value: data.value.merchant_count || 0, unit: '个',
    icon: OfficeBuilding,
    gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
]);

const loadDashboard = async () => {
  try {
    const res = await request.get('/dashboard');
    if (res.code === 0) data.value = res.data;
  } catch (e) { /* ignore */ }
};

const loadGasBalance = async () => {
  gasLoading.value = true;
  try {
    const res = await request.get('/address/gas-balance');
    if (res.code === 0) gasBalances.value = res.data;
  } catch (e) { /* ignore */ }
  finally { gasLoading.value = false; }
};

const manualCollect = async (chainType) => {
  collecting.value = true;
  try {
    const res = await request.post('/collection/manual', { chain_type: chainType });
    ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  } finally { collecting.value = false; }
};

let timer = null;
onMounted(() => {
  loadDashboard();
  loadGasBalance();
  timer = setInterval(() => { loadDashboard(); loadGasBalance(); }, 30000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
/* 欢迎横幅 */
.welcome-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #1a1d2e 0%, #2d3561 100%);
  border-radius: 16px;
  padding: 24px 32px;
  margin-bottom: 24px;
  box-shadow: 0 4px 20px rgba(26,29,46,0.2);
}
.welcome-text h2 { color: #fff; font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.welcome-text p { color: rgba(255,255,255,0.5); font-size: 14px; }
.banner-actions { display: flex; gap: 10px; }

/* 统计卡片 */
.stat-card {
  border-radius: 16px;
  padding: 20px 22px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: default;
}
.stat-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(0,0,0,0.18); }
.stat-icon-wrap {
  width: 52px; height: 52px;
  min-width: 52px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
}
.stat-info { overflow: hidden; }
.stat-label { font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 2px; white-space: nowrap; }
.stat-value { font-size: 26px; font-weight: 800; color: #fff; line-height: 1.1; }
.stat-unit { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 2px; }

/* 通用卡片 */
.section-card { border-radius: 14px; border: 1px solid #eef0f5; }
:deep(.section-card .el-card__header) { padding: 14px 20px; border-bottom: 1px solid #f5f7fa; }
:deep(.section-card .el-card__body) { padding: 16px 20px; }

.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.section-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; color: #1a1a2e; }
.title-dot {
  width: 4px; height: 16px;
  background: linear-gradient(to bottom, #409EFF, #67c23a);
  border-radius: 2px;
}
.title-dot.blue { background: linear-gradient(to bottom, #409EFF, #00c6ff); }
.title-dot.red { background: linear-gradient(to bottom, #f5576c, #f093fb); }

/* Gas 卡片 */
.gas-card {
  flex: 0 0 auto;
  width: 220px;
  border-radius: 10px;
  padding: 10px 14px;
  border: 1px solid transparent;
  transition: box-shadow 0.2s, transform 0.2s;
}
.gas-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.08); transform: translateY(-1px); }
.gas-ok {
  background: linear-gradient(135deg, #f0f9eb 0%, #e8f8f0 100%);
  border-color: #c2e7d0;
}
.gas-warn {
  background: linear-gradient(135deg, #fff5f5 0%, #fde8e8 100%);
  border-color: #f5c6c6;
}
.gas-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.gas-address { font-size: 11px; color: #909399; font-family: monospace; }
.gas-card-body { display: flex; align-items: center; gap: 16px; }
.gas-metric { display: flex; flex-direction: column; }
.gas-metric-label { font-size: 10px; color: #909399; margin-bottom: 1px; text-transform: uppercase; letter-spacing: 0.5px; }
.gas-metric-value { font-size: 17px; font-weight: 700; color: #1a1a2e; }
.gas-divider { width: 1px; height: 28px; background: rgba(0,0,0,0.08); }
</style>
