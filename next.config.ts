import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/PokeAPI/sprites/**",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/simeonelias/**",
      },
      {
        protocol: "https",
        hostname: "s3.pokeos.com",
        pathname: "/pokeos-uploads/**",
      },
      {
        protocol: "https",
        hostname: "images.scrydex.com",
      },
    ],
  },
};

export default nextConfig;
