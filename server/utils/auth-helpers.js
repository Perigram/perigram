import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createError } from 'h3';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = '15m';

// Password hashing
export async function hashPassword(password) {
  return await argon2.hash(password);
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// JWT tokens (NO permissions - fetch fresh on each request)
export function generateAccessToken(userId) {
  return jwt.sign(
    { userId: userId.toString() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw createError({ statusCode: 401, message: 'Invalid token' });
  }
}

// Permission checks
export function hasPermission(user, entity, requiredLevel) {
  const userLevel = user.permissions?.[entity] || 'none';
  
  const levels = ['none', 'read', 'write', 'admin'];
  const userLevelIndex = levels.indexOf(userLevel);
  const requiredLevelIndex = levels.indexOf(requiredLevel);
  
  return userLevelIndex >= requiredLevelIndex;
}

export function canAccessEntity(user, entityType, entityId) {
  // If no restrictions, can access all in org
  if (!user.restrictedTo) return true;
  
  const restrictedField = `${entityType}Ids`;
  if (!user.restrictedTo[restrictedField]) return true;
  
  return user.restrictedTo[restrictedField].includes(entityId.toString());
}

// Session generation
export function generateSession() {
  const sessionId = Array.from({ length: 64 }, () => 
    Math.random().toString(36)[2]).join('');
  
  return {
    sessionId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    createdAt: new Date()
  };
}