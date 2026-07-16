import { withAui } from "@assistant-ui/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const hermes = (process.env.HERMES_URL || "http://127.0.0.1:9119").replace(
      /\/$/,
      "",
    );
    return [
      {
        source: "/api/:path*",
        destination: `${hermes}/api/:path*`,
      },
      {
        source: "/agui",
        destination: `${hermes}/agui`,
      },
    ];
  },
};

export default withAui(nextConfig);
