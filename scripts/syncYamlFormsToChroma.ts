// Deno 2 script: Scan YAML files, segment top-level forms, embed via Azure OpenAI, upsert to Chroma Cloud
// Permissions: requires -A (env, net, read)

import "jsr:@std/dotenv/load";
import { join, relative, resolve } from "jsr:@std/path";
import { walk } from "jsr:@std/fs";
import { parse, stringify } from "jsr:@std/yaml";
import { get_encoding as getEncoding } from "npm:@dqbd/tiktoken@1.0.15";
import OpenAI, { AzureOpenAI } from "npm:openai@4.58.1";
import { CloudClient } from "npm:chromadb@1.9.4";

const REPO_ROOT = resolve(join(import.meta.dirname!, ".."));
const EXAMPLES_DIR = join(REPO_ROOT, "examples");
const SRC_DIR = join(REPO_ROOT, "src");

const MAX_TOKENS = Number(Deno.env.get("CHUNK_MAX_TOKENS") ?? 500);
const OVERLAP_TOKENS = Number(Deno.env.get("CHUNK_OVERLAP_TOKENS") ?? 50);
const COLLECTION_NAME = Deno.env.get("CHROMA_COLLECTION_NAME") ?? "yaml-forms";
const EMBEDDING_DIM = Number(Deno.env.get("EMBEDDING_DIM") ?? 1536);

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha1Hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return toHex(digest);
}

// Tokenizer for OpenAI 3.x embedding models (cl100k_base)
const enc = getEncoding("cl100k_base");

function tokenLength(text: string): number {
  const s = typeof text === "string" ? text : String(text ?? "");
  return enc.encode(s).length;
}

function decodeTokens(tokens: Uint32Array): string {
  const anyEnc = enc as unknown as {
    decode(tokens: Uint32Array): string | Uint8Array;
  };
  const decoded = anyEnc.decode(tokens);
  if (typeof decoded === "string") return decoded;
  if (decoded instanceof Uint8Array) return new TextDecoder().decode(decoded);
  return String(decoded ?? "");
}

type ListedFile = { abs: string; rel: string };

async function listYamlFiles(rootDir: string): Promise<ListedFile[]> {
  const results: ListedFile[] = [];
  try {
    for await (const entry of walk(rootDir, {
      includeFiles: true,
      includeDirs: false,
    })) {
      if (/\.ya?ml$/i.test(entry.path)) {
        results.push({
          abs: entry.path,
          rel: relative(REPO_ROOT, entry.path),
        });
      }
    }
  } catch (_) {
    // ignore missing dir
  }
  results.sort((a, b) => a.rel.localeCompare(b.rel));
  return results;
}

type Form = { key: string; text: string };

function extractTopLevelForms(yamlSource: string): Form[] {
  try {
    const contents = parse(yamlSource) as Record<string, unknown> | null;
    if (!contents || typeof contents !== "object") return [];
    const ns = (contents as Record<string, unknown>)["namespace"];
    const result: Form[] = [];
    for (const [key, value] of Object.entries(contents)) {
      if (key === "namespace") continue;
      const single: Record<string, unknown> = {};
      if (ns !== undefined) single.namespace = ns;
      single[key] = value;
      const text = stringify(single);
      result.push({ key, text });
    }
    return result;
  } catch {
    return naiveTopLevelFormSplit(yamlSource);
  }
}

