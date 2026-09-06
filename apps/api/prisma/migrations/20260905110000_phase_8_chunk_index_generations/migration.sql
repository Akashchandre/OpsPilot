-- Keep immutable chunk descriptors from prior published index generations so
-- historical AI citations retain relational integrity across a reindex.
DROP INDEX `company_document_chunks_ordinal_key` ON `company_document_chunks`;

CREATE UNIQUE INDEX `company_document_chunks_index_ordinal_key`
    ON `company_document_chunks`(`document_version_id`, `index_version`, `ordinal`);

-- Citation rows retain opaque historical IDs, but the chunk text-derived
-- descriptors can now be erased. The retained version FK still prevents an
-- orphan citation or physical version removal.
ALTER TABLE `ai_document_citations`
    DROP FOREIGN KEY `ai_document_citations_version_chunk_fkey`,
    ADD CONSTRAINT `ai_document_citations_document_version_id_fkey`
    FOREIGN KEY (`document_version_id`) REFERENCES `company_document_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
