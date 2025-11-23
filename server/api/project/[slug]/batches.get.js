import { defineEventHandler, createError, readBody } from "h3";
import { connectDB } from "~/server/db/mongo";
import { ObjectId } from "mongodb";

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const projectSlug = event.context.params.slug;
  const db = await connectDB();

  // Verify project ownership
  const project = await db.collection("projects").findOne({
    slug: projectSlug,
    ownerId: userId
  });

  if (!project) {
    throw createError({ statusCode: 404, message: "Project not found" });
  }

  // Get batches for this project
  const batches = await db.collection("batches")
    .find({ projectSlug })
    .sort({ batchNumber: 1 })
    .toArray();

  return batches;
});
