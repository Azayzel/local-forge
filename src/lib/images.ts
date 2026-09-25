export function imageDataUrl(value: string): string {
  if (value.startsWith("data:") || value.startsWith("local-forge-attachment:"))
    return value;
  const mime = value.startsWith("iVBOR")
    ? "image/png"
    : value.startsWith("UklGR")
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${value}`;
}

export function imageBase64(value: string): string {
  if (!value.startsWith("data:")) return value;
  const separator = value.indexOf(",");
  return separator >= 0 ? value.slice(separator + 1) : value;
}
