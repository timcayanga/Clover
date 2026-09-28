import assert from "node:assert/strict";
type ObjectRow = { bytes: Uint8Array; contentType: string; etag: string };
export const objects = new Map<string, ObjectRow>();
class Command {
  constructor(public input: any) {}
}
export class PutObjectCommand extends Command {}
export class HeadObjectCommand extends Command {}
export class GetObjectCommand extends Command {}
export class CopyObjectCommand extends Command {}
export class DeleteObjectCommand extends Command {}
export class S3Client {
  constructor(_config: unknown) {}
  async send(command: Command): Promise<any> {
    const input = command.input;
    if (command instanceof DeleteObjectCommand) {
      objects.delete(input.Key);
      return {};
    }
    if (command instanceof CopyObjectCommand) {
      const source = objects.get(
        input.CopySource.slice(input.Bucket.length + 1),
      );
      if (!source || source.etag !== input.CopySourceIfMatch)
        throw new Error("PreconditionFailed");
      assert(!objects.has(input.Key), "Never overwrite a final media key");
      objects.set(input.Key, { ...source, bytes: source.bytes.slice() });
      return {};
    }
    const object = objects.get(input.Key);
    if (!object) throw new Error("NoSuchKey");
    if (command instanceof HeadObjectCommand)
      return {
        ContentLength: object.bytes.length,
        ContentType: object.contentType,
        ETag: object.etag,
      };
    if (command instanceof GetObjectCommand) {
      if (input.IfMatch && input.IfMatch !== object.etag)
        throw new Error("PreconditionFailed");
      return {
        Body: { transformToByteArray: async () => object.bytes.slice(0, 32) },
      };
    }
    throw new Error("Unexpected S3 operation");
  }
}
