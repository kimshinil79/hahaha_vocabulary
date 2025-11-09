/** @type {import('next').Config} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  assetPrefix: process.env.NODE_ENV === 'production' ? '/hahahaEnglish' : '',
  basePath: process.env.NODE_ENV === 'production' ? '/hahahaEnglish' : '',
  webpack: (config, { isServer }) => {
    // Transformers.js를 위한 webpack 설정
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  // Turbopack 설정 (Next.js 16) - 빈 설정으로 에러 방지
  turbopack: {},
}

module.exports = nextConfig
