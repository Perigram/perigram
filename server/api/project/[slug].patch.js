import { defineEventHandler, createError, readBody } from "h3";
import { connectDB } from "~~/server/db/mongo";

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const slug = event.context.params.slug;
  const body = await readBody(event);

  const db = await connectDB();
  
  // Verify ownership
  const project = await db.collection("projects").findOne({
    slug,
    ownerId: userId
  });

  if (!project) {
    throw createError({ statusCode: 404, message: "Project not found" });
  }

  // Prepare update data
  const updateData = {
    updatedAt: new Date()
  };

  if (body.name !== undefined) {
    updateData.name = body.name;
  }

  if (body.metadata !== undefined) {
    updateData.metadata = body.metadata;
  }

  if (body.tep !== undefined) {
    updateData.tep = body.tep;
  }

  if (body.status !== undefined) {
    updateData.status = body.status;
  }

  if (body.sheets !== undefined) {
    updateData.sheets = body.sheets;
  }

  if (body.cutLogs !== undefined) {
    updateData.cutLogs = body.cutLogs;
  }

  if (body.projectMaterials !== undefined) {
    updateData.projectMaterials = body.projectMaterials;
  }

  // Update project
  const result = await db.collection("projects").findOneAndUpdate(
    { slug, ownerId: userId },
    { $set: updateData },
    { returnDocument: "after" }
  );

  return result.value;
});
