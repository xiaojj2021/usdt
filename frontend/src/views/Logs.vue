<template>
  <div>
    <el-card shadow="hover">
      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <el-select v-model="filters.log_type" placeholder="日志类型" clearable style="width: 120px;" @change="loadData">
          <el-option label="API日志" value="api" />
          <el-option label="操作日志" value="operate" />
          <el-option label="链上日志" value="chain" />
          <el-option label="异常日志" value="error" />
        </el-select>
        <el-input v-model="filters.module" placeholder="模块" clearable style="width: 140px;" />
        <el-input v-model="filters.operator" placeholder="操作人" clearable style="width: 120px;" />
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="log_type" label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="{ api: 'primary', operate: 'success', chain: 'warning', error: 'danger' }[row.log_type] || 'info'" size="small">
              {{ { api: 'API', operate: '操作', chain: '链上', error: '异常' }[row.log_type] || row.log_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="100" />
        <el-table-column prop="action" label="操作" width="100" />
        <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP" width="130" />
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="create_time" label="时间" width="170" />
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '../utils/request';

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filters = ref({ log_type: '', module: '', operator: '' });

const loadData = async () => {
  loading.value = true;
  try {
    const res = await request.get('/log/list', { params: { page: page.value, page_size: pageSize.value, ...filters.value } });
    if (res.code === 0) { list.value = res.data.list; total.value = res.data.pagination.total; }
  } finally { loading.value = false; }
};

onMounted(loadData);
</script>
