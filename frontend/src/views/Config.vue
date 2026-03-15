<template>
  <div>
    <!-- 审核 & 风控 -->
    <el-row :gutter="20" style="margin-bottom: 20px;">
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">审核模式设置</span>
              <el-tag size="small" effect="plain">安全</el-tag>
            </div>
          </template>
          <el-form label-width="130px" label-position="right">
            <el-form-item label="提币审核">
              <el-radio-group v-model="configs.withdraw_audit_mode">
                <el-radio-button label="auto">自动</el-radio-button>
                <el-radio-button label="manual">人工审核</el-radio-button>
                <el-radio-button label="threshold">按阈值</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="审核阈值">
              <div style="display: flex; align-items: center; gap: 8px;">
                <el-input-number v-model.number="configs.withdraw_audit_threshold" :min="0" :step="10" style="width: 150px;" />
                <span style="color:#909399; font-size: 12px;">USDT 以下自动，以上人工（按阈值模式生效）</span>
              </div>
            </el-form-item>
            <el-form-item label="转账审核">
              <el-radio-group v-model="configs.transfer_audit_mode">
                <el-radio-button value="auto">自动</el-radio-button>
                <el-radio-button value="manual">人工审核</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="归集审核">
              <el-radio-group v-model="configs.collection_audit_mode">
                <el-radio-button value="auto">自动</el-radio-button>
                <el-radio-button value="manual">人工审核</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">风控配置</span>
              <el-tag size="small" type="danger" effect="plain">限额</el-tag>
            </div>
          </template>
          <el-form label-width="130px" label-position="right">
            <el-form-item label="单笔提币限额">
              <div style="display: flex; align-items: center; gap: 8px;">
                <el-input v-model="configs.withdraw_max_amount" style="width: 180px;" />
                <span style="color:#909399; font-size: 13px;">USDT</span>
              </div>
            </el-form-item>
            <el-form-item label="每日提币限额">
              <div style="display: flex; align-items: center; gap: 8px;">
                <el-input v-model="configs.withdraw_daily_limit" style="width: 180px;" />
                <span style="color:#909399; font-size: 13px;">USDT</span>
              </div>
            </el-form-item>
            <el-form-item label="手续费承担方">
              <el-radio-group v-model="configs.fee_payer">
                <el-radio-button value="platform">平台</el-radio-button>
                <el-radio-button value="merchant">商户</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- RPC & 归集 -->
    <el-row :gutter="20" style="margin-bottom: 20px;">
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">RPC 节点配置</span>
              <el-tag size="small" type="success" effect="plain">链</el-tag>
            </div>
          </template>
          <el-form label-width="140px" label-position="right">
            <el-form-item label="TRC20 主节点"><el-input v-model="configs.trc20_rpc_url" placeholder="https://api.trongrid.io" /></el-form-item>
            <el-form-item label="TRC20 备用"><el-input v-model="configs.trc20_backup_rpc_url" placeholder="备用节点 URL" /></el-form-item>
            <el-divider style="margin: 12px 0;" />
            <el-form-item label="BSC 主节点"><el-input v-model="configs.bsc_rpc_url" placeholder="https://bsc-dataseed.binance.org" /></el-form-item>
            <el-form-item label="BSC 备用"><el-input v-model="configs.bsc_backup_rpc_url" placeholder="备用节点 URL" /></el-form-item>
          </el-form>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">归集配置</span>
              <el-tag size="small" type="warning" effect="plain">自动</el-tag>
            </div>
          </template>
          <el-form label-width="130px" label-position="right">
            <el-form-item label="归集阈值">
              <div style="display: flex; align-items: center; gap: 8px;">
                <el-input v-model="configs.collection_threshold" style="width: 180px;" />
                <span style="color:#909399; font-size: 13px;">USDT</span>
              </div>
            </el-form-item>
            <el-form-item label="TRC20 主地址"><el-input v-model="configs.collection_main_address_trc20" placeholder="未设主地址时使用" /></el-form-item>
            <el-form-item label="BSC 主地址"><el-input v-model="configs.collection_main_address_bsc" placeholder="未设主地址时使用" /></el-form-item>
            <el-form-item label="定时策略"><el-input v-model="configs.collection_cron" placeholder="CRON 表达式，如 */10 * * * *" /></el-form-item>
            <el-form-item label="手动归集">
              <div style="display: flex; gap: 8px;">
                <el-button type="primary" :loading="collecting" @click="manualCollect('trc20')">TRC20 归集</el-button>
                <el-button type="success" :loading="collecting" @click="manualCollect('bsc')">BSC 归集</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- 区块确认 & 黑名单 -->
    <el-row :gutter="20" style="margin-bottom: 20px;">
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">区块确认 & 扫描</span>
              <el-tag size="small" type="info" effect="plain">参数</el-tag>
            </div>
          </template>
          <el-form label-width="150px" label-position="right">
            <el-form-item label="TRC20 确认区块数"><el-input-number v-model.number="configs.trc20_confirm_blocks" :min="1" style="width: 160px;" /></el-form-item>
            <el-form-item label="BSC 确认区块数"><el-input-number v-model.number="configs.bsc_confirm_blocks" :min="1" style="width: 160px;" /></el-form-item>
            <el-form-item label="充币扫描间隔">
              <div style="display: flex; align-items: center; gap: 8px;">
                <el-input-number v-model.number="configs.deposit_scan_interval" :min="1000" :step="1000" style="width: 160px;" />
                <span style="color:#909399; font-size: 12px;">ms</span>
              </div>
            </el-form-item>
            <el-form-item label="回调最大重试"><el-input-number v-model.number="configs.callback_max_retry" :min="0" style="width: 160px;" /></el-form-item>
          </el-form>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">黑名单地址</span>
              <el-tag size="small" type="danger" effect="plain">安全</el-tag>
            </div>
          </template>
          <el-input v-model="configs.blacklist_addresses" type="textarea" :rows="8" placeholder='JSON 数组格式，如：["addr1", "addr2"]' style="font-family: monospace;" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 能量租赁 -->
    <el-row :gutter="20" style="margin-bottom: 20px;">
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">TRC20 能量租赁</span>
              <el-tag size="small" type="warning" effect="plain">feee.io</el-tag>
            </div>
          </template>
          <el-form label-width="130px" label-position="right">
            <el-form-item label="启用租赁">
              <el-switch v-model="feeeEnabled" active-text="开" inactive-text="关" />
            </el-form-item>
            <el-form-item label="API Key"><el-input v-model="configs.feee_api_key" placeholder="feee.io API Key" show-password /></el-form-item>
            <el-form-item label="User-Agent"><el-input v-model="configs.feee_user_agent" placeholder="feee.io 白名单 User-Agent" /></el-form-item>
            <el-form-item label="平台余额">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span v-if="energyBalance !== null" style="font-size: 20px; font-weight: bold; color: #67C23A;">{{ energyBalance.balance }} TRX</span>
                <span v-else style="color: #909399;">未查询</span>
                <el-button size="small" type="primary" plain @click="loadEnergyBalance" :loading="energyLoading">查询</el-button>
              </div>
            </el-form-item>
            <el-form-item label="充值地址" v-if="energyBalance">
              <el-input :model-value="energyBalance.rechargeAddress" readonly>
                <template #append><el-button @click="copyText(energyBalance.rechargeAddress)">复制</el-button></template>
              </el-input>
              <div style="font-size: 12px; color: #909399; margin-top: 4px;">往此地址转 TRX 即可充值 feee.io 平台余额</div>
            </el-form-item>
            <el-form-item label="今日消耗" v-if="energyBalance">
              <span style="color: #E6A23C; font-weight: 600;">{{ energyBalance.todayCost }} TRX</span>
              <span style="margin-left: 12px; color: #909399;">{{ energyBalance.todayEnergy }} 能量</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">能量租赁说明</span>
              <el-tag size="small" effect="plain">帮助</el-tag>
            </div>
          </template>
          <div style="line-height: 2.2; color: #606266; font-size: 13px; padding: 4px 0;">
            <p>启用后，TRC20 归集和提币前会自动为转出地址租赁能量，<b style="color: #67C23A;">子地址不再需要 TRX</b>。</p>
            <p>费用：约 <b style="color: #E6A23C;">2-3 TRX/笔</b>，从 feee.io 平台余额扣除。</p>
            <el-divider style="margin: 8px 0;" />
            <p style="font-weight: 600; color: #303133;">使用步骤：</p>
            <ol style="padding-left: 20px; margin: 4px 0;">
              <li>在 <a href="https://feee.io/console/api-key" target="_blank" style="color: #409EFF; text-decoration: none;">feee.io</a> 注册并创建 API Key</li>
              <li>设置 User-Agent 白名单</li>
              <li>填入左侧 API Key 和 User-Agent 并保存</li>
              <li>点击"查询"获取充值地址，转入 TRX</li>
              <li>完成！归集/提币会自动租赁能量</li>
            </ol>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 保存按钮 -->
    <div style="text-align: center; margin-bottom: 20px;">
      <el-button type="primary" size="large" :loading="saving" @click="handleSave" style="width: 240px; height: 46px; font-size: 16px; border-radius: 8px;">
        保存全部配置
      </el-button>
    </div>

    <!-- 归集日志 -->
    <el-card shadow="hover" class="config-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">归集实时日志</span>
          <span style="font-size: 12px; color: #909399;">每 10 秒自动刷新</span>
        </div>
      </template>
      <div ref="logContainer" style="max-height: 360px; overflow-y: auto; background: #1a1a2e; border-radius: 8px; padding: 16px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 12px; line-height: 1.9;">
        <div v-if="!collectionLogs.length" style="color: #6a9955; text-align: center; padding: 20px;">暂无归集日志</div>
        <div v-for="(line, idx) in collectionLogs" :key="idx" :style="{ color: getLogColor(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }">
          {{ line }}
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../utils/request';

