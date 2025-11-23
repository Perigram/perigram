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

  // Get next batch number
  const lastBatch = await db.collection("batches")
    .find({ projectSlug })
    .sort({ batchNumber: -1 })
    .limit(1)
    .toArray();

  const batchNumber = lastBatch.length > 0 ? lastBatch[0].batchNumber + 1 : 1;

  // Create batch
  const batch = {
    projectSlug,
    batchNumber,
    name: body.name || `Batch ${batchNumber}`,
    ownerId: userId,
    entries: body.entries || [],
    additionalFiles: [],
    artifacts: [],
    status: body.status || "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await db.collection("batches").insertOne(batch);
  
  // Update project's batchIds
  await db.collection("projects").updateOne(
    { slug: projectSlug },
    { 
      $push: { batchIds: result.insertedId },
      $set: { updatedAt: new Date() }
    }
  );

  return { ...batch, _id: result.insertedId };
});
