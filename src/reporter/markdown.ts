import { WasmAuditResult } from '../analyzer/wasm.js';
import { SecurityAuditResult } from '../analyzer/security.js';

export function generateMarkdownReport(
  wasmResult: WasmAuditResult,
  securityResult: SecurityAuditResult,
  maxWasmSizeKb: number
): string {
  const isFailed =
    wasmResult.hasExceeded ||
    securityResult.criticalCount > 0;
  const isWarning =
    !isFailed && (securityResult.highCount > 0 || securityResult.mediumCount > 0);

  const statusBadge = isFailed
    ? '🔴 **CI AUDIT FAILED**'
    : isWarning
    ? '🟡 **PASSED WITH WARNINGS**'
    : '🟢 **100% CLEAN — ALL CHECKS PASSED**';

  let md = `## 🛡️ Soroban Guard — Smart Contract Security & Gas Report\n\n`;
  md += `**Overall Status:** ${statusBadge}\n\n`;

  // --- WASM & Gas Section ---
  md += `### 📦 WASM Bytecode & Size Budget\n`;
  md += `> Configured Size Limit: **${maxWasmSizeKb} KB**\n\n`;

  if (wasmResult.artifacts.length === 0) {
    md += `_No compiled \`.wasm\` files found in scan directory. Run \`stellar contract build\` or \`cargo build --target wasm32-unknown-unknown --release\` before running this action._\n\n`;
  } else {
    md += `| WASM Artifact | Size (KB) | Optimized? | Limit Status |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const art of wasmResult.artifacts) {
      const statusIcon = art.exceedsThreshold ? '❌ **Exceeded**' : '✅ Within Limit';
      const optIcon = art.isOptimized ? '✅ Yes' : '⚠️ Unoptimized';
      md += `| \`${art.fileName}\` | **${art.sizeKb} KB** | ${optIcon} | ${statusIcon} |\n`;
    }
    md += `\n**Total WASM Footprint:** \`${wasmResult.totalSizeKb} KB\`\n\n`;
  }

  // --- Security Findings Section ---
  md += `### 🔬 Security Invariants & Anti-Pattern Analysis\n\n`;
  md += `| Critical | High | Medium | Low / Info |\n`;
  md += `| :---: | :---: | :---: | :---: |\n`;
  md += `| **${securityResult.criticalCount}** 🚨 | **${securityResult.highCount}** ⚠️ | **${securityResult.mediumCount}** ℹ️ | **${securityResult.lowCount}** 🔍 |\n\n`;

  if (securityResult.findings.length === 0) {
    md += `> ✅ **Zero anti-patterns detected.** Authorization, arithmetic checks, and storage TTL practices meet recommended Soroban standards.\n\n`;
  } else {
    md += `#### Detected Security Issues\n\n`;
    for (const item of securityResult.findings) {
      const severityIcon =
        item.severity === 'CRITICAL'
          ? '🚨 **CRITICAL**'
          : item.severity === 'HIGH'
          ? '⚠️ **HIGH**'
          : item.severity === 'MEDIUM'
          ? '⚡ **MEDIUM**'
          : 'ℹ️ **INFO**';

      md += `<details>\n`;
      md += `<summary>${severityIcon} <code>${item.ruleId}</code>: <b>${item.title}</b> (<code>${item.file}:${item.line}</code>)</summary>\n\n`;
      md += `**Description:** ${item.description}\n\n`;
      md += `**Code Snippet:**\n\`\`\`rust\n${item.snippet}\n\`\`\`\n\n`;
      md += `**💡 Remediation:** ${item.remediation}\n\n`;
      md += `</details>\n\n`;
    }
  }

  // --- Footer ---
  md += `---\n`;
  md += `*Report generated automatically by [Soroban Guard](https://github.com/marketplace) • Stellar Smart Contract Quality Assurance*\n`;

  return md;
}
