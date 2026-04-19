import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';

const BASE_URL = 'http://localhost:3006';

// Helper function to make HTTP requests
const request = (method, path, body = null, token = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3006,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
};

describe('Online Battle Service API', () => {
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request('GET', '/health');
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.status, 'healthy');
    });
  });

  describe('Matchmaking', () => {
    describe('POST /api/matchmaking/queue', () => {
      it('should join ranked queue', async () => {
        const response = await request('POST', '/api/matchmaking/queue', {
          queueType: 'ranked',
          faction: 'vees',
          teamSize: 1
        });

        // Should fail without auth token
        assert.strictEqual(response.status, 401);
      });
    });

    describe('GET /api/matchmaking/queue/status', () => {
      it('should return queue status', async () => {
        const response = await request('GET', '/api/matchmaking/queue/status');
        
        // Should fail without auth token
        assert.strictEqual(response.status, 401);
      });
    });
  });

  describe('Rooms', () => {
    describe('POST /api/rooms', () => {
      it('should create a room', async () => {
        const response = await request('POST', '/api/rooms', {
          name: 'Test Room',
          settings: {
            mapId: 'map_001',
            maxPlayers: 10,
            teamSize: 5,
            battleType: 'casual',
            isPrivate: false
          }
        });

        // Should fail without auth token
        assert.strictEqual(response.status, 401);
      });
    });

    describe('GET /api/rooms', () => {
      it('should list rooms', async () => {
        const response = await request('GET', '/api/rooms?limit=10&offset=0');
        
        // Should succeed without auth for public rooms
        assert.strictEqual(response.status, 200);
        assert(Array.isArray(response.body.rooms));
      });
    });
  });

  describe('Leaderboard', () => {
    describe('GET /api/leaderboard/global', () => {
      it('should return global leaderboard', async () => {
        const response = await request('GET', '/api/leaderboard/global?limit=10&offset=0');
        
        assert.strictEqual(response.status, 200);
        assert(Array.isArray(response.body.leaderboard));
        assert(response.body.pagination !== undefined);
      });
    });

    describe('GET /api/leaderboard/faction/:faction', () => {
      it('should return faction leaderboard', async () => {
        const response = await request('GET', '/api/leaderboard/faction/vees?limit=10&offset=0');
        
        assert.strictEqual(response.status, 200);
        assert(Array.isArray(response.body.leaderboard));
        assert.strictEqual(response.body.faction, 'vees');
      });
    });

    describe('GET /api/leaderboard/stats', () => {
      it('should return leaderboard stats', async () => {
        const response = await request('GET', '/api/leaderboard/stats');
        
        assert.strictEqual(response.status, 200);
        assert(typeof response.body.totalPlayers === 'number');
        assert(Array.isArray(response.body.factionDistribution));
      });
    });
  });

  describe('Battle History', () => {
    describe('GET /api/battles/history', () => {
      it('should return battle history', async () => {
        const response = await request('GET', '/api/battles/history?limit=10&offset=0');
        
        // Should fail without auth token
        assert.strictEqual(response.status, 401);
      });
    });

    describe('GET /api/battles/recent', () => {
      it('should return recent battles', async () => {
        const response = await request('GET', '/api/battles/recent?limit=10&offset=0');
        
        assert.strictEqual(response.status, 200);
        assert(Array.isArray(response.body.battles));
      });
    });
  });
});

describe('WebSocket Connection', () => {
  it('should connect via WebSocket', async () => {
    const WebSocket = require('ws');
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:3006');
      
      ws.on('open', () => {
        ws.close();
        resolve();
      });
      
      ws.on('error', reject);
      
      setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
    });
  });
});
