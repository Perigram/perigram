import {
  connectDB
} from '~~/server/db/mongo';
import {
  ObjectId
} from 'mongodb';
import fs from 'fs/promises';
import path from 'path';
import {
  spawn
} from 'child_process';
import {
  GridFSBucket
} from 'mongodb';

export default defineNitroPlugin(async (nitroApp) => {
  console.log('Nesting Processor Plugin Started');

  // Start polling loop
  processLoop();
});

async function processLoop() {
  while (true) {
    try {
      await processNextJob();
    } catch (err) {
      console.error('Error in nesting processor loop:', err);
    }
    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function processNextJob() {
  const db = await connectDB();

  // Find pending job
  const job = await db.collection('nesting_jobs').findOneAndUpdate(
    { status: 'pending' },
    {
      $set: {
        status: 'processing',
        startedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );

  if (!job) return;

  console.log(`Processing nesting job: ${job.slug}`);

  try {
    // 1. Prepare Input for Worker
    const items = [];
    let idCounter = 0;

    for (const file of job.files) {
      const cassetteId = new ObjectId(file.cassetteId);
      let cassette = await db.collection('cassettes').findOne({ _id: cassetteId });

      if (!cassette) {
        cassette = await db.collection('baked_cassettes').findOne({ _id: cassetteId });
      }

      if (!cassette) {
        throw new Error(`Cassette ${file.cassetteId} not found`);
      }

      const polygonParts = cassette.polygonParts;

      // Handle fallback (copied logic from main.py)
      if (polygonParts && polygonParts.length > 0) {
        for (const part of polygonParts) {
           items.push({
             id: idCounter++,
             cassette_id: file.cassetteId,
             coords: part.coordinates,
             handles: part.handles,
             count: file.count
           });
        }
      } else {
        // Fallback to dimensions
        const dims = file.dimensions || {};
        const width = dims.A || dims.width || 0; // Assuming A/B or width/height
        const height = dims.B || dims.height || 0;

        if (width && height) {
           const rect = [
             [0, 0], [width, 0], [width, height], [0, height], [0, 0]
           ];
           items.push({
             id: idCounter++,
             cassette_id: file.cassetteId,
             coords: rect,
             handles: [],
             count: file.count
           });
        } else {
          console.warn(`Cassette ${cassette.name} has no polygons and no dimensions`);
        }
      }
    }

    const payload = {
      items,
      params: job.params
    };

    // 2. Call Worker
    console.log('Sending request to nesting worker...');
    const workerUrl = process.env.NESTING_WORKER_URL || 'http://nesting-worker:8000/nest';

    // Need to use fetch (available in Node 18+)
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Worker failed: ${response.status} ${errText}`);
    }

    const workerResult = await response.json();
    console.log('Worker finished. Processing result...');

    // 3. Process Result (Convert to Transforms)
    // workerResult is { solution: { layouts: [...] } } (from lbf)
    const layouts = workerResult.solution?.layouts || [];
    const resultContainers = [];

    let containerId = 1;
    let totalPlaced = 0;

    for (const layout of layouts) {
      const transforms = [];
      for (const placedItem of layout.placed_items) {
        const originalItem = items.find(i => i.id === placedItem.item_id);
        if (!originalItem) continue;

        const trans = placedItem.transformation;
        // LBF returns translation as [x, y] and rotation (angle)
        transforms.push({
          cassette_id: originalItem.cassette_id,
          handles: originalItem.handles,
          x: trans.translation[0],
          y: trans.translation[1],
          angle: trans.rotation
        });
        totalPlaced++;
      }

      if (transforms.length > 0) {
        resultContainers.push({
          container_id: containerId++,
          transforms
        });
      }
    }

    // Update placed count
    await db.collection('nesting_jobs').updateOne(
      { _id: job._id },
      { $set: { placed: totalPlaced, layoutCount: layouts.length } }
    );

    // 4. Generate DXF
    // Create temp file for transforms
    const tmpDir = '/tmp'; // Docker container has /tmp
    const transformsPath = path.join(tmpDir, `transforms-${job.slug}.json`);
    const outputDir = path.join(tmpDir, `output-${job.slug}`);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(transformsPath, JSON.stringify(resultContainers));

    console.log('Generating DXF files...');
    // Run python script
    const scriptPath = path.resolve(process.cwd(), 'server/scripts/generate_nest_dxf.py');

    // We need to run this in a Promise wrapping spawn
    const generatedFiles = await new Promise((resolve, reject) => {
      const py = spawn('python3', [
        scriptPath,
        '--transforms', transformsPath,
        '--output-dir', outputDir,
        '--slug', job.slug
      ], {
        env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI || 'mongodb://mongo:27017/cutkit_dev' }
      });

      let stdout = '';
      let stderr = '';

      py.stdout.on('data', (data) => stdout += data.toString());
      py.stderr.on('data', (data) => stderr += data.toString());

      py.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`DXF Generation failed (code ${code}): ${stderr}`));
        } else {
          try {
            // Last line should be JSON
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const files = JSON.parse(lastLine);
            resolve(files);
          } catch (e) {
            console.error('Failed to parse script output:', stdout);
            reject(new Error(`Failed to parse script output: ${e.message}`));
          }
        }
      });
    });

    console.log(`Generated ${generatedFiles.length} DXF files.`);

    // 5. Upload to GridFS and Update Artifacts
    const bucket = new GridFSBucket(db, { bucketName: 'nestDxf' });
    const fileIds = [];

    for (const file of generatedFiles) {
      const content = await fs.readFile(file.path);
      const filename = file.filename;

      const uploadStream = bucket.openUploadStream(filename, {
        metadata: { ownerId: job.ownerId }
      });

      await new Promise((resolve, reject) => {
        uploadStream.write(content);
        uploadStream.end((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      fileIds.push(uploadStream.id);

      // Cleanup local file
      await fs.unlink(file.path);
    }

    // Cleanup temp dirs
    await fs.unlink(transformsPath);
    await fs.rm(outputDir, { recursive: true, force: true });

    // Update Job Status
    const dxfFilenames = generatedFiles.map(f => f.filename);

    await db.collection('nesting_jobs').updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'done',
          dxf_files: dxfFilenames,
          finishedAt: new Date()
        }
      }
    );

    // Update Artifacts
    if (fileIds.length > 0) {
        // Find the artifact created in nest.post.js
        // generatedBy: nestingSlug
        await db.collection('artifacts').updateOne(
            { generatedBy: job.slug, type: 'LAYOUT_DXF' },
            {
                $set: {
                    status: 'READY',
                    fileId: fileIds[0], // Link the first file? Or handle multiple?
                    // Currently artifact schema links to single file.
                    // If multiple layouts, maybe zip them? Or just link first for now.
                    mimeType: 'application/dxf',
                    updatedAt: new Date()
                }
            }
        );
    }

    console.log(`Job ${job.slug} completed successfully.`);

  } catch (error) {
    console.error(`Job ${job.slug} failed:`, error);
    await db.collection('nesting_jobs').updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'error',
          error: error.message,
          finishedAt: new Date()
        }
      }
    );

    // Update batch status to DRAFT? Or leave as is?
    // BatchService should handle this?
  }
}
