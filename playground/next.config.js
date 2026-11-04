/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // next dev would otherwise write an AGENTS.md here whenever a coding agent runs it.
  agentRules: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' http://localhost:3010 http://127.0.0.1:3010"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
