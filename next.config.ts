import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Deliver reservation metadata in the initial HTML, including LINE link previews.
  htmlLimitedBots: /.*/,
  outputFileTracingIncludes: { '/api/line/rehearsal-image/*': ['./assets/fonts/NotoSansJP-Regular.ttf', './assets/fonts/NotoSansJP-Bold.ttf'] },
};

export default nextConfig;
