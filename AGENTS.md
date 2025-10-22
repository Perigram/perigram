# AGENTS.md

This document provides a comprehensive overview of the Cutkit-Demo project's architecture, tech stack, and key principles for AI agent development.

## Project Overview

Cutkit-Demo is a full-stack web application built with Nuxt.js for smart nesting of DXF files for laser cutting and CNC machining. It allows users to upload DXF files, manage projects, and optimize material usage by nesting the parts onto sheets. The application includes user authentication, a credit system for nesting operations, and an admin interface for support.

## Tech Stack

-   **Frontend:**
    -   [Nuxt.js 3](https://nuxt.com/): A hybrid Vue.js framework for building server-side rendered (SSR) and static websites.
    -   [Vue.js 3](https://vuejs.org/): A progressive JavaScript framework for building user interfaces.
    -   [Tailwind CSS](https://tailwindcss.com/): A utility-first CSS framework for rapid UI development.
    -   [SCSS](https://sass-lang.com/): A CSS preprocessor for more advanced styling capabilities.

-   **Backend:**
    -   [Node.js](https://nodejs.org/): The JavaScript runtime environment for the backend.
    -   [Nuxt.js Server Engine (Nitro)](https://nitro.unjs.io/): The server engine for Nuxt.js, used to create the API endpoints.
    -   [MongoDB](https://www.mongodb.com/): A NoSQL database used for data persistence.
    -   [Mongoose](https://mongoosejs.com/): An ODM for MongoDB, used for data modeling.

-   **Authentication:**
    -   Session-based authentication with cookies.
    -   OAuth with GitHub and Google.

-   **Payment:**
    -   [Stripe](https://stripe.com/): Used for processing payments for credits.

## Architecture

The project follows a monolithic architecture with a tightly coupled frontend and backend, both built with Nuxt.js.

-   **Frontend:** The frontend is composed of Vue components located in the `components/` directory, pages in the `pages/` directory, and layouts in the `layouts/` directory. The application uses a component-based architecture with a clear separation of concerns.

-   **Backend:** The backend is built using Nuxt.js server routes, located in the `server/api/` directory. The API is organized into resources (e.g., `auth`, `files`, `nest`, `payment`). The backend communicates with a MongoDB database for data storage.

-   **Workers:** The project also includes Python-based worker processes in the `workers/` directory for handling CPU-intensive tasks like file processing (`fileprocessing/`) and nesting (`nesting/`). These workers likely communicate with the main application through a message queue or a similar mechanism.

## Data Flow

1.  **User Interaction:** The user interacts with the Vue.js components in the browser.
2.  **API Requests:** The frontend sends API requests to the Nuxt.js backend using `useFetch` or `$fetch`.
3.  **Backend Processing:** The backend processes the requests, interacts with the MongoDB database, and may delegate tasks to the Python workers.
4.  **Data Response:** The backend sends a JSON response back to the frontend.
5.  **UI Update:** The frontend updates the UI based on the response from the backend.

## Authentication

-   **Session Management:** Authentication is session-based. When a user logs in, a session is created on the server, and a session ID is stored in a cookie on the client.
-   **Middleware:**
    -   `server/middleware/auth.js`: This server-side middleware runs on every API request. It reads the session ID from the cookie, retrieves the user from the database, and attaches the user's information to the request context.
    -   `middleware/auth.js`: This client-side route middleware protects pages from unauthenticated access. It checks if the user is authenticated and redirects them accordingly.
-   **State Management:** The `authStore` composable (`composables/auth.js`) manages the user's authentication state on the client-side.

## API Endpoints

The API endpoints are defined in the `server/api/` directory. The main resources are:

-   `/api/auth`: Authentication-related endpoints (login, logout, OAuth).
-   `/api/files`: File management endpoints (upload, delete, etc.).
-   `/api/nest`: Endpoints for the nesting functionality.
-   `/api/payment`: Payment-related endpoints (Stripe integration).
-   `/api/project`: Project management endpoints.
-   `/api/user`: User management endpoints.

## State Management

The application uses Vue's built-in reactivity and composables for state management, following a pattern similar to Pinia or Vuex.

-   **Composables:** State is managed within composable functions in the `composables/` directory.
-   **Stores:** Each composable acts as a "store" for a specific feature (e.g., `authStore`, `filesStore`).
-   **Reactivity:** The state is defined as a `reactive` object, and getters are defined as `computed` properties. Actions are plain functions that modify the state.
-   **Readonly:** The stores are wrapped in `readonly` to prevent direct modification of the state from outside the store.

## Key Principles

-   **Modularity:** The code is organized into modules by feature (e.g., auth, files, payment).
-   **Separation of Concerns:** There is a clear separation between the frontend, backend, and worker processes.
-   **Composability:** Vue composables are used extensively for state management and reusable logic.
-   **Utility-First CSS:** Tailwind CSS is used for styling, promoting a utility-first approach.
-   **Server-Side Rendering (SSR):** The application is server-side rendered, which is beneficial for SEO and initial page load performance.
