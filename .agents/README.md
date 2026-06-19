# Agent Scope Gates

`.agents/app-layer.allowlist` is the write allowlist for external top-layer
composition agents. The checked-in guard is:

```bash
npm run agent:scope-check -- --base origin/local
```

The guard checks committed, staged, unstaged, and untracked files. It fails if
any changed path is outside the allowlist, except local tool/cache paths ignored
by the script.

Only the repository owner should widen this allowlist. If a composition task
needs a forbidden path, add an extension point in the platform deliberately
instead of letting the external agent patch core/runtime/shared files directly.
