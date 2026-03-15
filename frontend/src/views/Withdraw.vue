<template>
  <div>
    <el-card shadow="hover" class="page-card">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; font-size: 16px;">提币订单</span>
          <el-button type="danger" size="small" :disabled="!selectedIds.length" @click="batchDelete">
            批量删除 ({{ selectedIds.length }})
          </el-button>
        </div>
      </template>

      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
        <el-input v-model="filters.order_no" placeholder="订单号" clearable style="width: 200px;" />
        <el-select v-model="filters.chain_type" placeholder="链类型" clearable style="width: 120px;">
          <el-option label="TRC20" value="trc20" /><el-option label="BSC" value="bsc" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px;">
          <el-option label="处理中" :value="0" /><el-option label="成功" :value="1" /><el-option label="失败" :value="2" /><el-option label="待审核" :value="3" />
        </el-select>
        <el-select v-model="filters.audit_status" placeholder="审核" clearable style="width: 120px;">
          <el-option label="待审核" :value="0" /><el-option label="通过" :value="1" /><el-option label="驳回" :value="2" />
        </el-select>
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe @selection-change="onSelectionChange" row-key="id">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="order_no" label="订单号" width="200" show-overflow-tooltip />
        <el-table-column prop="merchant_order_no" label="商户单号" width="150" show-overflow-tooltip />
        <el-table-column prop="chain_type" label="链" width="80">
          <template #default="{ row }">
            <el-tag :type="row.chain_type === 'trc20' ? 'primary' : 'success'" size="small" effect="light">{{ row.chain_type?.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="to_address" label="目标地址" min-width="260" show-overflow-tooltip />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">
            <span style="font-weight: 600;">{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="fee" label="手续费" width="80" />
        <el-table-column prop="audit_status" label="审核" width="80">
          <template #default="{ row }">
            <el-tag :type="row.audit_status === 1 ? 'success' : row.audit_status === 2 ? 'danger' : 'warning'" size="small">
              {{ row.audit_status === 1 ? '通过' : row.audit_status === 2 ? '驳回' : '待审' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'warning'" size="small" effect="dark">
              {{ ['处理中', '成功', '失败', '待审核'][row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="txid" label="TXID" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.txid" :href="row.chain_type === 'trc20' ? `https://tronscan.org/#/transaction/${row.txid}` : `https://bscscan.com/tx/${row.txid}`" target="_blank" style="color: #409EFF; text-decoration: none;">{{ row.txid?.substr(0,12) }}...</a>
            <span v-else style="color: #c0c4cc;">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="时间" width="165" />
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 13px; color: #909399;">已选 {{ selectedIds.length }} 项</span>
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
      </div>
    </el-card>
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
const filters = ref({ order_no: '', chain_type: '', status: '', audit_status: '' });
const selectedIds = ref([]);

const onSelectionChange = (rows) => { selectedIds.value = rows.map(r => r.id); };

const loadData = async () => {
  loading.value = true;
  try {
    const res = await request.get('/withdraw/list', { params: { page: page.value, page_size: pageSize.value, ...filters.value } });
    if (res.code === 0) { list.value = res.data.list; total.value = res.data.pagination.total; }
  } finally { loading.value = false; }
};

const batchDelete = async () => {
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 笔提币订单？`, '批量删除', { type: 'warning' });
    const res = await request.post('/withdraw/batch-delete', { ids: selectedIds.value });
    ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
    loadData();
  } catch (e) { /* cancelled */ }
};

onMounted(loadData);
</script>
