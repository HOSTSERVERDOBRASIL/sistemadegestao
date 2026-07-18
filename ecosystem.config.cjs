module.exports = {
  apps: [
    {
      name: 'atlasX-api',
      script: 'dist/server.js',
      instances: 'max',          // cluster mode — usa todos os CPUs
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      kill_timeout: 10000,       // espera graceful shutdown
    },
  ],
};
