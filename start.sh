#!/bin/bash

# Start script with multiple fallback options

echo "🚀 Starting Pi Network Bot Server..."

# Check if server.ts exists
if [ -f "server.ts" ]; then
    echo "✅ Found server.ts, starting with Bun..."
    exec bun run server.ts
elif [ -f "dist/server.js" ]; then
    echo "✅ Found compiled server.js, starting..."
    exec bun run dist/server.js
elif [ -f "index.ts" ]; then
    echo "⚠️  No server.ts found, using fallback index.ts..."
    # Create a minimal server wrapper
    cat > temp-server.ts << 'EOF'
import { serve } from 'bun';

// Import the bot logic
import './index.ts';

const PORT = process.env.PORT || 3000;

// Create a minimal HTTP server
serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === '/health') {
      return Response.json({ status: 'healthy', mode: 'fallback' });
    }
    
    return new Response('Pi Bot Running (Fallback Mode)', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
});

console.log(`🚀 Server running on port ${PORT} (fallback mode)`);
EOF
    exec bun run temp-server.ts
else
    echo "❌ No executable file found!"
    echo "Available files:"
    ls -la
    exit 1
fi