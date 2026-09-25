import type { ImageModel } from "../types";

const NSFW_MODEL_PATTERN =
  /(?:^|[\s._/\\-])(nsfw|adult|uncensored|explicit|erotic|hentai|nude|nudity|porn|xxx)(?:$|[\s._/\\-])/i;

export const NSFW_STUDIO_PROMPT =
  "Adult-only fine-art figure study, clearly mature subject, tasteful nude portrait, natural anatomy, detailed skin texture, professional studio lighting, cinematic composition";

export const NSFW_STUDIO_NEGATIVE_PROMPT =
  "minor, child, teen, young-looking subject, age ambiguity, text, watermark, distorted anatomy, duplicate body parts, low detail";

export function isNsfwImageModel(
  model: Pick<ImageModel, "id" | "name" | "path" | "architecture">,
): boolean {
  return NSFW_MODEL_PATTERN.test(
    [model.id, model.name, model.path, model.architecture].join(" "),
  );
}
