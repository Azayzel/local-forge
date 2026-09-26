import argparse
import inspect
import io
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

NSFW_SEGMENTER_MODELS = {
    "breast": "nsfw-seg-breast-x.pt",
    "penis": "nsfw-seg-penis-x.pt",
    "vagina": "nsfw-seg-vagina-x.pt",
}


def emit(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def read_request() -> dict:
    line = sys.stdin.readline()
    if not line:
        raise ValueError("The image worker did not receive a request.")
    value = json.loads(line)
    if not isinstance(value, dict):
        raise ValueError("The image request must be a JSON object.")
    return value


def bounded_int(value: object, name: str, minimum: int, maximum: int) -> int:
    parsed = int(value)
    if parsed < minimum or parsed > maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return parsed


def bounded_float(value: object, name: str, minimum: float, maximum: float) -> float:
    parsed = float(value)
    if parsed < minimum or parsed > maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return parsed


def load_pipeline(model_path: Path):
    try:
        import torch
        from diffusers import DiffusionPipeline
    except ImportError as error:
        raise RuntimeError(
            "Image runtime dependencies are missing. Install runtime/requirements-image.txt "
            "into the selected Python environment."
        ) from error

    if not (model_path / "model_index.json").is_file():
        raise ValueError(
            "Image execution currently requires a Diffusers model directory containing "
            "model_index.json. Convert single-file checkpoints to Diffusers format first."
        )

    using_cuda = bool(torch.cuda.is_available())
    dtype = torch.float16 if using_cuda else torch.float32
    load_options = {
        "torch_dtype": dtype,
        "local_files_only": True,
    }
    emit({"type": "status", "message": f"Loading {model_path.name}..."})
    try:
        pipeline = DiffusionPipeline.from_pretrained(
            str(model_path), variant="fp16", **load_options
        )
    except (OSError, ValueError):
        pipeline = DiffusionPipeline.from_pretrained(str(model_path), **load_options)

    if using_cuda:
        total_vram = torch.cuda.get_device_properties(0).total_memory
        if total_vram >= 16 * 1024**3:
            pipeline.to("cuda")
        else:
            pipeline.enable_model_cpu_offload()
        generator = torch.Generator(device="cuda")
    else:
        emit(
            {
                "type": "status",
                "message": "CUDA is unavailable; generating on CPU.",
            }
        )
        pipeline.to("cpu")
        generator = torch.Generator(device="cpu")
    return pipeline, generator


def preview_step_numbers(total: int) -> set[int]:
    return {
        1,
        total,
        math.ceil(total * 0.25),
        math.ceil(total * 0.5),
        math.ceil(total * 0.75),
    }


def save_latent_preview(pipeline, latents, output_path: Path) -> tuple[int, int]:
    import torch
    import torch.nn.functional as functional

    vae = getattr(pipeline, "vae", None)
    image_processor = getattr(pipeline, "image_processor", None)
    if vae is None or image_processor is None or not isinstance(latents, torch.Tensor):
        raise RuntimeError("This pipeline does not expose decodable image latents.")
    if latents.ndim != 4:
        raise RuntimeError("This pipeline uses a latent format that cannot be previewed.")

    preview_latents = latents.detach()
    largest_side = max(preview_latents.shape[-2:])
    if largest_side > 64:
        scale = 64 / largest_side
        preview_latents = functional.interpolate(
            preview_latents,
            scale_factor=scale,
            mode="bilinear",
            align_corners=False,
        )

    original_dtype = next(vae.parameters()).dtype
    force_upcast = bool(
        original_dtype == torch.float16
        and getattr(vae.config, "force_upcast", False)
    )
    try:
        if force_upcast:
            if hasattr(pipeline, "upcast_vae"):
                pipeline.upcast_vae()
            else:
                vae.to(dtype=torch.float32)
        vae_parameter = next(vae.parameters())
        preview_latents = preview_latents.to(
            device=vae_parameter.device,
            dtype=vae_parameter.dtype,
        )
        scaling_factor = float(getattr(vae.config, "scaling_factor", 1.0))
        shift_factor = getattr(vae.config, "shift_factor", None)
        preview_latents = preview_latents / scaling_factor
        if shift_factor is not None:
            preview_latents = preview_latents + float(shift_factor)
        with torch.inference_mode():
            decoded = vae.decode(preview_latents, return_dict=False)[0]
        image = image_processor.postprocess(decoded, output_type="pil")[0]
        image.save(output_path, format="PNG")
        return image.width, image.height
    finally:
        if force_upcast:
            vae.to(dtype=original_dtype)


def require_model_file(
    value: object, name: str, extensions: set[str]
) -> Path:
    model_path = Path(str(value or "")).expanduser().resolve()
    if not model_path.is_file():
        raise ValueError(f"{name} was not found: {model_path}")
    if model_path.suffix.lower() not in extensions:
        expected = ", ".join(sorted(extensions))
        raise ValueError(f"{name} must use one of these formats: {expected}.")
    return model_path


def require_segmenter_directory(value: object) -> Path:
    model_dir = Path(str(value or "")).expanduser().resolve()
    if not model_dir.is_dir():
        raise ValueError(f"NSFW segmentation model directory was not found: {model_dir}")
    for filename in NSFW_SEGMENTER_MODELS.values():
        if not (model_dir / filename).is_file():
            raise ValueError(f"NSFW segmentation model was not found: {filename}")
    return model_dir


def segment_nsfw(
    model_dir: Path,
    image: Any,
    conf: float = 0.3,
    model_factory: Any | None = None,
) -> dict[str, Any]:
    import numpy as np
    from PIL import Image

    if model_factory is None:
        try:
            from ultralytics import YOLO
        except ImportError as error:
            raise RuntimeError(
                "NSFW segmentation requires ultralytics. "
                "Reinstall runtime/requirements-image.txt."
            ) from error
        model_factory = YOLO

    width, height = image.size
    masks: dict[str, Any] = {}
    for region, filename in NSFW_SEGMENTER_MODELS.items():
        model = model_factory(str(model_dir / filename))
        results = model.predict(image, conf=conf, verbose=False)
        combined = np.zeros((height, width), dtype=np.uint8)
        for result in results:
            if result.masks is None:
                continue
            for mask_data in result.masks.data:
                mask_array = mask_data.cpu().numpy()
                mask = Image.fromarray((mask_array * 255).astype(np.uint8))
                mask = mask.resize((width, height), Image.Resampling.NEAREST)
                combined = np.maximum(combined, np.asarray(mask))
        if combined.max() > 0:
            masks[region] = Image.fromarray(combined)
    return masks


def expanded_face_box(
    box: tuple[int, int, int, int],
    image_width: int,
    image_height: int,
    padding: float = 0.4,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    side = max(x2 - x1, y2 - y1) * (1 + padding)
    center_x = (x1 + x2) / 2
    center_y = (y1 + y2) / 2
    return (
        int(max(0, center_x - side / 2)),
        int(max(0, center_y - side / 2)),
        int(min(image_width, center_x + side / 2)),
        int(min(image_height, center_y + side / 2)),
    )


def feathered_mask(size: tuple[int, int], feather: int = 24):
    from PIL import Image, ImageFilter

    width, height = size
    if width <= feather * 2 or height <= feather * 2:
        return Image.new("L", size, 255)
    mask = Image.new("L", size, 0)
    mask.paste(
        Image.new("L", (width - feather * 2, height - feather * 2), 255),
        (feather, feather),
    )
    return mask.filter(ImageFilter.GaussianBlur(radius=feather / 2))


def parse_edit_region(value: object) -> tuple[float, float, float, float]:
    if not isinstance(value, dict):
        raise ValueError("edit_region must be an object.")
    x = bounded_float(value.get("x"), "edit_region.x", 0, 1)
    y = bounded_float(value.get("y"), "edit_region.y", 0, 1)
    width = bounded_float(value.get("width"), "edit_region.width", 0.01, 1)
    height = bounded_float(value.get("height"), "edit_region.height", 0.01, 1)
    if x + width > 1 or y + height > 1:
        raise ValueError("edit_region must stay inside the source image.")
    return x, y, width, height


def edit_selection_mask(
    size: tuple[int, int],
    region: tuple[float, float, float, float],
    feather: int = 24,
):
    from PIL import Image, ImageChops, ImageDraw, ImageFilter

    image_width, image_height = size
    x, y, width, height = region
    left = max(0, min(image_width - 1, round(x * image_width)))
    top = max(0, min(image_height - 1, round(y * image_height)))
    right = max(left + 1, min(image_width, round((x + width) * image_width)))
    bottom = max(top + 1, min(image_height, round((y + height) * image_height)))
    hard_mask = Image.new("L", size, 0)
    ImageDraw.Draw(hard_mask).rectangle(
        (left, top, right - 1, bottom - 1),
        fill=255,
    )
    if feather <= 0:
        return hard_mask
    softened = hard_mask.filter(ImageFilter.GaussianBlur(radius=feather / 2))
    return ImageChops.multiply(softened, hard_mask)


def edit_generation_prompt(prompt: str, instruction: str) -> str:
    instruction = instruction.strip()
    if not instruction:
        return prompt
    prompt = prompt.strip().rstrip(" ,.")
    return f"{prompt}, {instruction}" if prompt else instruction


def detect_face_boxes(detector_path: Path, image, maximum: int = 4):
    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise RuntimeError(
            "Face Fix requires ultralytics. Reinstall runtime/requirements-image.txt."
        ) from error

    detector = YOLO(str(detector_path))
    boxes: list[tuple[int, int, int, int]] = []
    for result in detector.predict(image, conf=0.35, verbose=False):
        if result.boxes is None:
            continue
        for coordinates in result.boxes.xyxy.cpu().numpy():
            boxes.append(tuple(map(int, coordinates)))
    boxes.sort(
        key=lambda box: (box[2] - box[0]) * (box[3] - box[1]),
        reverse=True,
    )
    return boxes[:maximum]


def face_crop_size(pipeline: Any) -> int:
    sample_size = getattr(getattr(pipeline, "unet", None), "config", None)
    sample_size = getattr(sample_size, "sample_size", 64)
    if isinstance(sample_size, (tuple, list)):
        sample_size = max(sample_size)
    latent_scale = int(getattr(pipeline, "vae_scale_factor", 8))
    return max(512, min(1024, int(sample_size) * latent_scale))


def refine_faces(
    pipeline: Any,
    image: Any,
    detector_path: Path,
    prompt: str,
    negative_prompt: str,
    strength: float,
    generator: Any,
):
    import torch
    from diffusers import AutoPipelineForImage2Image
    from PIL import Image

    boxes = detect_face_boxes(detector_path, image)
    if not boxes:
        emit({"type": "log", "message": "Face Fix found no faces; keeping the base image."})
        return image

    try:
        image_to_image = AutoPipelineForImage2Image.from_pipe(pipeline)
    except Exception as error:
        raise RuntimeError(
            "The selected Diffusers pipeline cannot run image-to-image Face Fix."
        ) from error

    crop_size = face_crop_size(pipeline)
    result = image
    face_prompt = (
        "detailed face, symmetric eyes, natural skin texture, sharp focus, "
        f"realistic facial features, {prompt}"
    )
    try:
        for index, box in enumerate(boxes, 1):
            emit(
                {
                    "type": "status",
                    "message": f"Refining face {index} of {len(boxes)}...",
                }
            )
            x1, y1, x2, y2 = expanded_face_box(box, *result.size)
            crop = result.crop((x1, y1, x2, y2))
            crop_width, crop_height = crop.size
            if crop_width < 16 or crop_height < 16:
                continue
            resized = crop.resize(
                (crop_size, crop_size), Image.Resampling.LANCZOS
            )
            with torch.inference_mode():
                refined = image_to_image(
                    prompt=face_prompt,
                    negative_prompt=negative_prompt or None,
                    image=resized,
                    strength=strength,
                    num_inference_steps=25,
                    guidance_scale=6.0,
                    generator=generator,
                ).images[0]
            refined = refined.resize(
                (crop_width, crop_height), Image.Resampling.LANCZOS
            )
            mask = feathered_mask((crop_width, crop_height))
            composited = result.copy()
            composited.paste(refined, (x1, y1), mask)
            result = composited
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    finally:
        del image_to_image
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    return result


def upscale_image(
    image: Any,
    model_path: Path,
    factor: int,
    tile_size: int = 384,
    tile_overlap: int = 32,
):
    try:
        import numpy as np
        import torch
        from PIL import Image
        from spandrel import ImageModelDescriptor, ModelLoader
    except ImportError as error:
        raise RuntimeError(
            "Upscaling requires numpy and spandrel. Reinstall runtime/requirements-image.txt."
        ) from error

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = ModelLoader().load_from_file(str(model_path))
    if not isinstance(model, ImageModelDescriptor):
        raise RuntimeError("The selected upscaler is not a single-image model.")
    native_scale = int(model.scale)
    if native_scale < factor:
        raise RuntimeError(
            f"This model supports {native_scale}x output, not the requested {factor}x."
        )
    model.to(device).eval()

    source = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    tensor = torch.from_numpy(source).permute(2, 0, 1).unsqueeze(0).to(device)
    _, _, height, width = tensor.shape
    output = torch.zeros(
        (1, 3, height * native_scale, width * native_scale),
        device=device,
        dtype=tensor.dtype,
    )
    weight = torch.zeros_like(output)
    stride = tile_size - tile_overlap

    with torch.inference_mode():
        for y in range(0, height, stride):
            for x in range(0, width, stride):
                y2, x2 = min(y + tile_size, height), min(x + tile_size, width)
                y1, x1 = max(0, y2 - tile_size), max(0, x2 - tile_size)
                patch = tensor[:, :, y1:y2, x1:x2]
                upscaled_patch = model(patch).clamp(0, 1)
                output[
                    :,
                    :,
                    y1 * native_scale : y2 * native_scale,
                    x1 * native_scale : x2 * native_scale,
                ] += upscaled_patch
                weight[
                    :,
                    :,
                    y1 * native_scale : y2 * native_scale,
                    x1 * native_scale : x2 * native_scale,
                ] += 1

    output = output / weight.clamp(min=1)
    pixels = (
        output.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0
    ).clip(0, 255).astype(np.uint8)
    upscaled = Image.fromarray(pixels)
    if factor != native_scale:
        upscaled = upscaled.resize(
            (image.width * factor, image.height * factor),
            Image.Resampling.LANCZOS,
        )
    del model, tensor, output, weight
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return upscaled


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--job-id", required=True)
    arguments = parser.parse_args()

    request = read_request()
    prompt = str(request.get("prompt", "")).strip()
    if not prompt:
        raise ValueError("A prompt is required.")
    negative_prompt = str(request.get("negative_prompt", "")).strip()
    width = bounded_int(request.get("width", 1024), "width", 256, 2048)
    height = bounded_int(request.get("height", 1024), "height", 256, 2048)
    if width % 8 or height % 8:
        raise ValueError("Image width and height must be divisible by 8.")
    steps = bounded_int(request.get("steps", 24), "steps", 1, 100)
    guidance = bounded_float(request.get("guidance", 5.5), "guidance", 0, 30)
    seed = bounded_int(request.get("seed", 0), "seed", 0, 2**32 - 1)
    source_image_value = str(request.get("source_image", "")).strip()
    edit_region_value = request.get("edit_region")
    if bool(source_image_value) != isinstance(edit_region_value, dict):
        raise ValueError("Image edits require both source_image and edit_region.")
    edit_region = (
        parse_edit_region(edit_region_value) if source_image_value else None
    )
    edit_instruction = str(request.get("edit_prompt", "")).strip()
    edit_strength = bounded_float(
        request.get("edit_strength", 0.65), "edit_strength", 0.1, 1
    )
    face_fix = bool(request.get("face_fix", False))
    face_fix_strength = bounded_float(
        request.get("face_fix_strength", 0.45),
        "face_fix_strength",
        0.1,
        0.8,
    )
    upscale = bool(request.get("upscale", False))
    nsfw_segmentation = bool(request.get("nsfw_segmentation", False))
    upscale_factor = bounded_int(
        request.get("upscale_factor", 2), "upscale_factor", 2, 4
    )
    if upscale_factor not in (2, 4):
        raise ValueError("upscale_factor must be 2 or 4.")

    model_path = Path(arguments.model).expanduser().resolve()
    output_dir = Path(arguments.output).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    pipeline, generator = load_pipeline(model_path)
    generator.manual_seed(seed)

    generation_pipeline = pipeline
    source_image = None
    edit_mask = None
    if source_image_value and edit_region:
        try:
            from diffusers import AutoPipelineForInpainting
            from PIL import Image

            source_path = Path(source_image_value).expanduser().resolve()
            if not source_path.is_file():
                raise ValueError(f"Source image was not found: {source_path}")
            with Image.open(source_path) as opened_image:
                source_image = opened_image.convert("RGB").resize(
                    (width, height), Image.Resampling.LANCZOS
                )
            edit_mask = edit_selection_mask(source_image.size, edit_region)
            generation_pipeline = AutoPipelineForInpainting.from_pipe(pipeline)
            prompt = edit_generation_prompt(prompt, edit_instruction)
        except ImportError as error:
            raise RuntimeError(
                "Image editing requires the Diffusers inpainting runtime."
            ) from error
        except (AttributeError, TypeError, ValueError) as error:
            raise RuntimeError(
                "The selected Diffusers model cannot run masked image edits."
            ) from error

    safe_job_id = re.sub(r"[^A-Za-z0-9_-]", "-", arguments.job_id)[:80]
    run_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    preview_steps = preview_step_numbers(steps)
    preview_warning_emitted = False

    def publish_preview(step: int, latents) -> None:
        nonlocal preview_warning_emitted
        if step not in preview_steps:
            return
        preview_path = output_dir / (
            f"preview-{run_timestamp}-{safe_job_id}-{step:03d}.png"
        )
        try:
            preview_width, preview_height = save_latent_preview(
                pipeline, latents, preview_path
            )
            emit(
                {
                    "type": "preview",
                    "path": str(preview_path),
                    "step": step,
                    "total": steps,
                    "width": preview_width,
                    "height": preview_height,
                }
            )
        except Exception as error:
            if not preview_warning_emitted:
                emit(
                    {
                        "type": "log",
                        "message": f"Live preview unavailable: {error}",
                    }
                )
                preview_warning_emitted = True

    def progress_callback(_pipeline, step_index, _timestep, callback_kwargs):
        current_step = step_index + 1
        emit({"type": "progress", "step": current_step, "total": steps})
        if "latents" in callback_kwargs:
            publish_preview(current_step, callback_kwargs["latents"])
        return callback_kwargs

    def legacy_progress_callback(step_index, _timestep, latents):
        current_step = step_index + 1
        emit({"type": "progress", "step": current_step, "total": steps})
        publish_preview(current_step, latents)

    call_options = {
        "prompt": prompt,
        "negative_prompt": negative_prompt or None,
        "num_inference_steps": steps,
        "guidance_scale": guidance,
        "width": width,
        "height": height,
        "generator": generator,
    }
    if source_image is not None and edit_mask is not None:
        call_options.update(
            {
                "image": source_image,
                "mask_image": edit_mask,
                "strength": edit_strength,
            }
        )
    call_parameters = inspect.signature(generation_pipeline.__call__).parameters
    if source_image is not None and edit_mask is not None:
        required_edit_parameters = {"image", "mask_image", "strength"}
        if not required_edit_parameters.issubset(call_parameters):
            raise RuntimeError(
                "The selected Diffusers model does not expose inpainting inputs."
            )
        if "padding_mask_crop" in call_parameters:
            call_options["padding_mask_crop"] = 32
    if "callback_on_step_end" in call_parameters:
        call_options["callback_on_step_end"] = progress_callback
    elif "callback" in call_parameters:
        call_options["callback"] = legacy_progress_callback
        call_options["callback_steps"] = 1

    emit(
        {
            "type": "status",
            "message": (
                "Reworking selected area..."
                if source_image is not None
                else "Generating image..."
            ),
        }
    )
    result = generation_pipeline(**call_options)
    image = result.images[0]
    processing_suffixes: list[str] = []
    if source_image is not None and edit_mask is not None:
        from PIL import Image

        generated = image.convert("RGB")
        if generated.size != source_image.size:
            generated = generated.resize(source_image.size, Image.Resampling.LANCZOS)
        image = Image.composite(generated, source_image, edit_mask)
        processing_suffixes.append("edit")

    if face_fix:
        try:
            detector_path = require_model_file(
                request.get("face_detector_model"),
                "Face detector model",
                {".pt"},
            )
            emit({"type": "status", "message": "Detecting faces..."})
            image = refine_faces(
                pipeline,
                image,
                detector_path,
                prompt,
                negative_prompt,
                face_fix_strength,
                generator,
            )
            processing_suffixes.append("face")
        except Exception as error:
            emit({"type": "log", "message": f"Face Fix skipped: {error}"})

    if upscale:
        try:
            upscaler_path = require_model_file(
                request.get("upscaler_model"),
                "Upscaler model",
                {".pth", ".pt", ".safetensors"},
            )
            emit(
                {
                    "type": "status",
                    "message": f"Upscaling {upscale_factor}x in tiles...",
                }
            )
            image = upscale_image(image, upscaler_path, upscale_factor)
            processing_suffixes.append(f"{upscale_factor}x")
        except Exception as error:
            emit({"type": "log", "message": f"Upscale skipped: {error}"})

    suffix = f"_{'_'.join(processing_suffixes)}" if processing_suffixes else ""
    output_path = output_dir / f"{run_timestamp}_{safe_job_id}{suffix}.png"

    try:
        from PIL.PngImagePlugin import PngInfo

        metadata = PngInfo()
        metadata.add_text("prompt", prompt)
        metadata.add_text("negative_prompt", negative_prompt)
        metadata.add_text("steps", str(steps))
        metadata.add_text("guidance", str(guidance))
        metadata.add_text("seed", str(seed))
        metadata.add_text("model", model_path.name)
        metadata.add_text("face_fix", str(face_fix).lower())
        metadata.add_text("face_fix_strength", str(face_fix_strength))
        metadata.add_text("upscale", str(upscale).lower())
        metadata.add_text("upscale_factor", str(upscale_factor))
        metadata.add_text("nsfw_segmentation", str(nsfw_segmentation).lower())
        metadata.add_text("edit_prompt", edit_instruction)
        metadata.add_text("edit_strength", str(edit_strength))
        if edit_region:
            metadata.add_text("edit_region", json.dumps(edit_region))
        metadata.add_text("generator", "Local Forge")
        image.save(output_path, pnginfo=metadata)
    except ImportError:
        image.save(output_path)

    if nsfw_segmentation:
        try:
            segmenter_dir = require_segmenter_directory(
                request.get("nsfw_segmenter_model_dir")
            )
            emit({"type": "status", "message": "Running NSFW segmentation..."})
            masks = segment_nsfw(segmenter_dir, image)
            for region, mask in masks.items():
                mask_path = output_dir / f"{output_path.stem}_mask_{region}.png"
                mask.save(mask_path)
            if masks:
                regions = ", ".join(sorted(masks))
                emit({"type": "log", "message": f"Saved NSFW masks: {regions}."})
            else:
                emit(
                    {
                        "type": "log",
                        "message": "NSFW segmentation found no matching regions.",
                    }
                )
        except Exception as error:
            emit({"type": "log", "message": f"NSFW segmentation skipped: {error}"})

    emit(
        {
            "type": "done",
            "path": str(output_path),
            "width": image.width,
            "height": image.height,
        }
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        sys.exit(1)