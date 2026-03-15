<template>
  <div>
    <el-card shadow="hover" class="page-card">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; font-size: 16px;">充币订单</span>
          <div style="display: flex; gap: 8px;">
            <el-button type="warning" size="small" @click="doRescan" :loading="rescanLoading">手动补扫</el-button>
            <el-button type="danger" size="small" :disabled="!selectedIds.length" @click="batchDelete">
              批量删除 ({{ selectedIds.length }})
            </el-button>
          </div>
        </div>
      </template>

      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
        <el-input v-model="filters.order_no" placeholder="订单号" clearable style="width: 200px;" />
        <el-input v-model="filters.address" placeholder="地址" clearable style="width: 240px;" />
        <el-select v-model="filters.chain_type" placeholder="链类型" clearable style="width: 120px;">
          <el-option label="TRC20" value="trc20" /><el-option label="BSC" value="bsc" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px;">
          <el-option label="待确认" :value="0" /><el-option label="成功" :value="1" /><el-option label="失败" :value="2" />
        </el-select>
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe @selection-change="onSelectionChange" row-key="id">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="order_no" label="订单号" width="200" show-overflow-tooltip />
        <el-table-column prop="address" label="收款地址" min-width="260" show-overflow-tooltip />
        <el-table-column prop="chain_type" label="链" width="80">
          <template #default="{ row }">
            <el-tag :type="row.chain_type === 'trc20' ? 'primary' : 'success'" size="small" effect="light">{{ row.chain_type?.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            <span style="font-weight: 600;">{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="txid" label="TXID" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.txid" :href="getExplorerUrl(row)" target="_blank" style="color: #409EFF; text-decoration: none;">{{ row.txid?.substr(0, 16) }}...</a>
            <span v-else style="color: #c0c4cc;">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="confirmations" label="确认数" width="80" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'warning'" size="small" effect="dark">
              {{ row.status === 1 ? '成功' : row.status === 2 ? '失败' : '待确认' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="callback_status" label="回调" width="90">
          <template #default="{ row }">
            <el-tag :type="row.callback_status === 1 ? 'success' : row.callback_status === 2 ? 'danger' : 'info'" size="small">
              {{ row.callback_status === 1 ? '已回调' : row.callback_status === 2 ? '失败' : '未回调' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="时间" width="165" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="warning" @click="resendCallback(row.order_no)" :disabled="row.callback_status === 1">重发回调</el-button>
            <el-button size="small" type="success" @click="markCallbackSuccess(row.order_no)" :disabled="row.callback_status === 1">标记成功</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 13px; color: #909399;">已选 {{ selectedIds.length }} 项</span>
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '../utils/request';

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filters = ref({ order_no: '', address: '', chain_type: '', status: '' });
const rescanLoading = ref(false);
const selectedIds = ref([]);

const onSelectionChange = (rows) => { selectedIds.value = rows.map(r => r.id); };

const loadData = async (showLoading = true) => {
  if (showLoading) loading.value = true;
  try {
    const res = await request.get('/deposit/list', { params: { page: page.value, page_size: pageSize.value, ...filters.value } });
    if (res.code === 0) { list.value = res.data.list; total.value = res.data.pagination.total; }
  } finally { if (showLoading) loading.value = false; }
};

const getExplorerUrl = (row) => {
  if (row.chain_type === 'trc20') return `https://tronscan.org/#/transaction/${row.txid}`;
  return `https://bscscan.com/tx/${row.txid}`;
};

const resendCallback = async (orderNo) => {
  const res = await request.post('/deposit/resend-callback', { order_no: orderNo });
  ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  loadData();
};

const markCallbackSuccess = async (orderNo) => {
  const res = await request.post('/deposit/mark-callback-success', { order_no: orderNo });
  ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  loadData();
};

const doRescan = async () => {
  rescanLoading.value = true;
  try {
    const res = await request.post('/deposit/rescan');
    ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
    loadData();
  } finally { rescanLoading.value = false; }
};

const batchDelete = async () => {
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 笔充币订单？`, '批量删除', { type: 'warning' });
    const res = await request.post('/deposit/batch-delete', { ids: selectedIds.value });
    ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
    loadData();
  } catch (e) { /* cancelled */ }
};

let timer = null;
onMounted(() => {
  loadData();
  timer = setInterval(() => loadData(false), 10000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
