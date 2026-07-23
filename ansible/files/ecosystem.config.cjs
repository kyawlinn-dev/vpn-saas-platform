module.exports = {
  apps: [
    {
      name: "novanet-backend",
      script: "src/server.js",
      cwd: "/var/www/novanet/backend",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
