import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Use this directory as workspace root to avoid lockfile inference warnings
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
