/**
 * room.contract.ts — 房间 / 联机强契约
 *
 * Phase 33-Contract（2026-08-06）。
 *
 * @module @mecha/shared-kernel/contracts/room
 */

import { z } from 'zod';
import { EntityId, DisplayLabel, RoleEnum, RoomStatusEnum } from './primitives.js';

export const RoomPlayerContract = z.object({
  userId: EntityId,
  username: DisplayLabel,
  faction: z.string().default('neutral'),
  team: z.number().int().default(0),
  ready: z.boolean().default(false),
  joinedAt: z.string().default(() => new Date().toISOString()),
  identityRole: z.enum(['player', 'referee', 'visitor']).optional(),
  tacticalSlot: RoleEnum.nullable().optional(),
  isSpectator: z.boolean().optional(),
  selectedUnits: z.array(z.string()).optional(),
}).passthrough();

export const RoomSettingsContract = z.object({
  name: DisplayLabel,
  maxPlayers: z.number().int().min(1).default(8),
  mapId: EntityId,
  turnTimeLimit: z.number().int().min(0).default(0),
  isPrivate: z.boolean().default(false),
  password: z.string().optional(),
  rules: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

export const RoomContract = z.object({
  id: EntityId,
  status: RoomStatusEnum.default(RoomStatusEnum.enum.WAITING),
  settings: RoomSettingsContract,
  hostId: EntityId,
  players: z.array(RoomPlayerContract).default([]),
  battleId: EntityId.optional(),
}).passthrough();

export type Room = z.infer<typeof RoomContract>;
