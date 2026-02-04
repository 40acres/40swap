# Liquidity Manager Frontend

Frontend application for the Lightning Liquidity Manager, built with SolidJS.

## Features

- View all Lightning Network channels with their balances
- Visual balance indicators for each channel
- Execute swaps to move balance out of channels
- **View complete swap history** with status and costs
- Real-time feedback with toast notifications
- Responsive Bootstrap-based UI

## Pages

- **Channels** (`/`) - Main page showing all channels and swap controls
- **History** (`/history`) - Complete swap history with filtering and details

## Development

```bash
# Install dependencies (from root)
npm install

# Start development server
npm run start:dev
```

The application will be available at: `http://localhost:7083`

The frontend proxies API requests to the backend at `http://localhost:7082`

## Build

```bash
# Build for production
npm run build
```

Built files will be in the `dist` directory.

## Project Structure

```
src/
├── components/       # React-like components
│   ├── ChannelsPage.tsx   # Main channel list view
│   └── SwapModal.tsx      # Swap execution modal
├── services/         # API client services
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
├── App.tsx           # Root application component
├── app.scss          # Global styles
├── index.tsx         # Application entry point
└── index.html        # HTML template
```
