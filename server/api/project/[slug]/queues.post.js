import { defineEventHandler, createError, readBody } from "h3";
import { connectDB } from "~/server/db/mongo";

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const projectSlug = event.context.params.slug;
  const body = await readBody(event);
  const db = await connectDB();

  // Verify project ownership
  const project = await db.collection("projects").findOne({
    slug: projectSlug,
    ownerId: userId
  });

  if (!project) {
    throw createError({ statusCode: 404, message: "Project not found" });
  }

  // Get next queue number
  const lastQueue = await db.collection("queues")
    .find({ projectSlug })
    .sort({ queueNumber: -1 })
    .limit(1)
    .toArray();

  const queueNumber = lastQueue.length > 0 ? lastQueue[0].queueNumber + 1 : 1;

  // Create queue
  const queue = {
    projectSlug,
    queueNumber,
    name: body.name || `Queue ${queueNumber}`,
    ownerId: userId,
    entries: body.entries || [],
    additionalFiles: [],
    artifacts: [],
    status: body.status || "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await db.collection("queues").insertOne(queue);
  
  // Update project's queueIds
  await db.collection("projects").updateOne(
    { slug: projectSlug },
    { 
      $push: { queueIds: result.insertedId },
      $set: { updatedAt: new Date() }
    }
  );

  return { ...queue, _id: result.insertedId };
});
