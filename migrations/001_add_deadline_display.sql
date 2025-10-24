Note for maintainers:
This PR adds usage of the `deadline_display` column in the Goal table.
To avoid errors in production, the following migration should be applied:

-- Migration: add deadline_display to Goal
ALTER TABLE goal ADD COLUMN deadline_display VARCHAR(25);

This PR works locally; production will require the column to be added.
