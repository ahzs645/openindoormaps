# Visitor archive retention

The published-project worker now releases verified raw JSON inventory after decoding a visitor package. Source/editor import keeps its original files; viewer export uses the exact decoded dataset and metadata. Unlisted packages still undergo normal full validation. Prepared display blobs remain available and transferable.

Two isolated Node receipt-loader probes used the exact accepted 45,519,753-byte ZIP, SHA-256 `09d35032a47d4cde544207c5a83f28c061750dfdaf2b32e07f042362c164658a`. Their complete dataset, hydrated metadata and manifest hashes match, with the dataset serialization retaining its original checksum `87194bb96ce4564699f5fb431ef00917fae93181f5730fe3e5f7056c1ca6ca1b`. Both retain 1,864 places and 7,063 source edges. The same compiled receipt and all entry checksums run in both modes.

- Original/default retained archive inventory and transfer buffers: 231,895,082 bytes, four files.
- Visitor runtime retained archive inventory and transfer buffers: zero bytes/files.
- Isolated Node maximum RSS: 2,435,596 KiB versus 2,194,528 KiB. This includes proof serialization and is not browser memory or mobile device performance.
- Probe duration including complete hashing: 14.18 versus 14.36 seconds. This does not establish a startup speed improvement.

`archive-retained.json` and `visitor-runtime.json` contain exact scalar results. A targeted real exporter/importer regression verifies that a visitor with no raw inventory still re-exports identical non-manifest entry bytes, geometry, metadata and routes. The manifest creation time is newly generated. Other regressions cover receipt/hash refusals, exact hydrated values, source-file preservation, prepared-blob retention and deduplicated transfer buffers.
