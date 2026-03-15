<template>
  <div>
    <el-card shadow="hover" class="page-card">
      <template #header>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-weight: bold; font-size: 16px;">内部转账</span>
          <el-tag effect="plain" size="small" style="margin-left: auto;">{{ activeTab === 'single' ? '单笔模式' : '批量模式' }}</el-tag>
        </div>
      </template>

      <el-tabs v-model="activeTab" type="border-card" @tab-click="loadAddresses">
        <!-- ===== 单笔转账 ===== -->
        <el-tab-pane label="单笔转账" name="single">
          <div style="max-width: 600px; margin: 24px auto 0;">
            <el-form :model="form" label-width="100px" label-position="right">
              <el-form-item label="转出地址">
                <el-select v-model="form.from_address" filterable placeholder="选择平台内地址" style="width: 100%;" @focus="loadAddresses" @change="refreshBalance(form.from_address)">
                  <el-option v-for="a in addressList" :key="a.address" :label="a.address" :value="a.address">
                    <div style="display: flex; justify-content: space-between; width: 100%;">
                      <span style="font-family: monospace; font-size: 13px;">{{ a.address.substr(0,10) }}...{{ a.address.substr(-6) }}</span>
                      <span style="color: #67C23A; font-weight: 600;">{{ a.balance }} USDT</span>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="可用余额" v-if="form.from_address">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 22px; font-weight: bold; color: #67C23A;">{{ selectedBalance }} USDT</span>
                  <el-button link type="primary" @click="refreshBalance(form.from_address)">刷新</el-button>
                  <el-tag v-if="selectedChain" :type="selectedChain === 'trc20' ? 'primary' : 'success'" size="small" effect="plain">{{ selectedChain?.toUpperCase() }}</el-tag>
                </div>
              </el-form-item>

              <el-form-item label="目标地址">
                <el-input v-model="form.to_address" placeholder="粘贴 TRC20 或 BSC 收款地址" />
              </el-form-item>

              <el-form-item label="金额">
                <el-input-number v-model="form.amount" :min="0.01" :max="selectedBalance" :precision="6" style="width: 100%;" />
                <span style="font-size: 12px; color: #909399; margin-top: 4px; display: block;">最大可转 {{ selectedBalance }} USDT</span>
              </el-form-item>

              <el-form-item>
                <el-button type="primary" :loading="loading" @click="handleTransfer" style="width: 100%; height: 42px; font-size: 15px;">
                  执行转账
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- ===== 批量转账 ===== -->
        <el-tab-pane label="批量转账" name="batch">
          <div style="margin: 20px 0;">
            <el-form label-width="100px" label-position="right">
              <el-form-item label="转出地址">
                <el-select v-model="batchForm.from_address" filterable placeholder="选择转出地址" style="width: 420px;" @focus="loadAddresses" @change="refreshBatchBalance">
                  <el-option v-for="a in addressList" :key="a.address" :value="a.address">
                    <div style="display: flex; justify-content: space-between; width: 100%;">
                      <span style="font-family: monospace; font-size: 13px;">{{ a.address.substr(0,10) }}...{{ a.address.substr(-6) }}</span>
                      <span style="color: #67C23A; font-weight: 600;">{{ a.balance }} USDT</span>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="可用余额" v-if="batchForm.from_address">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 22px; font-weight: bold; color: #67C23A;">{{ batchBalance }} USDT</span>
                  <el-button link type="primary" @click="refreshBatchBalance">刷新</el-button>
                </div>
              </el-form-item>
            </el-form>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <span style="font-size: 14px; font-weight: 600; color: #303133;">转账列表</span>
              <el-button type="primary" size="small" plain @click="addBatchRow">+ 添加一笔</el-button>
            </div>

            <el-table :data="batchRows" border size="small" max-height="340" style="border-radius: 8px;">
              <el-table-column label="序号" width="60" type="index" />
              <el-table-column label="目标地址" min-width="300">
                <template #default="{ row }">
                  <el-input v-model="row.to_address" placeholder="收款地址" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="金额(USDT)" width="150">
                <template #default="{ row }">
                  <el-input-number v-model="row.amount" :min="0.01" :precision="6" size="small" style="width: 130px;" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="70" fixed="right">
                <template #default="{ $index }">
                  <el-button type="danger" link size="small" @click="removeBatchRow($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>

            <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f5f7fa; border-radius: 8px;">
              <div>
                <span style="color: #606266; font-weight: 600;">合计: {{ batchTotalAmount.toFixed(6) }} USDT</span>
                <span style="margin-left: 16px; color: #909399;">共 {{ batchRows.length }} 笔</span>
                <el-tag v-if="batchForm.from_address && batchTotalAmount > batchBalance" type="danger" size="small" style="margin-left: 12px;">余额不足</el-tag>
              </div>
              <el-button type="primary" :loading="loading" :disabled="!canBatchSubmit" @click="handleBatchTransfer" style="height: 38px; padding: 0 32px;">
                执行批量转账 ({{ batchRows.length }} 笔)
              </el-button>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../utils/request';

