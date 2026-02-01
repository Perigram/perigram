import { BaseEntity, createAttachment } from '~/server/utils/blocks';

/**
 * Artifact Entity - v24 Absolute Final
 */
export class Artifact extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    if (!raw._id && raw.params) {
      const { type, fileId, name, metadata } = raw.params;
      // 1. Move file link to standardized 'attachments' block
      this.attachments.main = createAttachment(type, fileId, name, metadata);
      
      // 2. data block contains only non-file metadata
      this.data = {
        type,
        metadata: metadata || {}
      };
    }
  }

  /**
   * Local Method: Get download URL from the attachments block
   */
  getDownloadUrl() {
    const main = this.attachments.main;
    if (!main?.fileId) return null;
    const type = main.type?.toLowerCase() || 'unknown';
    return `/api/files/result/${type}/${main.fileId}`;
  }
}