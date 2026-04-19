# Dean-Garage Online Battle Service

Real-time matchmaking, battle rooms, leaderboards, and battle history service for the Dean-Garage mecha battle game.

## Features

- **Matchmaking System**: ELO-based ranked matchmaking, casual queues, custom rooms
- **Battle Rooms**: Create/join rooms, configurable settings, real-time chat
- **Leaderboards**: Global rankings, faction rankings, seasonal competitions
- **Battle History**: Complete battle records, statistics tracking, replay data
- **Real-time Updates**: WebSocket support for live room updates

## Architecture

```
online-battle-service/
├── src/
│   ├── app.js              # Express app setup
│   ├── index.js            # Entry point with WebSocket
│   ├── config/
│   │   └── config.js       # Configuration
│   ├── database/
│   │   └── db.js           # Database interface
│   ├── middleware/
│   │   ├── auth.js         # Authentication
│   │   └── validation.js   # Request validation
│   ├── models/
│   │   └── index.js        # Data models
│   ├── routes/
│   │   ├── matchmaking.js  # Matchmaking endpoints
│   │   ├── rooms.js        # Room management
│   │   ├── leaderboard.js  # Leaderboard endpoints
│   │   └── battles.js      # Battle history
│   └── services/
│       ├── matchmakingService.js
│       ├── roomService.js
│       ├── leaderboardService.js
│       └── battleHistoryService.js
├── migrations/
│   └── 001_initial_schema.sql
├── tests/
│   └── api.test.js
├── package.json
├── Dockerfile
└── README.md
```

## API Documentation

### Matchmaking

#### Join Queue
```
POST /api/matchmaking/queue
Authorization: Bearer <token>

{
  "queueType": "ranked" | "casual",
  "faction": "vees" | "raptors" | "independents",
  "teamSize": 1 | 3 | 5
}

Response:
{
  "queueId": "uuid",
  "queueType": "ranked",
  "estimatedWaitTime": 45,
  "position": 3
}
```

#### Leave Queue
```
DELETE /api/matchmaking/queue/:queueId
Authorization: Bearer <token>

Response:
{
  "message": "Left queue successfully"
}
```

#### Queue Status
```
GET /api/matchmaking/queue/status
Authorization: Bearer <token>

Response:
{
  "inQueue": true,
  "queueId": "uuid",
  "queueType": "ranked",
  "waitTime": 30,
  "position": 2
}
```

### Battle Rooms

#### Create Room
```
POST /api/rooms
Authorization: Bearer <token>

{
  "name": "My Custom Battle",
  "settings": {
    "mapId": "map_001",
    "maxPlayers": 10,
    "teamSize": 5,
    "battleType": "ranked" | "casual" | "custom",
    "isPrivate": false,
    "password": "optional"
  }
}

Response:
{
  "room": {
    "id": "room_uuid",
    "name": "My Custom Battle",
    "hostId": "user_uuid",
    "settings": {...},
    "players": [...],
    "status": "waiting",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

#### Join Room
```
POST /api/rooms/:roomId/join
Authorization: Bearer <token>

{
  "password": "required_if_private"
}

Response:
{
  "room": {...},
  "message": "Joined room successfully"
}
```

#### Leave Room
```
POST /api/rooms/:roomId/leave
Authorization: Bearer <token>

Response:
{
  "message": "Left room successfully"
}
```

#### Update Room Settings (Host Only)
```
PUT /api/rooms/:roomId/settings
Authorization: Bearer <token>

{
  "mapId": "map_002",
  "maxPlayers": 8,
  "isPrivate": true,
  "password": "newpassword"
}

Response:
{
  "room": {...}
}
```

#### Set Player Ready
```
POST /api/rooms/:roomId/ready
Authorization: Bearer <token>

{
  "isReady": true
}

Response:
{
  "player": {
    "userId": "uuid",
    "isReady": true
  }
}
```

#### Start Battle (Host Only)
```
POST /api/rooms/:roomId/start
Authorization: Bearer <token>

Response:
{
  "battleId": "battle_uuid",
  "message": "Battle started",
  "combatServiceUrl": "http://combat-service:3003"
}
```

#### Room Chat
```
POST /api/rooms/:roomId/chat
Authorization: Bearer <token>

{
  "message": "Hello everyone!"
}

