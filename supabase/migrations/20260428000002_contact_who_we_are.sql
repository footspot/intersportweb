-- * "Qui sommes-nous ?" textarea on the singleton contact_info row.
-- * Rendered on the public /contact page above (or alongside) the address block.

ALTER TABLE contact_info
  ADD COLUMN IF NOT EXISTS who_we_are TEXT;
