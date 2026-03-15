<template>
  <div>
    <el-card shadow="hover">
      <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
        <div style="display: flex; gap: 12px;">
          <el-select v-model="filters.chain_type" placeholder="链类型" clearable style="width: 120px;" @change="loadData">
            <el-option label="TRC20" value="trc20" /><el-option label="BSC" value="bsc" />
          </el-select>
          <el-input v-model="filters.merchant_id" placeholder="商户ID" clearable style="width: 120px;" />
          <el-input v-model="filters.address" placeholder="地址" clearable style="width: 240px;" />
          <el-button type="primary" @click="loadData">查询</el-button>
          <el-button @click="refreshAll" :loading="refreshing">刷新全部余额</el-button>
        </div>
        <el-button type="primary" @click="genVisible = true">生成地址</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="address" label="地址" min-width="300" show-overflow-tooltip />
        <el-table-column prop="chain_type" label="链" width="80">
          <template #default="{ row }">
            <el-tag :type="row.chain_type === 'trc20' ? 'primary' : 'success'" size="small">{{ row.chain_type?.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="merchant_id" label="商户ID" width="80" />
        <el-table-column prop="user_id" label="用户ID" width="100" />
        <el-table-column prop="balance" label="余额(USDT)" width="120" />
        <el-table-column prop="is_main" label="主地址" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.is_main === 1" type="success" size="small">主地址</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">{{ row.status === 1 ? '正常' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="170" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="setMainAddr(row.id)" v-if="row.is_main !== 1">设为主地址</el-button>
            <el-button size="small" type="warning" @click="cancelMainAddr(row.id)" v-if="row.is_main === 1">取消主地址</el-button>
            <el-button size="small" type="danger" @click="disableAddr(row.id)" v-if="row.status===1">禁用</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="genVisible" title="生成地址" width="450px">
      <el-form :model="genForm" label-width="120px">
        <el-form-item label="链类型">
          <el-select v-model="genForm.chain_type" style="width: 100%;">
            <el-option label="TRC20" value="trc20" /><el-option label="BSC" value="bsc" />
          </el-select>
        </el-form-item>
        <el-form-item label="商户ID"><el-input-number v-model="genForm.merchant_id" :min="1" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="genForm.count" :min="1" :max="100" /></el-form-item>
        <el-form-item label="设为主地址">
          <el-checkbox v-model="genForm.set_as_main">生成时设为主地址（归集目标）</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genVisible = false">取消</el-button>
        <el-button type="primary" :loading="genLoading" @click="handleGenerate">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../utils/request';

const list = ref([]);
const loading = ref(false);
const refreshing = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filters = ref({ chain_type: '', merchant_id: '', address: '' });
const genVisible = ref(false);
const genLoading = ref(false);
const genForm = ref({ chain_type: 'trc20', merchant_id: 1, count: 1, set_as_main: false });

const loadData = async (showLoading = true, refresh = false) => {
  if (showLoading) loading.value = true;
  try {
    const params = { page: page.value, page_size: pageSize.value, ...filters.value };
    if (refresh) params.refresh = '1';
    const res = await request.get('/address/list', { params });
    if (res.code === 0) { list.value = res.data.list; total.value = res.data.pagination.total; }
  } finally { if (showLoading) loading.value = false; }
};

const refreshAll = async () => {
  refreshing.value = true;
  try {
    await loadData(false, true);
    ElMessage.success('余额已刷新');
  } finally { refreshing.value = false; }
};

const handleGenerate = async () => {
  genLoading.value = true;
  try {
    const url = genForm.value.count > 1 ? '/address/batch-generate' : '/address/generate';
    const payload = { ...genForm.value };
    if (url === '/address/batch-generate') {
      payload.set_first_as_main = payload.set_as_main;
      delete payload.set_as_main;
    } else {
      payload.set_as_main = payload.set_as_main;
    }
    const res = await request.post(url, payload);
    if (res.code === 0) { ElMessage.success(res.msg); genVisible.value = false; loadData(); }
    else ElMessage.error(res.msg);
  } finally { genLoading.value = false; }
};

const setMainAddr = async (id) => {
  const res = await request.post('/address/set-main', { id });
  ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  loadData();
};

const cancelMainAddr = async (id) => {
  const res = await request.post('/address/cancel-main', { id });
  ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  loadData();
};

const disableAddr = async (id) => {
  await request.post('/address/disable', { id });
  ElMessage.success('已禁用');
  loadData();
};

let timer = null;
onMounted(() => {
  loadData(true, true);
  timer = setInterval(() => loadData(false, true), 30000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
