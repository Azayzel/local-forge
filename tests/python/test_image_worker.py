import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import torch
from PIL import Image

from runtime.image_worker import (
    expanded_face_box,
    feathered_mask,
    require_model_file,
    upscale_image,
)


class FakeUpscaler:
    scale = 4

    def to(self, _device):
        return self

    def eval(self):
        return self

    def __call__(self, image):
        return torch.nn.functional.interpolate(image, scale_factor=4, mode="nearest")


class FakeModelLoader:
    def load_from_file(self, _model_path):
        return FakeUpscaler()


class ImageWorkerTests(unittest.TestCase):
    def test_expanded_face_box_is_square_and_clamped(self):
        self.assertEqual(
            expanded_face_box((0, 5, 30, 25), 100, 80),
            (0, 0, 36, 36),
        )

    def test_feathered_mask_keeps_center_and_softens_edges(self):
        mask = feathered_mask((100, 100), feather=20)

        self.assertEqual(mask.getpixel((50, 50)), 255)
        self.assertLess(mask.getpixel((0, 0)), mask.getpixel((20, 20)))

    def test_require_model_file_checks_path_and_extension(self):
        with tempfile.TemporaryDirectory() as directory:
            model_path = Path(directory) / "face.pt"
            model_path.write_bytes(b"fixture")
            invalid_path = Path(directory) / "face.bin"
            invalid_path.write_bytes(b"fixture")

            self.assertEqual(
                require_model_file(model_path, "Face detector", {".pt"}),
                model_path.resolve(),
            )
            with self.assertRaisesRegex(ValueError, "must use one of"):
                require_model_file(invalid_path, "Face detector", {".pt"})

    def test_four_x_model_can_produce_exact_two_x_output(self):
        source = Image.new("RGB", (17, 13), (32, 64, 96))
        import spandrel

        with (
            patch.object(spandrel, "ImageModelDescriptor", FakeUpscaler),
            patch.object(spandrel, "ModelLoader", FakeModelLoader),
            patch.object(torch.cuda, "is_available", return_value=False),
        ):
            result = upscale_image(
                source,
                Path("fixture.pth"),
                factor=2,
                tile_size=8,
                tile_overlap=2,
            )

        self.assertEqual(result.size, (34, 26))
        self.assertEqual(result.getpixel((10, 10)), (32, 64, 96))


if __name__ == "__main__":
    unittest.main()