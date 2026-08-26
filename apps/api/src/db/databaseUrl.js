export function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "");

  if (url.protocol !== "mysql:" || !url.hostname || !url.username || !database) {
    throw new Error("DATABASE_URL is not a complete MySQL connection URL");
  }

  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 5,
    allowPublicKeyRetrieval: loopbackHosts.has(url.hostname.toLowerCase()),
  };
}
