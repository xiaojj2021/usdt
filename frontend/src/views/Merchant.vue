<template>
  <div>
    <el-card shadow="hover">
      <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
        <div style="display: flex; gap: 12px;">
          <el-input v-model="filters.merchant_name" placeholder="商户名称" clearable style="width: 200px;" @clear="loadData" />
          <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px;" @change="loadData">
            <el-option label="启用" :value="1" /><el-option label="禁用" :value="0" />
          </el-select>
          <el-button type="primary" @click="loadData">查询</el-button>
        </div>
        <el-button type="primary" @click="showDialog()">新增商户</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="merchant_name" label="商户名称" min-width="120" />
        <el-table-column prop="api_key" label="API Key" min-width="200" show-overflow-tooltip />
        <el-table-column prop="callback_url" label="回调地址" min-width="200" show-overflow-tooltip />
        <el-table-column prop="ip_whitelist" label="IP白名单" min-width="140" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="170" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="showDialog(row)">编辑</el-button>
            <el-button size="small" type="warning" @click="resetKeys(row.id)">重置密钥</el-button>
            <el-button size="small" :type="row.status === 1 ? 'danger' : 'success'" @click="toggleStatus(row)">{{ row.status === 1 ? '禁用' : '启用' }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editForm.id ? '编辑商户' : '新增商户'" width="500px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="商户名称"><el-input v-model="editForm.merchant_name" /></el-form-item>
        <el-form-item label="回调地址"><el-input v-model="editForm.callback_url" /></el-form-item>
        <el-form-item label="IP白名单"><el-input v-model="editForm.ip_whitelist" placeholder="多个用逗号分隔，* 表示全部" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '../utils/request';

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filters = ref({ merchant_name: '', status: '' });
const dialogVisible = ref(false);
const submitting = ref(false);
const editForm = ref({ merchant_name: '', callback_url: '', ip_whitelist: '' });

const loadData = async () => {
  loading.value = true;
  try {
    const res = await request.get('/merchant/list', { params: { page: page.value, page_size: pageSize.value, ...filters.value } });
    if (res.code === 0) { list.value = res.data.list; total.value = res.data.pagination.total; }
  } finally { loading.value = false; }
};

const showDialog = (row) => {
  editForm.value = row ? { ...row } : { merchant_name: '', callback_url: '', ip_whitelist: '' };
  dialogVisible.value = true;
};

const handleSubmit = async () => {
  submitting.value = true;
  try {
    const url = editForm.value.id ? '/merchant/update' : '/merchant/create';
    const res = await request.post(url, editForm.value);
    if (res.code === 0) {
      ElMessage.success(res.msg);
      dialogVisible.value = false;
      if (!editForm.value.id && res.data) {
        ElMessageBox.alert(`API Key: ${res.data.api_key}\nAPI Secret: ${res.data.api_secret}`, '商户密钥（请妥善保管）', { confirmButtonText: '已复制' });
      }
      loadData();
    } else { ElMessage.error(res.msg); }
  } finally { submitting.value = false; }
};

const resetKeys = async (id) => {
  await ElMessageBox.confirm('重置后旧密钥立即失效，确定重置？', '提示', { type: 'warning' });
  const res = await request.post('/merchant/reset-keys', { id });
  if (res.code === 0) {
    ElMessageBox.alert(`API Key: ${res.data.api_key}\nAPI Secret: ${res.data.api_secret}`, '新密钥（请妥善保管）', { confirmButtonText: '已复制' });
  }
};

const toggleStatus = async (row) => {
  const url = row.status === 1 ? '/merchant/disable' : '/merchant/enable';
  await request.post(url, { id: row.id });
  ElMessage.success('操作成功');
  loadData();
};

onMounted(loadData);
</script>
