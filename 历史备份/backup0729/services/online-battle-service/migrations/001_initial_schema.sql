-- Online Battle Service Database Schema
-- Migration: 001_initial_schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table (synced with auth-service)
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL,
    faction VARCHAR(50) DEFAULT 'independents',
    elo INTEGER DEFAULT 1500,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_players_elo ON players(elo DESC);
CREATE INDEX idx_players_faction ON players(faction);
CREATE INDEX idx_players_user_id ON players(user_id);

-- Active queues
CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    queue_type VARCHAR(20) NOT NULL CHECK (queue_type IN ('ranked', 'casual')),
    faction VARCHAR(50),
    team_size INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queues_player ON queues(player_id);
CREATE INDEX idx_queues_type ON queues(queue_type);
CREATE INDEX idx_queues_created ON queues(created_at);

-- Battle rooms
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    host_id UUID NOT NULL REFERENCES players(id),
    map_id VARCHAR(50),
    max_players INTEGER DEFAULT 10,
    team_size INTEGER DEFAULT 5,
    battle_type VARCHAR(20) DEFAULT 'casual' CHECK (battle_type IN ('ranked', 'casual', 'custom')),
    is_private BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'active', 'completed', 'closed')),
    battle_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rooms_host ON rooms(host_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_battle_type ON rooms(battle_type);

-- Room players
CREATE TABLE IF NOT EXISTS room_players (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team INTEGER DEFAULT 0,
    is_ready BOOLEAN DEFAULT FALSE,
    is_host BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, player_id)
);

CREATE INDEX idx_room_players_player ON room_players(player_id);
CREATE INDEX idx_room_players_ready ON room_players(room_id, is_ready);

-- Room messages
CREATE TABLE IF NOT EXISTS room_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_room_messages_room ON room_messages(room_id);
CREATE INDEX idx_room_messages_created ON room_messages(created_at DESC);

-- Seasons
CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_number INTEGER NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_seasons_active ON seasons(is_active);
CREATE INDEX idx_seasons_number ON seasons(season_number);

-- Seasonal rankings
CREATE TABLE IF NOT EXISTS seasonal_rankings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    peak_elo INTEGER DEFAULT 1500,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    final_rank INTEGER,
    UNIQUE(season_id, player_id)
);

CREATE INDEX idx_seasonal_rankings_season ON seasonal_rankings(season_id);
CREATE INDEX idx_seasonal_rankings_player ON seasonal_rankings(player_id);
CREATE INDEX idx_seasonal_rankings_elo ON seasonal_rankings(season_id, peak_elo DESC);

-- Battles
CREATE TABLE IF NOT EXISTS battles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id),
    battle_type VARCHAR(20) NOT NULL,
    map_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    winner_faction VARCHAR(50),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    replay_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_battles_room ON battles(room_id);
CREATE INDEX idx_battles_status ON battles(status);
CREATE INDEX idx_battles_type ON battles(battle_type);
CREATE INDEX idx_battles_created ON battles(created_at DESC);

-- Battle participants
CREATE TABLE IF NOT EXISTS battle_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id),
    faction VARCHAR(50) NOT NULL,
    team INTEGER NOT NULL,
    result VARCHAR(20),
    elo_change INTEGER DEFAULT 0,
    player_elo_before INTEGER,
    player_elo_after INTEGER,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_battle_participants_battle ON battle_participants(battle_id);
CREATE INDEX idx_battle_participants_player ON battle_participants(player_id);

-- Battle stats (per unit)
CREATE TABLE IF NOT EXISTS battle_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES battle_participants(id) ON DELETE CASCADE,
    unit_id VARCHAR(50) NOT NULL,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    damage_dealt INTEGER DEFAULT 0,
    damage_received INTEGER DEFAULT 0,
    turns_active INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_battle_stats_battle ON battle_stats(battle_id);
CREATE INDEX idx_battle_stats_participant ON battle_stats(participant_id);

-- Battle history view (for quick access)
CREATE OR REPLACE VIEW player_battle_history AS
SELECT 
    bp.player_id,
    b.id as battle_id,
    b.battle_type,
    m.name as map_name,
    bp.result,
    bp.faction,
    bp.elo_change,
    b.ended_at,
    EXTRACT(EPOCH FROM (b.ended_at - b.started_at)) as duration_seconds
FROM battle_participants bp
JOIN battles b ON bp.battle_id = b.id
LEFT JOIN maps m ON b.map_id = m.id
WHERE b.status = 'completed'
ORDER BY b.ended_at DESC;

-- Functions

-- Update player ELO
CREATE OR REPLACE FUNCTION update_player_elo(
    p_player_id UUID,
    p_elo_change INTEGER
) RETURNS VOID AS $$
BEGIN
    UPDATE players 
    SET 
        elo = GREATEST(0, elo + p_elo_change),
        wins = wins + CASE WHEN p_elo_change > 0 THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN p_elo_change < 0 THEN 1 ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql;

-- Get or create active season
CREATE OR REPLACE FUNCTION get_or_create_active_season() 
RETURNS TABLE(
    id UUID,
    season_number INTEGER,
    name VARCHAR,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_season RECORD;
BEGIN
    SELECT * INTO v_season FROM seasons WHERE is_active = TRUE LIMIT 1;
    
    IF v_season IS NULL THEN
        SELECT COALESCE(MAX(season_number), 0) + 1 INTO v_season.season_number FROM seasons;
        
        INSERT INTO seasons (season_number, name, start_date, is_active)
        VALUES (
            v_season.season_number,
            'Season ' || v_season.season_number,
            CURRENT_TIMESTAMP,
            TRUE
        )
        RETURNING * INTO v_season;
    END IF;
    
    RETURN QUERY SELECT v_season.id, v_season.season_number, v_season.name, 
                        v_season.start_date, v_season.end_date;
END;
$$ LANGUAGE plpgsql;

-- Update or create seasonal ranking
CREATE OR REPLACE FUNCTION update_seasonal_ranking(
    p_season_id UUID,
    p_player_id UUID,
    p_new_elo INTEGER
) RETURNS VOID AS $$
BEGIN
    INSERT INTO seasonal_rankings (season_id, player_id, peak_elo, games_played)
    VALUES (p_season_id, p_player_id, p_new_elo, 1)
    ON CONFLICT (season_id, player_id) DO UPDATE SET
        peak_elo = GREATEST(seasonal_rankings.peak_elo, p_new_elo),
        games_played = seasonal_rankings.games_played + 1;
END;
$$ LANGUAGE plpgsql;

-- Initial data

-- Create first season if not exists
INSERT INTO seasons (season_number, name, start_date, is_active)
SELECT 1, 'Season 1', CURRENT_TIMESTAMP, TRUE
WHERE NOT EXISTS (SELECT 1 FROM seasons LIMIT 1);
