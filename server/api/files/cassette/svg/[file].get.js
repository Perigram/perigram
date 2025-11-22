import { getCassettesSvgBucket } from "~/server/db/mongo";

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
  }

  const fileName = getRouterParam(event, "file");

  const cassetteSvgBucket = await getCassettesSvgBucket();

  const files = await cassetteSvgBucket.find({ filename: fileName }).toArray();
  
  if (!files || files.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "File not found",
    });
  }
  
  const metadata = files[0].metadata;

  if (metadata.ownerId !== userId && !(event.context.auth.isAdmin == true)) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
  }

  const readStream = cassetteSvgBucket.openDownloadStreamByName(fileName);

  setResponseHeaders(event, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=86400",
  });
  return readStream;
});
