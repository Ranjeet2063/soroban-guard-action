# 🛡️ Soroban Guard Action

> **The Automated Smart Contract Security, Gas & WASM Budget Auditor for Stellar Soroban.**

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Soroban%20Guard-blueviolet?logo=github)](https://github.com/marketplace)
[![CI Tests](https://img.shields.io/badge/tests-100%25%20passing-brightgreen)](https://github.com/marketplace)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built for Stellar Soroban](https://img.shields.io/badge/Stellar-Soroban-black)](https://stellar.org)

**Soroban Guard** is a developer-first GitHub Action that automatically audits Stellar Soroban smart contracts on every Pull Request and commit push. It detects critical security vulnerabilities, verifies WASM size limits, prevents storage state expiration, and generates actionable PR reports.

---

## ⚡ Why Soroban Guard?

Deploying unoptimized or insecure contracts to Stellar Soroban leads to transaction failure, expired ledger state, and exploit vulnerabilities:
1. **WASM Bloat:** Contracts exceeding bytecode thresholds fail invocation or consume excessive resource fees.
2. **Missing Authorization:** Forgetting `env.require_auth()` allows unauthorized accounts to drain balances or overwrite state.
3. **Storage TTL Expiration:** Forgetting `extend_ttl` leads to contract instance archival and broken dApps.
4. **Unchecked Arithmetic:** Integer overflows or panics in arithmetic loops trigger VM aborts.

**Soroban Guard catches all of these locally in CI before code ever hits testnet or mainnet.**

---

## 🚀 Quick Start

Add this workflow to your repository at `.github/workflows/soroban-guard.yml`:

```yaml
name: 'Soroban Security & Gas Guard'

on:
  pull_request:
    branches: [main, dev]
  push:
    branches: [main]

jobs:
  audit:
    name: 'Audit Soroban Contracts'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Rust & Soroban Target
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown

      - name: Build Contracts
        run: cargo build --target wasm32-unknown-unknown --release

      - name: Run Soroban Guard
        uses: Ranjeet2063/soroban-guard-action@v1
        with:
          contract_path: '.'
          max_wasm_size_kb: '64'
          fail_on_security_warning: 'true'
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

---

## 📋 Action Inputs

| Input | Description | Default | Required |
| :--- | :--- | :---: | :---: |
| `contract_path` | Directory containing contracts or compiled `.wasm` files | `.` | No |
| `max_wasm_size_kb` | Max allowable `.wasm` file size in KB before failing | `64` | No |
| `fail_on_security_warning` | Fail CI if High/Critical security issues are found | `false` | No |
| `fail_on_size_exceeded` | Fail CI if WASM exceeds `max_wasm_size_kb` | `true` | No |
| `comment_on_pr` | Post automated Markdown report on PR | `true` | No |
| `github_token` | GitHub token for posting PR comments (`secrets.GITHUB_TOKEN`) | `""` | No |

---

## 🔬 Security Rules Catalog

| Rule ID | Severity | Detection | Remediation |
| :--- | :---: | :--- | :--- |
| `SOROBAN-AUTH-01` | **CRITICAL** | State-mutating function missing `require_auth()` | Add `caller.require_auth()` before state modification |
| `SOROBAN-TTL-01` | **HIGH** | Storage used without `extend_ttl()` | Call `env.storage().instance().extend_ttl()` |
| `SOROBAN-MATH-01` | **HIGH** | Unchecked compound math on balance/supply | Use `checked_add()`, `checked_sub()`, `checked_mul()` |
| `SOROBAN-PANIC-01` | **MEDIUM** | Direct `.unwrap()` / `.expect()` in contract logic | Use custom `#[contracterror]` enum with `Result<T, E>` |

---

## 📊 Example PR Report

Whenever a PR is opened, Soroban Guard leaves a clear audit comment:

```markdown
## 🛡️ Soroban Guard — Smart Contract Security & Gas Report

**Overall Status:** 🟢 **100% CLEAN — ALL CHECKS PASSED**

### 📦 WASM Bytecode & Size Budget
| WASM Artifact | Size (KB) | Optimized? | Limit Status |
| :--- | :--- | :--- | :--- |
| `vault.wasm` | **42.10 KB** | ✅ Yes | ✅ Within Limit |

### 🔬 Security Invariants & Anti-Pattern Analysis
| Critical | High | Medium | Low / Info |
| :---: | :---: | :---: | :---: |
| **0** 🚨 | **0** ⚠️ | **0** ℹ️ | **0** 🔍 |

> ✅ Zero anti-patterns detected. Authorization, arithmetic checks, and storage TTL practices meet recommended Soroban standards.
```

---

## 📄 License & Author

- **Author:** Ranjeet Kumar Gupta ([@Ranjeet2063](https://github.com/Ranjeet2063))
- **License:** MIT License
