// Minimal ambient declarations for @azure/storage-blob used by this project.
// These are intentionally small — they only include the members the code uses,
// so the TypeScript build can succeed without installing external declaration packages.

declare module '@azure/storage-blob' {
  export class BlobServiceClient {
    static fromConnectionString(connectionString: string): BlobServiceClient;
    getContainerClient(name: string): ContainerClient;
  }

  export interface ContainerClient {
    createIfNotExists(): Promise<void>;
    getBlockBlobClient(name: string): BlockBlobClient;
  }

  export interface BlockBlobClient {
    uploadData(data: unknown, options?: unknown): Promise<void>;
    download(): Promise<{ readableStreamBody?: AsyncIterable<Uint8Array | string> }>;
    exists(): Promise<boolean>;
    deleteIfExists(): Promise<void>;
  }

  export { ContainerClient };
}
