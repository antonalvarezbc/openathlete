-- This fork added MOBILITY earlier, in 20261004100000_add_mobility_sport,
-- with the same data migration. Upstream's copy must not fail on the fork's
-- databases, where the value already exists.
ALTER TYPE "sport_type" ADD VALUE IF NOT EXISTS 'MOBILITY';
