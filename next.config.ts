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
};

export default nextConfig;