Response:
{
  "message": {
    "id": "msg_uuid",
    "from": { "userId": "uuid", "username": "Player1" },
    "message": "Hello everyone!",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### Leaderboards

#### Global Leaderboard
```
GET /api/leaderboard/global?limit=50&offset=0

Response:
{
  "leaderboard": [
    {
      "rank": 1,
      "playerId": "uuid",
      "username": "TopPlayer",
      "faction": "vees",
      "elo": 2500,
      "wins": 150,
      "losses": 50,
      "winRate": 0.75
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Faction Leaderboard
```
GET /api/leaderboard/faction/:faction?limit=50&offset=0

Response: Similar to global leaderboard
```

#### Seasonal Leaderboard
```
GET /api/leaderboard/season?season=1&limit=50&offset=0

Response:
{
  "season": 1,
  "isActive": true,
  "leaderboard": [...],
  "pagination": {...}
}
```

#### Player Rank
```
GET /api/leaderboard/rank
Authorization: Bearer <token>

Response:
{
  "rank": 42,
  "totalPlayers": 1000,
  "percentile": 95.8,
  "player": {
    "id": "uuid",
    "username": "Player1",
    "elo": 1850,
    "wins": 75,
    "losses": 45,
    "winRate": 0.625
  }
}
```

#### Leaderboard Stats
```
GET /api/leaderboard/stats

Response:
{
  "totalPlayers": 1000,
  "averageElo": 1500,
  "topElo": 2500,
  "factionDistribution": [
    { "faction": "vees", "count": 400, "averageElo": 1520 },
    { "faction": "raptors", "count": 350, "averageElo": 1480 },
    { "faction": "independents", "count": 250, "averageElo": 1500 }
  ]
}
```

### Battle History

#### My Battle History
```
GET /api/battles/history?limit=20&offset=0
Authorization: Bearer <token>

Response:
{
  "history": [
    {
      "id": "battle_uuid",
      "battleType": "ranked",
      "mapName": "Industrial Complex",
      "result": "victory",
      "faction": "vees",
      "eloChange": 15,
      "endedAt": "2024-01-01T00:00:00Z",
      "duration": 1800
    }
  ],
  "pagination": {...}
}
```

#### Battle Details
```
GET /api/battles/:battleId
Authorization: Bearer <token>

Response:
{
  "battle": {
    "id": "battle_uuid",
    "battleType": "ranked",
    "mapId": "map_001",
    "status": "completed",
    "winnerFaction": "vees",
    "startedAt": "2024-01-01T00:00:00Z",
    "endedAt": "2024-01-01T00:30:00Z",
    "duration": 1800,
    "replayData": {...},
    "participants": [
      {
        "id": "player_uuid",
        "username": "Player1",
        "faction": "vees",
        "team": 1,
        "result": "victory",
        "eloChange": 15,
        "playerElo": 1850,
        "stats": [...]
      }
    ]
  }
}
```

#### Recent Battles
```
GET /api/battles/recent?limit=10&offset=0

Response:
{
  "battles": [...],
  "pagination": {...}
}
```

#### Player Statistics
```
GET /api/battles/stats
Authorization: Bearer <token>

Response:
{
  "stats": {
    "totalBattles": 120,
    "wins": 75,
    "losses": 45,
    "winRate": 0.625,
    "favoriteFaction": "vees",
    "favoriteMap": "Industrial Complex",
    "averageBattleDuration": 1650,
    "totalKills": 450,
    "totalDeaths": 300,
    "kdRatio": 1.5,
    "rankedStats": {...},
    "casualStats": {...}
  }
}
```

## WebSocket API

Connect to `ws://localhost:3006`

### Messages

#### Authentication
```json
{
  "type": "auth",
  "payload": {
    "userId": "user_uuid",
    "username": "Player1",
    "token": "jwt_token"
  }
}
```

#### Join Room
```json
{
  "type": "join_room",
  "payload": {
    "roomId": "room_uuid"
  }
}
```

#### Leave Room
```json
{
  "type": "leave_room",
  "payload": {
    "roomId": "room_uuid"
  }
}
```

#### Room Chat
```json
{
  "type": "room_message",
  "payload": {
    "roomId": "room_uuid",
    "message": "Hello!"
  }
}
```

#### Room Actions (ready, start, etc.)
```json
{
  "type": "room_action",
  "payload": {
    "roomId": "room_uuid",
    "action": "set_ready",
    "data": {
      "isReady": true
    }
  }
}
```

### Events Received

#### Room Update
```json
{
  "type": "room_update",
  "payload": {
    "action": "player_joined",
    "roomId": "room_uuid",
    "player": {
      "userId": "uuid",
      "username": "Player2"
    }
  }
}
```

#### Room Message
```json
{
  "type": "room_message",
  "payload": {
    "roomId": "room_uuid",
    "from": {
      "userId": "uuid",
      "username": "Player2"
    },
    "message": "Hello!",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

#### Room Action
```json
{
  "type": "room_action",
  "payload": {
    "roomId": "room_uuid",
    "action": "player_ready",
    "data": {
      "playerId": "uuid",
      "isReady": true
    },
    "from": {
      "userId": "uuid",
      "username": "Player2"
    },
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## Configuration

Environment variables:

```bash
# Server
PORT=3006
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dean_garage_online_battle

# Auth Service
AUTH_SERVICE_URL=http://localhost:3001

# Combat Service
COMBAT_SERVICE_URL=http://localhost:3003

# Map Service
MAP_SERVICE_URL=http://localhost:3004

# Comm Service
COMM_SERVICE_URL=http://localhost:3005
```

## Development

```bash
# Install dependencies
npm install

# Run migrations
npm run migrate

# Start development server
npm run dev

# Run tests
npm test
```

## Docker

```bash
# Build
docker build -t dean-garage/online-battle-service .

# Run
docker run -p 3006:3006 --env-file .env dean-garage/online-battle-service
```

## Integration

### Auth Service
- Verify JWT tokens on protected endpoints
- Extract user information from tokens

### Combat Service
- Initialize battles when rooms start
- Receive battle completion notifications
- Update battle history and leaderboards

### Map Service
- Fetch available maps
- Validate map selections

### Comm Service
- Forward real-time updates
- Cross-service communication

## Database Schema

See `migrations/001_initial_schema.sql` for complete schema.

Main tables:
- `players` - Player profiles and ELO
- `queues` - Active matchmaking queues
- `rooms` - Battle rooms
- `room_players` - Room membership
- `room_messages` - Room chat
- `battles` - Battle records
- `battle_participants` - Battle participants
- `battle_stats` - Per-unit battle statistics
- `seasons` - Competitive seasons
- `seasonal_rankings` - Season-specific rankings

## License

MIT
