# KRC20 Backend

This is the backend service for KRC20 transaction data. It fetches and stores transaction data from the Kasplex API and provides a REST API endpoint for querying this data.

## Features

- Fetches and stores KRC20 transaction data from Kasplex API
- Provides a REST API endpoint for querying transaction data
- Implements caching for improved performance
- Uses rate limiting to prevent API abuse
- Scheduled tasks for regular data updates

## Prerequisites

- Node.js (v14 or later)
- npm
- PostgreSQL database
- PM2 (for production deployment)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/krc20-backend.git
   cd krc20-backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add the following variables:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/krc20_db?schema=public"
   PORT=3000
   ```

4. Set up the database:
   ```
   npx prisma db push
   ```

## Development

To run the application in development mode:

```
npm run dev
```

## Building for Production

To build the application for production:

```
npm run build
```

## Production Deployment with PM2

1. Install PM2 globally if you haven't already:
   ```
   npm install -g pm2
   ```

2. Create a PM2 ecosystem file:
   Create a file named `ecosystem.config.js` in the root directory with the following content:
   ```javascript
   module.exports = {
     apps: [{
       name: "krc20-backend",
       script: "dist/index.js",
       env: {
         NODE_ENV: "production",
       },
       instances: "max",
       exec_mode: "cluster",
       autorestart: true,
       watch: false,
       max_memory_restart: "1G",
     }]
   };
   ```

3. Start the application with PM2:
   ```
   pm2 start ecosystem.config.js
   ```

4. Set up PM2 to start on system boot:
   ```
   pm2 startup
   pm2 save
   ```

## API Endpoints

### GET /api/transactions

Fetches KRC20 transactions with optional filtering and pagination.

Query Parameters:
- `txHash`: Filter by transaction hash
- `tick`: Filter by token tick
- `from`: Filter by sender address
- `to`: Filter by recipient address
- `op`: Filter by operation type
- `opError`: Filter by operation error
- `page`: Page number for pagination (default: 1)
- `limit`: Number of records per page (default: 10000, max: 10000)

Example:
```
http://your-server-ip:3000/api/transactions?tick=KOIN&page=1&limit=100
```

## Scheduled Tasks

The application runs the following scheduled tasks:

- Fetches all historical data on startup
- Removes duplicate transactions on startup
- Polls the Kasplex API for new transactions every hour

