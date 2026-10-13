import * as fs from 'fs';
import * as path from 'path';

export interface WasmArtifact {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  sizeKb: number;
  isOptimized: boolean;
  exceedsThreshold: boolean;
}

export interface WasmAuditResult {
  artifacts: WasmArtifact[];
  totalSizeKb: number;
  hasExceeded: boolean;
}

export function findWasmFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories and huge caches
      if (entry.name !== '.git' && entry.name !== 'node_modules') {
        findWasmFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.wasm')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function analyzeWasmFiles(
  baseDir: string,
  maxWasmSizeKb: number
): WasmAuditResult {
  const wasmPaths = findWasmFiles(baseDir);
  const artifacts: WasmArtifact[] = [];

  let totalSizeKb = 0;
  let hasExceeded = false;

  for (const wPath of wasmPaths) {
    const stats = fs.statSync(wPath);
    const sizeBytes = stats.size;
    const sizeKb = Number((sizeBytes / 1024).toFixed(2));
    const exceedsThreshold = sizeKb > maxWasmSizeKb;

    if (exceedsThreshold) {
      hasExceeded = true;
    }
    totalSizeKb += sizeKb;

    // Check if optimized by inspecting name or size heuristic
    const isOptimized = !wPath.includes('debug') && (wPath.includes('optimized') || sizeKb < 100);

    artifacts.push({
      fileName: path.basename(wPath),
      filePath: wPath,
      sizeBytes,
      sizeKb,
      isOptimized,
      exceedsThreshold,
    });
  }

  return {
    artifacts,
    totalSizeKb: Number(totalSizeKb.toFixed(2)),
    hasExceeded,
  };
}
