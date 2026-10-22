/** Wraps a tool's data (or failure) into an MCP tool result. Data is returned as pretty JSON text. */
export async function respond(run: () => Promise<unknown>) {
  try {
    const data = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }
}

/** Shared tool annotations: every tool only reads public market data. */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