function naiveTopLevelFormSplit(src: string): Form[] {
  const lines = src.split(/\r?\n/);
  const forms: Form[] = [];
  let currentKey: string | null = null;
  let currentLines: string[] = [];
  let namespaceLine: string | null = null;
  for (const line of lines) {
    const nsMatch = line.match(/^namespace\s*:\s*(.+)$/);
    if (nsMatch) namespaceLine = line;
    const keyMatch = line.match(/^([A-Za-z0-9_.-]+):\s*$/);
    if (keyMatch && !/^namespace\s*:/.test(line)) {
      if (currentKey) {
        const text = [
          namespaceLine,
          ...(namespaceLine ? [""] : []),
          ...currentLines,
        ]
          .filter(Boolean)
          .join("\n");
        forms.push({ key: currentKey, text });
      }
      currentKey = keyMatch[1];
      currentLines = [line];
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  if (currentKey) {
    const text = [
      namespaceLine,
      ...(namespaceLine ? [""] : []),
      ...currentLines,
    ]
      .filter(Boolean)
      .join("\n");
    forms.push({ key: currentKey, text });
  }
  return forms;
}

function chunkSegments(
  segments: string[],
  maxTokens: number,
  overlapTokens: number
): string[] {
  const result: string[] = [];
  let p = 0;
  let prevChunkSegments: string[] = [];
  while (p < segments.length) {
    const chunkSegmentsArr: string[] = [];
    const safeOverlapTokens = Math.max(
      0,
      Math.min(overlapTokens, Math.floor(maxTokens / 3))
    );
    if (prevChunkSegments.length > 0 && safeOverlapTokens > 0) {
      let tokenSum = 0;
      for (let i = prevChunkSegments.length - 1; i >= 0; i--) {
        const seg = prevChunkSegments[i];
        tokenSum += tokenLength(seg);
        chunkSegmentsArr.unshift(seg);
        if (tokenSum >= safeOverlapTokens) break;
      }
    }
    let tokenCount = chunkSegmentsArr.reduce((a, s) => a + tokenLength(s), 0);
    if (tokenCount >= maxTokens) {
      prevChunkSegments = [];
      continue;
    }
    let addedNew = 0;
    while (p < segments.length) {
      const seg = segments[p];
      const segTokens = tokenLength(seg);
      if (tokenCount + segTokens > maxTokens) break;
      chunkSegmentsArr.push(seg);
      tokenCount += segTokens;
      p++;
      addedNew++;
    }
    if (addedNew === 0) {
      const tooLargeSeg = segments[p];
      const toks = enc.encode(tooLargeSeg);
      const slice = toks.slice(0, maxTokens - tokenCount);
      chunkSegmentsArr.push(decodeTokens(slice));
      const remainder = decodeTokens(toks.slice(slice.length));
      segments[p] = remainder;
    }
    const text = chunkSegmentsArr.join("");
    if (text.trim().length > 0) result.push(text);
    prevChunkSegments = chunkSegmentsArr;
  }
  return result;
}

function splitYamlFormIntoSegments(text: string): string[] {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trimEnd() + "\n\n")
    .filter((p) => p.trim().length > 0);
  return parts.length > 0 ? parts : [text];
}

function fileStartsWithNamespace(absPath: string): boolean {
  let content = Deno.readTextFileSync(absPath);
  // strip BOM
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*$/.test(line)) continue; // blank
    if (/^\s*#/.test(line)) continue; // comment
    if (/^\s*---\s*$/.test(line)) continue; // yaml doc start
    return /^\s*namespace\s*:/.test(line);
  }
  return false;
}

type Chunk = {
  id: string;
  text: string;
  hash: string;
  sourceFile: string;
  formKey: string;
  chunkIndex: number;
};

async function buildChunksFromYamlFiles(files: ListedFile[]): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  for (const { abs, rel } of files) {
    const raw = Deno.readTextFileSync(abs);
    const forms = extractTopLevelForms(raw);
    let idx = 0;
    for (const form of forms) {
      const segments = splitYamlFormIntoSegments(form.text);
      const pieces = chunkSegments(segments, MAX_TOKENS, OVERLAP_TOKENS);
      for (const piece of pieces) {
        const hash = await sha1Hex(piece);
        const id = await sha1Hex(rel + "\u241E" + form.key + "\u241E" + piece);
        chunks.push({
          id,
          text: piece,
          hash,
          sourceFile: rel,
          formKey: form.key,
          chunkIndex: idx++,
        });
      }
    }
  }
  return chunks;
}

