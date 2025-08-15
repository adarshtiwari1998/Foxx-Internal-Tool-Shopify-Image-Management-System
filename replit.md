# Overview

This is a Shopify Image Management System built for internal tools at Foxx Life Sciences. The application allows users to manage product images across multiple Shopify stores, supporting operations like image replacement, addition, and updates. It provides a comprehensive interface for searching products by SKU or URL, uploading images, and tracking operation results.

## Recent Changes (August 15, 2025)
- ✓ Successfully migrated from Replit Agent to standard Replit environment
- ✓ Fixed image replacement RESOURCE_NOT_FOUND error by improving error handling
- ✓ Enhanced image replacement logic to handle variant images properly
- ✓ Added support for draft product preview links in operation results
- ✓ Updated frontend to pass correct data structure (SKU, existing image ID)
- ✓ Improved Store Configuration UI with collapsible design to save space
- ✓ Added "Add Store" button that only shows full form when needed
- ✓ Enhanced user experience with compact store management interface
- ✓ Maintained all existing functionality while reducing visual clutter

## Previous Changes (August 14, 2025)
- ✓ Migrated from Neon Database to Render PostgreSQL for production stability
- ✓ Updated database configuration with SSL support for secure connections
- ✓ Fixed TypeScript issues in routes and Shopify service
- ✓ Successfully deployed database schema with stores and product_operations tables
- ✓ Configured cross-browser persistence for store configurations

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for client-side routing
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **State Management**: TanStack React Query for server state management
- **Form Handling**: React Hook Form with Zod schema validation

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **Database**: PostgreSQL with Drizzle ORM for schema management
- **API Design**: RESTful API with structured error handling and request logging
- **File Handling**: Multer for multipart form data processing

## Database Schema
- **Stores Table**: Manages Shopify store configurations (credentials, URLs, active status)
- **Product Operations Table**: Tracks image management operations with status and metadata
- **Migration System**: Drizzle Kit for database schema versioning
- **Database Provider**: Render PostgreSQL with SSL connections for production stability

## Authentication & External Integration
- **Shopify Integration**: Custom service class for GraphQL API communication
- **Store Management**: Multi-store support with active store switching
- **Session Handling**: Express sessions with PostgreSQL session store

## Core Features
- **Product Search**: Support for both SKU-based and URL-based product lookup
- **Image Management**: Upload, preview, and apply images to product variants
- **Operation Tracking**: Real-time status monitoring of image operations
- **Store Configuration**: Dynamic store setup and credential validation

## Development Workflow
- **Build Process**: Vite for frontend bundling, esbuild for backend compilation
- **Type Safety**: Shared TypeScript schemas between frontend and backend
- **Hot Reload**: Development server with live reloading capabilities

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database operations and schema management

## Third-Party APIs
- **Shopify Admin API**: GraphQL integration for product and image management
- **Shopify REST API**: Legacy endpoint support where needed

## UI Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Lucide React**: Icon library for consistent iconography
- **Embla Carousel**: Image carousel functionality

## Development Tools
- **Replit Integration**: Custom plugins for development environment
- **TanStack React Query**: Server state synchronization and caching
- **Zod**: Runtime type validation and schema definition

## File Storage
- **Multer**: In-memory file processing for image uploads
- **File System**: Local storage for temporary file handling