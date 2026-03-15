/**
 * 统一响应格式
 */

const success = (data = null, msg = '操作成功') => ({
  code: 0,
  msg,
  data,
  timestamp: Date.now(),
});

const error = (msg = '操作失败', code = -1, data = null) => ({
  code,
  msg,
  data,
  timestamp: Date.now(),
});

const pageResult = (list, total, page, pageSize) => ({
  code: 0,
  msg: '查询成功',
  data: {
    list,
    pagination: {
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize),
    },
  },
  timestamp: Date.now(),
});

module.exports = { success, error, pageResult };
