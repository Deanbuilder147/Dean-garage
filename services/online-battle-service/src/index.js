import express from 'express';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import expressWs from 'express-ws';
import app from './app.js';
import config from './config/index.js';

const PORT = config.port || 3006;

// Create HTTP server
const server = http.createServer(app);

// Initialize express-ws
expressWs(app, server);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store connected clients and rooms
const clients = new Map(); // socket -> { userId, username, rooms }
const roomClients = new Map(); // roomId -> Set of sockets

// Broadcast to all clients in a room
const broadcastToRoom = (roomId, message, excludeSocket = null) => {
  const roomSet = roomClients.get(roomId);
  if (!roomSet) return;
  
  roomSet.forEach(socket => {
    if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  });
};

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');
  
  let userId = null;
  let username = null;
  
  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'auth':
          // Authenticate WebSocket connection
          // In production, validate the token here
          userId = message.payload.userId;
          username = message.payload.username;
          clients.set(ws, { userId, username, rooms: new Set() });
          ws.send(JSON.stringify({ type: 'auth_success', payload: { userId, username } }));
          console.log(`User ${username} authenticated via WebSocket`);
          break;
          
        case 'join_room':
          const roomId = message.payload.roomId;
          if (!roomId) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room ID required' } }));
            break;
          }
          
          // Add to room
          if (!roomClients.has(roomId)) {
            roomClients.set(roomId, new Set());
          }
          roomClients.get(roomId).add(ws);
          
          // Update client's room list
          const clientData = clients.get(ws);
          if (clientData) {
            clientData.rooms.add(roomId);
          }
          
          // Broadcast to room
          broadcastToRoom(roomId, {
            type: 'room_update',
            payload: {
              action: 'player_joined',
              roomId,
              player: { userId, username }
            }
          });
          
          ws.send(JSON.stringify({
            type: 'room_joined',
            payload: { roomId }
          }));
          console.log(`User ${username} joined room ${roomId}`);
          break;
          
        case 'leave_room':
          const leaveRoomId = message.payload.roomId;
          if (!leaveRoomId) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room ID required' } }));
            break;
          }
          
          const leaveRoomSet = roomClients.get(leaveRoomId);
          if (leaveRoomSet) {
            leaveRoomSet.delete(ws);
            if (leaveRoomSet.size === 0) {
              roomClients.delete(leaveRoomId);
            }
          }
          
          const leaveClientData = clients.get(ws);
          if (leaveClientData) {
            leaveClientData.rooms.delete(leaveRoomId);
          }
          
          broadcastToRoom(leaveRoomId, {
            type: 'room_update',
            payload: {
              action: 'player_left',
              roomId: leaveRoomId,
              player: { userId, username }
            }
          });
          
          ws.send(JSON.stringify({
            type: 'room_left',
            payload: { roomId: leaveRoomId }
          }));
          console.log(`User ${username} left room ${leaveRoomId}`);
          break;
          
        case 'room_message':
          const chatRoomId = message.payload.roomId;
          const chatMessage = message.payload.message;
          
          if (!chatRoomId || !chatMessage) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room ID and message required' } }));
            break;
          }
          
          broadcastToRoom(chatRoomId, {
            type: 'room_message',
            payload: {
              roomId: chatRoomId,
              from: { userId, username },
              message: chatMessage,
              timestamp: new Date().toISOString()
            }
          });
          console.log(`Message in room ${chatRoomId} from ${username}`);
          break;
          
        case 'room_action':
          const actionRoomId = message.payload.roomId;
          const action = message.payload.action;
          const actionData = message.payload.data;
          
          if (!actionRoomId || !action) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room ID and action required' } }));
            break;
          }
          
          broadcastToRoom(actionRoomId, {
            type: 'room_action',
            payload: {
              roomId: actionRoomId,
              action,
              data: actionData,
              from: { userId, username },
              timestamp: new Date().toISOString()
            }
          });
          console.log(`Action ${action} in room ${actionRoomId} from ${username}`);
          break;
          
        default:
          ws.send(JSON.stringify({ type: 'error', payload: { message: 'Unknown message type' } }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    
    const clientData = clients.get(ws);
    if (clientData) {
      // Remove from all rooms
      clientData.rooms.forEach(roomId => {
        const roomSet = roomClients.get(roomId);
        if (roomSet) {
          roomSet.delete(ws);
          if (roomSet.size === 0) {
            roomClients.delete(roomId);
          } else {
            // Notify remaining players
            broadcastToRoom(roomId, {
              type: 'room_update',
              payload: {
                action: 'player_left',
                roomId,
                player: { userId: clientData.userId, username: clientData.username }
              }
            });
          }
        }
      });
      
      clients.delete(ws);
    }
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  // Send ping to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
  
  ws.on('close', () => clearInterval(pingInterval));
});

// Start server
server.listen(PORT, () => {
  console.log(`Online Battle Service running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  wss.clients.forEach(client => {
    client.close();
  });
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default { server, wss, broadcastToRoom };
