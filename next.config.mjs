/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 빌드 차단 lint 분리 — 타입 검사(tsc)는 유지, ESLint 위반은 빌드를 막지 않음
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
