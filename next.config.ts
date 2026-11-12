import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Keep the preview clean — no floating dev-tools indicator over the UI
  devIndicators: false,
};

export default nextConfig;