function buildManualEmbeddingFunction() {
  return {
    embedDocuments: (docs: string[]) =>
      docs.map(() => Array.from({ length: EMBEDDING_DIM }, () => 0)),
    embedQuery: (_q: string) => Array.from({ length: EMBEDDING_DIM }, () => 0),
  } as unknown;
}

type ChromaCollection = {
  get(args: { include?: string[]; limit?: number; offset?: number }): Promise<{
    ids: string[];
    metadatas: Record<string, unknown>[];
  }>;
  delete(args: { ids: string[] }): Promise<unknown>;
  upsert(args: {
    ids: string[];
    embeddings: number[][];
    metadatas: Record<string, unknown>[];
    documents: string[];
  }): Promise<unknown>;
};

type ChromaClientLike = {
  getCollection(args: {
    name: string;
    embeddingFunction: unknown;
  }): Promise<ChromaCollection>;
  createCollection(args: {
    name: string;
    embeddingFunction: unknown;
  }): Promise<ChromaCollection>;
};

async function getOrCreateCollection(
  chroma: ChromaClientLike
): Promise<ChromaCollection> {
  try {
    return await chroma.getCollection({
      name: COLLECTION_NAME,
      embeddingFunction: buildManualEmbeddingFunction(),
    });
  } catch {
    return await chroma.createCollection({
      name: COLLECTION_NAME,
      embeddingFunction: buildManualEmbeddingFunction(),
    });
  }
}

function getChromaClient(): ChromaClientLike {
  return new (CloudClient as unknown as {
    new (args: {
      apiKey: string;
      tenant: string;
      database: string;
    }): ChromaClientLike;
  })({
    apiKey: requiredEnv("CHROMA_API_KEY"),
    tenant: requiredEnv("CHROMA_TENANT_ID"),
    database: requiredEnv("CHROMA_DATABASE"),
  });
}

function getAzureClient(): OpenAI {
  const endpoint = requiredEnv("AZURE_OPENAI_ENDPOINT");
  const apiKey = requiredEnv("AZURE_OPENAI_API_KEY");
  const apiVersion =
    Deno.env.get("AZURE_OPENAI_API_VERSION") || "2024-08-01-preview";
  return new AzureOpenAI({ endpoint, apiKey, apiVersion }) as unknown as OpenAI;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 5
): Promise<T> {
  let attempt = 0;
  let delayMs = 1000;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      let status: number | string | undefined;
      if (typeof err === "object" && err !== null) {
        const e = err as Record<string, unknown>;
        const resp = e["response"];
        const respStatus =
          typeof resp === "object" && resp !== null
            ? (resp as Record<string, unknown>)["status"]
            : undefined;
        const s = e["status"] ?? e["code"] ?? respStatus;
        if (typeof s === "number" || typeof s === "string") status = s;
      }
      const shouldRetry =
        status === 429 ||
        status === 408 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504;
      if (!shouldRetry || attempt > maxRetries) throw err;
      await new Promise((res) => setTimeout(res, delayMs));
      delayMs = Math.min(delayMs * 2, 16000);
      if (Deno.env.get("DEBUG"))
        console.warn(`${label} retry ${attempt} after error`, status);
    }
  }
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const batchSize = Number(Deno.env.get("EMBEDDING_BATCH_SIZE") ?? 100);
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    type EmbeddingResp = { data: { embedding: number[] }[] };
    const resp = (await withRetry(
      () =>
        getAzureClient().embeddings.create({
          model: requiredEnv("AZURE_OPENAI_EMBEDDING_MODEL"),
          input: batch,
        }),
      "azure-embed"
    )) as EmbeddingResp;
    vectors.push(...resp.data.map((d) => d.embedding));
  }
  return vectors;
}

