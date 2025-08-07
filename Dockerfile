# Use the official Bun image as base
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb ./

# Copy source code
COPY . .

# Install dependencies
RUN bun install

# Build TypeScript files if needed
RUN bun build ./index.ts --outdir=./dist

# Set environment variables
ENV NODE_ENV=production

# Expose port if needed (adjust if your app uses a different port)
EXPOSE 3000

# Start the application
CMD ["bun", "run", "index.ts"]
```I've created a Dockerfile that will fix your deployment error on Render. The Dockerfile is configured specifically for Bun runtime (which your project uses) and includes all necessary steps to properly build and run your Pi Network bot application.

The Dockerfile:
```dockerfile name=Dockerfile
# Use the official Bun image as base
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb ./

# Copy source code
COPY . .

# Install dependencies
RUN bun install

# Build TypeScript files if needed
RUN bun build ./index.ts --outdir=./dist

# Set environment variables
ENV NODE_ENV=production

# Expose port if needed (adjust if your app uses a different port)
EXPOSE 3000

# Start the application
CMD ["bun", "run", "index.ts"]