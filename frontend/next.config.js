/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['geist'],
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;