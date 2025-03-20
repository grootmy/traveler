/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['geist'],
  webpack: (config) => {
    config.cache = false;

    // SVG 파일을 React 컴포넌트로 변환하기 위한 설정 추가
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },
};

module.exports = nextConfig;