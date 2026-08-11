import { requireAuth } from '../../utils/permissions.js';
import * as usersService from '../../features/users/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const user = await usersService.getById(auth.userId);
  if (!user) {
    setResponseStatus(401);
    return {};
  }
  const data = user.toJSON();
  return {
    id: data._id,
    name: data.identity?.name,
    email: data.data?.email,
    avatar: data.data?.avatarUrl || null,
    isAdmin: Boolean(auth.isAdmin),
  };
});
