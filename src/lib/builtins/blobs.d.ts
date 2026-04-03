/**
 * Blobs module for blob storage operations (provided by Goja runtime)
 */
declare module "blobs" {
  /**
   * Blob metadata interface
   */
  interface BlobMetadata {
    hash: string;
    name: string;
    size: number;
    path: string;
    storedAt: string;
  }

  /**
   * Blob storage operations interface
   */
  interface BlobsModule {
    /**
     * Lists all blob metadata
     * @returns Array of blob metadata objects
     */
    list(): BlobMetadata[];

    /**
     * Retrieves blob metadata by name
     * @param name - Blob name to retrieve
     * @returns The blob metadata object
     */
    get(name: string): BlobMetadata;

    /**
     * Converts a blob's tar archive to a zip archive (base64-encoded)
     * @param name - Blob name to convert
     * @returns The ZIP archive content as a base64-encoded string
     */
    zip(name: string): string;

    /**
     * Returns a blob's raw tar archive content (base64-encoded)
     * @param name - Blob name
     * @returns The tar archive content as a base64-encoded string
     */
    tar(name: string): string;

    /**
     * Returns a blob's tar archive gzip-compressed (base64-encoded)
     * @param name - Blob name
     * @returns The tar.gz archive content as a base64-encoded string
     */
    tgz(name: string): string;
  }

  const blobs: BlobsModule;
  export default blobs;
}
