FROM ubuntu:24.04

# Pure source regression tests can run without granting shell network access.
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/bin/node

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash \
      bubblewrap \
      ca-certificates \
      coreutils \
      findutils \
      git \
      jq \
      ripgrep \
    && rm -rf /var/lib/apt/lists/*

RUN chmod 4755 /usr/bin/bwrap

ENV CODEX_HOME=/codex-home

ENTRYPOINT ["/usr/local/bin/codex"]
