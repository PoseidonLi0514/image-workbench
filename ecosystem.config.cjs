module.exports = {
  apps: [
    {
      name: "image-workbench-backend",
      script: "backend/server.mjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
        HOST: "127.0.0.1",
        PORT: "6666",
        PUBLIC_BASE_URL: "https://imagebackend.78139191.xyz",
      },
    },
  ],
};
