# Architecture Decision Records

## Index

| ADR | Title | Status | Notes |
|-----|-------|--------|-------|
| [0001](0001-control-plane-and-runtime.md) | Separate Control Plane and Execution Plane | Authoritative | Core separation of auth/policy/audit from agent execution for fault isolation and scaling |
| [0002](0002-desired-state-and-run-snapshots.md) | Desired State in DB and Snapshot Runs | Authoritative | Store config as versioned DB records with immutable run snapshots, not shared files |
| [0003](0003-single-node-first-distributed-capable.md) | Build Appliance-First, Not Appliance-Only | Authoritative | Single-node deployment first while keeping service boundaries distributed-capable |
| [0004](0004-openclaw-first-runtime-backend.md) | OpenClaw as First Runtime Backend | Authoritative | Use OpenClaw for execution while Clawback owns conversations, approvals, audit, and policy |
| [0005](0005-plugin-capable-core-with-typed-registries.md) | Plugin-Capable Core with Typed Registries | Authoritative | Stable core model with first-party typed registries for connections, ingress, actions, and worker packs |
| [0006](0006-plugin-operator-lifecycle-and-doctor.md) | Plugin Operator Lifecycle and Doctor Contract | Authoritative | Real plugins expose setup, validate, probe, status, and recovery hints for operator diagnostics |
| [0007](0007-whatsapp-approval-transport-adapters.md) | WhatsApp Approval Transport Adapters | Authoritative | Keep approval core fixed; treat WhatsApp delivery as swappable adapters (openclaw_pairing, meta_cloud_api) |
| [0008](0008-keep-worker-execution-semantics-in-clawback.md) | Keep Worker Execution Semantics in Clawback | Authoritative | Clawback owns worker-step semantics; OpenClaw and n8n are execution substrates, not behavior owners |
| [0009](0009-sequence-kernel-generalization-after-semantic-freeze.md) | Sequence Kernel Generalization After Semantic Freeze | Historical context | Prove shared execution semantics in domain first, then formalize worker-pack contract in Phase 3 |
| [0010](0010-keep-execution-kernel-in-domain-until-second-runtime-pack.md) | Keep Execution Kernel in Domain Until Second Runtime Pack | Authoritative | Defer packages/execution-kernel extraction; keep helpers in @clawback/domain until a second pack forces the split |

## How to Read These

ADRs record significant architectural decisions. They capture *why* a decision was made at the time. Even superseded ADRs are useful for understanding the reasoning that led to the current architecture.

## Adding New ADRs

Use the next sequential number (0011). Follow the existing format: problem, decision, consequences.
