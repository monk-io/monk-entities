# Job image for the RunPod cross-region training example.
#
# All tools are installed at BUILD time, not pod boot time. The hybrid architecture
# doc measured `apt-get update` hanging for 6+ minutes in US-IL-1 at pod startup —
# a correctness problem that presents as a silent hang, not just slowness. Baking the
# toolchain into the image sidesteps it entirely: nothing installs anything at runtime.
FROM debian:bookworm-slim

# Pinned, not `rclone-current-linux-amd64.deb`: that pointer floats, so two builds
# months apart would silently get different rclone versions with different S3
# defaults — exactly the reproducibility problem "pin tools into the job image" (the
# hybrid architecture doc §6.1) exists to prevent. 1.75.0 is the version already
# verified in this image (`docker run --rm --entrypoint rclone <image> version`).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates jq && \
    curl -fsSL -o /tmp/rclone.deb https://downloads.rclone.org/v1.75.0/rclone-v1.75.0-linux-amd64.deb && \
    dpkg -i /tmp/rclone.deb && \
    rm -rf /tmp/rclone.deb /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY sync-to-path.sh /usr/local/bin/sync-to-path.sh
COPY warm-from-path.sh /usr/local/bin/warm-from-path.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/sync-to-path.sh \
      /usr/local/bin/warm-from-path.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
