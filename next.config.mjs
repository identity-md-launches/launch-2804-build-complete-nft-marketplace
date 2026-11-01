/** @type {import('next').NextConfig} */
export default {
  output: "export",
  assetPrefix: process.env.NODE_ENV === "production" ? "." : undefined,
  images: { unoptimized: true },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: { cpus: 2 },
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};