async function syncYaml() {
  const exampleFiles = await listYamlFiles(EXAMPLES_DIR);
  const srcAll = await listYamlFiles(SRC_DIR);
  const preFiles = [...exampleFiles, ...srcAll];
  const files = preFiles.filter((f) => {
    if (/\.test\.ya?ml$/i.test(f.abs)) return false; // exclude *.test.yaml
    return fileStartsWithNamespace(f.abs);
  });

  console.log(`Scanning YAML files: ${files.length} found`);
  const currentChunks = await buildChunksFromYamlFiles(files);
  console.log(`Prepared ${currentChunks.length} chunks`);

  // Always print per-file chunk counts
  const counts = new Map<string, number>();
  for (const c of currentChunks) {
    counts.set(c.sourceFile, (counts.get(c.sourceFile) ?? 0) + 1);
  }
  console.log("Per-file chunk counts:");
  for (const f of files) {
    const count = counts.get(f.rel) ?? 0;
    console.log(`  ${f.rel}: ${count}`);
  }

  // Warn if any chunk exceeds max token budget (should be rare)
  for (const c of currentChunks) {
    const tks = tokenLength(c.text);
    if (tks > MAX_TOKENS) {
      console.warn(
        `Warning: chunk > max tokens (${tks} > ${MAX_TOKENS}) at ${c.sourceFile} [form=${c.formKey}] chunkIndex=${c.chunkIndex}`
      );
    }
  }

  const dryRun =
    (Deno.env.get("DRY_RUN") ?? "").toLowerCase() === "1" ||
    (Deno.env.get("DRY_RUN") ?? "").toLowerCase() === "true";
  if (dryRun) {
    console.log("Dry-run enabled: skipping Chroma and Azure calls.");
    return;
  }

  const chroma = getChromaClient();
  const collection = await getOrCreateCollection(chroma);

  // Page through existing items
  const idToMeta = new Map<string, { hash?: string }>();
  const existingIds: string[] = [];
  const pageSize = Math.min(
    100,
    Number(Deno.env.get("CHROMA_GET_LIMIT") ?? 100)
  );
  let offset = 0;
  while (true) {
    const page = await collection.get({
      include: ["metadatas"],
      limit: pageSize,
      offset,
    });
    const ids: string[] = page.ids || [];
    const metas: Record<string, unknown>[] = page.metadatas || [];
    if (ids.length === 0) break;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      existingIds.push(id);
      idToMeta.set(id, metas[i] ?? {});
    }
    offset += ids.length;
    if (ids.length < pageSize) break;
  }

  const existingIdSet = new Set(existingIds);
  const currentIdSet = new Set(currentChunks.map((c) => c.id));
  const toInsert = currentChunks.filter((c) => !existingIdSet.has(c.id));
  const toUpdate = currentChunks.filter((c) => {
    const meta = idToMeta.get(c.id);
    return meta !== undefined && meta.hash !== c.hash;
  });
  const toDelete = existingIds.filter((id) => !currentIdSet.has(id));

  console.log(
    `Inserts: ${toInsert.length}, Updates: ${toUpdate.length}, Deletes: ${toDelete.length}`
  );

  if (toDelete.length > 0) {
    await collection.delete({ ids: toDelete });
  }

  const upserts = [...toInsert, ...toUpdate];
  if (upserts.length > 0) {
    for (let i = 0; i < upserts.length; i += 100) {
      const batch = upserts.slice(i, i + 100);
      const embeddings = await embedTexts(batch.map((b) => b.text));
      await collection.upsert({
        ids: batch.map((b) => b.id),
        embeddings,
        metadatas: batch.map((b) => ({
          sourceFile: b.sourceFile,
          formKey: b.formKey,
          chunkIndex: b.chunkIndex,
          hash: b.hash,
        })),
        documents: batch.map((b) => b.text),
      });
    }
  }

  console.log("YAML sync complete ✅");
}

await syncYaml()
  .catch((err) => {
    console.error(err);
    Deno.exit(1);
  })
  .finally(() => {
    enc.free();
  });
