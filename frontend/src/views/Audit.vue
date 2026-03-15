<template>
  <div>
    <el-card shadow="hover">
      <template #header><span style="font-weight: bold;">待审核提币</span></template>
      <div style="margin-bottom: 12px;" v-if="withdrawOrders.length > 0">
        <el-button type="success" @click="batchApproveWithdraw" :disabled="selectedWithdrawIds.length === 0">批量通过 ({{ selectedWithdrawIds.length }})</el-button>
        <el-button type="danger" @click="showRejectDialog" :disabled="selectedWithdrawIds.length === 0">批量驳回 ({{ selectedWithdrawIds.length }})</el-button>
      </div>
      <el-table :data="withdrawOrders" border stripe @selection-change="(rows) => selectedWithdrawIds = rows.map(r => r.id)">
        <el-table-column type="selection" width="40" />
        <el-table-column prop="order_no" label="订单号" width="200" show-overflow-tooltip />
        <el-table-column prop="chain_type" label="链" width="80">
          <template #default="{ row }">
            <el-tag :type="row.chain_type === 'trc20' ? 'primary' : 'success'" size="small">{{ row.chain_type?.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="to_address" label="目标地址" min-width="280" show-overflow-tooltip />
        <el-table-column prop="amount" label="金额" width="120" />
        <el-table-column prop="merchant_id" label="商户ID" width="80" />
        <el-table-column prop="create_time" label="申请时间" width="170" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="approveWithdraw([row.id])">通过</el-button>
            <el-button size="small" type="danger" @click="showRejectDialog(null, [row.id])">驳回</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="withdrawOrders.length === 0" description="暂无待审核提币订单" />
    </el-card>

    <el-dialog v-model="rejectDialogVisible" title="驳回原因" width="400px">
      <el-input v-model="rejectRemark" type="textarea" :rows="3" placeholder="请输入驳回原因" />
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../utils/request';

const withdrawOrders = ref([]);
const selectedWithdrawIds = ref([]);
const rejectDialogVisible = ref(false);
const rejectRemark = ref('');
const rejectIds = ref([]);

const loadData = async () => {
  try {
    const res = await request.get('/audit/pending');
    if (res.code === 0) withdrawOrders.value = res.data.withdraw_orders || [];
  } catch (e) {}
};

const approveWithdraw = async (ids) => {
  const res = await request.post('/audit/withdraw/approve', { ids });
  ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  loadData();
};

const batchApproveWithdraw = () => approveWithdraw(selectedWithdrawIds.value);

const showRejectDialog = (_t, ids) => {
  rejectIds.value = ids || selectedWithdrawIds.value;
  rejectRemark.value = '';
  rejectDialogVisible.value = true;
};

const confirmReject = async () => {
  const res = await request.post('/audit/withdraw/reject', { ids: rejectIds.value, remark: rejectRemark.value });
  ElMessage[res.code === 0 ? 'success' : 'error'](res.msg);
  rejectDialogVisible.value = false;
  loadData();
};

onMounted(loadData);
</script>
