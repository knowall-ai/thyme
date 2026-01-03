# Thyme - Time Tracking for Business Central

A modern time tracking web application that integrates with Microsoft Dynamics 365 Business Central. Built by [KnowAll.ai](https://knowall.ai).

## Features

- **Weekly Timesheet View** - Track time across the week with an intuitive grid layout
- **Real-time Timer** - Start/stop timer for accurate time tracking
- **Business Central Sync** - Automatic synchronization with BC Jobs and Job Journal Lines
- **Microsoft Authentication** - Secure SSO via Microsoft Entra ID
- **Dark Theme** - Modern, eye-friendly dark interface
- **Mobile Responsive** - Works on desktop and mobile devices

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Next.js 14 |
| Styling | Tailwind CSS |
| State | Zustand |
| Auth | MSAL.js (Microsoft Entra ID) |
| Data | Business Central OData API |
| Testing | Playwright, Vitest |
| Hosting | Azure App Service |

## Getting Started

### Prerequisites

- Node.js 20 LTS
- Azure subscription with Entra ID
- Business Central environment

### Installation

```bash
# Clone the repository
git clone https://github.com/knowall-ai/thyme.git
cd thyme

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Azure/BC credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

```bash
NEXT_PUBLIC_AZURE_CLIENT_ID=<entra-app-client-id>
AZURE_CLIENT_SECRET=<entra-app-secret>
NEXT_PUBLIC_AZURE_TENANT_ID=<tenant-id>
BC_ENVIRONMENT=<production|sandbox>
BC_COMPANY_ID=<business-central-company-guid>
```

## Development

### Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
npm run test       # Run unit tests
npm run test:e2e   # Run E2E tests
npm run typecheck  # Run TypeScript checks
```

### Project Structure

```
thyme/
├── .github/
│   └── AGENTS.md              # AI assistant personas
├── docs/
│   ├── SOLUTION_DESIGN.adoc   # Architecture overview
│   ├── DEPLOYMENT.adoc        # Deployment guide
│   ├── TESTING.adoc           # Test documentation
│   └── TROUBLESHOOTING.adoc   # Problem/solution guide
├── src/
│   ├── app/                   # Next.js pages
│   ├── components/            # React components
│   ├── hooks/                 # Custom hooks & stores
│   ├── services/              # API clients
│   ├── types/                 # TypeScript types
│   └── utils/                 # Utilities
├── tests/
│   ├── e2e/                   # Playwright tests
│   └── unit/                  # Vitest tests
└── public/                    # Static assets
```

## Deployment

Deploy to Azure App Service:

```bash
npm run build
# Deploy .next/standalone to Azure
```

See [docs/DEPLOYMENT.adoc](docs/DEPLOYMENT.adoc) for detailed instructions.

## Documentation

- [Solution Design](docs/SOLUTION_DESIGN.adoc) - Architecture and design
- [Deployment Guide](docs/DEPLOYMENT.adoc) - Azure setup
- [Testing Guide](docs/TESTING.adoc) - Running tests
- [Troubleshooting](docs/TROUBLESHOOTING.adoc) - Common issues

## Contributing

This is an internal tool for KnowAll.ai. For issues or feature requests, please use GitHub Issues.

## License

Proprietary - KnowAll.ai
