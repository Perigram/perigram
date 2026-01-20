import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersRepository from '~/server/features/users/repository';
import * as organizationsRepository from '~/server/features/organizations/repository';
import { ObjectId } from 'mongodb';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  // Fetch user fresh to get all memberships
  const user = await usersRepository.findById(auth.userId);
  if (!user || !user.memberships || user.memberships.length === 0) {
    return [];
  }
  
  const orgIds = user.memberships.map(m => new ObjectId(m.organizationId));
  return await organizationsRepository.find({ _id: { $in: orgIds } });
});
