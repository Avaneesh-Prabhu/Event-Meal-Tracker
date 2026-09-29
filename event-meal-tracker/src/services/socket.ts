import { io, Socket } from 'socket.io-client';

// Connect to the same origin the page was loaded from. In dev, Vite's proxy
// (see vite.config.ts) forwards /socket.io to the backend on PORT 4000. In
// production, server/index.js serves the built frontend itself, so "same
// origin" is simply correct with nothing to configure.
export const socket: Socket = io({
  autoConnect: true,
  reconnection: true
});
