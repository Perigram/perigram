import { MongoClient, GridFSBucket } from "mongodb";
import logger from "../utils/logger.js";

// Don't read from process.env directly - use useRuntimeConfig() in server context
let client;
/**
 * @type {import('mongodb').Db}
 */
export let db;

/**
 * @type {GridFSBucket}
 */
let avatarBucket;

/**
 * @returns {Promise<GridFSBucket>}
 */
export async function getAvatarBucket() {
  await connectDB();
  if (!avatarBucket) {
    avatarBucket = new GridFSBucket(db, {
      bucketName: "avatars",
    });
  }
  return avatarBucket;
}

let svgResultBucket;

/**
 * @returns {Promise<GridFSBucket>}
 */
export async function getSvgResultBucket() {
  await connectDB();
  if (!svgResultBucket) {
    svgResultBucket = new GridFSBucket(db, {
      bucketName: "nestSvg",
    });
  }
  return svgResultBucket;
}

let userDxfFilesSvg;

/**
 * @returns {Promise<GridFSBucket>}
 */
export async function getUserDxfFilesSvgBucket() {
  await connectDB();
  if (!userDxfFilesSvg) {
    userDxfFilesSvg = new GridFSBucket(db, {
      bucketName: "userDxfFilesSvg",
    });
  }
  return userDxfFilesSvg;
}

let dxfResultBucket;

/**
 * @returns {Promise<GridFSBucket>}
 */
export async function getDxfResultBucket() {
  await connectDB();
  if (!dxfResultBucket) {
    dxfResultBucket = new GridFSBucket(db, {
      bucketName: "nestDxf",
    });
  }
  return dxfResultBucket;
}

/**
 * @type {GridFSBucket}
 */
let userDxfBucket;

/**
 * @returns {Promise<GridFSBucket>}
 */
export async function getUserDxfBucket() {
  await connectDB();
  if (!userDxfBucket) {
    userDxfBucket = new GridFSBucket(db, {
      bucketName: "userDxf",
    });
  }
  return userDxfBucket;
}

/**
 * @type {GridFSBucket}
 */
let userSvgBucket;

/**
 * @returns {Promise<GridFSBucket>}
 */
export async function getUserSvgBucket() {
  await connectDB();
  if (!userSvgBucket) {
    userSvgBucket = new GridFSBucket(db, {
      bucketName: "userSvg",
    });
  }
  return userSvgBucket;
}

/**
 * @type {GridFSBucket}
 */
let validUserDxfBucket;

/**
 * @returns {Promise<GridFSBucket>}
 */
export async function getValidUserDxfBucket() {
  await connectDB();
  if (!validUserDxfBucket) {
    validUserDxfBucket = new GridFSBucket(db, {
      bucketName: "validDxf",
    });
  }
  return validUserDxfBucket;
}

export async function connectDB() {
  if (!client) {
    try {
      // Try multiple sources for MongoDB URI
      // 1. Direct from process.env (works in Railway and standalone scripts)
      // 2. From Nuxt runtime config (works in Vercel - only available in Nuxt context)
      let uri = process.env.NUXT_MONGODB_URI || process.env.MONGODB_URI;
      
      // Only try useRuntimeConfig if in Nuxt context (not standalone script)
      if (!uri && typeof useRuntimeConfig !== 'undefined') {
        try {
          uri = useRuntimeConfig().mongoUri;
        } catch (e) {
          // useRuntimeConfig not available in standalone scripts
        }
      }
      
      // DEBUG: Log all available env vars (without values for security)
      logger.info(`Available MONGO env vars: ${Object.keys(process.env).filter(k => k.includes('MONGO')).join(', ')}`);
      logger.info(`Using URI from: ${process.env.NUXT_MONGODB_URI ? 'NUXT_MONGODB_URI' : process.env.MONGODB_URI ? 'MONGODB_URI' : 'runtimeConfig'}`);
      
      // Debug: Log what URI we're trying to use (hide password)
      const debugUri = uri ? uri.replace(/:([^:@]+)@/, ':****@') : 'EMPTY/UNDEFINED';
      logger.info(`Attempting MongoDB connection with URI: ${debugUri}`);
      
      if (!uri) {
        throw new Error('MongoDB URI is not configured. Set NUXT_MONGODB_URI or MONGODB_URI environment variable in Railway.');
      }
      
      client = new MongoClient(uri);
      await client.connect();
      logger.info("Connected to MongoDB");
    } catch (error) {
      logger.error("Failed to connect to MongoDB", error);
      throw error;
    }
  }
  if (!db) {
    db = client.db();
  }
  return db;
}
