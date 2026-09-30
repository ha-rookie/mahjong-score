ALTER TABLE game_results
ADD COLUMN placement INTEGER CHECK (placement BETWEEN 1 AND 4);

ALTER TABLE game_results
ADD COLUMN is_last INTEGER NOT NULL DEFAULT 0 CHECK (is_last IN (0, 1));

UPDATE game_results
SET
  placement = 1 + (
    SELECT COUNT(*)
    FROM game_results AS higher
    WHERE higher.game_id = game_results.game_id
      AND higher.score_point > game_results.score_point
  ),
  is_last = CASE
    WHEN score_point = (
      SELECT MIN(lower_result.score_point)
      FROM game_results AS lower_result
      WHERE lower_result.game_id = game_results.game_id
    ) THEN 1
    ELSE 0
  END;

-- A valid finalized Score Point set has exactly one first place.
-- If legacy data contains a highest-score tie, creating this index fails the
-- migration rather than guessing which Player should be first.
CREATE UNIQUE INDEX idx_game_results_unique_first_place
ON game_results(game_id)
WHERE placement = 1;
