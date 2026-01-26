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
import { createStatus } from '../utils/blocks';

export default defineNitroPlugin(async (nitroApp) => {
  console.log('Nesting Processor Plugin Started');

  // Start polling loop in background
  (async () => {
    while (true) {
      try {
        await processNextJob();
      } catch (err) {
        console.error('Error in nesting processor loop:', err);
      }
      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  })();
});

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
    if (!job.files || !Array.isArray(job.files)) {
      throw new Error('Job has no files or files is not an array');
    }

    const items = [];
    let idCounter = 0;

    for (const file of job.files) {
      if (!file.cassetteId) continue;
      
      const cassetteId = new ObjectId(file.cassetteId);
      let cassette = await db.collection('cassettes').findOne({ _id: cassetteId });

      if (!cassette) {
        cassette = await db.collection('baked_cassettes').findOne({ _id: cassetteId });
      }

      if (!cassette) {
        console.error(`Cassette ${file.cassetteId} not found for job ${job.slug}`);
        continue;
      }

      const polygonParts = cassette.polygonParts || [];

      // Handle fallback
      if (polygonParts.length > 0) {
        for (const part of polygonParts) {
           items.push({
             id: idCounter++,
             cassette_id: file.cassetteId,
             coords: part.coordinates,
             handles: part.handles || [],
             count: file.count || 1
           });
        }
      } else {
        // Fallback to dimensions
        const dims = file.dimensions || {};
        const width = dims.A || dims.width || 0;
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
             count: file.count || 1
           });
        }
      }
    }

    if (items.length === 0) {
      throw new Error('No valid items to nest');
    }

    const payload = {
      items,
      params: job.params || {}
    };

    // 2. Call Worker
    const workerUrl = process.env.NESTING_WORKER_URL || 'http://nesting-worker:8000/nest';
    console.log(`Sending request to nesting worker at: ${workerUrl}`);

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
    if (!workerResult || !workerResult.solution) {
      console.error('Worker returned invalid response:', JSON.stringify(workerResult));
      throw new Error('Worker returned invalid or empty solution');
    }
    
    console.log(`Worker finished for job ${job.slug}. Solution found: ${!!workerResult.solution}`);

    // 3. Process Result (Convert to Transforms)
    const layouts = workerResult.solution.layouts || [];
    const resultContainers = [];

    let totalPlaced = 0;

    for (const layout of layouts) {
      if (!layout) continue;
      
      const transforms = [];
      const placedItems = layout.placed_items || [];
      
      for (const placedItem of placedItems) {
        if (!placedItem) continue;
        
        const originalItem = items.find(i => i.id === placedItem.item_id);
        if (!originalItem) continue;

        const trans = placedItem.transformation;
        if (!trans || !trans.translation) continue;

        transforms.push({
          cassette_id: originalItem.cassette_id,
          handles: originalItem.handles || [],
          x: trans.translation[0],
          y: trans.translation[1],
          angle: trans.rotation || 0
        });
        totalPlaced++;
      }

      if (transforms.length > 0) {
        resultContainers.push({
          container_id: resultContainers.length + 1,
          width: job.params?.width || 1220,
          height: job.params?.height || 2440,
          transforms
        });
      }
    }

    const layoutCount = resultContainers.length;
    
    // Calculate total utilization (average)
    let totalUtilization = workerResult.solution?.utilization || 0.85;

    console.log(`Job ${job.slug}: Placed ${totalPlaced} items on ${layoutCount} containers. Utilization: ${totalUtilization}`);

    // Update nesting job record
    await db.collection('nesting_jobs').updateOne(
      { _id: job._id },
      { $set: { placed: totalPlaced, layoutCount: layoutCount, utilization: totalUtilization } }
    );

    // 4. Generate DXF
    const tmpDir = '/tmp';
    const transformsPath = path.join(tmpDir, `transforms-${job.slug}.json`);
    const outputDir = path.join(tmpDir, `output-${job.slug}`);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(transformsPath, JSON.stringify(resultContainers));

    console.log('Generating DXF files...');
    let scriptPath = path.resolve(process.cwd(), 'server/scripts/generate_nest_dxf.py');
    
    try { await fs.access(scriptPath); } catch {
        const prodPath = path.resolve(process.cwd(), '.output/server/scripts/generate_nest_dxf.py');
        try { await fs.access(prodPath); scriptPath = prodPath; } catch {}
    }

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
        if (code !== 0) reject(new Error(`DXF Generation failed (code ${code}): ${stderr}`));
        else {
          try {
            const lines = stdout.trim().split('\n');
            if (lines.length === 0) throw new Error('Script output is empty');
            const lastLine = lines[lines.length - 1];
            resolve(JSON.parse(lastLine));
          } catch (e) { reject(new Error(`Failed to parse script output: ${e.message}`)); }
        }
      });
    });

    console.log(`Generated ${generatedFiles?.length || 0} DXF files.`);

    // 5. Upload to GridFS and Update Artifacts
    const bucket = new GridFSBucket(db, { bucketName: 'nestDxf' });
    const fileIds = [];

    for (const file of (generatedFiles || [])) {
      if (!file || !file.path) continue;
      const content = await fs.readFile(file.path);
      const uploadStream = bucket.openUploadStream(file.filename, { metadata: { ownerId: job.ownerId } });

      await new Promise((resolve, reject) => {
        uploadStream.write(content);
        uploadStream.end((err) => { err ? reject(err) : resolve(); });
      });

      fileIds.push(uploadStream.id);
      try { await fs.unlink(file.path); } catch (e) { console.warn(`Failed to unlink ${file.path}:`, e.message); }
    }

    try { await fs.unlink(transformsPath); } catch (e) {}
    try { await fs.rm(outputDir, { recursive: true, force: true }); } catch (e) {}

    // Finalize Job and Queue
    await db.collection('nesting_jobs').updateOne(
      { _id: job._id },
      { $set: { status: 'done', dxf_files: (generatedFiles || []).map(f => f.filename), finishedAt: new Date() } }
    );
    
    // Update Queue Run Status to COMPLETE
    const statusUpdate = createStatus('COMPLETE', 'SYSTEM', { note: 'Nesting completed successfully' });

    await db.collection('queues').updateOne(
      { _id: job.queueId, "runs._id": job.runId },
      { $set: { 
          "runs.$.status": statusUpdate, 
          "runs.$.layoutCount": layoutCount,
          "runs.$.placedCount": totalPlaced,
          "runs.$.utilization": totalUtilization
        } 
      }
    );

    // Update artifacts status
    if (fileIds.length > 0) {
        const artifactStatus = createStatus('READY', 'SYSTEM', { note: 'File generated' });
        // Update LAYOUT_DXF with fileId
        await db.collection('artifacts').updateOne(
            { "lineage.runId": job.runId, type: 'LAYOUT_DXF' },
            {
                $set: {
                    fileId: fileIds[0],
                    mimeType: 'application/dxf',
                    status: artifactStatus,
                    updatedAt: new Date()
                }
            }
        );
    }
    
    // Mark other placeholders as FAILED for now if not implemented
    const failStatus = createStatus('FAILED', 'SYSTEM', { note: 'Artifact not generated' });
    await db.collection('artifacts').updateMany(
        { "lineage.runId": job.runId, status: { $ne: 'READY' }, "status.state": { $ne: 'READY' } },
        { $set: { status: failStatus, updatedAt: new Date() } }
    );

    console.log(`Job ${job.slug} completed successfully. Placed ${totalPlaced} items on ${layoutCount} sheets.`);
  } catch (error) {
    console.error(`Job ${job.slug} failed:`, error);
    await db.collection('nesting_jobs').updateOne(
      { _id: job._id },
      { $set: { status: 'error', error: error.message, finishedAt: new Date() } }
    );
    if (job.queueId && job.runId) {
        const errorStatus = createStatus('ERROR', 'SYSTEM', { note: error.message });

        await db.collection('queues').updateOne(
          { _id: job.queueId, "runs._id": job.runId },
          { $set: { "runs.$.status": errorStatus, "runs.$.error": error.message } }
        );
        
        // Mark all artifacts for this run as FAILED
        const artifactErrorStatus = createStatus('FAILED', 'SYSTEM', { note: error.message });
        await db.collection('artifacts').updateMany(
            { "lineage.runId": job.runId },
            { $set: { status: artifactErrorStatus, error: error.message } }
        );
    }
  }
}
