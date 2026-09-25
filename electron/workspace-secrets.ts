function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mapSecretRecord(
  value: unknown,
  transform: (value: string) => string,
): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === "string" ? transform(entry) : entry,
    ]),
  );
}

export function mapWorkspaceMcpSecrets(
  value: unknown,
  transform: (value: string) => string,
): unknown {
  if (!isRecord(value) || !isRecord(value.settings)) return value;
  const servers = value.settings.mcpServers;
  if (!Array.isArray(servers)) return value;

  return {
    ...value,
    settings: {
      ...value.settings,
      mcpServers: servers.map((server) =>
        isRecord(server)
          ? {
              ...server,
              env: mapSecretRecord(server.env, transform),
              headers: mapSecretRecord(server.headers, transform),
            }
          : server,
      ),
    },
  };
}
