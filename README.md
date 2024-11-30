# KRC20 Backend

This is the backend API for managing KRC20 tokens and transactions. It provides endpoints for fetching token data, updating databases, and uploading token logos.

## Features

- Fetch mint totals and transactions for tokens
- Update database for all tokens or specific tickers
- Upload and serve token logos
- Retrieve price data for tokens
- Check API health

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/argonmining/krc20-backend.git
   cd krc20-backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   Create a `.env` file in the root directory and add the necessary environment variables. Example:

   ```env
   DATABASE_URL=your_database_url
   PORT=3000
   PRICE_UPDATE_INTERVAL=15
   ```

4. Generate Prisma client:

   ```bash
   npm run prisma:generate
   ```

5. Build the project:

   ```bash
   npm run build
   ```

## Usage

- Start the server:

  ```bash
  npm start
  ```

- For development:

  ```bash
  npm run dev
  ```

## API Endpoints

Refer to the [OpenAPI Specification](openapi.yaml) for detailed information about the available endpoints and their usage.

### Key Endpoints

- **GET /api/mint-Totals**: Retrieve mint totals for all tokens.
- **GET /api/transactions**: Get transactions for a specific token.
- **POST /api/{ticker}/upload-logo**: Upload a new logo for a specific token and update the database.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the ISC License.
