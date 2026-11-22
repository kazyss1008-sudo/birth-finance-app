import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: { '/api/line/rehearsal-image/*': ['./assets/fonts/NotoSansJP-Regular.ttf', './assets/fonts/NotoSansJP-Bold.ttf'] },
};

export default nextConfig;
