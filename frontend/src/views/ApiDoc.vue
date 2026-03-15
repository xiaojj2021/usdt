<template>
  <div>
    <el-card shadow="hover">
      <template #header>
        <span style="font-weight: bold;">商户对接 API 文档</span>
        <el-button type="primary" text size="small" @click="loadDoc" :loading="loading" style="float:right;">刷新</el-button>
      </template>
      <div v-loading="loading" class="api-doc-content" v-html="htmlContent" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { marked } from 'marked';
import request from '../utils/request';

const loading = ref(true);
const htmlContent = ref('');

const loadDoc = async () => {
  loading.value = true;
  try {
    const res = await request.get('/doc');
    if (res.code === 0 && res.data?.content) {
      htmlContent.value = marked.parse(res.data.content, { gfm: true });
    } else {
      htmlContent.value = '<p style="color:#F56C6C;">文档加载失败</p>';
    }
  } catch (e) {
    htmlContent.value = '<p style="color:#F56C6C;">文档加载失败</p>';
  } finally {
    loading.value = false;
  }
};

onMounted(loadDoc);
</script>

<style scoped>
.api-doc-content {
  padding: 16px 0;
  font-size: 14px;
  line-height: 1.7;
}
.api-doc-content :deep(h1) { font-size: 24px; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #ebeef5; }
.api-doc-content :deep(h2) { font-size: 20px; margin: 20px 0 12px; }
.api-doc-content :deep(h3) { font-size: 16px; margin: 16px 0 8px; }
.api-doc-content :deep(h4) { font-size: 14px; margin: 12px 0 6px; }
.api-doc-content :deep(p) { margin: 8px 0; }
.api-doc-content :deep(table) { border-collapse: collapse; width: 100%; margin: 12px 0; }
.api-doc-content :deep(th),
.api-doc-content :deep(td) { border: 1px solid #ebeef5; padding: 8px 12px; text-align: left; }
.api-doc-content :deep(th) { background: #f5f7fa; font-weight: 600; }
.api-doc-content :deep(tr:nth-child(even)) { background: #fafafa; }
.api-doc-content :deep(code) { background: #f5f7fa; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.api-doc-content :deep(pre) { background: #282c34; color: #abb2bf; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
.api-doc-content :deep(pre code) { background: none; padding: 0; color: inherit; }
.api-doc-content :deep(hr) { border: none; border-top: 1px solid #ebeef5; margin: 24px 0; }
.api-doc-content :deep(ul), .api-doc-content :deep(ol) { margin: 8px 0; padding-left: 24px; }
.api-doc-content :deep(li) { margin: 4px 0; }
</style>
