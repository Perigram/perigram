import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as usersRepository from '../../features/users/repository.js';
import * as organizationsRepository from '../../features/organizations/repository.js';
import { ObjectId } from 'mongodb';
import { User } from '../../features/users/model.js';
import { Organization } from '../../features/organizations/model.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  console.log(`[API] Fetching orgs for user: ${auth.userId}`);
  
  // Fetch user fresh to get all memberships
  const userRaw = await usersRepository.findById(auth.userId);
  if (!userRaw) {
    console.warn(`[API] User not found for ID: ${auth.userId}`);
    return [];
  }
  
  const user = new User(userRaw);
  console.log(`[API] User found: ${user.email}. Memberships: ${user.memberships?.length}`);

  if (!user.memberships || user.memberships.length === 0) {
    return [];
  }
  
  const orgIds = user.memberships.map(m => new ObjectId(m.organizationId));
  const orgsRaw = await organizationsRepository.find({ _id: { $in: orgIds } });
  const orgs = orgsRaw.map(raw => new Organization(raw).toJSON());
  console.log(`[API] Returning ${orgs.length} organizations`);
  return orgs;
});
