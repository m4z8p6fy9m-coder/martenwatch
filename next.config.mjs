const rawPort = process.env.ACTIONLEDGER_API_PORT ?? '4000';
if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('Invalid ACTIONLEDGER_API_PORT');
export default { experimental: { useWasmBinary: true }, outputFileTracingRoot: process.cwd(), async rewrites() { return [{source:'/api/:path*',destination:`http://127.0.0.1:${Number(rawPort)}/api/:path*`}]; } };
