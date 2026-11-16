FROM denoland/deno:alpine
WORKDIR /app
COPY workers/plugin-runtime ./workers/plugin-runtime
COPY shared/plugin-runtime.js ./shared/plugin-runtime.js
ENV DENO_NO_PROMPT=1
CMD ["run", "--no-prompt", "--allow-net", "--allow-env", "--allow-run", "--allow-read", "--allow-write", "workers/plugin-runtime/index.ts"]
