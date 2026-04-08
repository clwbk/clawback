# Start Here

Choose the path that matches how much you want to inspect.

**Audience:** First-time evaluators, operators, and contributors deciding
whether to click through the shared demo, clone the repo, or deploy the stack.

## The Short Version

There are three honest ways to start:

1. **Use the shared hosted demo**
   - fastest first impression
   - no local setup
   - intentionally narrow and disposable
   - use [Public Demo Guide](./public-demo.md)
2. **Clone the repo and run it locally**
   - best path if you want to inspect the real product surfaces
   - use [Quickstart](./quickstart.md)
3. **Deploy it on a server**
   - best path if you want a real self-hosted workspace instead of a shared demo
   - use [Deployment](./deployment.md)

## Which Path Should You Pick?

### Pick the shared demo if:

- you want a quick evaluator pass
- you are okay with a bounded `Incident Copilot` path
- you do not need your own data or your own workspace

What it proves:

- retrieval-backed answers over a known corpus
- governed action handoff
- visible review and workspace state

What it does not prove:

- your own deployment
- your own users or connectors
- broad workflow coverage

Next doc:

- [Public Demo Guide](./public-demo.md)

### Pick local clone if:

- you want to inspect the repo and product honestly
- you want a private local workspace
- you may want to contribute or debug

Fast path:

```bash
git clone https://github.com/clwbk/clawback.git clawback
cd clawback
pnpm install
./scripts/start-local.sh
pnpm db:seed
```

Then open:

- `http://localhost:3000/setup`

Next docs:

- [Quickstart](./quickstart.md)
- [Getting Started](./getting-started.md)

### Pick server deployment if:

- you want a real self-hosted environment
- you need a dedicated workspace rather than a shared public one
- you want to verify the supported single-node deployment path

Next docs:

- [Deployment](./deployment.md)
- [Verification and Testing](./verification-and-testing.md)
- [Known Limitations](./known-limitations.md)

## With Or Without Cloning The Repo

The honest current answer is:

- if you want to self-host, the supported path still starts from a repo checkout
- if you only want to try the product, use the shared demo and do not clone anything
- if you are deploying to a remote VM, the **remote host does not need its own git checkout**
  when you deploy from a local checkout with `./scripts/deploy-remote-stack.sh`

That means the current modes are:

1. **No clone at all**
   - use the shared hosted demo
2. **Clone locally**
   - use quickstart for local evaluation or contribution
3. **Clone locally, but not on the server**
   - use the deployment tooling to sync the current repo snapshot to the host

Example remote deploy flow:

```bash
git clone https://github.com/clwbk/clawback.git clawback
cd clawback
cp .env.prod.example .env
./scripts/deploy-remote-stack.sh --host user@host
```

## Recommended Starting Order

If you are unsure, use this order:

1. [Public Demo Guide](./public-demo.md) for the quick shared path
2. [Quickstart](./quickstart.md) for the real local path
3. [Deployment](./deployment.md) if you want a dedicated server-backed workspace

## Related Guides

- [Public Demo Guide](./public-demo.md)
- [Quickstart](./quickstart.md)
- [Getting Started](./getting-started.md)
- [Deployment](./deployment.md)
- [Verification and Testing](./verification-and-testing.md)
- [Known Limitations](./known-limitations.md)
