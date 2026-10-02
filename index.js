require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Security Headers
app.use(helmet());

// 2. Request Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// 3. Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Production CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173']; // Default to local Vite dev server

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or ALB health checks)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy does not allow access from ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// 5. ALB / Container Health Check Endpoint
// The Application Load Balancer queries this to verify task status
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'backend-api',
  });
});

// 6. Sample Application Endpoints
app.get('/api/v1/data', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Data successfully retrieved from ECS backend service',
    items: [
      { id: 1, name: 'Task Alpha', status: 'Completed' },
      { id: 2, name: 'Task Beta', status: 'In Progress' },
      { id: 3, name: 'Task Gamma', status: 'Pending' },
    ],
  });
});

app.post('/api/v1/data', (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  res.status(201).json({
    success: true,
    message: 'Item created',
    item: { id: Date.now(), title },
  });
});

// 7. 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// 8. Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// 9. Start Server
const server = app.listen(PORT, () => {
  console.log(`[ECS Backend] Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// 10. Graceful Shutdown (Critical for ECS Fargate & Spot)
// When ECS stops a task, it sends SIGTERM. We stop accepting new traffic
// and close open connections before the container is forcefully killed.
function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close after 10 seconds if connections hang
  setTimeout(() => {
    console.error('Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
