import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import url from 'url';
import { prisma } from '../config/prisma';
import { allowedOrigins } from '../config/security';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

// Map of roomId (notaId) to Set of connected clients
const rooms = new Map<string, Set<WebSocket>>();
const usedTickets = new Map<string, number>();

// Map to store user info per socket
interface SocketUser {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  color: string;
}

const socketUsers = new WeakMap<WebSocket, SocketUser>();

function generateColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function broadcastToRoom(roomId: string, message: any, excludeSocket?: WebSocket) {
  const clients = rooms.get(roomId);
  if (!clients) return;
  
  const payload = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastUsersList(roomId: string) {
  const clients = rooms.get(roomId);
  if (!clients) return;
  
  // Get all users in the room and deduplicate by userId
  const uniqueUsersMap = new Map<string, SocketUser>();
  
  Array.from(clients).forEach(client => {
    const user = socketUsers.get(client);
    if (user && !uniqueUsersMap.has(user.id)) {
      uniqueUsersMap.set(user.id, user);
    }
  });
  
  const users = Array.from(uniqueUsersMap.values());
  broadcastToRoom(roomId, { type: 'presence', users });
}

export function initializeWebSockets(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      ws.close(4003, 'Origin is not allowed');
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);
    const protocolHeader = req.headers['sec-websocket-protocol'] || '';
    const ticketProtocol = protocolHeader.split(',').map((protocol) => protocol.trim())
      .find((protocol) => protocol.startsWith('tesseract-ticket.'));
    const ticket = ticketProtocol?.slice('tesseract-ticket.'.length);
    let roomId = '';
    try {
      roomId = decodeURIComponent(parsedUrl.pathname?.slice(1) || ''); // workspaceId:notaId
    } catch {
      ws.close(4001, 'Invalid room');
      return;
    }

    if (!ticket || !roomId) {
      ws.close(4001, 'Unauthorized or missing room');
      return;
    }

    let decoded: { userId: string; authVersion: number; purpose: string; roomId: string; jti?: string };
    try {
      decoded = jwt.verify(ticket, JWT_SECRET) as typeof decoded;
    } catch (err) {
      ws.close(4001, 'Unauthorized: Invalid token');
      return;
    }

    const now = Date.now();
    for (const [ticketId, expiresAt] of usedTickets) {
      if (expiresAt <= now) usedTickets.delete(ticketId);
    }
    if (decoded.purpose !== 'collaboration' || decoded.roomId !== roomId || !decoded.jti || usedTickets.has(decoded.jti)) {
      ws.close(4001, 'Unauthorized: Invalid ticket');
      return;
    }
    usedTickets.set(decoded.jti, now + 30_000);

    const userId = decoded.userId;
    
    // Fetch user details from DB
    let userName = 'Usuário';
    let userUsername: string | null = null;
    let userAvatarUrl: string | null = null;
    try {
      const user = await prisma.user.findUnique({ 
        where: { id: userId },
        select: { id: true, name: true, username: true, email: true, avatarUrl: true, authVersion: true }
      });
      if (user && user.authVersion === decoded.authVersion) {
        const [workspaceId, noteId, ...extra] = roomId.split(':');
        const membership = extra.length === 0 ? await prisma.workspace.findFirst({
          where: {
            id: workspaceId,
            notas: { some: { id: noteId } },
            OR: [{ userId }, { collaborators: { some: { userId } } }],
          },
          select: { id: true },
        }) : null;
        if (!membership) {
          ws.close(4003, 'Unauthorized: Room access denied');
          return;
        }
        userName = user.name || (user.username ? `@${user.username}` : user.email.split('@')[0]);
        userUsername = user.username;
        userAvatarUrl = user.avatarUrl;
      } else {
        ws.close(4001, 'Unauthorized: Session expired');
        return;
      }
    } catch (e) {
      console.error('Failed to fetch user', e);
      ws.close(1011, 'Unable to validate session');
      return;
    }
    
    // Store user data
    socketUsers.set(ws, { 
      id: userId, 
      name: userName,
      username: userUsername,
      avatarUrl: userAvatarUrl,
      color: generateColor(userId)
    });

    // Add to room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId)!.add(ws);

    // Send immediate presence update
    broadcastUsersList(roomId);

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        const user = socketUsers.get(ws);
        
        // Broadcast standard changes to everyone else in the room
        if (data.type === 'document_change' || data.type === 'drawing_change') {
          broadcastToRoom(roomId, data, ws);
        } else if (data.type === 'cursor_move' && user) {
          broadcastToRoom(roomId, {
            type: 'cursor_move',
            userId: user.id,
            userName: user.name,
            username: user.username,
            avatarUrl: user.avatarUrl,
            color: user.color,
            x: data.x,
            y: data.y,
            selectionStart: data.selectionStart,
            selectionEnd: data.selectionEnd,
            textMode: data.textMode === true,
            active: data.active !== false
          }, ws);
        }
      } catch (e) {
        console.error('Invalid message received', e);
      }
    });

    ws.on('close', () => {
      const user = socketUsers.get(ws);
      if (user) {
        broadcastToRoom(roomId, {
          type: 'cursor_move',
          userId: user.id,
          userName: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl,
          color: user.color,
          active: false
        }, ws);
      }

      const clients = rooms.get(roomId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          rooms.delete(roomId);
        } else {
          broadcastUsersList(roomId);
        }
      }
    });
  });
}