const activeTab = ref('single');
const form = ref({ from_address: '', to_address: '', amount: 0.01 });
const batchForm = ref({ from_address: '' });
const batchRows = ref([{ to_address: '', amount: 0.01 }]);
const addressList = ref([]);
const loading = ref(false);

const selectedAddr = computed(() => addressList.value.find(x => x.address === form.value.from_address));
const selectedChain = computed(() => selectedAddr.value?.chain_type || '');
const selectedBalance = computed(() => selectedAddr.value?.balance ?? '0');

const batchAddr = computed(() => addressList.value.find(x => x.address === batchForm.value.from_address));
const batchBalance = computed(() => parseFloat(batchAddr.value?.balance || 0));
const batchTotalAmount = computed(() => batchRows.value.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0));
const canBatchSubmit = computed(() =>
  batchForm.value.from_address &&
  batchRows.value.length > 0 &&
  batchRows.value.every(r => r.to_address && r.amount >= 0.01) &&
  batchTotalAmount.value <= batchBalance.value
);

const loadAddresses = async () => {
  try {
    const res = await request.get('/address/list', { params: { page_size: 500, refresh: '1' } });
    if (res.code === 0) addressList.value = (res.data.list || []).filter(x => x.status === 1);
  } catch (e) { /* ignore */ }
};

const refreshBalance = async (addr) => {
  if (!addr) return;
  try {
    const res = await request.get('/address/balance', { params: { address: addr } });
    if (res.code === 0) {
      const a = addressList.value.find(x => x.address === addr);
      if (a) a.balance = res.data.balance;
    }
  } catch (e) { /* ignore */ }
};

const refreshBatchBalance = () => refreshBalance(batchForm.value.from_address);
const addBatchRow = () => batchRows.value.push({ to_address: '', amount: 0.01 });
const removeBatchRow = (i) => batchRows.value.splice(i, 1);

const handleTransfer = async () => {
  if (!form.value.from_address || !form.value.to_address || !form.value.amount) {
    ElMessage.warning('请填写完整信息'); return;
  }
  if (form.value.amount < 0.01) { ElMessage.warning('金额至少 0.01 USDT'); return; }
  loading.value = true;
  try {
    const res = await request.post('/transfer/execute', form.value);
    if (res.code === 0) {
      ElMessage.success(`转账成功，TXID: ${res.data.txid}`);
      form.value = { from_address: '', to_address: '', amount: 0.01 };
      loadAddresses();
    } else { ElMessage.error(res.msg); }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '转账失败'); }
  finally { loading.value = false; }
};

const handleBatchTransfer = async () => {
  if (!canBatchSubmit.value) return;
  loading.value = true;
  try {
    const items = batchRows.value.map(r => ({ from_address: batchForm.value.from_address, to_address: r.to_address, amount: r.amount }));
    const res = await request.post('/transfer/batch-execute', { items });
    if (res.code === 0) {
      ElMessage.success(res.msg);
      batchRows.value = [{ to_address: '', amount: 0.01 }];
      loadAddresses();
      refreshBatchBalance();
    } else { ElMessage.error(res.msg); }
  } catch (e) { ElMessage.error(e.response?.data?.msg || '批量转账失败'); }
  finally { loading.value = false; }
};
</script>
