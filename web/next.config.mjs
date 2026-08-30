/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the build emits plain files and nothing runs on the server.
  // This is what keeps the showcase up while the Go service is being broken.
  output: 'export',
  images: { unoptimized: true },
  // Emits posts/foo/index.html, which is the most predictable shape to serve
  // from a plain file server.
  trailingSlash: true,
};

export default nextConfig;
