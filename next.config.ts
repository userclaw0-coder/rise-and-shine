import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Let Turbopack use the actual project root (process.cwd()).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
