import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    config.externals = [...(config.externals || []), "pino-pretty", "encoding"];
    return config;
  },
  experimental: {
    optimizePackageImports: ["@reown/appkit", "@reown/appkit-adapter-wagmi"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.reown.com https://*.walletconnect.com https://*.walletconnect.org",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' https: data: blob:",
              "font-src 'self' https: data: https://fonts.gstatic.com",
              "connect-src 'self' https: wss: https://*.reown.com https://*.walletconnect.com https://*.walletconnect.org https://*.blockscout.com https://*.routescan.io https://api.dexscreener.com https://api.geckoterminal.com https://api.birdeye.so https://*.binance.com https://*.hyperliquid.xyz https://*.inkonchain.com https://*.publicnode.com https://*.binance.org https://rpc.hyperliquid.xyz",
              "frame-src 'self' https://*.reown.com https://*.walletconnect.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
