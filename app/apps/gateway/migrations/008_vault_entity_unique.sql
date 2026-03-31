-- Add unique constraint on vault_entities.document_id so vault-sync can upsert by document
ALTER TABLE vault_entities ADD CONSTRAINT vault_entities_document_id_unique UNIQUE (document_id);
