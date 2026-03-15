<template>
  <div class="logs-page">
    <!-- 实时日志面板 -->
    <el-card shadow="hover" class="log-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon :size="20" style="color: #409eff; margin-right: 8px;"><Monitor /></el-icon>
            <span class="header-title">实时运行日志</span>
            <el-tag v-if="autoRefresh" type="success" size="small" effect="plain" style="margin-left: 10px;">
              自动刷新中
            </el-tag>
          </div>
          <div class="header-actions">
            <el-select v-model="activeFile" placeholder="选择日志" style="width: 180px;" @change="loadLogContent">
              <el-option v-for="f in logFiles" :key="f.name" :label="fileLabel(f.name)" :value="f.name">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span>{{ fileLabel(f.name) }}</span>
                  <span style="font-size:11px;color:#999;">{{ formatSize(f.size) }}</span>
                </div>
              </el-option>
            </el-select>
            <el-input v-model="keyword" placeholder="关键词过滤" clearable style="width: 160px;" @keyup.enter="loadLogContent" />
            <el-input-number v-model="lineCount" :min="50" :max="2000" :step="50" style="width: 120px;" controls-position="right" />
            <el-button type="primary" :icon="Search" @click="loadLogContent">查询</el-button>
            <el-button :type="autoRefresh ? 'success' : 'default'" @click="toggleAutoRefresh">
              {{ autoRefresh ? '停止刷新' : '自动刷新' }}
            </el-button>
            <el-popconfirm title="确认清空该日志文件？" @confirm="clearLogFile">
              <template #reference>
                <el-button type="danger" plain :icon="Delete">清空</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </template>

      <!-- 快捷标签 -->
      <div class="quick-tabs">
        <el-check-tag
          v-for="tab in quickTabs"
          :key="tab.file"
          :checked="activeFile === tab.file"
          @change="activeFile = tab.file; loadLogContent()"
          class="tab-item"
        >
          <el-icon :size="14" style="margin-right: 4px;"><component :is="tab.icon" /></el-icon>
          {{ tab.label }}
        </el-check-tag>
      </div>

      <div class="log-stats" v-if="logData.total">
        <span>文件: <b>{{ activeFile }}</b></span>
        <el-divider direction="vertical" />
        <span>总行数: <b>{{ logData.total }}</b></span>
        <el-divider direction="vertical" />
        <span>显示: <b>{{ logData.filtered }}</b> 行</span>
      </div>

      <!-- 日志内容 -->
      <div class="log-console" ref="logConsole">
        <div v-if="logLoading" style="text-align:center;padding:40px;">
          <el-icon class="is-loading" :size="24"><Loading /></el-icon>
          <span style="margin-left:8px;color:#999;">加载中...</span>
        </div>
        <div v-else-if="!logData.lines?.length" style="text-align:center;padding:60px;color:#999;">
          暂无日志内容
        </div>
        <div v-else>
          <div
            v-for="(line, idx) in logData.lines"
            :key="idx"
            class="log-line"
            :class="lineClass(line)"
          >
            <span class="line-num">{{ logData.total - logData.lines.length + idx + 1 }}</span>
            <span class="line-text" v-html="highlightLine(line)"></span>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 操作日志表格 -->
    <el-card shadow="hover" class="log-card" style="margin-top: 16px;">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon :size="20" style="color: #e6a23c; margin-right: 8px;"><Notebook /></el-icon>
            <span class="header-title">操作审计日志</span>
          </div>
          <div class="header-actions">
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
        </div>
      </template>

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
import { ref, onMounted, onUnmounted, nextTick, markRaw } from 'vue';
import { Search, Delete, Monitor, Notebook, Loading, Coin, Money, SetUp, Connection, Promotion, Document } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '../utils/request';

const quickTabs = [
  { file: 'combined.log', label: '全部', icon: markRaw(Document) },
  { file: 'deposit.log', label: '充币', icon: markRaw(Coin) },
  { file: 'withdraw.log', label: '提币', icon: markRaw(Money) },
  { file: 'collection.log', label: '归集', icon: markRaw(SetUp) },
  { file: 'callback.log', label: '回调', icon: markRaw(Connection) },
  { file: 'chain.log', label: '链上', icon: markRaw(Promotion) },
  { file: 'api.log', label: '请求', icon: markRaw(Monitor) },
  { file: 'error.log', label: '错误', icon: markRaw(Delete) },
];

const logFiles = ref([]);
const activeFile = ref('combined.log');
const keyword = ref('');
const lineCount = ref(200);
const logData = ref({ lines: [], total: 0, filtered: 0 });
const logLoading = ref(false);
const logConsole = ref(null);
const autoRefresh = ref(false);
let refreshTimer = null;

