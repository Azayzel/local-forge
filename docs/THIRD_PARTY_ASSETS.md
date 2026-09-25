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

## Fonts and icons

- Manrope and Space Grotesk are bundled through Fontsource packages and distributed under the SIL Open Font License 1.1.
- Interface icons come from Lucide, distributed under the ISC License.
- MCP transport and protocol support uses the official `@modelcontextprotocol/sdk`, distributed under the MIT License.
- The Local Forge anvil logo and derived application icon are project artwork covered by the repository license.