const configs = ref({});
const saving = ref(false);
const collecting = ref(false);
const collectionLogs = ref([]);
const logContainer = ref(null);
const energyBalance = ref(null);
const energyLoading = ref(false);

const feeeEnabled = computed({
  get: () => configs.value.feee_energy_enabled === '1',
  set: (val) => { configs.value.feee_energy_enabled = val ? '1' : '0'; }
});

const loadData = async () => {
  const res = await request.get('/config/list');
  if (res.code === 0) {
    const map = {};
    for (const item of res.data) map[item.config_key] = item.config_value;
    if (map.withdraw_audit_threshold === undefined) map.withdraw_audit_threshold = '100';
    configs.value = map;
  }
};

const handleSave = async () => {
  saving.value = true;
  try {
    const items = Object.entries(configs.value).map(([key, value]) => ({ key, value: String(value) }));
    const res = await request.post('/config/update', { configs: items });
    ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  } finally { saving.value = false; }
};

const manualCollect = async (chainType) => {
  collecting.value = true;
  try {
    const res = await request.post('/collection/manual', { chain_type: chainType });
    ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
    loadCollectionLogs();
  } finally { collecting.value = false; }
};

const loadCollectionLogs = async () => {
  try {
    const res = await request.get('/collection/logs');
    if (res.code === 0) {
      collectionLogs.value = res.data;
      nextTick(() => { if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight; });
    }
  } catch (e) { /* ignore */ }
};

const loadEnergyBalance = async () => {
  energyLoading.value = true;
  try {
    const res = await request.get('/energy/balance');
    if (res.code === 0) energyBalance.value = res.data;
    else ElMessage.error(res.msg);
  } catch (e) { ElMessage.error('查询失败，请检查 API Key 配置'); }
  finally { energyLoading.value = false; }
};

const copyText = (text) => {
  navigator.clipboard.writeText(text);
  ElMessage.success('已复制');
};

const getLogColor = (line) => {
  if (line.includes('error') || line.includes('失败') || line.includes('Error')) return '#f14c4c';
  if (line.includes('warn') || line.includes('跳过') || line.includes('不足')) return '#cca700';
  if (line.includes('成功') || line.includes('完成')) return '#6a9955';
  return '#d4d4d4';
};

let timer = null;
onMounted(() => {
  loadData();
  loadCollectionLogs();
  timer = setInterval(loadCollectionLogs, 10000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.config-card { border-radius: 12px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: bold; font-size: 15px; }
</style>
