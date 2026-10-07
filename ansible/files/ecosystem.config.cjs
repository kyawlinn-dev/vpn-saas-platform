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
        // The Droplet has no working IPv6 route. Node 22's family race can
        // abandon Telegram's slower IPv4 connection before it completes.
        NODE_OPTIONS: "--no-network-family-autoselection",
      },
    },
  ],
};
