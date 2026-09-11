import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 全靜態輸出：build 出純 HTML/JS/CSS，直接丟 Cloudflare Pages，無 server、無 DB。
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
