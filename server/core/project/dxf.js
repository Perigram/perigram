import { createError, readMultipartFormData } from "h3";
import { ObjectId } from "mongodb";

import { connectDB, getUserDxfBucket } from "~~/server/db/mongo";
import { generateRandomString } from "~~/server/utils/strings";
import { enqueueTask } from "~~/server/core/tasks/service.js";

import standardSlugify from "standard-slugify";

export async function saveFilesToProject(event, projectSlug, userId) {
  const fields = await readMultipartFormData(event);
  const dxfFileFields = fields.filter((field) => field.name === "dxf");

  if (dxfFileFields.length === 0) {
    throw createError({
      statusCode: 400,
      message: "No DXF file uploaded. Please upload a DXF file.",
    });
  }

  const dxfUserBucket = await getUserDxfBucket();

  const dxfs = [];
  const file_records = [];

  dxfFileFields.forEach((dxfFile) => {
    const fileBuffer = dxfFile.data;
    const userFileName = dxfFile.filename;
    const file_slug = standardSlugify(userFileName, {
      keepCase: false,
    }) + `-${generateRandomString(6)}.dxf`;

    const uploadSream = dxfUserBucket.openUploadStream(file_slug);
    uploadSream.write(fileBuffer);
    uploadSream.end();

    const dxfRecord = {
      slug: file_slug,
      name: userFileName,
    };
    dxfs.push(dxfRecord);

    const file_record = {
      _id: new ObjectId(),
      slug: file_slug,
      name: userFileName,
      processRunId: new ObjectId(),
      processingStatus: "pending",
      projectSlug: projectSlug,
      ownerId: userId,
      uploadAt: new Date(),
      flattening: 0.01,
      worker_tag: "normal",
    };

    file_records.push(file_record);
  });

  file_records.forEach((file_record) => {
    track("create_project_dxf_file", userId, {
      fileName: file_record.name,
      fileSlug: file_record.slug,
      projectSlug: projectSlug,
    })
  });

  const db = await connectDB();

  for (const fileRecord of file_records) {
    const taskRun = await enqueueTask("dxf.parseUpload", {
      entities: { upload: fileRecord._id.toString() },
      parameters: { workerTag: fileRecord.worker_tag }
    }, { userId }, { idempotencyKey: `dxf:${fileRecord._id.toString()}` });
    fileRecord.taskRunId = taskRun._id;
  }
  await db.collection("user_dxf_files").insertMany(file_records);
}
