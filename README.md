# Orion CRM

A simplified Customer Relationship Management (CRM) application built with the MERN stack (modernized with TypeScript, Vite, and Prisma).

## Architecture

This project follows a monorepo structure with separate frontend and backend applications:

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js 22 + Express 5 + TypeScript + Prisma

## Prerequisites

- **Node.js** >= 22.0.0
- **npm** >= 10.0.0

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd p7-dfsjs
```

### 2. Install backend dependencies

```bash
cd server
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` if needed (default values should work for local development).

### 4. Initialize the database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 5. Install frontend dependencies

```bash
cd ../client
npm install
```

### 6. Configure frontend environment

```bash
cp .env.example .env
```

## Running the Application

### Start the backend server

```bash
cd server
npm run dev
```

The API will be available at `http://localhost:8080`

### Start the frontend application

In a new terminal:

```bash
cd client
npm run dev
```

The application will be available at `http://localhost:4200`

## Available Scripts

### Backend (server/)

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (database GUI)

### Frontend (client/)

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run tests
- `npm run lint` - Lint code

## Project Structure

```
p7-dfsjs-starter/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API client services
│   │   ├── types/         # TypeScript type definitions
│   │   ├── App.tsx        # Main App component
│   │   └── main.tsx       # Application entry point
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── server/                # Backend Express application
│   ├── src/
│   │   ├── controllers/   # Route handlers (HTTP layer)
│   │   ├── services/      # Business logic layer
│   │   ├── repositories/  # Data access layer
│   │   ├── models/        # Data models and schemas
│   │   ├── routes/        # API route definitions
│   │   └── index.ts       # Server entry point
│   ├── prisma/
│   │   └── schema.prisma  # Database schema
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
└── README.md
```

## Features

- **Dashboard**: View statistics and overview
- **Contacts Management**: Create, read, update, and delete contacts
- **Organizations Management**: Manage companies and link them to contacts
- **RESTful API**: Well-structured backend with Controller-Service-Repository pattern
- **Type Safety**: Full TypeScript support on frontend and backend
- **Modern UI**: Tailwind CSS with responsive design

## API Endpoints

### Organizations

- `GET /api/organizations` - Get all organizations
- `GET /api/organizations/:id` - Get organization by ID
- `POST /api/organizations` - Create new organization
- `PUT /api/organizations/:id` - Update organization
- `DELETE /api/organizations/:id` - Delete organization
- `GET /api/organizations/stats` - Get organization statistics

### Contacts

- `GET /api/contacts` - Get all contacts
- `GET /api/contacts/:id` - Get contact by ID
- `POST /api/contacts` - Create new contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact
- `GET /api/contacts/stats` - Get contact statistics

## Technology Stack

### Frontend

- **React 19**: Modern React with Hooks
- **TypeScript 5.x**: Static typing
- **Vite**: Fast build tool
- **Tailwind CSS**: Utility-first CSS framework
- **TanStack Query**: Data fetching and caching
- **Axios**: HTTP client
- **React Router**: Client-side routing
- **Zustand**: Lightweight state management

### Backend

- **Node.js 22 LTS**: JavaScript runtime
- **Express 5**: Web framework
- **TypeScript 5.x**: Static typing
- **Prisma**: Modern ORM
- **SQLite**: Development database
- **Zod**: Runtime type validation
- **Vitest**: Testing framework

## Development Guidelines

### Code Style

- Use **TypeScript strict mode**
- No `any` types allowed
- Use **functional components** and hooks (no class components)
- Use `async/await` for asynchronous operations (no callbacks)
- Follow the **Controller-Service-Repository** pattern on the backend

### Architecture Principles

- **Separation of Concerns**: Clear separation between UI, business logic, and data access
- **Type Safety**: Define interfaces/types for all data structures
- **Custom Hooks**: Extract complex logic into reusable hooks
- **API Layer**: Centralized API calls in service files
- **Validation**: Use Zod schemas for input validation

## License

MIT
