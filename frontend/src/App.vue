<template>
  <router-view />
</template>

<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Roboto, Arial, sans-serif;
  background: #f0f2f5;
  color: #303133;
  -webkit-font-smoothing: antialiased;
}

/* Element Plus 全局微调 */
.el-card {
  border-radius: 12px !important;
  border-color: #eef0f5 !important;
}
.el-card__header {
  padding: 14px 20px !important;
}
.el-button {
  border-radius: 8px !important;
  font-weight: 500 !important;
}
.el-table {
  border-radius: 8px !important;
  overflow: hidden !important;
}
.el-table th {
  background: #f7f8fb !important;
  color: #606266 !important;
  font-weight: 600 !important;
  font-size: 13px !important;
}
.el-tag {
  border-radius: 6px !important;
  font-weight: 500 !important;
}
.el-input__wrapper {
  border-radius: 8px !important;
}
.el-select .el-input__wrapper {
  border-radius: 8px !important;
}
.el-pagination {
  --el-pagination-border-radius: 8px;
}

/* 滚动条美化 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #d0d3dc; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #b0b3bc; }
</style>
