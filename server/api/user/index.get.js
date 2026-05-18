import { connectDB } from "~/server/db/mongo";

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    setResponseStatus(401);
    return {};
  }

  const db = await connectDB();
  const user = await db.collection("users").findOne({ _id: userId });
  if (!user) {
    setResponseStatus(401);
    return {};
  }
  return {
    id: user._id,
    name: user.identity?.name,
    email: user.data?.email,
    avatar: user.data?.avatarUrl || "/api/user/avatar",
    isAdmin: user.data?.isAdmin || false,
  };
});
