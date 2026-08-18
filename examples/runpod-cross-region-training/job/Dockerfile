# Job image for the RunPod cross-region training example.
#
# All tools are installed at BUILD time, not pod boot time. The hybrid architecture
# doc measured `apt-get update` hanging for 6+ minutes in US-IL-1 at pod startup —
# a correctness problem that presents as a silent hang, not just slowness. Baking the
# toolchain into the image sidesteps it entirely: nothing installs anything at runtime.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates jq && \
    curl -fsSL -o /tmp/rclone.deb https://downloads.rclone.org/rclone-current-linux-amd64.deb && \
    dpkg -i /tmp/rclone.deb && \
    rm -rf /tmp/rclone.deb /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY sync-to-external-storage.sh /usr/local/bin/sync-to-external-storage.sh
COPY warm-from-external-storage.sh /usr/local/bin/warm-from-external-storage.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/sync-to-external-storage.sh \
      /usr/local/bin/warm-from-external-storage.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
