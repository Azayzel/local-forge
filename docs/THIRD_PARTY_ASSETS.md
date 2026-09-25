# Third-party assets

## Bundled Library samples

The four files under `public/demo/` are interface samples downloaded from the Unsplash image CDN during prototyping:

| File | Source |
| --- | --- |
| `forge-01.jpg` | <https://images.unsplash.com/photo-1535223289827-42f1e9919769> |
| `forge-02.jpg` | <https://images.unsplash.com/photo-1487958449943-2429e8be8625> |
| `forge-03.jpg` | <https://images.unsplash.com/photo-1513364776144-60967b0f800f> |
| `forge-04.jpg` | <https://images.unsplash.com/photo-1500530855697-b586d89ba3ee> |

The downloaded variants used `auto=format`, `fit=crop`, `w=1200`, and `q=84` query parameters. Unsplash's license is available at <https://unsplash.com/license>.

The files are `1200 x 1800`, `1200 x 800`, `1200 x 800`, and `1200 x 1800` respectively. The download step did not retain creator profile metadata, so these should be replaced with project-owned images or re-downloaded through an attribution-preserving workflow before a stable release. They are not generated outputs and are not covered by Local Forge's MIT code license.

Images imported by a user are copied into that user's private Local Forge data directory. They are never included in the source tree or project releases.

## Optional enhancement models

Local Forge does not bundle enhancement weights. When a user chooses Install in Studio, the app downloads an immutable, checksum-verified revision to that user's private Local Forge data directory:

| Purpose | Repository | File | SHA-256 |
| --- | --- | --- | --- |
| 4x image upscaling | [lokCX/4x-Ultrasharp](https://huggingface.co/lokCX/4x-Ultrasharp) | `4x-UltraSharp.pth` | `a5812231fc936b42af08a5edba784195495d303d5b3248c24489ef0c4021fe01` |
| Face detection | [Bingsu/adetailer](https://huggingface.co/Bingsu/adetailer) | `face_yolov8n.pt` | `70b640f8f60b1cf0dcc72f30caf3da9495eb2fb6509da48c53374ad6806e6a9c` |
| Breast segmentation | [NSFW-API/NSFW_Segmentation](https://huggingface.co/NSFW-API/NSFW_Segmentation) | `nsfw-seg-breast-x.pt` | `5ad882ddaf149873be131943b373da9f15a0603c91508e2291ece83d729c8ecc` |
| Penis segmentation | [NSFW-API/NSFW_Segmentation](https://huggingface.co/NSFW-API/NSFW_Segmentation) | `nsfw-seg-penis-x.pt` | `49d9fc8ee67d3bdee44e46bf75aeb76058f5cd074bac027b55ff071b63a32e21` |
| Vagina segmentation | [NSFW-API/NSFW_Segmentation](https://huggingface.co/NSFW-API/NSFW_Segmentation) | `nsfw-seg-vagina-x.pt` | `f8349ae348f5cf041809c38bf38d2c80a0f3dccdb1375b97971358cde742197f` |

These files remain subject to the terms published by their respective authors and are not covered by Local Forge's MIT code license.

## Fonts and icons

- Manrope and Space Grotesk are bundled through Fontsource packages and distributed under the SIL Open Font License 1.1.
- Interface icons come from Lucide, distributed under the ISC License.
- MCP transport and protocol support uses the official `@modelcontextprotocol/sdk`, distributed under the MIT License.
- The Local Forge anvil logo and derived application icon are project artwork covered by the repository license.
