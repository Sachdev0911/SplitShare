# SplitShare - Production Expense Splitter

## Overview
SplitShare is a full-stack expense-splitting application designed for high performance and scalability. It features real-time updates, multi-currency support, and a greedy settlement algorithm.

## Tech Stack
- **Frontend**: React (Vite) + Tailwind CSS + Motion
- **Backend**: Node.js + Express + TypeScript
- **Database**: Firebase Firestore (NoSQL)
- **Auth**: Firebase Authentication
- **Real-time**: Socket.io
- **DevOps**: Docker, Nginx, GitHub Actions (Config provided)

## Project Structure
- `/src`: Frontend React application
- `/server.ts`: Express backend server
- `/firestore.rules`: Security rules for database
- `/firebase-blueprint.json`: Database schema definition
- `/Dockerfile`: Containerization config
- `/.github/workflows`: CI/CD pipeline

## Setup Instructions
1. **Firebase Setup**: Accept the Firebase terms in the UI to provision the database and auth.
2. **Environment Variables**:
   - `GEMINI_API_KEY`: For AI features (auto-injected).
   - `APP_URL`: Base URL for the app (auto-injected).
3. **Run Locally**:
   ```bash
   npm install
   npm run dev
   ```

## Features
- Group Management
- Expense Tracking with multiple split types (Equal, Exact, Percentage, Shares)
- Real-time Balance Tracking
- Debt Settlement Algorithm (Greedy)
- Audit Logging
- Mobile-first Responsive Design