const fileLabel = (name) => {
  const map = {
    'combined.log': '全部日志',
    'error.log': '错误日志',
    'deposit.log': '充币日志',
    'withdraw.log': '提币日志',
    'collection.log': '归集日志',
    'callback.log': '回调日志',
    'chain.log': '链上日志',
    'api.log': '请求日志',
  };
  return map[name] || name;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

const loadLogFiles = async () => {
  try {
    const res = await request.get('/log/files');
    if (res.code === 0) logFiles.value = res.data;
  } catch (e) { /* ignore */ }
};

const loadLogContent = async () => {
  logLoading.value = true;
  try {
    const res = await request.get('/log/read', {
      params: { file: activeFile.value, lines: lineCount.value, keyword: keyword.value }
    });
    if (res.code === 0) {
      logData.value = res.data;
      await nextTick();
      if (logConsole.value) {
        logConsole.value.scrollTop = logConsole.value.scrollHeight;
      }
    }
  } catch (e) { /* ignore */ }
  logLoading.value = false;
};

const clearLogFile = async () => {
  try {
    const res = await request.post('/log/clear', { file: activeFile.value });
    if (res.code === 0) {
      ElMessage.success(res.msg || '已清空');
      loadLogContent();
      loadLogFiles();
    }
  } catch (e) { /* ignore */ }
};

const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value;
  if (autoRefresh.value) {
    refreshTimer = setInterval(loadLogContent, 3000);
    ElMessage.success('已开启自动刷新（3秒）');
  } else {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

const lineClass = (line) => {
  if (line.includes('[ERROR]')) return 'line-error';
  if (line.includes('[WARN]')) return 'line-warn';
  if (line.includes('成功') || line.includes('完成')) return 'line-success';
  return '';
};

const highlightLine = (line) => {
  let s = line
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\[ERROR\]/g, '<span class="hl-error">[ERROR]</span>')
    .replace(/\[WARN\]/g, '<span class="hl-warn">[WARN]</span>')
    .replace(/\[INFO\]/g, '<span class="hl-info">[INFO]</span>')
    .replace(/\[([\d-]+ [\d:]+)\]/g, '<span class="hl-time">[$1]</span>')
    .replace(/\[充币\]/g, '<span class="hl-deposit">[充币]</span>')
    .replace(/\[提币\]/g, '<span class="hl-withdraw">[提币]</span>')
    .replace(/\[归集\]/g, '<span class="hl-collection">[归集]</span>')
    .replace(/\[回调\]/g, '<span class="hl-callback">[回调]</span>')
    .replace(/\[链上\]/g, '<span class="hl-chain">[链上]</span>')
    .replace(/\[请求\]/g, '<span class="hl-api">[请求]</span>')
    .replace(/\[心跳\]/g, '<span class="hl-heartbeat">[心跳]</span>')
    .replace(/\[服务\]/g, '<span class="hl-service">[服务]</span>');
  if (keyword.value) {
    const escaped = keyword.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }
  return s;
};

// 操作日志表格
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

onMounted(() => {
  loadLogFiles();
  loadLogContent();
  loadData();
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<style scoped>
.logs-page { max-width: 1400px; }
.log-card :deep(.el-card__header) { padding: 14px 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.header-left { display: flex; align-items: center; }
.header-title { font-size: 16px; font-weight: 600; color: #1a1a2e; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.quick-tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.tab-item { display: flex; align-items: center; cursor: pointer; }

.log-stats {
  font-size: 12px;
  color: #909399;
  padding: 6px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 10px;
}

.log-console {
  background: #1e1e2e;
  border-radius: 8px;
  padding: 14px;
  max-height: 600px;
  overflow-y: auto;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.7;
}

.log-console::-webkit-scrollbar { width: 6px; }
.log-console::-webkit-scrollbar-track { background: transparent; }
.log-console::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }

.log-line { display: flex; gap: 10px; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
.log-line:hover { background: rgba(255,255,255,0.04); }
.line-num { color: rgba(255,255,255,0.2); min-width: 40px; text-align: right; user-select: none; flex-shrink: 0; }
.line-text { color: #cdd6f4; white-space: pre-wrap; word-break: break-all; }

.line-error .line-text { color: #f38ba8; }
.line-warn .line-text { color: #f9e2af; }
.line-success .line-text { color: #a6e3a1; }

:deep(.hl-error) { color: #f38ba8; font-weight: 700; }
:deep(.hl-warn) { color: #f9e2af; font-weight: 700; }
:deep(.hl-info) { color: #89b4fa; font-weight: 600; }
:deep(.hl-time) { color: #6c7086; }
:deep(.hl-deposit) { color: #89dceb; font-weight: 600; }
:deep(.hl-withdraw) { color: #cba6f7; font-weight: 600; }
:deep(.hl-collection) { color: #a6e3a1; font-weight: 600; }
:deep(.hl-callback) { color: #fab387; font-weight: 600; }
:deep(.hl-chain) { color: #f9e2af; font-weight: 600; }
:deep(.hl-api) { color: #74c7ec; font-weight: 600; }
:deep(.hl-heartbeat) { color: #94e2d5; font-weight: 600; }
:deep(.hl-service) { color: #b4befe; font-weight: 600; }
:deep(mark) { background: #f9e2af33; color: #f9e2af; padding: 0 2px; border-radius: 2px; }
</style>
