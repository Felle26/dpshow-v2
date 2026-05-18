import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["http://192.168.178.170:3000"],
};

export default nextConfig;
