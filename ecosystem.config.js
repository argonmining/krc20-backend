module.exports = {
    apps: [{
      name: "krc20-backend",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    }]
  };