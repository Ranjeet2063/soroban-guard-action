import * as core from '@actions/core';
import * as path from 'path';
import { analyzeWasmFiles } from './analyzer/wasm.js';
import { scanRustCodeForSorobanRisks } from './analyzer/security.js';
import { generateMarkdownReport } from './reporter/markdown.js';
import { postOrUpdatePRComment } from './github/comment.js';

async function run(): Promise<void> {
  try {
    const contractPathInput = core.getInput('contract_path') || '.';
    const maxWasmSizeKb = parseFloat(core.getInput('max_wasm_size_kb') || '64');
    const failOnSecurityWarning = core.getInput('fail_on_security_warning') === 'true';
    const failOnSizeExceeded = core.getInput('fail_on_size_exceeded') !== 'false';
    const commentOnPr = core.getInput('comment_on_pr') !== 'false';
    const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN;

    const targetDir = path.resolve(process.cwd(), contractPathInput);

    core.info(`🔍 Soroban Guard scanning target directory: ${targetDir}`);
    core.info(`⚙️ Configuration: max_wasm_size_kb=${maxWasmSizeKb}, fail_on_security=${failOnSecurityWarning}`);

    // 1. WASM Audit
    const wasmResult = analyzeWasmFiles(targetDir, maxWasmSizeKb);
    core.info(`📦 WASM Analysis Complete: ${wasmResult.artifacts.length} file(s) found, Total Size: ${wasmResult.totalSizeKb} KB`);

    // 2. Static Security Audit
    const securityResult = scanRustCodeForSorobanRisks(targetDir);
    core.info(
      `🔬 Security Audit Complete: ${securityResult.criticalCount} Critical, ${securityResult.highCount} High, ${securityResult.mediumCount} Medium`
    );

    // 3. Generate Markdown Report
    const reportMarkdown = generateMarkdownReport(wasmResult, securityResult, maxWasmSizeKb);

    // 4. Set Action Outputs
    core.setOutput('wasm_size_kb', wasmResult.totalSizeKb.toString());
    core.setOutput('security_warnings_count', securityResult.findings.length.toString());

    const hasFailed =
      (failOnSizeExceeded && wasmResult.hasExceeded) ||
      (failOnSecurityWarning && (securityResult.criticalCount > 0 || securityResult.highCount > 0));

    core.setOutput('status', hasFailed ? 'failed' : 'passed');

    // 5. Post PR Comment if enabled and token provided
    if (commentOnPr && githubToken) {
      await postOrUpdatePRComment(githubToken, reportMarkdown);
    } else if (commentOnPr && !githubToken) {
      core.info('PR comment requested but no github_token provided. Skipping comment dispatch.');
    }

    // 6. Fail job if threshold breached
    if (hasFailed) {
      if (wasmResult.hasExceeded) {
        core.setFailed(`WASM size exceeded maximum threshold of ${maxWasmSizeKb} KB!`);
      }
      if (failOnSecurityWarning && securityResult.criticalCount > 0) {
        core.setFailed(`Critical Soroban security violations detected! Please remediate before merging.`);
      }
    } else {
      core.info('✅ Soroban Guard checks completed successfully!');
    }
  } catch (error: any) {
    core.setFailed(`Soroban Guard execution failed: ${error.message}`);
  }
}

run();
