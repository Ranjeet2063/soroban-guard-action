import * as fs from 'fs';
import * as path from 'path';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface SecurityFinding {
  ruleId: string;
  severity: Severity;
  title: string;
  description: string;
  file: string;
  line: number;
  snippet: string;
  remediation: string;
}

export interface SecurityAuditResult {
  findings: SecurityFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export function findRustFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.git' && entry.name !== 'target' && entry.name !== 'node_modules') {
        findRustFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function scanRustCodeForSorobanRisks(baseDir: string): SecurityAuditResult {
  const rustFiles = findRustFiles(baseDir);
  const findings: SecurityFinding[] = [];

  for (const file of rustFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const relPath = path.relative(baseDir, file);
    const isTestFile =
      relPath.startsWith('test/') ||
      relPath.startsWith('tests/') ||
      relPath.endsWith('_test.rs') ||
      relPath.endsWith('.test.rs') ||
      content.includes('#[cfg(test)]');

    let insideContractImpl = false;
    let hasStorageUsage = false;
    let hasExtendTtl = false;

    // Check file level storage vs TTL extension
    if (content.includes('env.storage()')) {
      hasStorageUsage = true;
    }
    if (content.includes('extend_ttl')) {
      hasExtendTtl = true;
    }

    if (hasStorageUsage && !hasExtendTtl && !isTestFile) {
      findings.push({
        ruleId: 'SOROBAN-TTL-01',
        severity: 'HIGH',
        title: 'Missing Storage TTL Extension (`extend_ttl`)',
        description:
          'Contract writes to or reads from ledger storage but never extends TTL. Soroban storage entries can expire and get archived if not bumped.',
        file: relPath,
        line: 1,
        snippet: 'env.storage() usage without extend_ttl',
        remediation:
          'Call `env.storage().instance().extend_ttl(threshold, extend_to)` to ensure the contract state remains active.',
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue; // skip comments
      }

      if (trimmed.includes('#[contractimpl]')) {
        insideContractImpl = true;
      }

      // Check Rule: Naked .unwrap() inside contract logic
      if (
        (trimmed.includes('.unwrap()') || trimmed.includes('.expect(')) &&
        !isTestFile &&
        !trimmed.startsWith('//')
      ) {
        findings.push({
          ruleId: 'SOROBAN-PANIC-01',
          severity: 'MEDIUM',
          title: 'Direct `.unwrap()` / `.expect()` in Contract Logic',
          description:
            'Unchecked unwrap causes the VM to abort with generic panic instead of structured contract error enum.',
          file: relPath,
          line: lineNum,
          snippet: trimmed,
          remediation:
            'Use `#[contracterror]` enum and return `Result<T, Error>` with `?` or `.ok_or(Error::SomeError)?`.',
        });
      }

      // Check Rule: Mutating function without require_auth check on Address argument
      if (
        trimmed.startsWith('pub fn ') &&
        trimmed.includes('env: Env') &&
        trimmed.includes('Address') &&
        !isTestFile
      ) {
        // Look ahead 25 lines to see if require_auth is called in active code
        const activeLookaheadCode = lines
          .slice(i, Math.min(i + 25, lines.length))
          .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
          .join('\n');

        if (
          !activeLookaheadCode.includes('.require_auth(') &&
          !activeLookaheadCode.includes('.require_auth_for_args(') &&
          (activeLookaheadCode.includes('set(') ||
            activeLookaheadCode.includes('transfer(') ||
            activeLookaheadCode.includes('mint(') ||
            activeLookaheadCode.includes('burn('))
        ) {
          findings.push({
            ruleId: 'SOROBAN-AUTH-01',
            severity: 'CRITICAL',
            title: 'Potential Missing Authorization (`require_auth`) on State Mutation',
            description:
              'Function accepts an Address and executes state mutations (set/transfer/mint) without calling `address.require_auth()`.',
            file: relPath,
            line: lineNum,
            snippet: trimmed,
            remediation:
              'Enforce explicit caller authorization: `address.require_auth()` before mutating state.',
          });
        }
      }

      // Check Rule: Raw arithmetic without checked operations in balance calculations
      if (
        (trimmed.includes(' += ') || trimmed.includes(' -= ') || trimmed.includes(' *= ')) &&
        (trimmed.includes('amount') || trimmed.includes('balance') || trimmed.includes('supply')) &&
        !isTestFile
      ) {
        findings.push({
          ruleId: 'SOROBAN-MATH-01',
          severity: 'HIGH',
          title: 'Unchecked Arithmetic in Financial Calculation',
          description:
            'Direct compound arithmetic on balance/amount variables may panic on overflow/underflow or fail unexpectedly.',
          file: relPath,
          line: lineNum,
          snippet: trimmed,
          remediation:
            'Use `checked_add`, `checked_sub`, or `checked_mul` to safely handle arithmetic boundaries.',
        });
      }
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;
  const lowCount = findings.filter((f) => f.severity === 'LOW' || f.severity === 'INFO').length;

  return {
    findings,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}
