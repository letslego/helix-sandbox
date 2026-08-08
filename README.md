# @letslego/helix-sandbox

Isolated **sandbox compute** for Helix agents.

- Path-safe filesystem
- `glob` / `grep`
- Allowlisted `bash` (`ls`, `cat`, `node`, …)
- Workspace seeding from authored files

```bash
npm install @letslego/helix-sandbox
```

```ts
import { createSandbox, defineSandbox } from "@letslego/helix-sandbox";

const sbx = createSandbox(process.cwd(), defineSandbox({ backend: "local" }));
sbx.writeFile("workspace/note.txt", "hello");
```

## Ecosystem

| Package | Role |
| --- | --- |
| [@letslego/helix](https://github.com/letslego/helix) | Agent framework |
| [@letslego/helix-workflow](https://github.com/letslego/helix-workflow) | Durable workflows |
| [@letslego/helix-gateway](https://github.com/letslego/helix-gateway) | AI Gateway |
| [@letslego/helix-sandbox](https://github.com/letslego/helix-sandbox) | Isolated compute |
| [@letslego/helix-connect](https://github.com/letslego/helix-connect) | Credential brokering |
| [@letslego/helix-channels](https://github.com/letslego/helix-channels) | Delivery surfaces |

Overview: https://letslego.github.io/helix-ecosystem/


## License

Apache-2.0 © LetsLego
