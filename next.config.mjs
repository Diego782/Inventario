/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: 'standalone', // Necesario para Docker
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
}

export default nextConfig
