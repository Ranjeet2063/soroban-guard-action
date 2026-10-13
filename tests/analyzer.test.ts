import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeWasmFiles } from '../src/analyzer/wasm.js';
import { scanRustCodeForSorobanRisks } from '../src/analyzer/security.js';
import { generateMarkdownReport } from '../src/reporter/markdown.js';

const TEST_DIR = path.join(__dirname, 'mock_contract');

describe('Soroban Guard Test Suite', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('detects missing authorization and unchecked arithmetic in vulnerable contract', () => {
    const vulnerableRustCode = `
      use soroban_sdk::{contract, contractimpl, Address, Env};

      #[contract]
      pub struct VulnerableContract;

      #[contractimpl]
      impl VulnerableContract {
          pub fn transfer_insecure(env: Env, from: Address, to: Address, amount: i128) {
              // Missing from.require_auth()!
              let mut balance = 1000i128;
              balance -= amount; // Unchecked arithmetic
              env.storage().instance().set(&from, &balance);
          }
      }
    `;

    fs.writeFileSync(path.join(TEST_DIR, 'lib.rs'), vulnerableRustCode);

    const result = scanRustCodeForSorobanRisks(TEST_DIR);

    expect(result.criticalCount).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.ruleId === 'SOROBAN-AUTH-01')).toBe(true);
    expect(result.findings.some((f) => f.ruleId === 'SOROBAN-MATH-01')).toBe(true);
    expect(result.findings.some((f) => f.ruleId === 'SOROBAN-TTL-01')).toBe(true);
  });

  it('passes cleanly on secure Soroban contract with require_auth and safe math', () => {
    const secureRustCode = `
      use soroban_sdk::{contract, contractimpl, Address, Env};

      #[contract]
      pub struct SecureContract;

      #[contractimpl]
      impl SecureContract {
          pub fn transfer_secure(env: Env, from: Address, to: Address, amount: i128) {
              from.require_auth();
              env.storage().instance().extend_ttl(100, 1000);
              let balance: i128 = 1000;
              let new_balance = balance.checked_sub(amount).expect("math overflow");
              env.storage().instance().set(&from, &new_balance);
          }
      }
    `;

    fs.writeFileSync(path.join(TEST_DIR, 'lib.rs'), secureRustCode);

    const result = scanRustCodeForSorobanRisks(TEST_DIR);
    expect(result.criticalCount).toBe(0);
    expect(result.findings.some((f) => f.ruleId === 'SOROBAN-AUTH-01')).toBe(false);
  });

  it('correctly audits WASM file sizes and detects threshold breach', () => {
    const mockWasm = Buffer.alloc(100 * 1024); // 100 KB
    fs.writeFileSync(path.join(TEST_DIR, 'test_contract.wasm'), mockWasm);

    // Limit set to 64 KB, file is 100 KB -> should exceed
    const auditResult = analyzeWasmFiles(TEST_DIR, 64);
    expect(auditResult.artifacts.length).toBe(1);
    expect(auditResult.hasExceeded).toBe(true);
    expect(auditResult.artifacts[0].sizeKb).toBe(100);

    // Generate markdown report
    const emptySecurity = { findings: [], criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 };
    const md = generateMarkdownReport(auditResult, emptySecurity, 64);
    expect(md).toContain('CI AUDIT FAILED');
    expect(md).toContain('100 KB');
  });
});
