# Axon documentation

Source of https://axongui.github.io/. It lives outside the framework repo and consumes the **published**
`axon-gui` from npm — so what the docs describe is exactly what users install.

Two shapes, same bundle: in a plain browser it is a normal manual; inside an AxonGUI window
(`python scripts/main.py`) every example grows a "Run" button that really calls the Python
controller and prints both sides of the message flow.

```bash
cd web && npm install && npm run docs:build && cd ..
npm --prefix web run docs:dev          # manual only
uv sync && uv run python scripts/main.py
uv run python scripts/verify_offline.py
uv run python scripts/verify_docs.py
```

MIT
