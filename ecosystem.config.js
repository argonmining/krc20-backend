module.exports = {
    apps: [{
      name: "krc20-backend",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,  // This ensures only one instance
      exec_mode: "fork",  // Change this to "fork" for a single instance
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    }]
  };