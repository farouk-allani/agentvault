import express from 'express';
import cors from 'cors';
import { env, validateEnv } from './config/index.js';
import vaultRoutes from './routes/vault.js';
import swapRoutes from './routes/swap.js';

// Validate environment variables
validateEnv();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    network: env.SUI_NETWORK,
  });
});

// API info endpoint
app.get('/api', (_req, res) => {
  res.json({
    name: 'AgentVault API',
    version: '1.0.0',
    description: 'Backend API for AgentVault - constrained agent spending on Sui',
    endpoints: {
      vault: {
        'GET /api/vault/:id': 'Get vault details',
        'GET /api/vault/owner/:address': 'Get vaults by owner',
        'GET /api/vault/:id/status': 'Get vault status with spending summary',
        'GET /api/vault/:id/can-spend?amount=X': 'Check if amount can be spent',
        'POST /api/vault/parse-intent': 'Parse natural language intent',
      },
      swap: {
        'POST /api/swap/build': 'Build a swap transaction',
        'POST /api/swap/execute': 'Build transaction for execution',
        'GET /api/swap/pools': 'Get available DeepBook pools',
        'GET /api/swap/quote': 'Get swap price quote',
        'GET /api/swap/validate/:vaultId?quantity=X': 'Validate swap feasibility',
      },
    },
    network: env.SUI_NETWORK,
  });
});

// Routes
app.use('/api/vault', vaultRoutes);
app.use('/api/swap', swapRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Start server
const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    AgentVault Backend                     ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                  ║
║  Network: ${env.SUI_NETWORK.padEnd(47)}║
║  Package: ${(env.PACKAGE_ID || 'Not configured').slice(0, 47).padEnd(47)}║
╚═══════════════════════════════════════════════════════════╝
  `);
  console.log('Available endpoints:');
  console.log('  GET  /health              - Health check');
  console.log('  GET  /api                 - API documentation');
  console.log('  GET  /api/vault/:id       - Get vault details');
  console.log('  POST /api/vault/parse-intent - Parse intent');
  console.log('  POST /api/swap/build      - Build swap transaction');
  console.log('  GET  /api/swap/pools      - Get DeepBook pools');
  console.log('');
});

export default app;
