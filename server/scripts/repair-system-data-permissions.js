/**
 * Repair system-data permissions on stored users.
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../db/mongo.js';
import { materializeRolePermissions } from '../../shared/permission-templates.js';
import { levelAtLeast } from '../../shared/access-control.js';

const GUARANTEED_FEATURES = ['materials', 'layer_standards'];

function floorFeatureAccess(value) {
  if (!value || value === 'none') return 'read';
  if (typeof value === 'string') return levelAtLeast(value, 'read') ? value : 'read';
  if (Array.isArray(value)) return value.map(floorFeatureAccess);
  if (typeof value === 'object') {
    const level = value.level || value.access || 'none';
    return {
      ...value,
      level: levelAtLeast(level, 'read') ? level : 'read'
    };
  }
  return 'read';
}

function ensureSystemDataAccess(role, permissions = {}) {
  const next = materializeRolePermissions(role || 'IndividualUser', permissions || {});
  for (const feature of GUARANTEED_FEATURES) {
    next[feature] = floorFeatureAccess(next[feature]);
  }
  return next;
}

function hasPermissionChanges(original = {}, next = {}) {
  return JSON.stringify(original || {}) !== JSON.stringify(next || {});
}

async function main() {
  console.log('🛠️  Repairing stored user permissions for system data...\n');

  try {
    const db = await connectDB();
    const users = await db.collection('users').find({}).toArray();

    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      const role = user.data?.role || 'IndividualUser';
      const currentPermissions = user.data?.permissions || {};
      const currentMemberships = user.data?.memberships || [];

      const nextPermissions = ensureSystemDataAccess(role, currentPermissions);
      const nextMemberships = currentMemberships.map(membership => ({
        ...membership,
        permissions: ensureSystemDataAccess(membership.role || role, membership.permissions || {})
      }));

      const permissionsChanged = hasPermissionChanges(currentPermissions, nextPermissions);
      const membershipsChanged = hasPermissionChanges(currentMemberships, nextMemberships);

      if (!permissionsChanged && !membershipsChanged) {
        skipped++;
        continue;
      }

      await db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            'data.permissions': nextPermissions,
            'data.memberships': nextMemberships
          }
        }
      );
      updated++;
    }

    console.log(`\n✨ Updated ${updated} user records (${skipped} already compliant)`);
  } catch (error) {
    console.error('\n❌ Repair failed:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
