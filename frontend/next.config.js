/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable path aliases
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname),
    };
    return config;
  },
}

module.exports = nextConfig
