import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // typedRoutes intentionally disabled — we redirect to user-supplied strings
  // (e.g. ?next=<path>) which can't be statically typed. Enable later if we
  // add a router helper that validates paths at the boundary.
  experimental: {
    staleTimes: {
      dynamic: 30,  // cache dynamic routes 30s client-side for instant tab switching
      static: 180,
    },
  },
};

export default config;
