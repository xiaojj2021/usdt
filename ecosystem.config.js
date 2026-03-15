/**
 * PM2 进程配置
 */
module.exports = {
  apps: [
    {
      name: 'usdt-api',
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-api-error.log',
      out_file: './logs/pm2-api-out.log',
    },
    {
      name: 'usdt-task',
      script: 'src/task-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-task-error.log',
      out_file: './logs/pm2-task-out.log',
    },
    {
      name: 'usdt-scheduler',
      script: 'src/scheduler.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-scheduler-error.log',
      out_file: './logs/pm2-scheduler-out.log',
    },
  ],
};
