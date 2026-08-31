-- ----------------------------------------------------------------------------
-- MIGRATION: add three new services to the clinic_service enum
-- ----------------------------------------------------------------------------
-- Adds Dental Implants, Teeth Extraction, and a catch-all "Other" to the
-- services patients can request on the booking form (see 0001_init_schema.sql
-- for the original six). ADD VALUE is safe to run multiple times with
-- IF NOT EXISTS and does not affect any existing rows.
-- ----------------------------------------------------------------------------

alter type clinic_service add value if not exists 'dental_implants';
alter type clinic_service add value if not exists 'teeth_extraction';
alter type clinic_service add value if not exists 'other';
